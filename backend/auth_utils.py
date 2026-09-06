import os
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_APP_MODE = os.getenv("ORDAL_APP_MODE", "0") == "1"


def _resolve_key_file() -> str:
    explicit = os.getenv("JWT_SECRET_FILE", "").strip()
    if explicit:
        return explicit
    # v42: Lazy import untuk hindari circular import.
    from database import get_data_dir
    data_dir = get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "secret.key")


_KEY_FILE = _resolve_key_file()


def _get_secret() -> str:
    """
    Production: pakai JWT_SECRET dari environment variable.
    Local fallback: generate secret.key sekali untuk development.
    Mac app mode: simpan di ~/Library/Application Support/ORDAL/secret.key
    """
    env_secret = os.getenv("JWT_SECRET", "").strip()
    if env_secret:
        return env_secret

    if os.path.exists(_KEY_FILE):
        with open(_KEY_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()

    import secrets
    key = secrets.token_hex(32)
    os.makedirs(os.path.dirname(_KEY_FILE) or ".", exist_ok=True)
    with open(_KEY_FILE, "w", encoding="utf-8") as f:
        f.write(key)
    print(f"secret.key dibuat otomatis: {_KEY_FILE}")
    return key


SECRET_KEY = _get_secret()
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=not _APP_MODE)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
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


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Mac app mode (ORDAL_APP_MODE=1): return single-user (id=1) tanpa cek token.
    Production mode: decode JWT dari Authorization header.
    """
    if _APP_MODE:
        return {"id": 1, "email": "local@ordal.app"}

    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    return {"id": int(payload["sub"]), "email": payload["email"]}
