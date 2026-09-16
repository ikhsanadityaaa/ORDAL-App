"""ORDAL v3 — Auth router.

Flow baru:
1. Register (email+password) → akun dibuat di DB pusat (tabel "User" milik web)
   tanpa memulai trial → email verifikasi WAJIB.
2. Login (email+password) → kalau email belum diverifikasi → kirim kode lagi.
3. Verifikasi email: kode 6 digit, berlaku 15 menit, resend cooldown 60 detik.
4. Google OAuth 2.0 (PKCE + loopback redirect) — email otomatis terverifikasi.
5. Device: 1 akun maksimal 2 device (mirip WhatsApp). Login ke-3 ditolak
   sampai salah satu device dikeluarkan lewat dashboard device.
6. Login tercatat di app_login_events; logout melepas slot device ini.
"""
import base64
import hashlib
import os
import secrets
import string
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr, Field

from database import get_db, query_one
from auth_utils import (
    hash_password,
    verify_password_ex,
    create_token,
    get_current_user,
    get_or_create_device_id,
    get_device_name,
    get_app_version,
    get_device_fingerprint,
)
from abuse_prevention import (
    assert_email_allowed,
    canonicalize_email,
    device_signal,
    email_signal,
    login_attempt_allowed,
    record_event,
    register_attempt_allowed,
)
from services.email_sender import is_smtp_configured, send_verification_email

router = APIRouter()

MAX_DEVICES = 2
CODE_EXPIRE_MINUTES = 15
RESEND_COOLDOWN_SECONDS = 60
MAX_CODE_ATTEMPTS = 10
CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # tanpa I/O/0/1 (sama dengan web)
USER_CODE_PREFIX = "ORD-USER-"

GOOGLE_CLIENT_ID = ""
GOOGLE_CLIENT_SECRET = ""


def _load_google_creds():
    import os
    global GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
    GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()


_load_google_creds()


def google_configured() -> bool:
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


# ── Helpers: id & kode (format sama dengan ORDAL-Web) ─────────────────────

def _gen_cuid_like() -> str:
    """ID 25 karakter mirip Prisma cuid(): 'c' + 24 char base36."""
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    return "c" + "".join(secrets.choice(alphabet) for _ in range(24))


def _gen_user_code() -> str:
    return USER_CODE_PREFIX + "".join(secrets.choice(CODE_CHARSET) for _ in range(6))


def _create_web_user(db, email: str, name: str, password: str | None, provider: str) -> dict:
    """Buat user di tabel "User" (schema Prisma milik web).
    CATATAN v3.1: Trial 3 hari TIDAK dibuat di sini — trial dimulai saat user
    pertama kali klik "Cari Kerja" (lihat routers/license.py: ensure_trial_started).
    Install ulang app tidak mereset trial karena trial tersimpan di DB pusat."""
    for _ in range(5):
        uid = _gen_cuid_like()
        ucode = _gen_user_code()
        try:
            db.execute(
                'INSERT INTO "User" ("id", "email", "emailCanonical", "name", "password", "authProvider", "uniqueUserCode", "createdAt", "updatedAt") '
                "VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
                (uid, email, canonicalize_email(email), name, password, provider, ucode),
            )
            db.execute(
                "INSERT INTO app_user_profile (user_id, email_verified) VALUES (?, ?) ON CONFLICT DO NOTHING",
                (uid, provider == "google"),
            )
            db.commit()
            return {"id": uid, "email": email, "name": name, "uniqueUserCode": ucode}
        except Exception:
            db.rollback()
            continue
    raise HTTPException(status_code=500, detail="Gagal membuat akun, coba lagi")


def _get_user_by_email(email: str) -> dict | None:
    return query_one(
        'SELECT "id", "email", "name", "password", "authProvider", "uniqueUserCode", "createdAt" '
        'FROM "User" WHERE "email" = ? OR "emailCanonical" = ? ORDER BY CASE WHEN "email" = ? THEN 0 ELSE 1 END LIMIT 1',
        (email, canonicalize_email(email), email),
    )


def _get_profile(user_id: str) -> dict:
    row = query_one(
        "SELECT email_verified, onboarding_completed FROM app_user_profile WHERE user_id = ?",
        (user_id,),
    )
    if row:
        return {"email_verified": bool(row["email_verified"]), "onboarding_completed": bool(row["onboarding_completed"])}
    return {"email_verified": False, "onboarding_completed": False}


