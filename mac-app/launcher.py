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
from urllib.parse import quote

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
# v3.1.1 — Database pusat: pre-flight check + .env layering
# ----------------------------------------------------------------------------
# MASALAH YANG DIFIX: sebelumnya app yang di-build tanpa DATABASE URL akan
# crash saat dibuka (backend tidak bisa start → window tidak pernah muncul →
# app "close sendiri"). Sekarang launcher memastikan DB reachable SEBELUM
# start backend, dan kalau belum dikonfigurasi → dialog input URL native.
#
# Prioritas konfigurasi .env (tanpa rebuild app):
#   1. env sistem (dari shell)
#   2. ~/Library/Application Support/ORDAL/.env   (user override, per-device)
#   3. backend/.env yang di-bundle build.sh      (default dari build)
_DEV_DB_URL = ""
_KEYCHAIN_SERVICE = "com.ordal.app.postgres-url"


def _keychain_get() -> str:
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-a", os.getenv("USER", "ordal"), "-s", _KEYCHAIN_SERVICE, "-w"],
            capture_output=True, text=True, timeout=5, check=False,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
    except Exception:
        return ""


def _keychain_set(value: str) -> bool:
    try:
        result = subprocess.run(
            ["security", "add-generic-password", "-U", "-a", os.getenv("USER", "ordal"), "-s", _KEYCHAIN_SERVICE, "-w", value],
            capture_output=True, text=True, timeout=5, check=False,
        )
        return result.returncode == 0
    except Exception:
        return False


