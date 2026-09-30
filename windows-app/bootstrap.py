"""
ORDAL.exe bootstrap (Windows)
==============================
Ini adalah SATU-SATUNYA file yang di-freeze oleh PyInstaller menjadi ORDAL.exe.
Sengaja ditulis stdlib-only (tanpa fastapi/playwright/pywebview) supaya proses
build .exe cepat & reliable, dan supaya dependency berat tetap bisa di-install
normal lewat pip ke sebuah venv nyata (bukan di-freeze) — persis strategi yang
sudah terbukti jalan di build Mac (lihat mac-app/ORDAL_executable.sh).

Alur:
  1. Cari Python di komputer user (py launcher / lokasi umum / PATH). Prefer
     3.12 (paling teruji) tapi terima 3.11-3.14 — venv dibuat pakai versi apa
     pun yang tersedia, tidak lagi mewajibkan install Python 3.12 terpisah.
  2. Sinkronkan file aplikasi (backend/, frontend/dist/, windows-app/launcher.py)
     dari dalam .exe ke %LOCALAPPDATA%\\ORDAL\\app\\ (di-overwrite tiap start,
     supaya user selalu jalankan versi yang dibundle di ORDAL.exe).
  3. First-run (atau requirements berubah): buat venv di
     %LOCALAPPDATA%\\ORDAL\\venv, install windows-app/requirements-app.txt
     (backend deps + pywebview + pythonnet) + Playwright Chromium.
  4. Jalankan windows-app/launcher.py pakai python venv tsb (window app
     sesungguhnya, lihat launcher.py).

User data (DB, cookies, CV, API key) TIDAK PERNAH disentuh script ini — selalu
persist di %LOCALAPPDATA%\\ORDAL\\ (lihat launcher.py: resolve_user_data_dir()).
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

APP_NAME = "ORDAL"
NO_WINDOW = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0


# ----------------------------------------------------------------------------
# Paths
# ----------------------------------------------------------------------------
def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def bundled_root() -> Path:
    """Lokasi file yang dibundle ke dalam .exe (backend/, frontend/dist/, windows-app/)."""
    if is_frozen():
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    # Dev mode: jalankan `python windows-app/bootstrap.py` dari root repo
    return Path(__file__).resolve().parent.parent


def local_appdata() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base)


APP_DATA_DIR = local_appdata() / APP_NAME
APP_INSTALL_DIR = APP_DATA_DIR / "app"     # copy backend/frontend/launcher, disinkron tiap start
VENV_DIR = APP_DATA_DIR / "venv"
LOG_FILE = APP_DATA_DIR / "app.log"
SETUP_MARKER = VENV_DIR / ".setup_complete"
REQ_HASH_FILE = VENV_DIR / ".requirements_hash"


# ----------------------------------------------------------------------------
# Logging & error dialogs
# ----------------------------------------------------------------------------
def log(msg: str) -> None:
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def tail_log(n: int = 25) -> str:
    """Baca N baris terakhir dari LOG_FILE untuk ditampilkan langsung di dialog
    error, supaya user tidak perlu buka file .log secara manual untuk lihat
    traceback aslinya."""
    try:
        lines = LOG_FILE.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(lines[-n:])
    except Exception as e:
        return f"(Tidak bisa baca log: {e})"


def show_error(title: str, message: str) -> None:
    log(f"ERROR DIALOG [{title}]: {message}")
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, message, title, 0x10)  # MB_ICONERROR
    except Exception:
        pass


# ----------------------------------------------------------------------------
# Progress window (Tkinter — stdlib, aman di-freeze)
# ----------------------------------------------------------------------------
class ProgressWindow:
    def __init__(self) -> None:
        self.root = None
        self.label = None
        self.bar = None
        self.pct_label = None
        try:
            import tkinter as tk
            from tkinter import ttk
            self.root = tk.Tk()
            self.root.title("ORDAL — Menyiapkan aplikasi")
            self.root.geometry("460x190")
            self.root.resizable(False, False)
            try:
                icon = bundled_root() / "windows-app" / "ordal_icon.ico"
                if icon.exists():
                    self.root.iconbitmap(default=str(icon))
            except Exception:
                pass
            tk.Label(self.root, text="ORDAL sedang menyiapkan environment...",
                     font=("Segoe UI", 11, "bold")).pack(pady=(18, 6))
            self.label = tk.Label(self.root, text="Memulai...", font=("Segoe UI", 9),
                                   wraplength=420, justify="left")
            self.label.pack(pady=4)

            bar_frame = tk.Frame(self.root)
            bar_frame.pack(pady=(6, 0), padx=20, fill="x")
            self.bar = ttk.Progressbar(bar_frame, orient="horizontal", mode="determinate",
                                        maximum=100, value=0, length=380)
            self.bar.pack(side="left", fill="x", expand=True)
            self.pct_label = tk.Label(self.root, text="0%", font=("Segoe UI", 9))
            self.pct_label.pack(pady=(4, 0))

            tk.Label(self.root, text="Proses ini hanya terjadi sekali (~5-10 menit tergantung koneksi).",
                     font=("Segoe UI", 8), fg="#666666").pack(pady=(8, 0))
            self.root.update()
        except Exception as e:
            log(f"Progress window tidak bisa dibuat (lanjut tanpa GUI): {e}")
            self.root = None

    def set(self, text: str, percent: int | None = None) -> None:
        log(text if percent is None else f"[{percent}%] {text}")
        if self.root is None:
            return
        try:
            if self.label is not None:
                self.label.config(text=text)
            if percent is not None and self.bar is not None:
                percent = max(0, min(100, percent))
                self.bar["value"] = percent
                if self.pct_label is not None:
                    self.pct_label.config(text=f"{percent}%")
            self.root.update()
        except Exception:
            pass

    def close(self) -> None:
        if self.root is not None:
            try:
                self.root.destroy()
            except Exception:
                pass


# ----------------------------------------------------------------------------
# Find Python di sistem user — prefer 3.12 (paling teruji), tapi terima 3.11-3.14
# ----------------------------------------------------------------------------
ACCEPTABLE_MINORS = ("12", "13", "11", "14")  # urutan preferensi


def find_python() -> tuple[str, str] | None:
    """Return (path_ke_python, versi) atau None. Cari lewat py launcher, lokasi
    umum, dan PATH. Terima Python 3.11-3.14 — venv akan pakai versi yang ada di
    komputer user apa adanya (tidak wajib 3.12 lagi)."""
    candidates: list[str] = []

    for minor in ACCEPTABLE_MINORS:
        try:
            out = subprocess.run(
                ["py", f"-3.{minor}", "-c", "import sys; print(sys.executable)"],
                capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW,
            )
            if out.returncode == 0 and out.stdout.strip():
                candidates.append(out.stdout.strip())
        except Exception:
            pass

    # py launcher default (biasanya versi terbaru ter-install, mis. 3.14)
    try:
        out = subprocess.run(
            ["py", "-3", "-c", "import sys; print(sys.executable)"],
            capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW,
        )
        if out.returncode == 0 and out.stdout.strip():
            candidates.append(out.stdout.strip())
    except Exception:
        pass

    home = Path.home()
    for minor in ACCEPTABLE_MINORS:
        for guess in (
            home / "AppData" / "Local" / "Programs" / "Python" / f"Python3{minor}" / "python.exe",
            Path(f"C:/Python3{minor}/python.exe"),
            Path(f"C:/Program Files/Python3{minor}/python.exe"),
        ):
            if guess.exists():
                candidates.append(str(guess))

    for exe_name in ("python.exe", "python3.exe"):
        found = shutil.which(exe_name)
        if found:
            candidates.append(found)

    seen = set()
    found: dict[str, tuple[str, str]] = {}  # minor -> (path, version)
    for c in candidates:
        if c in seen:
            continue
        seen.add(c)
        try:
            out = subprocess.run(
                [c, "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
                capture_output=True, text=True, timeout=10, creationflags=NO_WINDOW,
            )
            if out.returncode != 0:
                continue
            ver = out.stdout.strip()
            major, _, minor = ver.partition(".")
            if major != "3" or not minor.isdigit() or int(minor) < 11:
                continue
            found.setdefault(minor, (c, ver))
        except Exception:
            continue

    if not found:
        return None

    # Preferensi urutan: 3.12 > 3.13 > 3.11 > 3.14 > lainnya yang lebih baru.
    for minor in ACCEPTABLE_MINORS:
        if minor in found:
            return found[minor]
    # Ada Python 3.x (>=3.11) yang tidak masuk daftar preferensi (mis. 3.15+) — tetap pakai.
    newest_minor = sorted(found.keys(), key=int)[-1]
    return found[newest_minor]


# ----------------------------------------------------------------------------
# Sync bundled app files -> persistent install dir
# ----------------------------------------------------------------------------
def _bundle_hash() -> str:
    """Hash file backend/main.py + frontend/dist/index.html untuk deteksi
    apakah bundle berubah. Kalau hash sama, skip sync_app_files."""
    h = hashlib.sha256()
    src_root = bundled_root()
    # Hash beberapa file kunci sebagai representasi versi bundle
    for relpath in ("backend/main.py", "backend/workers/jobstreet_bot.py",
                     "backend/routers/credentials.py", "backend/.env", "frontend/dist/index.html"):
        fpath = src_root / relpath
        if fpath.exists():
            h.update(fpath.read_bytes()[:4096])  # max 4KB per file
    return h.hexdigest()


BUNDLE_HASH_FILE = APP_DATA_DIR / ".bundle_hash"


def sync_app_files(progress: ProgressWindow) -> None:
    # v37: Guard — hanya sync kalau bundle berubah (hash beda).
    # Sebelumnya, sync jalan SETIAP start ORDAL.exe → copy ulang
    # backend/ dan frontend/ tiap kali → lambat + Windows Defender scan.
    new_hash = _bundle_hash()
    old_hash = BUNDLE_HASH_FILE.read_text().strip() if BUNDLE_HASH_FILE.exists() else None
    if old_hash == new_hash:
        log("Bundle tidak berubah, skip sync_app_files.")
        progress.set("Aplikasi siap.", 15)
        return

    progress.set("Menyalin file aplikasi...", 10)
    src_root = bundled_root()
    APP_INSTALL_DIR.mkdir(parents=True, exist_ok=True)

    for name in ("backend", "frontend"):
        src = src_root / name
        dst = APP_INSTALL_DIR / name
        if not src.exists():
            log(f"WARNING: {src} tidak ditemukan di bundle, skip.")
            continue
        if dst.exists():
            shutil.rmtree(dst, ignore_errors=True)
        # v3.1.1: .env TIDAK lagi di-ignore — konfigurasi DATABASE pusat
        # hasil build harus ikut tersinkron ke install dir supaya app bisa start.
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))

    wa_src = src_root / "windows-app"
    wa_dst = APP_INSTALL_DIR / "windows-app"
    wa_dst.mkdir(parents=True, exist_ok=True)
    for fname in ("launcher.py", "ordal_icon.ico", "ordal_icon.png", "requirements-app.txt", "clear_icon_cache.bat"):
        s = wa_src / fname
        if s.exists():
            shutil.copy2(s, wa_dst / fname)

    # Simpan hash supaya next start skip sync
    BUNDLE_HASH_FILE.write_text(new_hash)
    log(f"Bundle synced (hash: {new_hash[:16]}...).")


def requirements_hash() -> str:
    h = hashlib.sha256()
    req_file = APP_INSTALL_DIR / "windows-app" / "requirements-app.txt"
    if req_file.exists():
        h.update(req_file.read_bytes())
    return h.hexdigest()


# ----------------------------------------------------------------------------
# venv setup
# ----------------------------------------------------------------------------
def ensure_venv(progress: ProgressWindow, python_exe: str) -> bool:
    new_hash = requirements_hash()
    old_hash = REQ_HASH_FILE.read_text().strip() if REQ_HASH_FILE.exists() else None
    need_setup = (not VENV_DIR.exists()) or (not SETUP_MARKER.exists()) or (new_hash != old_hash)

    if not need_setup:
        log("Venv sudah lengkap & up-to-date, skip setup.")
        return True

    progress.set("Menyiapkan Python virtual environment...", 20)
    if VENV_DIR.exists():
        shutil.rmtree(VENV_DIR, ignore_errors=True)
    r = subprocess.run([python_exe, "-m", "venv", str(VENV_DIR)],
                        capture_output=True, text=True, creationflags=NO_WINDOW)
    if r.returncode != 0:
        show_error("ORDAL — Error", f"Gagal membuat virtual environment.\n\n{r.stderr[-800:]}\n\nLog: {LOG_FILE}")
        log(r.stdout); log(r.stderr)
        return False

    venv_python = VENV_DIR / "Scripts" / "python.exe"

    progress.set("Upgrade pip...", 30)
    subprocess.run([str(venv_python), "-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools"],
                    capture_output=True, text=True, creationflags=NO_WINDOW)

    progress.set("Install dependencies (backend + native window, bisa beberapa menit)...", 40)
    req = APP_INSTALL_DIR / "windows-app" / "requirements-app.txt"
    r = subprocess.run([str(venv_python), "-m", "pip", "install", "-r", str(req)],
                        capture_output=True, text=True, creationflags=NO_WINDOW)
    if r.returncode != 0:
        show_error("ORDAL — Error", f"Gagal install dependencies.\n\n{r.stderr[-800:]}\n\nLog lengkap: {LOG_FILE}")
        log(r.stdout); log(r.stderr)
        return False
    progress.set("Dependencies terinstall.", 80)

    progress.set("Install Playwright Chromium (~150MB, bisa beberapa menit)...", 85)
    r = subprocess.run([str(venv_python), "-m", "playwright", "install", "chromium"],
                        capture_output=True, text=True, timeout=900, creationflags=NO_WINDOW)
    if r.returncode != 0:
        log("WARNING: Chromium install gagal saat first-run, app akan retry saat launcher.py jalan.")
        log(r.stdout); log(r.stderr)

    progress.set("Setup selesai.", 100)
    REQ_HASH_FILE.write_text(new_hash)
    SETUP_MARKER.touch()
    return True


# ----------------------------------------------------------------------------
# Windows Icon Cache cleanup
# ----------------------------------------------------------------------------
def clear_windows_icon_cache() -> None:
    """Hapus Windows Icon Cache supaya icon ORDAL.exe yang baru terbaca.

    KENAPA INI PERLU:
    Windows cache icon exe di IconCache.db (%LOCALAPPDATA%\\IconCache.db)
    dan di folder explorer thumbcache. Kalau user sebelumnya jalankan
    ORDAL.exe versi lama (icon Python), Windows akan terus tampilkan icon
    lama walau exe sudah di-rebuild dengan icon baru. Cache bisa bertahan
    berhari-hari bahkan setelah restart.

    Fix: hapus IconCache.db + restart Explorer.exe supaya cache rebuild
    dengan icon terbaru. Aman dilakukan — Windows akan re-create cache
    otomatis saat dibutuhkan lagi.
    """
    if sys.platform != "win32":
        return
    try:
        import ctypes
        # Hapus IconCache.db
        icon_cache = local_appdata() / "IconCache.db"
        if icon_cache.exists():
            try:
                icon_cache.unlink()
                log(f"[icon-cache] Dihapus: {icon_cache}")
            except Exception as e:
                log(f"[icon-cache] Gagal hapus {icon_cache}: {e}")

        # Hapus thumbcache (Explorer icon thumbnail cache)
        explorer_dir = local_appdata() / "Microsoft" / "Windows" / "Explorer"
        if explorer_dir.exists():
            for f in explorer_dir.glob("thumbcache_*.db"):
                try:
                    f.unlink()
                except Exception:
                    pass
            for f in explorer_dir.glob("iconcache_*.db"):
                try:
                    f.unlink()
                except Exception:
                    pass
            log(f"[icon-cache] Explorer thumbcache di-clear.")

        # Restart Explorer.exe supaya cache rebuild
        # (SendMessageTimeout HWND_BROADCAST WM_SETTINGCHANGE untuk refresh icon)
        # Tidak restart Explorer.exe karena bisa ganggu user — biarkan Windows
        # rebuild cache secara lazy saat user lihat file/icon berikutnya.
        # Tapi kirim notify supaya shell refresh.
        try:
            HWND_BROADCAST = 0xFFFF
            WM_SETTINGCHANGE = 0x001A
            SMTO_ABORTIFHUNG = 0x0002
            result = ctypes.c_long()
            ctypes.windll.user32.SendMessageTimeoutW(
                HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Shell",
                SMTO_ABORTIFHUNG, 2000, ctypes.byref(result)
            )
            log("[icon-cache] Notifikasi refresh shell terkirim.")
        except Exception as e:
            log(f"[icon-cache] Gagal kirim notifikasi refresh: {e}")
    except Exception as e:
        log(f"[icon-cache] Error clear icon cache: {e}")


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
def main() -> int:
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    log("=" * 60)
    log("ORDAL.exe starting")
    log(f"bundled_root    = {bundled_root()}")
    log(f"APP_INSTALL_DIR = {APP_INSTALL_DIR}")
    log(f"VENV_DIR        = {VENV_DIR}")

    # Clear Windows Icon Cache di awal startup supaya icon ORDAL.exe
    # yang baru langsung terbaca (sebelumnya Windows cache icon lama).
    # First-run saja (selanjutnya cache sudah benar).
    icon_cache_cleared_marker = APP_DATA_DIR / ".icon_cache_cleared"
    if sys.platform == "win32" and not icon_cache_cleared_marker.exists():
        log("[icon-cache] First-run: clear Windows Icon Cache...")
        clear_windows_icon_cache()
        try:
            icon_cache_cleared_marker.touch()
        except Exception:
            pass

    progress = ProgressWindow()

    progress.set("Mencari Python (venv)...", 5)
    result = find_python()
    if not result:
        progress.close()
        show_error(
            "ORDAL — Python Dibutuhkan",
            "Python tidak ditemukan di komputer Anda (butuh versi 3.11-3.14).\n\n"
            "Silakan install Python dari:\n"
            "https://www.python.org/downloads/\n\n"
            "PENTING saat install: centang kotak 'Add python.exe to PATH'.\n\n"
            "Setelah selesai install, jalankan ORDAL.exe lagi.",
        )
        return 1
    python_exe, python_ver = result
    log(f"Python ditemukan: {python_exe} (versi {python_ver})")

    sync_app_files(progress)

    if not ensure_venv(progress, python_exe):
        progress.close()
        return 1

    progress.close()

    venv_pythonw = VENV_DIR / "Scripts" / "pythonw.exe"
    venv_python = VENV_DIR / "Scripts" / "python.exe"
    runner = venv_pythonw if venv_pythonw.exists() else venv_python
    launcher_script = APP_INSTALL_DIR / "windows-app" / "launcher.py"

    log(f"Menjalankan: {runner} {launcher_script}")
    env = os.environ.copy()
    # Login wajib melalui API HTTPS ORDAL-Web; data bot tetap lokal.
    env.pop("ORDAL_APP_MODE", None)
    env["ORDAL_DATA_DIR"] = str(APP_DATA_DIR)

    try:
        with open(LOG_FILE, "a", encoding="utf-8") as logf:
            result = subprocess.run(
                [str(runner), str(launcher_script)],
                cwd=str(APP_INSTALL_DIR),
                env=env,
                stdout=logf,
                stderr=subprocess.STDOUT,
            )
        log(f"launcher.py keluar dengan exit code {result.returncode}")
        if result.returncode != 0:
            show_error(
                "ORDAL — Error",
                f"ORDAL gagal start (exit code {result.returncode}).\n\n"
                f"--- 25 baris terakhir log ({LOG_FILE}) ---\n{tail_log(25)}\n"
                f"------------------------------------------\n\n"
                f"Kalau error terkait module Python, hapus folder venv lalu jalankan lagi:\n{VENV_DIR}",
            )
        return result.returncode
    except Exception as e:
        show_error(
            "ORDAL — Error",
            f"Gagal menjalankan aplikasi.\n\n{e}\n\n"
            f"--- 25 baris terakhir log ({LOG_FILE}) ---\n{tail_log(25)}",
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