def _ensure_profile(db, user_id: str, verified: bool = False):
    db.execute(
        "INSERT INTO app_user_profile (user_id, email_verified) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING",
        (user_id, verified),
    )
    db.commit()


# ── Helpers: kode verifikasi email ────────────────────────────────────────

def _hash_code(email: str, code: str) -> str:
    return hashlib.sha256(f"{email.lower()}:{code}".encode()).hexdigest()


def _issue_verification_code(db, email: str) -> dict:
    """Buat & kirim kode verifikasi. Return info utk frontend.
    Raise 429 kalau masih dalam cooldown resend."""
    last = query_one(
        "SELECT sent_at FROM app_verification_codes WHERE email = ? ORDER BY id DESC LIMIT 1",
        (email,),
    )
    if last and last.get("sent_at"):
        sent_at = last["sent_at"]
        if isinstance(sent_at, str):
            sent_at = datetime.fromisoformat(sent_at)
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - sent_at).total_seconds()
        if elapsed < RESEND_COOLDOWN_SECONDS:
            raise HTTPException(
                status_code=429,
                detail=f"Tunggu {int(RESEND_COOLDOWN_SECONDS - elapsed)} detik sebelum kirim ulang kode",
            )

    code = "".join(secrets.choice(string.digits) for _ in range(6))
    db.execute(
        "INSERT INTO app_verification_codes (email, code_hash, purpose, expires_at, sent_at) "
        "VALUES (?, ?, 'verify_email', NOW() + INTERVAL '15 minutes', NOW())",
        (email, _hash_code(email, code)),
    )
    db.commit()

    sent = False
    dev_code = None
    allow_dev_code = os.getenv("ALLOW_DEV_VERIFICATION_CODE", "").strip().lower() in ("1", "true", "yes")
    if is_smtp_configured():
        try:
            send_verification_email(email, code)
            sent = True
        except Exception as e:
            print(f"[WARN] Gagal kirim email verifikasi: {e}")
            if allow_dev_code:
                dev_code = code
    elif allow_dev_code:
        dev_code = code

    return {"sent": sent, "dev_code": dev_code, "smtp_configured": is_smtp_configured()}


def _check_verification_code(db, email: str, code: str) -> bool:
    row = query_one(
        "SELECT id, code_hash, attempts, expires_at FROM app_verification_codes "
        "WHERE email = ? ORDER BY id DESC LIMIT 1",
        (email,),
    )
    if not row:
        raise HTTPException(status_code=400, detail="Kode verifikasi tidak ditemukan. Kirim ulang kode.")
    expires_at = row["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Kode kedaluwarsa. Kirim ulang kode baru.")
    if int(row["attempts"] or 0) >= MAX_CODE_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Percobaan terlalu banyak. Kirim ulang kode baru.")
    if row["code_hash"] != _hash_code(email, code):
        db.execute(
            "UPDATE app_verification_codes SET attempts = attempts + 1 WHERE id = ?",
            (row["id"],),
        )
        db.commit()
        return False
    # sukses — hapus semua kode utk email ini
    db.execute("DELETE FROM app_verification_codes WHERE email = ?", (email,))
    db.commit()
    return True


# ── Helpers: device & sesi ────────────────────────────────────────────────

def _device_list(user_id: str) -> list[dict]:
    from database import query_all
    rows = query_all(
        "SELECT id, device_id, device_name, os, app_version, last_login_at, last_active_at, created_at "
        "FROM app_devices WHERE user_id = ? ORDER BY last_login_at DESC",
        (user_id,),
    )
    current = get_or_create_device_id()
    for r in rows:
        r["is_current"] = r["device_id"] == current
        for k in ("last_login_at", "last_active_at", "created_at"):
            if isinstance(r.get(k), datetime):
                r[k] = r[k].isoformat()
    return rows


class _DeviceLimit(HTTPException):
    def __init__(self, devices: list[dict]):
        super().__init__(
            status_code=403,
            detail={
                "code": "DEVICE_LIMIT",
                "message": f"Batas {MAX_DEVICES} device tercapai. Keluarkan salah satu device untuk lanjut.",
                "devices": devices,
            },
        )


