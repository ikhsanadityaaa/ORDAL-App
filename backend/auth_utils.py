import os
import secrets
import hashlib
import platform
import subprocess
import sys
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passwords import hash_password, verify_password, verify_password_ex

# Access tokens are opaque server sessions issued by ORDAL-Web.


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


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Validate opaque token with web control plane."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from control_plane import validate_session
    return validate_session(credentials.credentials)


def get_user_from_token(token: str) -> dict:
    """Validate query-token used by EventSource."""
    if not token:
        raise HTTPException(status_code=401, detail="Token tidak valid")
    from control_plane import validate_session
    return validate_session(token)
