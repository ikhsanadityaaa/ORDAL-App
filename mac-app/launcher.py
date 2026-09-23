"""
ORDAL Mac App Launcher
======================
Entry point untuk .app bundle macOS. Lakukan:
1. Resolve path ke backend/ & frontend/dist/ (relatif terhadap .app bundle atau dev mode)
2. Set env vars (ORDAL_DATA_DIR untuk user data; v3: login wajib, tanpa APP_MODE)
3. Start uvicorn (FastAPI) di background thread pada port acak lokal
4. Buka native macOS window via pywebview yang me-load URL backend
5. Pasang Chromium Playwright saat first-run jika belum ada
6. On window close → shutdown backend → exit
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

# ── Setup file logging di launcher juga (sebelum backend start) ──────────
# Supaya log launcher (sebelum backend import) juga tertulis ke file yang
# sama. Tanpa ini, kalau backend crash saat startup, user tidak bisa lihat
# errornya karena tidak ada console di app mode.
def _resolve_user_data_dir_for_log() -> Path:
    """Cari lokasi writable untuk file log. Harus konsisten dengan
    resolve_user_data_dir() di bawah."""
    env = os.getenv("ORDAL_DATA_DIR", "").strip()
    if env:
        return Path(env)
    if getattr(sys, "frozen", False) and hasattr(sys, "frozen"):
        return Path.home() / "Library" / "Application Support" / "ORDAL"
    return Path(__file__).resolve().parent.parent / "_ordal_data"

_log_data_dir = _resolve_user_data_dir_for_log()
_log_data_dir.mkdir(parents=True, exist_ok=True)
_log_file = _log_data_dir / "ordal.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.handlers.RotatingFileHandler(
            str(_log_file), maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
        ),
    ],
)
log = logging.getLogger("ordal-launcher")
log.info("=" * 60)
log.info(f"ORDAL Launcher starting. Log file: {_log_file}")
log.info("=" * 60)


# ----------------------------------------------------------------------------
# Path resolution
# ----------------------------------------------------------------------------
def is_frozen() -> bool:
    """True jika di-run dari dalam .app bundle (py2app/pyinstaller)."""
    return getattr(sys, "frozen", False) and hasattr(sys, "frozen")


def resolve_paths() -> dict[str, Path]:
    """
    Kembalikan dict path yang diperlukan launcher.

    Saat di dalam .app bundle:
      launcher.py ada di /Applications/ORDAL.app/Contents/Resources/mac-app/launcher.py
      → app_root = parent.parent = /Applications/ORDAL.app/Contents/Resources/

    Saat dev (jalankan `python mac-app/launcher.py` dari repo):
      launcher.py ada di <repo>/mac-app/launcher.py
      → app_root = parent.parent = <repo>/
    """
    if is_frozen():
        app_root = Path(sys._MEIPASS) if hasattr(sys, "_MEIPASS") else Path(__file__).resolve().parent
    else:
        app_root = Path(__file__).resolve().parent.parent  # mac-app/ -> repo root

    backend_dir = app_root / "backend"
    frontend_dist = app_root / "frontend" / "dist"

    return {
        "app_root": app_root,
        "backend_dir": backend_dir,
        "frontend_dist": frontend_dist,
    }


def resolve_user_data_dir() -> Path:
    """
    v42: Letak user data yang PERSISTENT antar versi app.
    Selalu pakai ~/Library/Application Support/ORDAL/ (Mac),
    baik dev maupun frozen mode.
    """
    home = Path.home()
    data_dir = home / "Library" / "Application Support" / "ORDAL"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


# ----------------------------------------------------------------------------
# Find free port
# ----------------------------------------------------------------------------
def find_free_port() -> int:
    """Cari port TCP lokal yang bebas."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


# ----------------------------------------------------------------------------
# Chromium install (first-run)
# ----------------------------------------------------------------------------
def ensure_chromium_installed(backend_dir: Path) -> None:
    """Pastikan Playwright Chromium ter-installed. Jalankan di background."""
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
    except ImportError:
        log.warning("Playwright tidak ter-install — skip Chromium check.")
        return

    marker = resolve_user_data_dir() / ".chromium_installed"
    if marker.exists():
        return

    log.info("First-run detected: installing Playwright Chromium (~150MB)...")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "playwright", "install", "chromium"],
            check=False,
            capture_output=True,
            timeout=300,
        )
        # Cuma tandai sukses kalau returncode 0 — kalau gagal (mis. internet
        # putus), jangan bikin marker, biar dicoba lagi di run berikutnya.
        if result.returncode == 0:
            marker.touch()
            log.info("Chromium installed successfully.")
        else:
            stderr_tail = (result.stderr or b"").decode(errors="ignore")[-300:]
            log.error(f"Install Chromium gagal (exit {result.returncode}): {stderr_tail}")
            log.error("Akan dicoba lagi di run berikutnya. Atau jalankan manual: python -m playwright install chromium")
    except Exception as e:
        log.error(f"Gagal install Chromium: {e}")
        log.error("User dapat menjalankan manual: python -m playwright install chromium")


