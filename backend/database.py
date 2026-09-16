import os
import base64
import sys
import threading
from pathlib import Path
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ═══════════════════════════════════════════════════════════════════════════
# ORDAL v3 — DATABASE PUSAT (PostgreSQL, shared dengan ORDAL-Web)
#
# Semua data user disimpan di PostgreSQL yang sama dengan database web
# (tabel "User", "Trial", "Download", "Session" dimiliki Prisma milik web).
# App menambahkan tabel-tabel sendiri (tanpa prefix; tidak bentrok dengan
# nama PascalCase milik web) + tabel baru: app_user_profile, app_devices,
# app_login_events, app_verification_codes, app_oauth_pending, app_onboarding.
#
# Kompatibilitas kode lama (SQLite-style):
#   - get_db() mengembalikan koneksi dengan API mirip sqlite3.Connection
#   - placeholder "?" otomatis dikonversi ke "%s" (psycopg2)
#   - datetime('now') otomatis dikonversi ke NOW()
#   - INSERT otomatis ditambah "RETURNING id" → cur.lastrowid tetap jalan
#   - INSERT OR IGNORE otomatis jadi "ON CONFLICT DO NOTHING"
# ═══════════════════════════════════════════════════════════════════════════

def _resolve_persistent_data_dir() -> str:
    """Direktori data lokal (cache file CV/cookie, secret key, log).
    Di-set oleh launcher via ORDAL_DATA_DIR, atau platform user data dir."""
    env_dir = os.getenv("ORDAL_DATA_DIR", "").strip()
    if env_dir:
        os.makedirs(env_dir, exist_ok=True)
        return env_dir

    if sys.platform == "darwin":
        data_dir = os.path.join(Path.home(), "Library", "Application Support", "ORDAL")
    elif sys.platform == "win32":
        appdata = os.getenv("APPDATA") or os.getenv("LOCALAPPDATA") or str(Path.home())
        data_dir = os.path.join(appdata, "ORDAL")
    else:
        data_dir = os.path.join(Path.home(), ".local", "share", "ORDAL")

    os.makedirs(data_dir, exist_ok=True)
    return data_dir


DATA_DIR = _resolve_persistent_data_dir()

# APP_MODE single-user sudah DIHAPUS di v3 — semua user wajib login
# ke database pusat. Variabel disimpan hanya untuk kompatibilitas import lama.
APP_MODE = False

# ── PostgreSQL connection ────────────────────────────────────────────────
# ORDAL_DATABASE_URL (prioritas — hindari bentrok dengan env lain di sistem)
# → DATABASE_URL → default dev lokal.
# Production: isi dengan URL Supabase yang sama dengan ORDAL-Web.
DATABASE_URL = (
    os.getenv("ORDAL_DATABASE_URL", "").strip()
    or os.getenv("DATABASE_URL", "").strip()
    or "postgresql://ordal:ordal@127.0.0.1:5432/ordal"
)

import psycopg2
from psycopg2.pool import ThreadedConnectionPool

_pool: ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()


def _get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = ThreadedConnectionPool(
                    minconn=2,
                    maxconn=12,
                    dsn=DATABASE_URL,
                )
                print(f"[INFO] PostgreSQL pool siap: {DATABASE_URL.split('@')[-1]}")
    return _pool


def get_database_url() -> str:
    return DATABASE_URL


def get_data_dir() -> str:
    """Single source of truth untuk data directory lokal."""
    return DATA_DIR


# ── SQL conversion helpers (SQLite → PostgreSQL) ─────────────────────────

_SENTINEL_Q = "\x00QQ\x00"


def _convert_sql(sql: str, has_params: bool) -> str:
    """Konversi SQL gaya SQLite ke PostgreSQL:
    - ? → %s
    - datetime('now') / date('now') → NOW() / CURRENT_DATE
    - INSERT OR IGNORE INTO → INSERT INTO ... ON CONFLICT DO NOTHING
    - escape literal '%' → '%%' (psycopg2) hanya ketika ada parameter
    """
    s = sql
    s = s.replace("datetime('now')", "NOW()")
    s = s.replace('datetime("now")', "NOW()")
    s = s.replace("date('now')", "CURRENT_DATE")

    stripped = s.lstrip()
    if stripped.upper().startswith("INSERT OR IGNORE INTO"):
        prefix_len = len(s) - len(stripped)
        s = s[:prefix_len] + "INSERT INTO" + stripped[len("INSERT OR IGNORE INTO"):]
        if "ON CONFLICT" not in s.upper():
            s = s.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"

    s = s.replace("?", _SENTINEL_Q)
    if has_params:
        s = s.replace("%", "%%")
    s = s.replace(_SENTINEL_Q, "%s")
    return s


