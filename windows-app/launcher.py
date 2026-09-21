"""
ORDAL Windows App Launcher
===========================
Entry point untuk ORDAL di Windows. Dijalankan oleh venv Python yang di-setup
oleh bootstrap.py / ORDAL.exe (lihat windows-app/bootstrap.py). Tugas file ini:

1. Resolve path ke backend/ & frontend/dist/ (dev mode ATAU dijalankan dari
   folder yang di-ekstrak oleh ORDAL.exe di %LOCALAPPDATA%\\ORDAL\\app)
2. Set env vars (ORDAL_DATA_DIR untuk data user; v3: login wajib, tanpa APP_MODE)
3. Start uvicorn (FastAPI) di background thread pada port acak lokal
4. Buka native Windows window via pywebview (backend EdgeChromium/WebView2)
   yang me-load URL backend
5. Pasang Chromium Playwright saat first-run jika belum ada
6. Saat window ditutup → shutdown backend → exit

CATATAN PENTING:
File ini SENGAJA dijalankan sebagai script Python biasa (bukan di-freeze oleh
PyInstaller) supaya semua dependency berat (fastapi, playwright, dst.) bisa
di-install lewat pip ke venv secara normal — sama seperti strategi Mac app
(lihat mac-app/launcher.py). Yang di-compile jadi .exe hanya bootstrap.py,
yang tugasnya menyiapkan venv ini lalu memanggil file ini.
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
    if os.getenv("LOCALAPPDATA"):
        # v3: layout ter-install default (login wajib, APP_MODE dihapus)
        return Path(os.environ["LOCALAPPDATA"]) / "ORDAL"
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
def resolve_paths() -> dict[str, Path]:
    """
    Kembalikan dict path yang diperlukan launcher.

    Saat dijalankan dari app terinstall:
      %LOCALAPPDATA%\\ORDAL\\app\\windows-app\\launcher.py
      -> app_root = parent.parent = %LOCALAPPDATA%\\ORDAL\\app\\

    Saat dev (jalankan `python windows-app\\launcher.py` dari repo):
      launcher.py ada di <repo>\\windows-app\\launcher.py
      -> app_root = parent.parent = <repo>\\
    """
    app_root = Path(__file__).resolve().parent.parent  # windows-app/ -> app root

    backend_dir = app_root / "backend"
    frontend_dist = app_root / "frontend" / "dist"

    return {
        "app_root": app_root,
        "backend_dir": backend_dir,
        "frontend_dist": frontend_dist,
    }


def resolve_user_data_dir() -> Path:
    """
    Letak user data (DB, cookies, uploads, keys) yang PERSISTENT antar versi app.
    Windows: %LOCALAPPDATA%\\ORDAL  (biasanya C:\\Users\\<user>\\AppData\\Local\\ORDAL)
    Dev:     ./_ordal_data/
    """
    is_installed_layout = "app" in Path(__file__).resolve().parts and os.getenv("LOCALAPPDATA")
    if os.getenv("ORDAL_DATA_DIR"):
        data_dir = Path(os.environ["ORDAL_DATA_DIR"])
    elif is_installed_layout:
        data_dir = Path(os.environ["LOCALAPPDATA"]) / "ORDAL"
    else:
        data_dir = Path(__file__).resolve().parent.parent / "_ordal_data"
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
#   2. %LOCALAPPDATA%\\ORDAL\\.env   (user override, per-device)
#   3. backend/.env yang di-bundle ke ORDAL.exe (default dari build)
_DEV_DB_URL = ""


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
    # Layer 3: bundled backend/.env (di-sync oleh ORDAL.exe bootstrap)
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
        import psycopg2  # venv sudah install (requirements-app.txt)
        conn = psycopg2.connect(url, connect_timeout=timeout)
        conn.close()
        return True, ""
    except Exception as e:
        first = str(e).splitlines()[0] if str(e) else "unknown error"
        return False, first[:300]


def _ask_db_url_dialog(prefill: str, error_note: str) -> str | None:
    """Dialog input DATABASE URL native Windows (tkinter — stdlib, ada di
    python.org install yang dipakai venv). None = user batal / tk unavailable."""
    host = _resolve_db_url().split("@")[-1]
    message = (
        f"ORDAL tidak bisa terhubung ke database pusat.\n\n"
        f"Server saat ini: {host}\n"
        f"Error: {error_note[:120]}\n\n"
        f"Paste DATABASE URL PostgreSQL (Supabase yang dipakai ORDAL-Web):\n"
        f"postgresql://user:password@host:5432/postgres\n\n"
        f"URL disimpan di komputer ini saja dan tidak menghapus data apa pun."
    )
    try:
        import tkinter as tk
        from tkinter import simpledialog
        root = tk.Tk()
        root.withdraw()
        try:
            root.attributes("-topmost", True)  # pastikan muncul di depan
        except Exception:
            pass
        url = simpledialog.askstring(
            "ORDAL — Konfigurasi Database", message, initialvalue=prefill or ""
        )
        root.destroy()
        return url
    except Exception as e:
        log.warning(f"Dialog tkinter tidak tersedia ({e}).")
        # Fallback terakhir: dialog pesan (ctypes MessageBoxW) dengan instruksi file
        try:
            import ctypes
            user_env_path = resolve_user_data_dir() / ".env"
            ctypes.windll.user32.MessageBoxW(
                0,
                f"ORDAL tidak bisa terhubung ke database pusat.\n\n"
                f"Error: {error_note[:200]}\n\n"
                f"Buat file berikut lalu isi satu baris:\n"
                f"{user_env_path}\n"
                f"ORDAL_DATABASE_URL=postgresql://user:password@host:5432/postgres\n\n"
                f"Setelah itu buka ORDAL lagi.",
                "ORDAL — Konfigurasi Database",
                0x10,
            )
        except Exception:
            pass
        return None


def _save_db_url_to_user_env(user_data: Path, url: str) -> None:
    """Simpan ORDAL_DATABASE_URL ke user_data/.env (persisten antar update app)."""
    env_file = user_data / ".env"
    lines: list[str] = []
    if env_file.exists():
        lines = [
            l for l in env_file.read_text(encoding="utf-8").splitlines()
            if not l.strip().startswith(("ORDAL_DATABASE_URL=", "DATABASE_URL="))
        ]
    lines.append(f"ORDAL_DATABASE_URL={url}")
    env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    log.info(f"DATABASE URL disimpan ke {env_file}")


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
        _save_db_url_to_user_env(user_data, answer)
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
# Window icon (Win32 API, bypass keterbatasan pywebview)
# ----------------------------------------------------------------------------
def _set_window_icon_win32(window_title: str, icon_path: Path) -> None:
    """Paksa set icon window native lewat Win32 API (SendMessage WM_SETICON).

    KENAPA INI PERLU: pywebview di Windows (backend WinForms/EdgeChromium)
    otomatis extract icon window dari `sys.executable`
    (System.Drawing.Icon.ExtractAssociatedIcon). Tapi launcher.py ini
    dijalankan pakai `pythonw.exe` dari VENV yang dibikin bootstrap.py
    (lihat bootstrap.py: subprocess.run([venv_pythonw, launcher.py])),
    BUKAN oleh ORDAL.exe hasil build. Jadi `sys.executable` = pythonw.exe
    polos dari venv, yang punya icon default Python generik (kertas putih
    dengan logo Python) — bukan icon custom ORDAL, walau ORDAL.exe sendiri
    sudah di-build dengan icon yang benar. Makanya title bar/taskbar selalu
    nunjukin icon Python, bukan icon ORDAL.

    Fix-nya: set icon window secara manual lewat Win32 API langsung setelah
    window native-nya kebuka, gak peduli exe apa yang menjalankannya.

    Penting: function ini harus dipanggil SETELAH window native ada
    (yaitu SETELAH webview.start() jalan). Kalau dipanggil sebelum window
    ada, FindWindowW akan return 0 dan icon tidak akan di-set.
    """
    if sys.platform != "win32" or not icon_path.exists():
        return

    def _worker():
        try:
            import ctypes
            user32 = ctypes.windll.user32
            WM_SETICON = 0x0080
            ICON_SMALL, ICON_BIG = 0, 1
            IMAGE_ICON = 1
            LR_LOADFROMFILE, LR_DEFAULTSIZE = 0x00000010, 0x00000040

            hwnd = 0
            # Tunggu sampai 30 detik window-nya muncul (sebelumnya 15s, naikkan
            # ke 30s karena di komputer lambat + first-run install Chromium,
            # window native bisa muncul lebih lama).
            for _ in range(120):
                hwnd = user32.FindWindowW(None, window_title)
                if hwnd:
                    break
                time.sleep(0.25)
            if not hwnd:
                log.warning("[icon] Window belum ketemu setelah 30s, skip set icon manual.")
                return

            # Load icon dari file .ico
            hicon_big = user32.LoadImageW(None, str(icon_path), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE)
            hicon_small = user32.LoadImageW(None, str(icon_path), IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
            if hicon_big:
                user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big)
            if hicon_small:
                user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small)
            log.info(f"[icon] Icon window berhasil di-set via Win32 API (hwnd={hwnd}, file={icon_path}).")
        except Exception as e:
            log.warning(f"[icon] Gagal set icon manual: {e}")

    threading.Thread(target=_worker, daemon=True).start()



def ensure_chromium_installed() -> None:
    """Pastikan Playwright Chromium ter-installed. Jalankan di background thread."""
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
    except ImportError:
        log.warning("Playwright tidak ter-install - skip Chromium check.")
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
            timeout=600,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        # PENTING: cuma tandai "sudah terinstall" kalau proses install-nya BENERAN
        # sukses (returncode 0). Sebelumnya marker selalu dibuat walau gagal
        # (misal karena internet putus pas first-run), jadi kalau gagal sekali,
        # app selamanya skip nyoba install lagi di run berikutnya, padahal
        # Chromium-nya belum ada — baru ketauan pas bot jalan dan error
        # "browser not found".
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
    """Start uvicorn di thread terpisah (app object langsung, tanpa string lookup)."""
    sys.path.insert(0, str(backend_dir))

    import uvicorn  # type: ignore
    import main  # import dari backend_dir (sudah di sys.path)

    config = uvicorn.Config(
        app=main.app,
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
    """Buka native Windows window ke URL backend (EdgeChromium/WebView2).

    ⚠️ FIX ICON WINDOWS:
    Sebelumnya `_set_window_icon_win32` dipanggil SEBELUM `webview.start()`.
    Tapi `webview.start()` adalah blocking call — window native baru dibuat
    SETELAH start jalan. Akibatnya `FindWindowW(None, "ORDAL...")` di worker
    thread cari window yang belum ada, tunggu 15 detik, lalu give up. Icon
    window tetap pakai icon default pythonw.exe (kertas/Python).

    Fix: pakai parameter `func=` di `webview.start()`. pywebview akan
    menjalankan function ini di thread terpisah SETELAH window siap. Dalam
    function tersebut, tunggu sebentar (window native butuh waktu dibuat)
    lalu panggil `_set_window_icon_win32` — sekarang `FindWindowW` akan
    menemukan window dan set icon via Win32 API.
    """
    import webview  # type: ignore

    create_window_kwargs = dict(
        title="ORDAL - Auto Apply Kerja",
        url=url,
        width=1280,
        height=860,
        min_size=(960, 640),
        text_select=False,
    )
    webview.create_window(**create_window_kwargs)

    icon_path = Path(__file__).resolve().parent / "ordal_icon.ico"

    def _set_icon_after_ready():
        """Callback yang dijalankan pywebview SETELAH window siap.
        Tunggu sebentar supaya window native benar-benar ter-create di OS
        (FindWindowW butuh window handle valid), lalu set icon via Win32 API."""
        # Beri delay 1.5s — pywebview butuh waktu untuk spawn window native
        # dan set title-nya. Tanpa delay, FindWindowW bisa kembali 0.
        time.sleep(1.5)
        _set_window_icon_win32("ORDAL - Auto Apply Kerja", icon_path)
        # Retry sekali lagi setelah 3 detik kalau window belum ada di iterasi pertama
        time.sleep(1.5)
        _set_window_icon_win32("ORDAL - Auto Apply Kerja", icon_path)

    # gui='edgechromium' butuh WebView2 Runtime (sudah bawaan di Win10 21H2+/Win11).
    # pywebview otomatis fallback ke mshtml kalau WebView2 tidak ada.
    # Parameter `func=` → pywebview jalanin callback di thread terpisah SETELAH
    # window siap. Ini fix race condition icon (sebelumnya icon setter jalan
    # sebelum window ada).
    try:
        webview.start(debug=False, gui="edgechromium", func=_set_icon_after_ready)
    except Exception as e:
        log.warning(f"EdgeChromium gagal ({e}), fallback ke default backend...")
        webview.start(debug=False, func=_set_icon_after_ready)


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

    # cwd ke user_data_dir (writable, persistent) supaya backend yang nulis
    # relative path (logs, screenshots, failure.log) nulis ke lokasi writable.
    os.chdir(str(user_data))
    log.info(f"  cwd          = {os.getcwd()}")

    # v3: APP_MODE single-user DIHAPUS — user wajib login ke DB pusat (PostgreSQL).
    # Data dir tetap dipakai untuk cache lokal (CV/cookie files, secret, device_id, log).
    os.environ.pop("ORDAL_APP_MODE", None)
    os.environ["ORDAL_DATA_DIR"] = str(user_data)
    os.environ["ORDAL_BACKEND_DIR"] = str(paths["backend_dir"])
    os.environ.setdefault("JWT_SECRET_FILE", str(user_data / "secret.key"))
    os.environ.setdefault("ENCRYPTION_KEY_FILE", str(user_data / "encrypt.key"))

    # v3.1.1: gabungkan .env (user override + bundled) SEBELUM import backend,
    # lalu pastikan database pusat reachable. Tanpa ini, app tanpa DATABASE URL
    # akan crash saat dibuka (window tidak pernah muncul).
    _load_env_layers(user_data, paths["backend_dir"])
    if not _ensure_database_ready(user_data, paths["backend_dir"]):
        return 1

    # First-run: install Chromium (background, tidak block window)
    threading.Thread(target=ensure_chromium_installed, daemon=True).start()

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
