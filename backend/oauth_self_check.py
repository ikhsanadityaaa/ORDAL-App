from pathlib import Path


root = Path(__file__).resolve().parents[1]
auth_backend = (root / "backend/routers/auth.py").read_text(encoding="utf-8")
auth_frontend = (root / "frontend/src/components/auth/AuthModal.jsx").read_text(encoding="utf-8")
info_plist = (root / "mac-app/Info.plist").read_text(encoding="utf-8")

assert "osascript" not in auth_backend
assert "Google Chrome" not in auth_backend
assert "NSAppleEventsUsageDescription" not in info_plist
assert "setInterval(async" not in auth_frontend
assert "setTimeout(poll" in auth_frontend
assert "pollCancelledRef" in auth_frontend
assert "10 * 60 * 1000" in auth_frontend

print("desktop OAuth self-check passed")
