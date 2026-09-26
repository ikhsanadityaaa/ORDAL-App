from pathlib import Path


root = Path(__file__).resolve().parents[1]
auth_backend = (root / "backend/routers/auth.py").read_text(encoding="utf-8")
ordal_api = (root / "backend/ordal_api.py").read_text(encoding="utf-8")
auth_frontend = (root / "frontend/src/components/auth/AuthModal.jsx").read_text(encoding="utf-8")
info_plist = (root / "mac-app/Info.plist").read_text(encoding="utf-8")
credentials_backend = (root / "backend/routers/credentials.py").read_text(encoding="utf-8")
browser_launcher = (root / "backend/workers/browser_launcher.py").read_text(encoding="utf-8")

assert "osascript" not in auth_backend
assert "Google Chrome" not in auth_backend
assert "NSAppleEventsUsageDescription" not in info_plist
assert 'local_address="0.0.0.0"' in ordal_api
assert "httpx.Timeout(15.0, connect=5.0)" in ordal_api
assert "setInterval(async" not in auth_frontend
assert "setTimeout(poll" in auth_frontend
assert "pollCancelledRef" in auth_frontend
assert "10 * 60 * 1000" in auth_frontend
assert "extra_page.close()" not in credentials_backend
assert "prefer_system_chrome=True" in credentials_backend
assert 'context_kwargs = {}' in credentials_backend
assert 'ignore_default_args' in browser_launcher

print("desktop OAuth self-check passed")
