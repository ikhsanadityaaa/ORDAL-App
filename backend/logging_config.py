"""ORDAL Logging Configuration
================================
Setup logging yang menulis ke FILE di user_data_dir (persistent, writable)
supaya log bisa diakses walaupun aplikasi di-build sebagai Mac/Windows app
(tanpa console yang terlihat).

File log:
- <user_data_dir>/ordal.log          — log utama (rolling 5MB x 5 files)
- <user_data_dir>/ordal-telegram.log — log khusus Telegram polling/callback

Lokasi user_data_dir:
- Mac (app mode):     ~/Library/Application Support/ORDAL/
- Windows (app mode): %LOCALAPPDATA%/ORDAL/
- Dev:                ./_ordal_data/
- Backend-only mode:  backend/ (cwd saat run.py dijalankan)
"""
import logging
import logging.handlers
import os
import sys
from pathlib import Path

# Flag supaya setup() idempotent (aman dipanggil berkali-kali)
_logging_initialized = False
_log_file_path: str = ""


def _resolve_data_dir() -> Path:
    """v42: Pakai get_data_dir() single source of truth dari database.py."""
    from database import get_data_dir
    data_dir = get_data_dir()
    p = Path(data_dir)
    try:
        p.mkdir(parents=True, exist_ok=True)
        return p
    except Exception:
        pass
    # Fallback: cwd
    cwd = Path.cwd()
    try:
        (cwd / "_log_test").touch()
        (cwd / "_log_test").unlink()
        return cwd
    except Exception:
        pass
    return Path(__file__).resolve().parent


def get_log_file_path() -> str:
    """Return absolute path file log utama."""
    global _log_file_path
    if not _log_file_path:
        setup_logging()
    return _log_file_path


def setup_logging(force: bool = False) -> None:
    """Setup logging ke stdout + file. Idempotent (aman dipanggil berkali-kali).

    Args:
        force: kalau True, setup ulang walau sudah pernah di-setup (untuk test).
    """
    global _logging_initialized, _log_file_path
    if _logging_initialized and not force:
        return

    data_dir = _resolve_data_dir()
    _log_file_path = str(data_dir / "ordal.log")
    telegram_log_path = str(data_dir / "ordal-telegram.log")

    # Format yang konsisten di semua handler
    fmt = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # ── Root logger ──
    root = logging.getLogger()
    # Hapus handler existing supaya tidak dobel kalau setup dipanggil ulang
    for h in list(root.handlers):
        root.removeHandler(h)
    root.setLevel(logging.INFO)

    # Stdout handler — kelihatan saat jalankan via `python run.py` di terminal
    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(fmt)
    stdout_handler.setLevel(logging.INFO)
    root.addHandler(stdout_handler)

    # File handler untuk root — RotatingFileHandler supaya tidak gede terus
    try:
        file_handler = logging.handlers.RotatingFileHandler(
            _log_file_path,
            maxBytes=5 * 1024 * 1024,  # 5 MB
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(fmt)
        file_handler.setLevel(logging.INFO)
        root.addHandler(file_handler)
    except Exception as e:
        # Jangan fail startup kalau file log tidak bisa dibuka
        root.warning(f"Gagal setup file log di {_log_file_path}: {e}")

    # ── Logger khusus ordal-telegram ──
    # Buat file terpisah supaya user bisa cepat cari info Telegram tanpa
    # harus scroll log utama yang penuh log bot apply.
    tg_logger = logging.getLogger("ordal-telegram")
    tg_logger.setLevel(logging.INFO)
    # Hapus handler existing di logger telegram
    for h in list(tg_logger.handlers):
        tg_logger.handlers.remove(h)
    try:
        tg_file_handler = logging.handlers.RotatingFileHandler(
            telegram_log_path,
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        tg_file_handler.setFormatter(fmt)
        tg_file_handler.setLevel(logging.INFO)
        tg_logger.addHandler(tg_file_handler)
    except Exception as e:
        root.warning(f"Gagal setup telegram log file: {e}")

    # Tandai sudah setup
    _logging_initialized = True

    # ── Tulis header supaya user gampang lihat log baru dimulai ──
    root.info("=" * 60)
    root.info(f"ORDAL logging initialized. Log file: {_log_file_path}")
    root.info(f"Telegram log file: {telegram_log_path}")
    root.info(f"Python: {sys.version.split()[0]} | Platform: {sys.platform}")
    root.info(f"Data dir: {data_dir}")
    root.info("=" * 60)


def get_log_tail(lines: int = 200) -> str:
    """Return N baris terakhir dari file log utama. Dipakai endpoint
    /api/debug/log supaya user bisa lihat log tanpa buka file manual."""
    path = get_log_file_path()
    if not path or not os.path.exists(path):
        return f"(file log tidak ditemukan di {path})"
    try:
        # Baca file dari belakang untuk efisien (file bisa besar)
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        return "".join(all_lines[-lines:])
    except Exception as e:
        return f"Gagal baca log: {e}"