def _is_insert(sql: str) -> bool:
    return sql.lstrip().upper().startswith("INSERT")


import re

_INSERT_TABLE_RE = re.compile(r"^\s*INSERT\s+INTO\s+(?:\"([^\"]+)\"|([A-Za-z_][\w]*))", re.IGNORECASE)

_tables_with_id: set | None = None


def _table_has_id_column(sql: str) -> bool:
    """Deteksi apakah tabel yang di-INSERT punya kolom 'id' (untuk auto RETURNING id).
    Hasil di-cache; cache di-refresh sekali kalau tabel belum terlihat."""
    global _tables_with_id
    m = _INSERT_TABLE_RE.match(sql)
    if not m:
        return False
    table = m.group(1) or m.group(2)

    if _tables_with_id is None:
        try:
            conn = get_db()
            try:
                rows = conn.execute(
                    "SELECT table_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND column_name = 'id'"
                ).fetchall()
                _tables_with_id = {r["table_name"] for r in rows}
            finally:
                conn.close()
        except Exception:
            _tables_with_id = set()

    if table in _tables_with_id or table.lower() in _tables_with_id:
        return True
    # tabel mungkin dibuat setelah cache terbentuk → refresh sekali
    try:
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT table_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND column_name = 'id'"
            ).fetchall()
            _tables_with_id = {r["table_name"] for r in rows}
        finally:
            conn.close()
    except Exception:
        pass
    return table in _tables_with_id or table.lower() in _tables_with_id


# ── Row / Cursor wrappers (API mirip sqlite3) ────────────────────────────

class Row:
    """Dict-like + tuple-like row, kompatibel dengan kode sqlite3.Row lama."""

    __slots__ = ("_columns", "_values")

    def __init__(self, columns, values):
        self._columns = columns
        self._values = list(values)

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return self._values[self._columns.index(key)]

    def keys(self):
        return list(self._columns)

    def __iter__(self):
        return iter(self._values)

    def __len__(self):
        return len(self._values)

    def __repr__(self):
        return f"Row({dict(zip(self._columns, self._values))})"


class _PgCursor:
    """Wrapper cursor psycopg2 dengan API sqlite3 + auto RETURNING id."""

    def __init__(self, cur):
        self._cur = cur
        self.lastrowid = None
        try:
            self.rowcount = cur.rowcount
        except Exception:
            self.rowcount = -1

    def execute(self, sql, params=()):
        params = tuple(params) if params is not None else ()
        sql2 = _convert_sql(sql, bool(params))
        if _is_insert(sql2) and " RETURNING " not in sql2.upper() and _table_has_id_column(sql2):
            sql2 = sql2.rstrip().rstrip(";") + " RETURNING id"
            self._cur.execute(sql2, params)
            row = self._cur.fetchone()
            # INSERT ... ON CONFLICT DO NOTHING yang conflict → tidak ada row.
            self.lastrowid = row[0] if row else None
        else:
            self._cur.execute(sql2, params)
        try:
            self.rowcount = self._cur.rowcount
        except Exception:
            pass
        return self

    def executemany(self, sql, seq_of_params):
        sql2 = _convert_sql(sql, True)
        # executemany psycopg2 tidak dukung RETURNING
        if _is_insert(sql2) and " RETURNING " not in sql2.upper():
            # hapus RETURNING hasil konversi manual jika ada
            pass
        self._cur.executemany(sql2, [tuple(p) for p in seq_of_params])
        self.lastrowid = None
        try:
            self.rowcount = self._cur.rowcount
        except Exception:
            pass
        return self

    def executescript(self, sql: str):
        self._cur.execute(sql)
        return self

    def _wrap_row(self, row):
        if row is None:
            return None
        columns = [d[0] for d in (self._cur.description or [])]
        return Row(columns, row)

    def fetchone(self):
        row = self._cur.fetchone()
        if row is None:
            return None
        columns = [d[0] for d in (self._cur.description or [])]
        return Row(columns, row)

    def fetchall(self):
        rows = self._cur.fetchall()
        columns = [d[0] for d in (self._cur.description or [])]
        return [Row(columns, r) for r in rows]

    def __iter__(self):
        for row in self.fetchall():
            yield row

    @property
    def description(self):
        return self._cur.description

    def close(self):
        try:
            self._cur.close()
        except Exception:
            pass