def _parse_env_file(path: Path) -> dict[str, str]:
    """Parser .env sederhana (KEY=VALUE) — tanpa dependency."""
    result: dict[str, str] = {}
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            result[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return result


def _load_env_layers(user_data: Path, backend_dir: Path) -> None:
    """Gabungkan user .env + bundled backend/.env ke os.environ.
    Key yang SUDAH ada di env sistem TIDAK di-override (prioritas tetap)."""
    # Layer 2: user override (per-device, persisten antar update app)
    user_env = user_data / ".env"
    if user_env.exists():
        loaded = []
        for k, v in _parse_env_file(user_env).items():
            if k not in os.environ:
                os.environ[k] = v
                loaded.append(k)
        if loaded:
            log.info(f"User .env dimuat ({len(loaded)} keys: {', '.join(sorted(loaded))})")
    # Layer 3: bundled backend/.env (dari build.sh)
    bundled_env = backend_dir / ".env"
    if bundled_env.exists():
        loaded = []
        for k, v in _parse_env_file(bundled_env).items():
            if k not in os.environ:
                os.environ[k] = v
                loaded.append(k)
        if loaded:
            log.info(f"Bundled backend/.env dimuat ({len(loaded)} keys)")


def _usable_database_url(value: str) -> str:
    value = (value or "").strip()
    return "" if not value or any(marker in value for marker in ("<", ">", "YOUR-", "YOUR_")) else value


def _resolve_db_url() -> str:
    """Resolve production PostgreSQL env ORDAL-Web; reject placeholders."""
    direct = next((value for value in (
        os.getenv("POSTGRES_URL", ""),
        os.getenv("POSTGRES_URL_NON_POOLING", ""),
        os.getenv("POSTGRES_PRISMA_URL", ""),
        os.getenv("ORDAL_DATABASE_URL", ""),
        os.getenv("DATABASE_URL", ""),
        _keychain_get(),
    ) if _usable_database_url(value)), "")
    if direct:
        return direct
    host = os.getenv("POSTGRES_HOST", "").strip()
    user = os.getenv("POSTGRES_USER", "").strip()
    password = os.getenv("POSTGRES_PASSWORD", "")
    database = os.getenv("POSTGRES_DATABASE", "").strip()
    if host and user and database:
        return f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@{host}/{quote(database, safe='')}"
    return _DEV_DB_URL


def _db_reachable(url: str, timeout: int = 8) -> tuple[bool, str]:
    """Cek koneksi PostgreSQL cepat (tanpa query)."""
    try:
        import psycopg2  # venv sudah install (backend requirements)
        conn = psycopg2.connect(url, connect_timeout=timeout)
        conn.close()
        return True, ""
    except Exception as e:
        first = str(e).splitlines()[0] if str(e) else "unknown error"
        return False, first[:300]


def _ask_db_url_dialog(prefill: str, error_note: str) -> str | None:
    """Dialog input DATABASE URL native Mac (osascript). None = user batal."""
    host = _resolve_db_url().split("@")[-1]
    msg = (
        f"ORDAL tidak bisa terhubung ke database pusat\\n\\n"
        f"Server saat ini: {host}\\n"
        f"Error: {error_note[:120]}\\n\\n"
        f"Paste DATABASE URL PostgreSQL (Supabase yang dipakai ORDAL-Web):\\n"
        f"postgresql://user:password@host:5432/postgres\\n\\n"
        f"URL disimpan aman di macOS Keychain komputer ini\\n"
        f"dan tidak menghapus data apa pun."
    )
    msg = msg.replace('"', "'")  # amankan quoting AppleScript
    script = (
        f'display dialog "{msg}" with title "ORDAL — Konfigurasi Database" '
        f'default answer "{prefill}" '
        f'buttons {{"Batal", "Simpan & Lanjut"}} default button "Simpan & Lanjut" with icon note'
    )
    try:
        out = subprocess.run(
            ["osascript", "-e", script], capture_output=True, text=True, timeout=600
        )
        if out.returncode != 0:
            return None  # user klik Batal
        # stdout: 'button returned:Simpan & Lanjut, text returned:VALUE'
        for part in out.stdout.split(","):
            if "text returned:" in part:
                return part.split("text returned:", 1)[1].strip()
        return None
    except Exception as e:
        log.warning(f"Dialog osascript gagal: {e}")
        return None


def _save_db_url_to_keychain(user_data: Path, url: str) -> bool:
    """Simpan database URL di macOS Keychain, bukan file plaintext."""
    if not _keychain_set(url):
        log.error("Gagal menyimpan database URL ke macOS Keychain.")
        return False
    env_file = user_data / ".env"
    if env_file.exists():
        lines = [
            line for line in env_file.read_text(encoding="utf-8").splitlines()
            if not line.split("=", 1)[0].strip() in {
                "POSTGRES_URL", "ORDAL_DATABASE_URL", "POSTGRES_URL_NON_POOLING",
                "POSTGRES_PRISMA_URL", "DATABASE_URL",
            }
        ]
        env_file.write_text(("\n".join(lines) + "\n") if lines else "", encoding="utf-8")
    log.info("Database URL disimpan di macOS Keychain.")
    return True


def _ensure_database_ready(user_data: Path, backend_dir: Path) -> bool:
    """Pastikan DB pusat reachable SEBELUM start backend (maks 3 percobaan
    dengan dialog input URL). Return False → app exit dengan pesan jelas
    di log + dialog — TIDAK close diam-diam."""
    for attempt in range(1, 4):
        url = _resolve_db_url()
        if not url:
            safe_host = "belum dikonfigurasi"
            err = "URL Supabase belum diisi"
            ok = False
        else:
            safe_host = url.split("@")[-1] if "@" in url else url
            ok, err = _db_reachable(url)
        if ok:
            log.info(f"Database pusat OK ({safe_host})")
            return True
        log.error(f"Database tidak terhubung (percobaan {attempt}/3, host={safe_host}): {err}")
        if attempt == 3:
            break
        # Jangan prefill URL dev default — biarkan kosong supaya user paste yang benar
        prefill = "" if "127.0.0.1:5432" in url else url
        answer = _ask_db_url_dialog(prefill, err)
        if not answer:
            log.warning("User membatalkan dialog konfigurasi database.")
            break
        if not _save_db_url_to_keychain(user_data, answer):
            break
        os.environ["ORDAL_DATABASE_URL"] = answer
    log.error("App tidak bisa lanjut tanpa koneksi database pusat. Exit dengan pesan ini.")
    return False


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

    # Set env untuk backend (v3: APP_MODE dihapus — login wajib, DB pusat)
    os.environ.pop("ORDAL_APP_MODE", None)
    os.environ["ORDAL_DATA_DIR"] = str(user_data)
    os.environ["ORDAL_BACKEND_DIR"] = str(paths["backend_dir"])
    # JWT & encryption keys boleh auto-generate (disimpan di user_data)
    os.environ.setdefault("JWT_SECRET_FILE", str(user_data / "secret.key"))
    os.environ.setdefault("ENCRYPTION_KEY_FILE", str(user_data / "encrypt.key"))

    # v3.1.1: gabungkan .env (user override + bundled) SEBELUM import backend,
    # lalu pastikan database pusat reachable. Tanpa ini, app tanpa DATABASE URL
    # akan crash saat dibuka (window tidak pernah muncul).
    _load_env_layers(user_data, paths["backend_dir"])
    if not _ensure_database_ready(user_data, paths["backend_dir"]):
        return 1

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
