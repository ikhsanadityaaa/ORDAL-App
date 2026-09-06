import os
from cryptography.fernet import Fernet


def _resolve_key_file() -> str:
    """Resolve lokasi encrypt.key."""
    # 1. Explicit override
    explicit = os.getenv("ENCRYPTION_KEY_FILE", "").strip()
    if explicit:
        return explicit
    # 2. v42: Lazy import get_data_dir untuk hindari circular import.
    from database import get_data_dir
    data_dir = get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "encrypt.key")


_ENCRYPT_KEY_FILE = _resolve_key_file()


def _get_fernet() -> Fernet:
    """
    Production: pakai ENCRYPTION_KEY dari environment variable.
    Local fallback: generate encrypt.key sekali untuk development.
    Mac app mode: simpan di ~/Library/Application Support/ORDAL/encrypt.key
    """
    env_key = os.getenv("ENCRYPTION_KEY", "").strip()
    if env_key:
        return Fernet(env_key.encode())

    if os.path.exists(_ENCRYPT_KEY_FILE):
        with open(_ENCRYPT_KEY_FILE, "r", encoding="utf-8") as f:
            key = f.read().strip().encode()
        return Fernet(key)

    key = Fernet.generate_key()
    os.makedirs(os.path.dirname(_ENCRYPT_KEY_FILE) or ".", exist_ok=True)
    with open(_ENCRYPT_KEY_FILE, "wb") as f:
        f.write(key)
    print(f"encrypt.key dibuat otomatis: {_ENCRYPT_KEY_FILE}")
    return Fernet(key)


def encrypt(text: str) -> str:
    return _get_fernet().encrypt(text.encode()).decode()


def decrypt(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()


# Aliases supaya namanya self-documenting untuk app_secrets.py
encrypt_value = encrypt
decrypt_value = decrypt