def _register_device(db, user_id: str):
    """Daftarkan device ini (atau refresh kalau sudah terdaftar).
    Raise 403 DEVICE_LIMIT kalau sudah penuh (max 2)."""
    device_id = get_or_create_device_id()
    device_name = get_device_name()
    import platform as _plat
    os_name = _plat.platform() or ""

    existing = query_one(
        "SELECT id FROM app_devices WHERE user_id = ? AND device_id = ?",
        (user_id, device_id),
    )
    if existing:
        db.execute(
            "UPDATE app_devices SET device_name = ?, os = ?, app_version = ?, last_login_at = NOW(), last_active_at = NOW() "
            "WHERE id = ?",
            (device_name, os_name, get_app_version(), existing["id"]),
        )
        db.commit()
        return

    count = query_one("SELECT COUNT(*) AS n FROM app_devices WHERE user_id = ?", (user_id,))
    if int(count["n"]) >= MAX_DEVICES:
        db.close()
        raise _DeviceLimit(_device_list(user_id))

    db.execute(
        "INSERT INTO app_devices (user_id, device_id, device_name, os, app_version, last_login_at, last_active_at) "
        "VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
        (user_id, device_id, device_name, os_name, get_app_version()),
    )
    db.commit()


def _record_login_event(db, user_id: str, method: str):
    db.execute(
        "INSERT INTO app_login_events (user_id, device_id, device_name, method, ip) VALUES (?, ?, ?, ?, ?)",
        (user_id, get_or_create_device_id(), get_device_name(), method, ""),
    )
    db.commit()


def _restore_user_files(user_id: str):
    """Pindahkan file CV & cookie milik user dari DB pusat ke disk lokal
    (untuk device baru / app update)."""
    from database import restore_persisted_files
    try:
        restore_persisted_files()
    except Exception as e:
        print(f"[WARN] restore file user gagal: {e}")


def _user_payload(user: dict) -> dict:
    profile = _get_profile(user["id"])
    created = user.get("createdAt")
    if isinstance(created, datetime):
        created = created.isoformat()
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "uniqueUserCode": user.get("uniqueUserCode") or "",
        "authProvider": user.get("authProvider") or "email",
        "emailVerified": profile["email_verified"],
        "createdAt": created,
    }


def _onboarding_payload(user_id: str) -> dict:
    row = query_one(
        "SELECT completed, current_step FROM app_onboarding WHERE user_id = ?",
        (user_id,),
    )
    if not row:
        return {"completed": False, "current_step": 1}
    return {"completed": bool(row["completed"]), "current_step": int(row["current_step"] or 1)}


def _issue_session(db, user: dict, method: str) -> dict:
    """Register device → token → payload login lengkap."""
    _register_device(db, user["id"])
    _record_login_event(db, user["id"], method)
    token = create_token(user["id"], user["email"], get_or_create_device_id())
    return {
        "token": token,
        "user": _user_payload(user),
        "onboarding": _onboarding_payload(user["id"]),
        "devices": _device_list(user["id"]),
    }


# ── Schemas ───────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)


class ResendRequest(BaseModel):
    email: EmailStr


class GoogleStartRequest(BaseModel):
    pass  # device info diambil server-side


class GooglePollRequest(BaseModel):
    state: str


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/register")
def register(req: RegisterRequest):
    email = req.email.lower().strip()
    assert_email_allowed(email)
    registration_device = device_signal(get_device_fingerprint())
    register_attempt_allowed(registration_device)
    record_event("register_attempt", registration_device, detail=canonicalize_email(email).rsplit("@", 1)[-1])
    db = get_db()
    try:
        existing = _get_user_by_email(email)
        if existing:
            raise HTTPException(status_code=409, detail="Email sudah terdaftar. Silakan masuk.")

        created = _create_web_user(db, email, req.name.strip(), hash_password(req.password), "email")
        record_event("register_created", registration_device, user_id=created["id"])

        verif = _issue_verification_code(db, email)
        return {
            "requires_verification": True,
            "email": email,
            "sent": verif["sent"],
            "smtp_configured": verif["smtp_configured"],
            "dev_code": verif["dev_code"],
        }
    finally:
        db.close()