# ----------------------------------------------------------------------------
# Backend thread
# ----------------------------------------------------------------------------
def start_backend(backend_dir: Path, port: int) -> threading.Thread:
    """
    Start uvicorn di thread terpisah.

    PENTING:
    - TIDAK boleh os.chdir() ke backend_dir di sini.
      pywebview (yang di-import nanti di open_window) memanggil base_uri() saat
      import-time, yang resolve sys.argv[0] terhadap cwd. Kalau cwd sudah pindah
      ke backend/, path relatif "mac-app/launcher.py" akan resolve ke path yang
      tidak ada → ValueError.

    - cwd sudah di-set ke user_data_dir oleh main() sebelum fungsi ini dipanggil.
      Backend code yang nulis relative path (logs, screenshots) akan nulis ke
      user_data_dir (writable + persistent).

    - Backend code pakai absolute paths via __file__ untuk locate modulnya sendiri,
      jadi cwd tidak masalah untuk import.
    """
    sys.path.insert(0, str(backend_dir))

    import uvicorn  # type: ignore
    import main  # import dari backend_dir (sudah di sys.path)

    config = uvicorn.Config(
        app=main.app,  # pass app object directly (avoid string lookup → no chdir)
        host="127.0.0.1",
        port=port,
        log_level="warning",
        loop="asyncio",
        access_log=False,
    )
    server = uvicorn.Server(config)

    def _run():
        try:
            server.run()
        except Exception as e:
            log.error(f"Backend crash: {e}")

    t = threading.Thread(target=_run, daemon=True, name="uvicorn")
    t.start()
    return t


def wait_for_backend(port: int, timeout: float = 30.0) -> bool:
    """Tunggu sampai backend listening."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return True
        except OSError:
            time.sleep(0.3)
    return False


# ----------------------------------------------------------------------------
# pywebview window
# ----------------------------------------------------------------------------
def open_window(url: str) -> None:
    """Buka native macOS window ke URL backend."""
    import webview  # type: ignore

    webview.create_window(
        title="ORDAL — Auto Apply Kerja",
        url=url,
        width=1280,
        height=860,
        min_size=(960, 640),
        text_select=False,
    )
    # Untuk Mac pakai cocoa; di Linux gtk; di Windows edgechromium
    webview.start(debug=False)


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main() -> int:
    log.info("ORDAL Launcher starting...")
    paths = resolve_paths()
    log.info(f"  APP_ROOT     = {paths['app_root']}")
    log.info(f"  BACKEND_DIR  = {paths['backend_dir']}")
    log.info(f"  FRONTEND_DIST= {paths['frontend_dist']}")

    user_data = resolve_user_data_dir()
    log.info(f"  USER_DATA    = {user_data}")

    # ── CRITICAL: Make sys.argv[0] absolute BEFORE importing webview ────────
    # pywebview's base_uri() (dipanggil saat `import webview`) resolves
    # sys.argv[0] terhadap cwd. Kalau argv[0] masih relative ("mac-app/launcher.py")
    # dan cwd adalah user_data_dir (setelah chdir di bawah), base_uri() akan
    # resolve ke path yang tidak ada → ValueError: Path X does not exist.
    # Fix: jadikan absolute SEBELUM chdir.
    if sys.argv and sys.argv[0]:
        sys.argv[0] = os.path.abspath(sys.argv[0])
        log.info(f"  sys.argv[0]  = {sys.argv[0]}")

    # ── Chdir ke user_data_dir (writable, persistent) ───────────────────────
    # Supaya backend code yang nulis relative path (logs, debug screenshots,
    # failure.log, dll) nulis ke lokasi writable. .app bundle di /Applications/
    # adalah read-only untuk normal user.
    os.chdir(str(user_data))
    log.info(f"  cwd          = {os.getcwd()}")

    # User wajib login ke API pusat; data operasional tetap lokal per device.
    os.environ.pop("ORDAL_APP_MODE", None)
    os.environ["ORDAL_DATA_DIR"] = str(user_data)
    os.environ["ORDAL_BACKEND_DIR"] = str(paths["backend_dir"])
    # JWT & encryption keys boleh auto-generate (disimpan di user_data)
    os.environ.setdefault("JWT_SECRET_FILE", str(user_data / "secret.key"))
    os.environ.setdefault("ENCRYPTION_KEY_FILE", str(user_data / "encrypt.key"))

    # First-run: install Chromium
    threading.Thread(
        target=ensure_chromium_installed,
        args=(paths["backend_dir"],),
        daemon=True,
    ).start()

    # Start backend
    port = find_free_port()
    log.info(f"Starting backend on 127.0.0.1:{port}")
    start_backend(paths["backend_dir"], port)

    if not wait_for_backend(port):
        log.error("Backend tidak start dalam 30 detik. Exit.")
        return 1

    url = f"http://127.0.0.1:{port}/"
    log.info(f"Backend ready. Opening window: {url}")
    open_window(url)

    log.info("Window closed. Shutting down backend.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