class _PgConn:
    """Koneksi pooled dengan API mirip sqlite3.Connection.
    close() mengembalikan koneksi ke pool (rollback otomatis kalau belum commit)."""

    def __init__(self, conn):
        self._conn = conn
        self._closed = False
        self._finished = False

    def cursor(self):
        return _PgCursor(self._conn.cursor())

    def execute(self, sql, params=()):
        return self.cursor().execute(sql, params)

    def executemany(self, sql, seq_of_params):
        return self.cursor().executemany(sql, seq_of_params)

    def executescript(self, sql: str):
        cur = self._conn.cursor()
        cur.execute(sql)
        cur.close()
        self._conn.commit()
        return cur

    def commit(self):
        self._conn.commit()
        self._finished = True

    def rollback(self):
        self._conn.rollback()
        self._finished = True

    def close(self):
        if self._closed:
            return
        self._closed = True
        try:
            if not self._finished:
                self._conn.rollback()
        except Exception:
            pass
        try:
            _get_pool().putconn(self._conn)
        except Exception:
            pass


def get_db() -> _PgConn:
    """Ambil koneksi dari pool. API kompatibel dengan sqlite3 lama:
    db.execute(sql, params).fetchone() / db.commit() / db.close()."""
    return _PgConn(_get_pool().getconn())


def query_all(sql: str, params=()) -> list[dict]:
    """Helper singkat: SELECT → list of dict."""
    db = get_db()
    try:
        rows = db.execute(sql, params).fetchall()
        return [dict(zip(r.keys(), list(r))) for r in rows]
    finally:
        db.close()


def query_one(sql: str, params=()) -> dict | None:
    """Helper singkat: SELECT → satu dict atau None."""
    db = get_db()
    try:
        row = db.execute(sql, params).fetchone()
        if row is None:
            return None
        return dict(zip(row.keys(), list(row)))
    finally:
        db.close()


# ── Schema ───────────────────────────────────────────────────────────────
# Tabel web (dimiliki Prisma): "User", "Trial", "Download", "Session".
# Tabel app di bawah TIDAK mengubah tabel web — hanya menambah tabel baru.
# user_id di tabel app = TEXT (cuid dari "User"."id").