@router.post("/login")
def login(req: LoginRequest):
    email = req.email.lower().strip()
    login_email_hash = email_signal(email)
    login_device_hash = device_signal(get_device_fingerprint())
    login_attempt_allowed(login_email_hash, login_device_hash)
    user = _get_user_by_email(email)
    if not user:
        record_event("login_failed", login_email_hash, detail="email")
        record_event("login_failed", login_device_hash, detail="device")
        raise HTTPException(status_code=401, detail="Email atau password salah")

    if user.get("password") is None and (user.get("authProvider") or "email") == "google":
        raise HTTPException(status_code=401, detail="Akun ini terdaftar lewat Google. Gunakan tombol Google untuk masuk.")

    ok, needs_upgrade = verify_password_ex(req.password, user.get("password") or "")
    if not ok:
        record_event("login_failed", login_email_hash, user_id=user["id"], detail="email")
        record_event("login_failed", login_device_hash, user_id=user["id"], detail="device")
        raise HTTPException(status_code=401, detail="Email atau password salah")

    # Upgrade hash SHA-256/bcrypt lama ke format scrypt bersama.
    if needs_upgrade:
        db = get_db()
        try:
            db.execute('UPDATE "User" SET "password" = ?, "updatedAt" = NOW() WHERE "id" = ?',
                       (hash_password(req.password), user["id"]))
            db.commit()
        finally:
            db.close()

    profile = _get_profile(user["id"])
    if not profile["email_verified"]:
        db = get_db()
        try:
            verif = _issue_verification_code(db, email)
        finally:
            db.close()
        return {
            "requires_verification": True,
            "email": email,
            "sent": verif["sent"],
            "smtp_configured": verif["smtp_configured"],
            "dev_code": verif["dev_code"],
        }

    db = get_db()
    try:
        result = _issue_session(db, user, "password")
        record_event("login_success", login_email_hash, user_id=user["id"])
        _restore_user_files(user["id"])
        return result
    finally:
        db.close()


@router.post("/verify")
def verify_email(req: VerifyRequest):
    email = req.email.lower().strip()
    user = _get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")

    db = get_db()
    try:
        if not _check_verification_code(db, email, req.code.strip()):
            raise HTTPException(status_code=400, detail="Kode verifikasi salah")

        db.execute(
            "INSERT INTO app_user_profile (user_id, email_verified) VALUES (?, TRUE) "
            "ON CONFLICT (user_id) DO UPDATE SET email_verified = TRUE, updated_at = NOW()",
            (user["id"],),
        )
        db.commit()

        result = _issue_session(db, user, "password")
        _restore_user_files(user["id"])
        return result
    finally:
        db.close()


@router.post("/resend")
def resend_code(req: ResendRequest):
    email = req.email.lower().strip()
    user = _get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    db = get_db()
    try:
        verif = _issue_verification_code(db, email)
        return {
            "ok": True,
            "sent": verif["sent"],
            "smtp_configured": verif["smtp_configured"],
            "dev_code": verif["dev_code"],
        }
    finally:
        db.close()


@router.get("/me")
def me(user=Depends(get_current_user)):
    full = _get_user_by_email(user["email"])
    payload = _user_payload(full or user)
    # v3.1: status lisensi/trial ikut dikirim saat boot supaya frontend langsung tahu
    # (countdown / pop-up trial berakhir) tanpa call kedua.
    from routers.license import get_access_status
    return {
        "user": payload,
        "onboarding": _onboarding_payload(user["id"]),
        "devices": _device_list(user["id"]),
        "google_configured": google_configured(),
        "smtp_configured": is_smtp_configured(),
        "license": get_access_status(user["id"]),
    }


@router.post("/logout")
def logout(user=Depends(get_current_user)):
    """Keluar + lepaskan slot device ini (mirip 'Log out' WhatsApp Web)."""
    db = get_db()
    try:
        db.execute(
            "DELETE FROM app_devices WHERE user_id = ? AND device_id = ?",
            (user["id"], user["device_id"]),
        )
        db.commit()
    finally:
        db.close()
    return {"ok": True}


@router.get("/devices")
def list_devices(user=Depends(get_current_user)):
    return {"devices": _device_list(user["id"])}


