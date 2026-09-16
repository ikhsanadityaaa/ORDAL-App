import hashlib
import secrets

SCRYPT_COST = 16_384
SCRYPT_BLOCK_SIZE = 8
SCRYPT_PARALLELIZATION = 1
SCRYPT_KEY_LENGTH = 64


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.scrypt(
        password.encode(),
        salt=salt,
        n=SCRYPT_COST,
        r=SCRYPT_BLOCK_SIZE,
        p=SCRYPT_PARALLELIZATION,
        dklen=SCRYPT_KEY_LENGTH,
    )
    return "$".join((
        "scrypt",
        str(SCRYPT_COST),
        str(SCRYPT_BLOCK_SIZE),
        str(SCRYPT_PARALLELIZATION),
        salt.hex(),
        key.hex(),
    ))


def _sha256_hex(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password_ex(password: str, hashed: str | None) -> tuple[bool, bool]:
    """Return (valid, needs_scrypt_upgrade)."""
    if not hashed:
        return False, False
    if hashed.startswith("scrypt$"):
        try:
            algorithm, n, r, p, salt_hex, key_hex = hashed.split("$")
            if (
                algorithm != "scrypt"
                or int(n) != SCRYPT_COST
                or int(r) != SCRYPT_BLOCK_SIZE
                or int(p) != SCRYPT_PARALLELIZATION
                or len(salt_hex) != 32
                or len(key_hex) != 128
            ):
                return False, False
            expected = bytes.fromhex(key_hex)
            actual = hashlib.scrypt(
                password.encode(),
                salt=bytes.fromhex(salt_hex),
                n=int(n),
                r=int(r),
                p=int(p),
                dklen=len(expected),
            )
            return secrets.compare_digest(actual, expected), False
        except (TypeError, ValueError):
            return False, False
    if hashed.startswith("$2"):
        try:
            import bcrypt
            valid = bcrypt.checkpw(password.encode(), hashed.encode())
            return valid, valid
        except Exception:
            return False, False
    if secrets.compare_digest(hashed, _sha256_hex(password)):
        return True, True
    return False, False


def verify_password(password: str, hashed: str) -> bool:
    valid, _ = verify_password_ex(password, hashed)
    return valid
