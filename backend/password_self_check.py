import hashlib

from passwords import hash_password, verify_password_ex

PASSWORD = "ORDAL-test-password"
KNOWN_HASH = (
    "scrypt$16384$8$1$000102030405060708090a0b0c0d0e0f$"
    "085ee6eb3e72221a2475b0a8e69fa5f8cd7efe47864bf52b437cfc4752558f1"
    "463962dd1b6156a2a75469ee72623395b0ee3b6f573b2aa2f61f0bdb8ff1516f0"
)

assert verify_password_ex(PASSWORD, KNOWN_HASH) == (True, False)
assert verify_password_ex("wrong", KNOWN_HASH) == (False, False)

legacy_sha = hashlib.sha256(PASSWORD.encode()).hexdigest()
assert verify_password_ex(PASSWORD, legacy_sha) == (True, True)

generated = hash_password(PASSWORD)
assert generated.startswith("scrypt$16384$8$1$")
assert verify_password_ex(PASSWORD, generated) == (True, False)

print("password compatibility self-check passed")