class DeviceLimitRemoveRequest(BaseModel):
    email: EmailStr
    password: str
    device_id: str


@router.post("/devices/limit-remove")
def device_limit_remove(req: DeviceLimitRemoveRequest):
    """Keluarkan device KETIKA login ditolak karena batas 2 device.
    Aman: tetap wajib password akun (user belum punya token di layar ini)."""
    email = req.email.lower().strip()
    user = _get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=401, detail="Email atau password salah")
    ok, needs_upgrade = verify_password_ex(req.password, user.get("password") or "")
    if not ok:
        raise HTTPException(status_code=401, detail="Email atau password salah")

    profile = _get_profile(user["id"])
    if not profile["email_verified"]:
        raise HTTPException(status_code=403, detail="Verifikasi email dulu sebelum mengelola device")

    db = get_db()
    try:
        db.execute(
            "DELETE FROM app_devices WHERE user_id = ? AND device_id = ?",
            (user["id"], req.device_id),
        )
        db.commit()
    finally:
        db.close()
    return {"ok": True, "devices": _device_list(user["id"])}


@router.delete("/devices/{device_id}")
def remove_device(device_id: str, user=Depends(get_current_user)):
    db = get_db()
    try:
        db.execute(
            "DELETE FROM app_devices WHERE user_id = ? AND device_id = ?",
            (user["id"], device_id),
        )
        db.commit()
    finally:
        db.close()
    return {"ok": True, "devices": _device_list(user["id"])}


# ── Google OAuth 2.0 (PKCE + loopback redirect) ───────────────────────────

@router.get("/google/config")
def google_config():
    return {"configured": google_configured()}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


@router.post("/google/start")
def google_start(request: Request):
    if not google_configured():
        raise HTTPException(
            status_code=501,
            detail="Login Google belum dikonfigurasi (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). "
                   "Lihat panduan di README — sementara gunakan email & password.",
        )

    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(64)
    challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
    redirect_uri = str(request.base_url).rstrip("/") + "/api/auth/google/callback"

    db = get_db()
    try:
        db.execute(
            "INSERT INTO app_oauth_pending (state, code_verifier, redirect_uri, device_id, device_name, os, app_version) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (state, verifier, redirect_uri, get_or_create_device_id(), get_device_name(), "", get_app_version()),
        )
        db.commit()
    finally:
        db.close()

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    from urllib.parse import urlencode
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

    # Buka browser sistem default (backend jalan lokal di device user)
    import webbrowser
    try:
        webbrowser.open(url)
    except Exception:
        pass

    return {"state": state, "url": url}


@router.get("/google/callback")
def google_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    pending = query_one("SELECT * FROM app_oauth_pending WHERE state = ?", (state,))
    if not pending:
        return HTMLResponse("<h3>Sesi Google tidak ditemukan. Buka lagi aplikasi ORDAL.</h3>", status_code=400)

    db = get_db()
    try:
        if error or not code:
            db.execute(
                "UPDATE app_oauth_pending SET status = 'error', error = ?, completed_at = NOW() WHERE state = ?",
                (error or "no_code", state),
            )
            db.commit()
            return _google_result_page(False, "Login Google dibatalkan.")

        # Tukar code → token
        try:
            resp = httpx.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "redirect_uri": pending["redirect_uri"],
                    "grant_type": "authorization_code",
                    "code_verifier": pending["code_verifier"],
                },
                timeout=20,
            )
            tokens = resp.json()
            if "access_token" not in tokens:
                raise RuntimeError(tokens.get("error_description") or "token exchange gagal")

            info = httpx.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
                timeout=20,
            ).json()
        except Exception as e:
            db.execute(
                "UPDATE app_oauth_pending SET status = 'error', error = ?, completed_at = NOW() WHERE state = ?",
                (str(e), state),
            )
            db.commit()
            return _google_result_page(False, "Gagal menghubungi Google. Coba lagi.")

        email = (info.get("email") or "").lower()
        if not email or not info.get("email_verified", False):
            db.execute(
                "UPDATE app_oauth_pending SET status = 'error', error = 'email_not_verified', completed_at = NOW() WHERE state = ?",
                (state,),
            )
            db.commit()
            return _google_result_page(False, "Email Google belum terverifikasi.")

        # Find-or-create user (authProvider google, password NULL, email_verified TRUE)
        user = _get_user_by_email(email)
        if not user:
            name = (info.get("name") or email.split("@")[0]).strip()
            user = _create_web_user(db, email, name, None, "google")
            user = _get_user_by_email(email)
        else:
            _ensure_profile(db, user["id"], verified=True)

        # Device flow (max 2)
        try:
            _register_device(db, user["id"])
            _record_login_event(db, user["id"], "google")
        except _DeviceLimit:
            db.execute(
                "UPDATE app_oauth_pending SET status = 'device_limit', completed_at = NOW() WHERE state = ?",
                (state,),
            )
            db.commit()
            return _google_result_page(False, "Batas 2 device tercapai. Keluarkan device lain dulu dari aplikasi.")

        db.execute(
            "UPDATE app_oauth_pending SET status = 'completed', user_id = ?, completed_at = NOW() WHERE state = ?",
            (user["id"], state),
        )
        db.commit()
        return _google_result_page(True, "")
    finally:
        db.close()


