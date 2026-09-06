import os
import base64
import sys
import shutil
from pathlib import Path
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ═══════════════════════════════════════════════════════════════════════════
# v42: SINGLE SOURCE OF TRUTH untuk data directory dan database path.
# Semua module (credentials.py, cv.py, encryption.py, auth_utils.py,
# logging_config.py, app_secrets.py) HARUS pakai get_data_dir() / DB_PATH.
#
# Prioritas:
# 1. ORDAL_DATA_DIR env var (di-set oleh launcher)
# 2. Platform-appropriate user data dir (Mac: ~/Library/Application Support/ORDAL/)
# 3. backend/ dir (dev mode fallback)
# ═══════════════════════════════════════════════════════════════════════════

def _resolve_persistent_data_dir() -> str:
    """Tentukan persistent data directory cross-platform.

    Mac:     ~/Library/Application Support/ORDAL/
    Windows: %APPDATA%/ORDAL/  (atau %LOCALAPPDATA%/ORDAL/)
    Linux:   ~/.local/share/ORDAL/
    Dev:     backend/autoapply.db (fallback)

    Urutan prioritas:
    1. ORDAL_DATA_DIR env (di-set oleh launcher Mac/Windows)
    2. Platform-appropriate user data dir
    """
    # 1. Explicit override dari launcher
    env_dir = os.getenv("ORDAL_DATA_DIR", "").strip()
    if env_dir:
        os.makedirs(env_dir, exist_ok=True)
        return env_dir

    # 2. Platform-appropriate user data dir
    if sys.platform == "darwin":
        data_dir = os.path.join(Path.home(), "Library", "Application Support", "ORDAL")
    elif sys.platform == "win32":
        # %APPDATA% (Roaming) untuk data yang persistent antar versi
        appdata = os.getenv("APPDATA") or os.getenv("LOCALAPPDATA") or str(Path.home())
        data_dir = os.path.join(appdata, "ORDAL")
    else:
        # Linux
        data_dir = os.path.join(Path.home(), ".local", "share", "ORDAL")

    os.makedirs(data_dir, exist_ok=True)
    return data_dir


DATA_DIR = _resolve_persistent_data_dir()
DB_PATH = os.path.join(DATA_DIR, "autoapply.db")


def get_data_dir() -> str:
    """Single source of truth untuk data directory. Dipakai oleh semua module."""
    return DATA_DIR


def get_database_path() -> str:
    """Single source of truth untuk database path."""
    return DB_PATH


def _migrate_legacy_database():
    """v42: Migrasi database lama dari lokasi legacy ke persistent location.

    Prioritas:
    1. Kalau persistent database sudah ada → gunakan, jangan overwrite.
    2. Kalau persistent belum ada → cari legacy database di:
       a. <APP_ROOT>/_ordal_data/autoapply.db (lokasi lama Mac)
       b. backend/autoapply.db (dev mode)
    3. Kalau legacy ditemukan → copy ke persistent location.
    4. Kalau tidak ada legacy → biarkan init_db() buat baru.

    SAFETY: TIDAK PERNAH overwrite persistent database yang sudah ada.
    """
    persistent_db = DB_PATH

    # 1. Kalau persistent sudah ada, gunakan — jangan sentuh.
    if os.path.exists(persistent_db) and os.path.getsize(persistent_db) > 0:
        print(f"[INFO] Existing persistent database found: {persistent_db}")
        print(f"[INFO] Using persistent database (size: {os.path.getsize(persistent_db)} bytes)")
        return

    # 2. Cari legacy database
    legacy_paths = []

    # a. <APP_ROOT>/_ordal_data/autoapply.db (Mac app mode lama)
    app_root = Path(BASE_DIR).parent  # backend/ -> repo root or Resources/
    legacy_app_data = app_root / "_ordal_data" / "autoapply.db"
    if legacy_app_data.exists():
        legacy_paths.append(str(legacy_app_data))

    # b. backend/autoapply.db (dev mode)
    dev_db = os.path.join(BASE_DIR, "autoapply.db")
    if os.path.exists(dev_db) and os.path.getsize(dev_db) > 0:
        legacy_paths.append(dev_db)

    # c. cwd/autoapply.db (kalau launcher chdir ke suatu lokasi)
    cwd_db = os.path.join(os.getcwd(), "autoapply.db")
    if os.path.exists(cwd_db) and os.path.getsize(cwd_db) > 0:
        legacy_paths.append(cwd_db)

    # 3. Kalau legacy ditemukan, copy ke persistent
    for legacy_db in legacy_paths:
        if os.path.abspath(legacy_db) == os.path.abspath(persistent_db):
            continue  # Skip kalau ternyata sama path-nya
        try:
            print(f"[INFO] Legacy database detected: {legacy_db}")
            print(f"[INFO] Migrating to persistent location: {persistent_db}")
            shutil.copy2(legacy_db, persistent_db)
            print(f"[INFO] Database migration completed successfully")
            print(f"[INFO] Database size: {os.path.getsize(persistent_db)} bytes")
            return  # Sukses, berhenti
        except Exception as e:
            print(f"[WARNING] Failed to migrate from {legacy_db}: {e}")
            continue

    # 4. Tidak ada legacy → biarkan init_db() buat baru
    print(f"[INFO] No legacy database found. Will create new at: {persistent_db}")


