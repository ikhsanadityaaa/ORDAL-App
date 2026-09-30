import hashlib
import os
import platform
import subprocess
import sys
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


security = HTTPBearer(auto_error=True)
_session_cache: dict[str, tuple[float, dict]] = {}
_user_tokens: dict[str, str] = {}


def get_or_create_device_id() -> str:
    from database import get_data_dir

    path = os.path.join(get_data_dir(), "device_id.txt")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as handle:
            value = handle.read().strip()
        if value:
            return value
    value = os.urandom(16).hex()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(value)
    return value


def get_device_fingerprint() -> str:
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

            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
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
    node = platform.node() or "Device"
    os_label = f"{platform.system()} {platform.release()}".strip()
    return f"{node} - {os_label}" if os_label else node


def get_app_version() -> str:
    return os.getenv("ORDAL_APP_VERSION", "3.2.3")


def _validate_token(token: str) -> dict:
    cached = _session_cache.get(token)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    from ordal_api import request

    data = request("GET", "/auth/me", token=token)
    user = data.get("user") or {}
    if not user.get("id"):
        raise HTTPException(status_code=401, detail="Sesi tidak valid")
    result = {
        "id": str(user["id"]),
        "email": str(user.get("email") or ""),
        "device_id": get_device_fingerprint(),
        "token": token,
    }
    _session_cache[token] = (time.monotonic() + 60, result)
    _user_tokens[result["id"]] = token
    return result


def invalidate_token(token: str) -> None:
    cached = _session_cache.pop(token, None)
    if cached:
        _user_tokens.pop(cached[1]["id"], None)


def get_token_for_user(user_id: str) -> str:
    token = _user_tokens.get(str(user_id), "")
    if not token:
        raise HTTPException(status_code=401, detail="Sesi pengguna tidak aktif")
    return token


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _validate_token(credentials.credentials)


def get_user_from_token(token: str) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _validate_token(token)