@router.post("/google/poll")
def google_poll(req: GooglePollRequest):
    pending = query_one("SELECT * FROM app_oauth_pending WHERE state = ?", (req.state,))
    if not pending:
        raise HTTPException(status_code=404, detail="Sesi Google tidak ditemukan")

    created_at = pending["created_at"]
    if isinstance(created_at, str):
        created_at = datetime.fromisoformat(created_at)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created_at > timedelta(minutes=5):
        return {"status": "expired"}

    status = pending["status"]
    if status == "completed" and pending.get("user_id"):
        user = query_one(
            'SELECT "id", "email", "name", "password", "authProvider", "uniqueUserCode", "createdAt" '
            'FROM "User" WHERE "id" = ?',
            (pending["user_id"],),
        )
        token = create_token(user["id"], user["email"], get_or_create_device_id())
        _restore_user_files(user["id"])
        return {
            "status": "completed",
            "token": token,
            "user": _user_payload(user),
            "onboarding": _onboarding_payload(user["id"]),
            "devices": _device_list(user["id"]),
        }
    if status in ("error", "device_limit"):
        return {"status": status, "error": pending.get("error") or ""}
    return {"status": "pending"}


def _google_result_page(success: bool, message: str) -> HTMLResponse:
    if success:
        html = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>ORDAL</title>
<style>body{margin:0;background:#F4F2EC;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}
.c{background:#fff;border:2px solid #33363F;border-radius:20px;box-shadow:5px 5px 0 #33363F;padding:40px 48px;text-align:center;max-width:380px}
.b{width:64px;height:64px;background:#F2661A;border-radius:14px;border:2px solid #33363F;margin:0 auto 16px;display:flex;align-items:center;justify-content:center}
.o{width:28px;height:28px;border:11px solid #fff;border-radius:50%}
h1{font-size:20px;color:#33363F;margin:0 0 8px}p{font-size:14px;color:#6B6E76;margin:0 0 20px;line-height:1.5}
</style></head><body><div class="c"><div class="b"><div class="o"></div></div>
<h1>Berhasil login ke ORDAL!</h1><p>Jendela ini bisa ditutup — aplikasi ORDAL akan lanjut otomatis.</p>
<script>setTimeout(function(){try{window.close()}catch(e){}},1200)</script></div></body></html>"""
    else:
        html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>ORDAL</title>
<style>body{{margin:0;background:#F4F2EC;font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}}
.c{{background:#fff;border:2px solid #33363F;border-radius:20px;box-shadow:5px 5px 0 #33363F;padding:40px 48px;text-align:center;max-width:380px}}
.b{{width:64px;height:64px;background:#F2661A;border-radius:14px;border:2px solid #33363F;margin:0 auto 16px;display:flex;align-items:center;justify-content:center}}
.o{{width:28px;height:28px;border:11px solid #fff;border-radius:50%}}
h1{{font-size:20px;color:#33363F;margin:0 0 8px}}p{{font-size:14px;color:#6B6E76;margin:0 0 20px;line-height:1.5}}
</style></head><body><div class="c"><div class="b"><div class="o"></div></div>
<h1>Gagal login</h1><p>{message}</p></div></body></html>"""
    return HTMLResponse(html)