def _backup_database():
    """Backup database sebelum schema migration. Backup disimpan di
    DATA_DIR/backups/autoapply-YYYYMMDD-HHMMSS.db"""
    if not os.path.exists(DB_PATH):
        return
    backup_dir = os.path.join(DATA_DIR, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(backup_dir, f"autoapply-{timestamp}.db")
    try:
        shutil.copy2(DB_PATH, backup_path)
        print(f"[INFO] Database backed up to: {backup_path}")
    except Exception as e:
        print(f"[WARNING] Failed to backup database: {e}")


# ── Schema version management (PRAGMA user_version) ───────────────────────
# Setiap perubahan schema dapat nomor version baru.
# init_db() cek version, backup database, lalu apply migration yang belum di-run.

SCHEMA_VERSION = 6  # v43: bumped to 6 (added indexes on apply_logs for faster duplicate check)

def _get_schema_version(conn):
    """Baca PRAGMA user_version dari database."""
    return conn.execute("PRAGMA user_version").fetchone()[0]

def _set_schema_version(conn, version):
    """Set PRAGMA user_version di database."""
    conn.execute(f"PRAGMA user_version = {version}")
    conn.commit()

# Mac app mode: single-user — semua operasi pakai user_id=1 (auto-provision)
APP_MODE = os.getenv("ORDAL_APP_MODE", "0") == "1"

TURSO_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN")
TURSO_SYNC_INTERVAL = int(os.getenv("TURSO_SYNC_INTERVAL", "15"))

# Kalau TURSO_DATABASE_URL & TURSO_AUTH_TOKEN diisi di .env, pakai Turso
# (embedded replica: baca dari file lokal, tulis disinkronkan ke cloud).
# Kalau kosong (misalnya dev di laptop / VPS dengan disk permanen), pakai
# sqlite3 biasa seperti sebelumnya. Tidak ada perubahan behavior untuk
# deployment VPS yang sudah punya disk persisten.
USE_TURSO = bool(TURSO_URL and TURSO_TOKEN)

if USE_TURSO:
    import libsql
else:
    import sqlite3


class Row:
    """Dict-like + tuple-like row object, supaya kompatibel dengan kode yang
    sudah ditulis untuk sqlite3.Row (mendukung row["kolom"] DAN row[0])."""

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


def _wrap_cursor(raw_cursor):
    columns = [d[0] for d in (raw_cursor.description or [])]

    class _CursorWrapper:
        def __init__(self, cur):
            self._cur = cur
            self.lastrowid = getattr(cur, "lastrowid", None)
            self.rowcount = getattr(cur, "rowcount", -1)

        def fetchone(self):
            row = self._cur.fetchone()
            return Row(columns, row) if row is not None else None

        def fetchall(self):
            return [Row(columns, row) for row in self._cur.fetchall()]

        def __iter__(self):
            for row in self._cur.fetchall():
                yield Row(columns, row)

    return _CursorWrapper(raw_cursor)


class _TursoConnWrapper:
    """Bikin koneksi libsql punya API yang sama persis dengan sqlite3.Connection
    yang dipakai di seluruh project ini (execute/commit/close/cursor)."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=()):
        cur = self._conn.execute(sql, params)
        return _wrap_cursor(cur)

    def executescript(self, sql):
        return self._conn.executescript(sql)

    def cursor(self):
        # Tidak ada state cursor terpisah yang dipakai di project ini —
        # semua pemakaian cuma cur.execute(...).fetchone()/.fetchall() berurutan.
        return self

    def commit(self):
        self._conn.commit()
        try:
            self._conn.sync()
        except Exception:
            pass

    def close(self):
        try:
            self._conn.close()
        except Exception:
            pass


def get_db():
    if USE_TURSO:
        conn = libsql.connect(
            DB_PATH,
            sync_url=TURSO_URL,
            auth_token=TURSO_TOKEN,
            sync_interval=TURSO_SYNC_INTERVAL,
        )
        try:
            conn.sync()
        except Exception:
            # Kalau lagi offline/network gangguan, tetap jalan pakai data lokal terakhir.
            pass
        return _TursoConnWrapper(conn)
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn


def ensure_column(cur, table: str, column: str, definition: str):
    cols = [row[1] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    # v42: Migrate legacy database ke persistent location SEBELUM init.
    _migrate_legacy_database()

    print(f"[INFO] ORDAL Data Dir: {DATA_DIR}")
    print(f"[INFO] Database Path: {DB_PATH}")
    db_exists = os.path.exists(DB_PATH)
    print(f"[INFO] Database exists: {db_exists}")
    if db_exists:
        print(f"[INFO] Database size: {os.path.getsize(DB_PATH)} bytes")

    conn = get_db()
    cur = conn.cursor()

    # Add cv_memory column if not exists (migration for existing DBs)
    try:
        cur.execute("ALTER TABLE cvs ADD COLUMN cv_memory TEXT")
        conn.commit()
    except Exception:
        pass  # Column already exists

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            email       TEXT    UNIQUE NOT NULL,
            password    TEXT    NOT NULL,
            name        TEXT    NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_credentials (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            platform    TEXT    NOT NULL,
            email       TEXT    NOT NULL,
            password    TEXT    NOT NULL,
            updated_at  TEXT    DEFAULT (datetime('now')),
            UNIQUE(user_id, platform)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS cvs (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            position_label TEXT    NOT NULL,
            file_name      TEXT    NOT NULL,
            file_path      TEXT    NOT NULL,
            cv_text        TEXT,
            cv_memory      TEXT,
            created_at     TEXT    DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS job_targets (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            cv_id       INTEGER NOT NULL REFERENCES cvs(id) ON DELETE CASCADE,
            position    TEXT    NOT NULL,
            location    TEXT    NOT NULL,
            platform    TEXT    NOT NULL,
            employment_type TEXT DEFAULT 'full_time',
            expected_salary TEXT DEFAULT '',
            available_join  TEXT DEFAULT '',
            excluded_positions TEXT DEFAULT '',
            cover_letter    TEXT,
            active      INTEGER DEFAULT 1,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    # Add new columns to job_targets if not exists (migration for existing DBs)
    migration_cols = [
        ("employment_type", "TEXT DEFAULT 'full_time'"),
        ("expected_salary", "TEXT DEFAULT ''"),
        ("available_join", "TEXT DEFAULT ''"),
        ("excluded_positions", "TEXT DEFAULT ''"),
        ("cover_letter", "TEXT"),
    ]
    for col_name, col_def in migration_cols:
        try:
            cur.execute(f"ALTER TABLE job_targets ADD COLUMN {col_name} {col_def}")
            conn.commit()
        except Exception:
            pass  # Column already exists

    cur.execute("""
        CREATE TABLE IF NOT EXISTS apply_sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status      TEXT    DEFAULT 'running',
            started_at  TEXT    DEFAULT (datetime('now')),
            ended_at    TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS apply_logs (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   INTEGER NOT NULL REFERENCES apply_sessions(id) ON DELETE CASCADE,
            platform     TEXT    NOT NULL,
            job_title    TEXT,
            company      TEXT,
            job_url      TEXT,
            position     TEXT,
            location     TEXT,
            job_location TEXT,
            salary       TEXT,
            question_answers TEXT,
            confirmed_at TEXT,
            status       TEXT    DEFAULT 'applied',
            skip_reason  TEXT,
            applied_at   TEXT    DEFAULT (datetime('now'))
        )
    """)

    ensure_column(cur, "apply_logs", "job_location", "TEXT")
    ensure_column(cur, "apply_logs", "salary", "TEXT")
    ensure_column(cur, "apply_logs", "question_answers", "TEXT")
    ensure_column(cur, "apply_logs", "confirmed_at", "TEXT")

    ensure_column(cur, "job_targets", "cover_letter", "TEXT")
    ensure_column(cur, "job_targets", "employment_type", "TEXT DEFAULT 'full_time'")
    ensure_column(cur, "job_targets", "expected_salary", "TEXT DEFAULT ''")
    ensure_column(cur, "job_targets", "available_join", "TEXT DEFAULT ''")
    ensure_column(cur, "job_targets", "excluded_positions", "TEXT DEFAULT ''")
    ensure_column(cur, "job_targets", "excluded_companies", "TEXT DEFAULT ''")

    ensure_column(cur, "apply_sessions", "source", "TEXT DEFAULT 'manual'")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_preferences (
            user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            expected_salary TEXT DEFAULT '',
            available_join  TEXT DEFAULT '',
            headless_mode   INTEGER DEFAULT 0,
            testing_email_mode INTEGER DEFAULT 0,
            updated_at      TEXT DEFAULT (datetime('now'))
        )
    """)
    ensure_column(cur, "user_preferences", "headless_mode", "INTEGER DEFAULT 0")
    ensure_column(cur, "user_preferences", "testing_email_mode", "INTEGER DEFAULT 0")
    ensure_column(cur, "user_preferences", "auto_apply_enabled", "INTEGER DEFAULT 0")
    ensure_column(cur, "user_preferences", "auto_apply_hour", "INTEGER DEFAULT 9")
    ensure_column(cur, "user_preferences", "auto_apply_minute", "INTEGER DEFAULT 0")
    ensure_column(cur, "user_preferences", "auto_apply_days", "TEXT DEFAULT 'mon,tue,wed,thu,fri'")
    ensure_column(cur, "user_preferences", "last_auto_apply_at", "TEXT")
    ensure_column(cur, "user_preferences", "auto_apply_force_headless", "INTEGER DEFAULT 1")

    ensure_column(cur, "user_credentials", "last_cookie_warning_at", "TEXT")
    ensure_column(cur, "user_credentials", "cookie_valid", "INTEGER DEFAULT 1")

    # ── Backup kolom untuk platform dengan disk ephemeral (misal Render free) ──
    # Isi cookie JSON & CV PDF disimpan juga sebagai data di DB (persisten lewat
    # Turso), supaya bisa direstore ke disk lokal tiap kali service restart dan
    # kehilangan file lokalnya. Di VPS dengan disk permanen, kolom ini boleh
    # tetap kosong — tidak mempengaruhi behavior yang sudah ada.
    ensure_column(cur, "user_credentials", "cookie_data", "TEXT")
    ensure_column(cur, "cvs", "file_data", "TEXT")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS question_bank (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            platform        TEXT DEFAULT '',
            question        TEXT NOT NULL,
            normalized      TEXT NOT NULL,
            answer          TEXT NOT NULL,
            field_type      TEXT DEFAULT '',
            source          TEXT DEFAULT 'ai',
            use_count       INTEGER DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, platform, normalized)
        )
    """)

    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_question_bank_user_norm
        ON question_bank(user_id, normalized)
    """)

    # v43: Index untuk apply_logs supaya _check_duplicate() cepat (sering dipanggil
    # untuk setiap lowongan yang mau dilamar). Tanpa index, query full-scan tabel
    # yang bikin bot lambat saat apply_logs udah banyak (ribuan row).
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_apply_logs_status_url
        ON apply_logs(status, job_url)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_apply_logs_status_title_company
        ON apply_logs(status, job_title, company)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_apply_logs_session_status
        ON apply_logs(session_id, status, confirmed_at)
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS telegram_users (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            chat_id TEXT UNIQUE,
            link_code TEXT UNIQUE,
            enabled INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)

    # ── Mac app mode: app_secrets table ──
    # Simpan API key (Gemini, Telegram bot token) sebagai Fernet-encrypted value
    # agar bisa di-edit dari UI Settings tanpa edit .env manual.
    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_secrets (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT DEFAULT (datetime('now'))
        )
    """)

    conn.commit()

    # v42: Schema version management.
    # Cek versi schema, backup kalau perlu migration, lalu update version.
    current_version = _get_schema_version(conn)
    if current_version > 0 and current_version < SCHEMA_VERSION:
        print(f"[INFO] Schema migration needed: v{current_version} → v{SCHEMA_VERSION}")
        _backup_database()
        _set_schema_version(conn, SCHEMA_VERSION)
        print(f"[INFO] Schema migration completed: v{SCHEMA_VERSION}")
    elif current_version == 0:
        # Database baru — set version langsung
        _set_schema_version(conn, SCHEMA_VERSION)
        print(f"[INFO] New database created with schema v{SCHEMA_VERSION}")
    else:
        print(f"[INFO] Schema version: v{current_version} (up to date)")

    # ── Mac app mode: auto-provision single user ──
    if APP_MODE:
        row = cur.execute("SELECT id FROM users WHERE id=1").fetchone()
        if not row:
            cur.execute(
                "INSERT INTO users (id, email, password, name) VALUES (1, ?, ?, ?)",
                ("local@ordal.app", "x", "Local User"),
            )
            cur.execute(
                "INSERT OR IGNORE INTO user_preferences (user_id) VALUES (1)"
            )
            conn.commit()
            print("App mode: auto-created local user (id=1)")
        else:
            # Ensure preferences row exists
            cur.execute(
                "INSERT OR IGNORE INTO user_preferences (user_id) VALUES (1)"
            )
            conn.commit()

    conn.close()
    print(f"Database initialized ({'Turso' if USE_TURSO else 'sqlite3 lokal'})")


def backup_file_to_db(table: str, id_column: str, row_id: int, data_column: str, raw_bytes: bytes):
    """Simpan isi file (CV PDF / cookie JSON) sebagai base64 ke kolom DB,
    supaya bisa direstore kalau disk lokal hilang (restart di Render/PaaS ephemeral)."""
    conn = get_db()
    try:
        encoded = base64.b64encode(raw_bytes).decode("ascii")
        conn.execute(
            f"UPDATE {table} SET {data_column} = ? WHERE {id_column} = ?",
            (encoded, row_id),
        )
        conn.commit()
    finally:
        conn.close()


def restore_persisted_files():
    """Dipanggil sekali saat startup. Kalau file lokal (CV / cookie) hilang tapi
    datanya masih ada di DB (backup dari backup_file_to_db), tulis ulang ke disk.
    Aman dipanggil di VPS biasa juga — kalau file lokal masih ada, tidak ngapa-ngapain."""
    conn = get_db()
    try:
        rows = conn.execute("SELECT id, file_path, file_data FROM cvs WHERE file_data IS NOT NULL").fetchall()
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
            print(f"Restore dari DB: {restored_cv} CV, {restored_cookie} cookie file")
    finally:
        conn.close()
