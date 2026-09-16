"""
App Secrets — storage helper untuk API key dan token yang sebelumnya dari .env.

Di Mac app mode, secret (GEMINI_API_KEY, TELEGRAM_BOT_TOKEN) disimpan di tabel
app_secrets dan dapat di-edit dari UI Settings. Get/Set di-encrypt dengan Fernet
(sama seperti SMTP password).

Module ini juga menjadi "config source" untuk backend — saat module-level
GEMINI_API_KEY/TELEGRAM_BOT_TOKEN dibaca, fall back ke DB dulu, lalu env.
"""
from __future__ import annotations

import os
import json
import threading
from typing import Optional

from database import get_db, get_data_dir

# Lazy import encryption untuk avoid circular import di edge cases
_encrypt = None
_decrypt = None
_local_lock = threading.Lock()
_LOCAL_SECRETS_PATH = os.path.join(get_data_dir(), "user-secrets.json")


def _get_cipher():
    global _encrypt, _decrypt
    if _encrypt is None:
        from encryption import encrypt_value, decrypt_value
        _encrypt = encrypt_value
        _decrypt = decrypt_value
    return _encrypt, _decrypt


def get_secret(key: str, default: str = "") -> str:
    """
    Baca secret dari DB (app_secrets table).
    Jika tidak ada / error, fall back ke env var dengan nama yang sama.

    Urutan prioritas:
    1. app_secrets table (di-edit dari UI)
    2. os.getenv(key)
    3. default
    """
    # Try DB first
    try:
        db = get_db()
        try:
            row = db.execute(
                "SELECT value FROM app_secrets WHERE key=?", (key,)
            ).fetchone()
            if row and row["value"]:
                _, decrypt_fn = _get_cipher()
                try:
                    decrypted = decrypt_fn(row["value"])
                    if decrypted:
                        return decrypted
                except Exception:
                    # Fallback: treat as plaintext (legacy)
                    return row["value"]
        finally:
            db.close()
    except Exception:
        pass

    # Fallback to env
    return os.getenv(key, default)


def set_secret(key: str, value: str) -> None:
    """Simpan secret ke DB. Empty value akan menghapus entry."""
    db = get_db()
    try:
        if not value:
            db.execute("DELETE FROM app_secrets WHERE key=?", (key,))
        else:
            encrypt_fn, _ = _get_cipher()
            encrypted = encrypt_fn(value)
            db.execute(
                """
                INSERT INTO app_secrets (key, value, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
                """,
                (key, encrypted),
            )
        db.commit()
    finally:
        db.close()


def list_secret_keys() -> list[str]:
    """Return list of keys yang sudah pernah di-set di DB (untuk debug/status)."""
    db = get_db()
    try:
        rows = db.execute("SELECT key FROM app_secrets ORDER BY key").fetchall()
        return [r["key"] for r in rows]
    finally:
        db.close()


def has_secret(key: str) -> bool:
    """Cek apakah secret sudah di-set (DB atau env)."""
    val = get_secret(key, "")
    return bool(val)


def _read_local_secrets() -> dict:
    if not os.path.exists(_LOCAL_SECRETS_PATH):
        return {}
    try:
        with open(_LOCAL_SECRETS_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_local_secrets(data: dict) -> None:
    os.makedirs(os.path.dirname(_LOCAL_SECRETS_PATH), exist_ok=True)
    temp_path = _LOCAL_SECRETS_PATH + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, separators=(",", ":"))
    os.chmod(temp_path, 0o600)
    os.replace(temp_path, _LOCAL_SECRETS_PATH)


def get_user_secret(user_id: str, key: str, default: str = "") -> str:
    with _local_lock:
        encrypted = _read_local_secrets().get(str(user_id), {}).get(key)
    if not encrypted:
        return os.getenv(key, default)
    _, decrypt_fn = _get_cipher()
    try:
        return decrypt_fn(encrypted)
    except Exception:
        return default


def set_user_secret(user_id: str, key: str, value: str) -> None:
    encrypt_fn, _ = _get_cipher()
    with _local_lock:
        data = _read_local_secrets()
        bucket = data.setdefault(str(user_id), {})
        if value:
            bucket[key] = encrypt_fn(value)
        else:
            bucket.pop(key, None)
        if not bucket:
            data.pop(str(user_id), None)
        _write_local_secrets(data)


def get_local_secret(key: str, default: str = "") -> str:
    return get_user_secret("_device", key, default)


def set_local_secret(key: str, value: str) -> None:
    set_user_secret("_device", key, value)


# ── Convenience wrappers ──────────────────────────────────────────────────────
def get_gemini_api_key() -> str:
    return get_secret("GEMINI_API_KEY")


def get_telegram_bot_token() -> str:
    return get_local_secret("TELEGRAM_BOT_TOKEN")
