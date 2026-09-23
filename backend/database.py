import os
import sqlite3
import sys
from pathlib import Path


def _resolve_data_dir() -> str:
    configured = os.getenv("ORDAL_DATA_DIR", "").strip()
    if configured:
        os.makedirs(configured, exist_ok=True)
        return configured
    if sys.platform == "darwin":
        path = Path.home() / "Library" / "Application Support" / "ORDAL"
    elif sys.platform == "win32":
        path = Path(os.getenv("APPDATA") or os.getenv("LOCALAPPDATA") or Path.home()) / "ORDAL"
    else:
        path = Path.home() / ".local" / "share" / "ORDAL"
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


DATA_DIR = _resolve_data_dir()
DB_PATH = os.path.join(DATA_DIR, "ordal-local-v2.db")
APP_MODE = False


def get_data_dir() -> str:
    return DATA_DIR


def get_database_path() -> str:
    return DB_PATH


def get_database_url() -> str:
    return DB_PATH


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 15000")
    return connection


def query_all(sql: str, params=()) -> list[dict]:
    connection = get_db()
    try:
        return [dict(row) for row in connection.execute(sql, params).fetchall()]
    finally:
        connection.close()


def query_one(sql: str, params=()) -> dict | None:
    connection = get_db()
    try:
        row = connection.execute(sql, params).fetchone()
        return dict(row) if row else None
    finally:
        connection.close()


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS local_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    last_cookie_warning_at TEXT,
    cookie_valid INTEGER NOT NULL DEFAULT 1,
    cookie_data TEXT,
    UNIQUE(user_id, platform)
);

CREATE TABLE IF NOT EXISTS cvs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    position_label TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    cv_text TEXT,
    cv_memory TEXT,
    file_data TEXT,
    file_hash TEXT,
    storage_path TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cvs_user ON cvs(user_id);
CREATE INDEX IF NOT EXISTS idx_cvs_user_file_hash ON cvs(user_id, file_hash);

CREATE TABLE IF NOT EXISTS job_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    cv_id INTEGER REFERENCES cvs(id) ON DELETE CASCADE,
    position TEXT NOT NULL,
    location TEXT NOT NULL,
    platform TEXT NOT NULL,
    employment_type TEXT DEFAULT 'full_time',
    expected_salary TEXT DEFAULT '',
    available_join TEXT DEFAULT '',
    excluded_positions TEXT DEFAULT '',
    excluded_companies TEXT DEFAULT '',
    cover_letter TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_targets_user ON job_targets(user_id, active);
CREATE INDEX IF NOT EXISTS idx_job_targets_cv ON job_targets(cv_id);

CREATE TABLE IF NOT EXISTS apply_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    source TEXT DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_apply_sessions_user ON apply_sessions(user_id, started_at);

CREATE TABLE IF NOT EXISTS apply_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES apply_sessions(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    job_title TEXT,
    company TEXT,
    job_url TEXT,
    position TEXT,
    location TEXT,
    job_location TEXT,
    salary TEXT,
    question_answers TEXT,
    confirmed_at TEXT,
    status TEXT DEFAULT 'applied',
    skip_reason TEXT,
    applied_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_apply_logs_status_url ON apply_logs(status, job_url);
CREATE INDEX IF NOT EXISTS idx_apply_logs_status_title_company ON apply_logs(status, job_title, company);
CREATE INDEX IF NOT EXISTS idx_apply_logs_session_status ON apply_logs(session_id, status, confirmed_at);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    expected_salary TEXT DEFAULT '',
    available_join TEXT DEFAULT '',
    headless_mode INTEGER NOT NULL DEFAULT 0,
    testing_email_mode INTEGER NOT NULL DEFAULT 0,
    auto_apply_enabled INTEGER NOT NULL DEFAULT 0,
    auto_apply_hour INTEGER NOT NULL DEFAULT 9,
    auto_apply_minute INTEGER NOT NULL DEFAULT 0,
    auto_apply_days TEXT DEFAULT 'mon,tue,wed,thu,fri',
    last_auto_apply_at TEXT,
    auto_apply_force_headless INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS question_bank (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    platform TEXT DEFAULT '',
    question TEXT NOT NULL,
    normalized TEXT NOT NULL,
    answer TEXT NOT NULL,
    field_type TEXT DEFAULT '',
    source TEXT DEFAULT 'ai',
    use_count INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, platform, normalized)
);
CREATE INDEX IF NOT EXISTS idx_question_bank_user_norm ON question_bank(user_id, normalized);

CREATE TABLE IF NOT EXISTS telegram_users (
    user_id TEXT PRIMARY KEY,
    chat_id TEXT UNIQUE,
    link_code TEXT UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    smtp_host TEXT DEFAULT 'smtp.gmail.com',
    smtp_port INTEGER DEFAULT 587,
    sender_email TEXT DEFAULT '',
    app_password TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_onboarding (
    user_id TEXT PRIMARY KEY,
    current_step INTEGER NOT NULL DEFAULT 1,
    cv_id INTEGER,
    preferences TEXT NOT NULL DEFAULT '{}',
    cover_letter TEXT,
    platforms TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_user_profile (
    user_id TEXT PRIMARY KEY,
    email_verified INTEGER NOT NULL DEFAULT 1,
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
"""


def init_db():
    connection = get_db()
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(SCHEMA_SQL)
        connection.commit()
    finally:
        connection.close()
    print(f"[INFO] Database lokal siap: {DB_PATH}")


def sync_local_user(user: dict) -> None:
    if not user.get("id"):
        return
    connection = get_db()
    try:
        connection.execute(
            "INSERT INTO local_users (id, email, name, updated_at) VALUES (?, ?, ?, datetime('now')) "
            "ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, updated_at=datetime('now')",
            (str(user["id"]), str(user.get("email") or ""), str(user.get("name") or "")),
        )
        connection.execute("INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)", (str(user["id"]),))
        connection.execute("INSERT OR IGNORE INTO app_user_profile (user_id) VALUES (?)", (str(user["id"]),))
        connection.commit()
    finally:
        connection.close()


def backup_file_to_db(*_args, **_kwargs):
    return None


def restore_persisted_files():
    return None