SCHEMA_SQL = """
-- ── Profil & keamanan app ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_user_profile (
    user_id             TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
    email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_devices (
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    device_id           TEXT NOT NULL,
    device_name         TEXT NOT NULL DEFAULT '',
    os                  TEXT NOT NULL DEFAULT '',
    app_version         TEXT NOT NULL DEFAULT '',
    last_login_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS app_login_events (
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    device_id   TEXT NOT NULL DEFAULT '',
    device_name TEXT NOT NULL DEFAULT '',
    method      TEXT NOT NULL DEFAULT 'password',   -- password | google
    ip          TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_login_events_user ON app_login_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_verification_codes (
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    purpose     TEXT NOT NULL DEFAULT 'verify_email',
    attempts    INT NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_verif_email ON app_verification_codes(email, created_at DESC);

CREATE TABLE IF NOT EXISTS app_oauth_pending (
    state           TEXT PRIMARY KEY,
    code_verifier   TEXT NOT NULL,
    redirect_uri    TEXT NOT NULL DEFAULT '',
    device_id       TEXT NOT NULL DEFAULT '',
    device_name     TEXT NOT NULL DEFAULT '',
    os              TEXT NOT NULL DEFAULT '',
    app_version     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | error | device_limit | expired
    user_id         TEXT,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_onboarding (
    user_id         TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
    current_step    INT NOT NULL DEFAULT 1,
    cv_id           BIGINT,
    preferences     TEXT NOT NULL DEFAULT '{}',   -- JSON string
    cover_letter    TEXT,
    platforms       TEXT NOT NULL DEFAULT '',      -- csv: jobstreet,linkedin_jobs,linkedin_posts
    completed       BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Lisensi: trial 3 hari + pembayaran + activation code ──────────────
-- Trial 3 hari TIDAK dibuat saat register — dibuat lazy saat user pertama
-- kali klik "Cari Kerja" (POST /api/trial/start). Karena tersimpan di DB
-- pusat per akun, install ulang app / ganti komputer TIDAK mereset trial.
-- "Trial" milik web dipakai apa adanya (startedAt/expiresAt/status).
CREATE TABLE IF NOT EXISTS app_payments (
    id              TEXT PRIMARY KEY,              -- PAY-XXXXXXXX
    user_id         TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    method          TEXT NOT NULL,                 -- qris_bca | paypal
    amount          INTEGER NOT NULL,              -- nominal IDR (base + kode unik utk QRIS manual)
    base_amount     INTEGER NOT NULL,              -- harga lisensi IDR
    unique_suffix   INTEGER NOT NULL DEFAULT 0,    -- 100-999 utk pencocokan transfer manual
    amount_usd      NUMERIC(10,2),                 -- harga utk PayPal (USD)
    currency        TEXT NOT NULL DEFAULT 'IDR',
    status          TEXT NOT NULL DEFAULT 'pending',   -- pending | verifying | verified | expired | failed
    reference       TEXT NOT NULL DEFAULT '',      -- ref unik utk user (ditampilkan di instruksi)
    gateway         TEXT NOT NULL DEFAULT 'manual',   -- manual | midtrans | paypal
    gateway_ref     TEXT,                          -- order_id Midtrans / orderID PayPal
    qr_string       TEXT,                          -- payload QRIS dinamis (Midtrans)
    qr_url          TEXT,                          -- URL gambar QR (Midtrans)
    approve_url     TEXT,                          -- link approve PayPal
    note            TEXT,
    verified_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour', -- kedaluwarsa invoice
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_payments_user ON app_payments(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_licenses (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
    code            TEXT NOT NULL,                 -- kode activation yang dipakai
    method          TEXT NOT NULL DEFAULT 'payment',  -- payment | admin
    payment_id      TEXT REFERENCES app_payments(id),
    activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ                    -- NULL = selamanya (LICENSE_DURATION_DAYS=0)
);
CREATE INDEX IF NOT EXISTS idx_app_licenses_user ON app_licenses(user_id);

-- ── Tabel app utama (konversi dari SQLite lama, user_id jadi TEXT) ────
CREATE TABLE IF NOT EXISTS user_credentials (
    id                      BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id                 TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    platform                TEXT NOT NULL,
    email                   TEXT NOT NULL,
    password                TEXT NOT NULL DEFAULT '',
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_cookie_warning_at  TIMESTAMPTZ,
    cookie_valid            SMALLINT NOT NULL DEFAULT 1,
    cookie_data             TEXT,
    UNIQUE (user_id, platform)
);

CREATE TABLE IF NOT EXISTS cvs (
    id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    position_label  TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    cv_text         TEXT,
    cv_memory       TEXT,
    file_data       TEXT,
    file_hash       TEXT,
    storage_path    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cvs_user ON cvs(user_id);
-- Fase 2 (Unified Schema): kolom dedupe + storage untuk DB yang sudah ada
-- (idempoten — aman dijalankan berulang; skema produksi sudah dimigrasi
-- 2026-09-15 via scripts/apply_unified_schema.py dari sisi web).
ALTER TABLE cvs ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE cvs ADD COLUMN IF NOT EXISTS storage_path TEXT;
CREATE INDEX IF NOT EXISTS idx_cvs_user_file_hash ON cvs(user_id, file_hash);

CREATE TABLE IF NOT EXISTS job_targets (
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    cv_id               BIGINT REFERENCES cvs(id) ON DELETE CASCADE,
    position            TEXT NOT NULL,
    location            TEXT NOT NULL,
    platform            TEXT NOT NULL,
    employment_type     TEXT DEFAULT 'full_time',
    expected_salary     TEXT DEFAULT '',
    available_join      TEXT DEFAULT '',
    excluded_positions  TEXT DEFAULT '',
    excluded_companies  TEXT DEFAULT '',
    cover_letter        TEXT,
    active              SMALLINT NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_targets_user ON job_targets(user_id, active);

CREATE TABLE IF NOT EXISTS apply_sessions (
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    status      TEXT DEFAULT 'running',
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at    TIMESTAMPTZ,
    source      TEXT DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_apply_sessions_user ON apply_sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS apply_logs (
    id               BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    session_id       BIGINT NOT NULL REFERENCES apply_sessions(id) ON DELETE CASCADE,
    platform         TEXT NOT NULL,
    job_title        TEXT,
    company          TEXT,
    job_url          TEXT,
    position         TEXT,
    location         TEXT,
    job_location     TEXT,
    salary           TEXT,
    question_answers TEXT,
    confirmed_at     TIMESTAMPTZ,
    status           TEXT DEFAULT 'applied',
    skip_reason      TEXT,
    applied_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apply_logs_status_url ON apply_logs(status, job_url);
CREATE INDEX IF NOT EXISTS idx_apply_logs_status_title_company ON apply_logs(status, job_title, company);
CREATE INDEX IF NOT EXISTS idx_apply_logs_session_status ON apply_logs(session_id, status, confirmed_at);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id                 TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
    expected_salary         TEXT DEFAULT '',
    available_join          TEXT DEFAULT '',
    headless_mode           SMALLINT NOT NULL DEFAULT 0,
    testing_email_mode      SMALLINT NOT NULL DEFAULT 0,
    auto_apply_enabled      SMALLINT NOT NULL DEFAULT 0,
    auto_apply_hour         INT NOT NULL DEFAULT 9,
    auto_apply_minute       INT NOT NULL DEFAULT 0,
    auto_apply_days         TEXT DEFAULT 'mon,tue,wed,thu,fri',
    last_auto_apply_at      TIMESTAMPTZ,
    auto_apply_force_headless SMALLINT NOT NULL DEFAULT 1,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_bank (
    id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    platform        TEXT DEFAULT '',
    question        TEXT NOT NULL,
    normalized      TEXT NOT NULL,
    answer          TEXT NOT NULL,
    field_type      TEXT DEFAULT '',
    source          TEXT DEFAULT 'ai',
    use_count       INT DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, platform, normalized)
);
CREATE INDEX IF NOT EXISTS idx_question_bank_user_norm ON question_bank(user_id, normalized);

CREATE TABLE IF NOT EXISTS telegram_users (
    user_id     TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
    chat_id     TEXT UNIQUE,
    link_code   TEXT UNIQUE,
    enabled     SMALLINT NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_secrets (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_configs (
    id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id         TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
    smtp_host       TEXT DEFAULT 'smtp.gmail.com',
    smtp_port       INT DEFAULT 587,
    sender_email    TEXT DEFAULT '',
    app_password    TEXT DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def ensure_column(cur, table: str, column: str, definition: str):
    """Tambah kolom kalau belum ada (versi PostgreSQL)."""
    cur.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s AND column_name = %s
        """,
        (table, column),
    )
    if not cur.fetchone():
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    print(f"[INFO] ORDAL Data Dir (lokal): {DATA_DIR}")
    print(f"[INFO] Database pusat: {DATABASE_URL.split('@')[-1]}")

    db = get_db()
    try:
        cur = db.cursor()
        cur.executescript(SCHEMA_SQL)
        db.commit()
        print("[INFO] Schema app siap (tabel web Prisma tidak diubah)")
    finally:
        db.close()


