"""
App Config Router — endpoint yang dipakai UI Settings untuk read/set app secrets.

Di Mac app mode, secret (GEMINI_API_KEY, TELEGRAM_BOT_TOKEN) tidak lagi dari .env,
tapi dari tabel app_secrets (di-encrypt Fernet). Endpoint ini ekspos read/set
dengan masking value (supaya tidak expose di UI), plus test-connection.

Endpoints:
  GET  /api/app_config              → status semua secret (true/false, masked)
  GET  /api/app_config/{key}        → detail satu secret (masked value)
  PUT  /api/app_config/{key}        → set secret value
  DELETE /api/app_config/{key}      → hapus secret
  POST /api/app_config/test/gemini  → test Gemini API key
  POST /api/app_config/test/telegram→ test Telegram bot token
  POST /api/app_config/test/email   → (delegasi ke email_config router)
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app_secrets import get_local_secret, set_local_secret
from auth_utils import get_current_user

router = APIRouter()

# Daftar secret yang dikenali. Masked value = prefix + suffix.
KNOWN_SECRETS = {
    "TELEGRAM_BOT_TOKEN": {
        "label": "Telegram Bot Token",
        "description": "Untuk kontrol via Telegram & notifikasi auto-apply. Dapat dari @BotFather.",
        "link": "https://t.me/BotFather",
        "test_endpoint": "/api/app_config/test/telegram",
    },
}


def _mask(value: str) -> str:
    """Mask value: tampilkan 4 char pertama + 4 char terakhir, tengah ••••."""
    if not value:
        return ""
    if len(value) <= 8:
        return "••••"
    return f"{value[:4]}••••{value[-4:]}"


class SecretUpdate(BaseModel):
    value: str


@router.get("")
def list_secrets(user: dict = Depends(get_current_user)):
    """
    Return status semua secret yang dikenali + indikator configured.
    Jangan pernah return value plain-text di sini.
    """
    out = []
    for key, meta in KNOWN_SECRETS.items():
        val = get_local_secret(key, "")
        out.append({
            "key": key,
            "label": meta["label"],
            "description": meta["description"],
            "link": meta["link"],
            "configured": bool(val),
            "masked": _mask(val),
            "test_endpoint": meta["test_endpoint"],
        })
    return {"secrets": out}


# ── Telegram Link endpoints ─────────────────────────────────────────────────
# Dideklarasikan SEBELUM /{key} route supaya tidak kena intercept oleh path param.

class TelegramLinkRequest(BaseModel):
    identifier: str  # bisa: "123456789" (numeric) atau "@username" atau "username"


@router.get("/telegram_link")
def get_telegram_link(user: dict = Depends(get_current_user)):
    """Cek status link Telegram untuk user ini."""
    from database import get_db as _get_db
    from services.telegram_service import _resolve_bot_token

    db = _get_db()
    try:
        row = db.execute(
            "SELECT chat_id, link_code, enabled FROM telegram_users WHERE user_id=?",
            (user["id"],),
        ).fetchone()
    finally:
        db.close()

    token = _resolve_bot_token()

    if row and row["chat_id"]:
        return {
            "connected": True,
            "chat_id": row["chat_id"],
            "enabled": bool(row["enabled"]),
            "link_code": row["link_code"],
            "bot_configured": bool(token),
        }
    return {
        "connected": False,
        "chat_id": None,
        "enabled": False,
        "link_code": row["link_code"] if row else None,
        "bot_configured": bool(token),
    }


@router.post("/telegram_link")
async def set_telegram_link(body: TelegramLinkRequest, user: dict = Depends(get_current_user)):
    """Link Telegram chat_id untuk user ini. Resolve identifier → chat_id, kirim test, simpan."""
    import httpx
    from database import get_db as _get_db
    from services.telegram_service import _resolve_bot_token

    token = _resolve_bot_token()
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN belum di-set."}

    identifier = (body.identifier or "").strip().lstrip("@")
    if not identifier:
        return {"ok": False, "error": "Identifier tidak boleh kosong."}

    chat_id = None
    resolved_username = None
    resolved_first_name = None

    async with httpx.AsyncClient(timeout=15) as client:
        if identifier.lstrip("-").isdigit():
            chat_id = identifier
        else:
            # ── Resolve username → chat_id via Telegram getChat API ──────────
            # PENTING: Bot API getChat dengan @username HANYA berhasil jika user
            # sudah pernah /start atau kirim pesan ke bot sebelumnya. Jika user
            # belum pernah interaksi dengan bot, getChat return 400 "chat not found"
            # — padahal username-nya benar dan akunnya ada.
            #
            # Bug lama: error "Username tidak ditemukan" menyesatkan user (terdengar
            # seperti username salah). Sekarang kita deteksi kasus "chat not found"
            # dan beri pesan yang jelas: user harus /start bot dulu.
            try:
                resp = await client.get(
                    f"https://api.telegram.org/bot{token}/getChat",
                    params={"chat_id": f"@{identifier}"},
                )
                data = resp.json()
                if not data.get("ok"):
                    desc = data.get("description", "")
                    desc_low = desc.lower()
                    # Kasus 1: user belum pernah /start bot
                    if "chat not found" in desc_low or "not found" in desc_low:
                        return {
                            "ok": False,
                            "error": (
                                f"Akun @{identifier} terdeteksi, tetapi bot belum bisa "
                                f"mengakses chat Anda karena Anda belum pernah /start bot.\n\n"
                                f"Silakan:\n"
                                f"1. Buka Telegram, cari bot @siordal_bot\n"
                                f"2. Klik tombol Start atau kirim perintah /start\n"
                                f"3. Tunggu 5-10 detik\n"
                                f"4. Kembali ke sini, klik tombol Link lagi\n\n"
                                f"(Detail teknis: {desc})"
                            ),
                            "needs_start": True,
                        }
                    # Kasus 2: username benar-benar tidak ada
                    if "user not found" in desc_low or "username is not occupied" in desc_low or "invalid username" in desc_low:
                        return {
                            "ok": False,
                            "error": (
                                f"Username @{identifier} tidak terdaftar di Telegram. "
                                f"Periksa ejaan username (huruf besar/kecil tidak masalah, "
                                f"tapi karakter lain harus persis). Anda bisa cek username "
                                f"di app Telegram → Settings → Username."
                            ),
                        }
                    # Kasus lain: tampilkan detail apa adanya
                    return {
                        "ok": False,
                        "error": (
                            f"Tidak bisa resolve username @{identifier}. "
                            f"Detail: {desc}"
                        ),
                    }
                chat_info = data["result"]
                chat_id = str(chat_info["id"])
                resolved_username = chat_info.get("username")
                resolved_first_name = chat_info.get("first_name")
            except Exception as e:
                return {"ok": False, "error": f"Gagal resolve username: {e}"}

        try:
            test_msg = (
                "*ORDAL Bot Linked*\n\n"
                "Akun Telegram Anda sudah terhubung dengan ORDAL.\n"
                "Anda akan menerima notifikasi auto-apply & bisa kontrol bot dari sini.\n\n"
                "Kirim /help untuk lihat daftar perintah."
            )
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": test_msg, "parse_mode": "Markdown"},
            )
            data = resp.json()
            if not data.get("ok"):
                desc = data.get("description", "")
                if "bot can't initiate conversation" in desc or "Forbidden" in desc or "chat not found" in desc:
                    return {
                        "ok": False,
                        "error": (
                            f"Bot belum bisa mengirim pesan ke Anda. "
                            f"Buka Telegram, cari bot Anda (@siordal_bot atau username bot Anda), "
                            f"klik Start / kirim perintah /start dulu. "
                            f"Setelah itu, klik tombol Link lagi. (Detail: {desc})"
                        ),
                        "needs_start": True,
                    }
                return {"ok": False, "error": f"Gagal kirim test message: {desc}"}
        except Exception as e:
            return {"ok": False, "error": f"Gagal kirim test message: {e}"}

    db = _get_db()
    try:
        db.execute(
            """
            INSERT INTO telegram_users (user_id, chat_id, link_code, enabled, updated_at)
            VALUES (?, ?, NULL, 1, datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
                chat_id = excluded.chat_id,
                enabled = 1,
                updated_at = datetime('now')
            """,
            (user["id"], chat_id),
        )
        db.commit()
    finally:
        db.close()

    return {
        "ok": True,
        "chat_id": chat_id,
        "username": resolved_username,
        "first_name": resolved_first_name,
        "detail": f"Berhasil! Notifikasi akan dikirim ke chat_id {chat_id}.",
    }


@router.delete("/telegram_link")
def unlink_telegram(user: dict = Depends(get_current_user)):
    """Hapus link Telegram (chat_id di-set NULL)."""
    from database import get_db as _get_db

    db = _get_db()
    try:
        db.execute(
            "UPDATE telegram_users SET chat_id = NULL, enabled = 0, updated_at = datetime('now') WHERE user_id = ?",
            (user["id"],),
        )
        db.commit()
    finally:
        db.close()
    return {"ok": True, "detail": "Link Telegram dihapus."}


@router.post("/telegram_link/auto")
async def auto_link_telegram(user: dict = Depends(get_current_user)):
    """
    Auto-link Telegram: cek apakah user sudah /start bot.

    Flow:
    1. User buka @siordal_bot di Telegram, klik /start dengan link code
    2. Backend polling service (telegram_service) terima /start <code>,
       otomatis simpan chat_id ke telegram_users untuk user pemilik code
    3. User kembali ke app, klik "Auto-link via /start"
    4. Endpoint ini cek DB — kalau chat_id sudah ada, return sukses
    5. Kalau belum ada, return instruksi ulang

    Endpoint ini TIDAK call getUpdates langsung (akan conflict dengan polling
    service yang sudah jalan 24/7 di backend).
    """
    from database import get_db as _get_db

    db = _get_db()
    try:
        row = db.execute(
            "SELECT chat_id, enabled FROM telegram_users WHERE user_id=?",
            (user["id"],),
        ).fetchone()
    finally:
        db.close()

    if row and row["chat_id"]:
        return {
            "ok": True,
            "chat_id": row["chat_id"],
            "username": None,
            "first_name": None,
            "detail": f"Berhasil! Akun Telegram Anda sudah terhubung (chat_id {row['chat_id']}).",
        }

    # Belum ada — user belum /start bot
    return {
        "ok": False,
        "error": (
            "Belum terdeteksi /start dari bot.\n\n"
            "Lakukan langkah berikut:\n"
            "1. Buka Telegram, cari bot @siordal_bot\n"
            "2. Klik tombol Start atau kirim perintah /start\n"
            "3. Tunggu 5-10 detik, lalu klik tombol 'Auto-link via /start' lagi"
        ),
    }


# ── Per-secret CRUD ─────────────────────────────────────────────────────────
# Dideklarasikan SETELAH semua specific path (/telegram_link, /test/*, dst.)
# supaya tidak intercept path yang lebih spesifik.

@router.get("/{key}")
def get_one_secret(key: str, user: dict = Depends(get_current_user)):
    if key not in KNOWN_SECRETS:
        raise HTTPException(status_code=404, detail=f"Unknown secret: {key}")
    val = get_local_secret(key, "")
    meta = KNOWN_SECRETS[key]
    return {
        "key": key,
        "label": meta["label"],
        "description": meta["description"],
        "link": meta["link"],
        "configured": bool(val),
        "masked": _mask(val),
    }


@router.put("/{key}")
def set_one_secret(key: str, body: SecretUpdate, user: dict = Depends(get_current_user)):
    """Set secret value. Empty string akan menghapus."""
    if key not in KNOWN_SECRETS:
        raise HTTPException(status_code=404, detail=f"Unknown secret: {key}")
    value = (body.value or "").strip()
    set_local_secret(key, value)
    return {
        "key": key,
        "configured": bool(value),
        "masked": _mask(value) if value else "",
    }


@router.delete("/{key}")
def delete_one_secret(key: str, user: dict = Depends(get_current_user)):
    if key not in KNOWN_SECRETS:
        raise HTTPException(status_code=404, detail=f"Unknown secret: {key}")
    set_local_secret(key, "")
    return {"key": key, "configured": False}


# ── Test endpoints ────────────────────────────────────────────────────────────
@router.post("/test/gemini")
async def test_gemini(user: dict = Depends(get_current_user)):
    """Test Gemini API key secara EKSPLISIT — bukan active provider.

    Bug lama: endpoint ini mengetes `get_active_provider()` yang mungkin saja
    bukan Gemini (mis. user belum klik 'Pakai' di halaman AI, atau sudah set
    OpenAI sebagai active). Akibatnya tombol Test di Settings selalu gagal
    walau Gemini API key sudah benar, padahal chat AI (yang memakai active
    provider) bisa jalan. Sekarang kita paksa test Gemini langsung.
    """
    try:
        from workers import ai_service
        result = await ai_service.test_provider(user["id"], "gemini")
        return result
    except Exception as e:
        return {"ok": False, "error": f"Ai service error: {e}"}


@router.post("/test/telegram")
async def test_telegram(user: dict = Depends(get_current_user)):
    """Test Telegram bot token dengan getMe. Pakai _resolve_bot_token (default hardcoded).
    
    Timeout dipercepat jadi 5 detik agar respons lebih cepat.
    """
    from services.telegram_service import _resolve_bot_token
    token = _resolve_bot_token()
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN belum di-set."}
    import httpx
    try:
        # Timeout dipercepat dari 15s ke 5s untuk respons yang lebih cepat
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"https://api.telegram.org/bot{token}/getMe")
            data = resp.json()
            if data.get("ok"):
                bot = data["result"]
                return {
                    "ok": True,
                    "detail": f"Bot @{bot.get('username','?')} ({bot.get('first_name','?')}) terhubung.",
                    "bot_username": bot.get("username"),
                }
            return {"ok": False, "error": data.get("description", "Unknown error")}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Timeout: Koneksi ke Telegram terlalu lama. Periksa koneksi internet atau token bot."}
    except Exception as e:
        return {"ok": False, "error": str(e)}
