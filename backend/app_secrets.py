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
from typing import Optional

from database import get_db

# Lazy import encryption untuk avoid circular import di edge cases
_encrypt = None
_decrypt = None


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


# ── Convenience wrappers ──────────────────────────────────────────────────────
def get_gemini_api_key() -> str:
    return get_secret("GEMINI_API_KEY")


def get_telegram_bot_token() -> str:
    return get_secret("TELEGRAM_BOT_TOKEN")