# ── Persistensi file (CV PDF / cookie) ke DB pusat ───────────────────────
# File berat tetap ditulis ke disk lokal, tapi isinya juga disimpan
# (base64) di DB pusat — supaya saat login di device lain atau app update,
# file bisa direstore otomatis.

def backup_file_to_db(table: str, id_column: str, row_id, data_column: str, raw_bytes: bytes):
    """Simpan isi file (CV PDF / cookie JSON) sebagai base64 ke DB pusat."""
    db = get_db()
    try:
        encoded = base64.b64encode(raw_bytes).decode("ascii")
        db.execute(
            f"UPDATE {table} SET {data_column} = ? WHERE {id_column} = ?",
            (encoded, row_id),
        )
        db.commit()
    finally:
        db.close()


def restore_persisted_files():
    """Restore file lokal (CV / cookie) dari DB pusat kalau file lokal hilang.
    Dipanggil saat startup — untuk semua user yang punya backup di DB.
    Dipanggil juga per-user saat login (refresh device baru)."""
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT id, file_path, file_data FROM cvs WHERE file_data IS NOT NULL"
        ).fetchall()
        restored_cv = 0
        for row in rows:
            file_path = row["file_path"]
            if file_path and not os.path.exists(file_path):
                try:
                    os.makedirs(os.path.dirname(file_path), exist_ok=True)
                    with open(file_path, "wb") as f:
                        f.write(base64.b64decode(row["file_data"]))
                    restored_cv += 1
                except Exception as e:
                    print(f"Gagal restore CV id={row['id']}: {e}")

        from routers.credentials import cookies_path
        rows = conn.execute(
            "SELECT user_id, platform, cookie_data FROM user_credentials WHERE cookie_data IS NOT NULL"
        ).fetchall()
        restored_cookie = 0
        for row in rows:
            path = cookies_path(row["user_id"], row["platform"])
            if not os.path.exists(path):
                try:
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    with open(path, "wb") as f:
                        f.write(base64.b64decode(row["cookie_data"]))
                    restored_cookie += 1
                except Exception as e:
                    print(f"Gagal restore cookie user={row['user_id']} platform={row['platform']}: {e}")

        if restored_cv or restored_cookie:
            print(f"Restore dari DB pusat: {restored_cv} CV, {restored_cookie} cookie file")
    finally:
        conn.close()
