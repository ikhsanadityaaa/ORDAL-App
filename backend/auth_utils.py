import os
import secrets
import jwt
import hashlib
import platform
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passwords import hash_password, verify_password, verify_password_ex

# v3: APP_MODE single-user dihapus — semua request wajib pakai JWT
# yang ter-bind ke device terdaftar (maks 2 device per akun).


def _resolve_key_file() -> str:
    explicit = os.getenv("JWT_SECRET_FILE", "").strip()
    if explicit:
        return explicit
    from database import get_data_dir
    data_dir = get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "secret.key")


_KEY_FILE = _resolve_key_file()


def _get_secret() -> str:
    """Production: JWT_SECRET dari environment (WAJIB disamakan antar device
    kalau backend di-deploy terpusat; di desktop app backend jalan lokal,
    tiap device punya secret sendiri — token hanya dipakai device itu).
    Fallback lokal: secret.key di data dir."""
    env_secret = os.getenv("JWT_SECRET", "").strip()
    if env_secret:
        return env_secret

    if os.path.exists(_KEY_FILE):
        with open(_KEY_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()

    key = secrets.token_hex(32)
    os.makedirs(os.path.dirname(_KEY_FILE) or ".", exist_ok=True)
    with open(_KEY_FILE, "w", encoding="utf-8") as f:
        f.write(key)
    print(f"secret.key dibuat otomatis: {_KEY_FILE}")
    return key


SECRET_KEY = _get_secret()
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=True)


# ── Device identity (per instalasi app) ──────────────────────────────────

def get_or_create_device_id() -> str:
    """Device ID stabil per instalasi (disimpan di data dir lokal).
    Konsepnya seperti WhatsApp: 1 akun maksimal 2 device."""
    from database import get_data_dir
    path = os.path.join(get_data_dir(), "device_id.txt")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            did = f.read().strip()
        if did:
            return did
    did = f"dev_{secrets.token_hex(16)}"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(did)
    return did


def get_device_fingerprint() -> str:
    """Stable hardware fingerprint used only as a hashed trial-abuse signal."""
    raw = ""
    try:
        if sys.platform == "darwin":
            output = subprocess.check_output(
                ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                text=True,
                timeout=3,
            )
            for line in output.splitlines():
                if "IOPlatformUUID" in line:
                    raw = line.split("=", 1)[-1].strip().strip('"')
                    break
        elif sys.platform == "win32":
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Cryptography",
            ) as key:
                raw = str(winreg.QueryValueEx(key, "MachineGuid")[0])
        else:
            for path in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as handle:
                        raw = handle.read().strip()
                    if raw:
                        break
    except Exception:
        raw = ""

    if not raw:
        raw = f"{platform.node()}:{platform.machine()}:{get_or_create_device_id()}"
    return "hw_" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_device_name() -> str:
    import platform
    try:
        node = platform.node() or "Device"
    except Exception:
        node = "Device"
    system = platform.system() or ""
    release = platform.release() or ""
    os_label = f"{system} {release}".strip()
    return f"{node} · {os_label}" if os_label else node


def get_app_version() -> str:
    return os.getenv("ORDAL_APP_VERSION", "3.0.0")


# ── JWT ──────────────────────────────────────────────────────────────────

def create_token(user_id: str, email: str, device_id: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "did": device_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _device_is_active(user_id: str, device_id: str) -> bool:
    """Cek device masih terdaftar (belum dikeluarkan lewat dashboard device)."""
    from database import query_one
    row = query_one(
        "SELECT id FROM app_devices WHERE user_id = ? AND device_id = ?",
        (user_id, device_id),
    )
    return row is not None


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Decode JWT + validasi device masih aktif. Return {"id","email","device_id"}.
    Kalau device sudah dikeluarkan dari akun → 401 (auto-logout di frontend)."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    user_id = str(payload["sub"])
    device_id = str(payload.get("did") or "")
    if not device_id or not _device_is_active(user_id, device_id):
        raise HTTPException(status_code=401, detail="Device tidak terdaftar — silakan login ulang")
    return {"id": user_id, "email": payload.get("email", ""), "device_id": device_id}


def get_user_from_token(token: str) -> dict:
    """Untuk endpoint yang menerima token lewat query param (SSE EventSource)."""
    payload = decode_token(token)
    user_id = str(payload["sub"])
    device_id = str(payload.get("did") or "")
    if not device_id or not _device_is_active(user_id, device_id):
        raise HTTPException(status_code=401, detail="Device tidak terdaftar — silakan login ulang")
    return {"id": user_id, "email": payload.get("email", ""), "device_id": device_id}
