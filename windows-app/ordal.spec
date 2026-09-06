# -*- mode: python ; coding: utf-8 -*-
# ==============================================================================
# PyInstaller spec — ORDAL.exe (Windows)
# ==============================================================================
# Build dengan (dari root repo):
#   pyinstaller windows-app/ordal.spec --noconfirm
#
# Hanya bootstrap.py yang di-freeze (stdlib only -> build cepat & reliable).
# backend/, frontend/dist/, dan windows-app/ dibundle sebagai DATA MENTAH
# (bukan di-compile), lalu di-copy keluar + di-pip-install ke venv nyata oleh
# bootstrap.py saat pertama kali dijalankan. Ini menghindari masalah klasik
# "PyInstaller + Playwright/FastAPI raksasa jadi 1 exe raksasa yang rapuh".
#
# Output: dist/ORDAL/ORDAL.exe (+ folder pendukung PyInstaller di sebelahnya)
# ==============================================================================
import sys
from pathlib import Path

block_cipher = None

REPO_ROOT = Path(SPECPATH).resolve().parent  # windows-app/ -> repo root
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
WINDOWS_APP_DIR = REPO_ROOT / "windows-app"

if not FRONTEND_DIST.exists():
    print("WARNING: frontend/dist/ tidak ada. Jalankan `npm run build` di frontend/ dulu "
          "(VITE_APP_MODE=1 npm run build) sebelum build ORDAL.exe.")

datas = []

# backend/ -> bundle/backend/  (source code mentah, dipakai lewat venv nyata)
if BACKEND_DIR.exists():
    datas.append((str(BACKEND_DIR), "backend"))

# frontend/dist/ -> bundle/frontend/dist/
if FRONTEND_DIST.exists():
    datas.append((str(FRONTEND_DIST), "frontend/dist"))

# windows-app/launcher.py + requirements-app.txt + icon + clear_icon_cache.bat
# -> bundle/windows-app/
for fname in ("launcher.py", "requirements-app.txt", "ordal_icon.ico", "ordal_icon.png", "clear_icon_cache.bat"):
    fpath = WINDOWS_APP_DIR / fname
    if fpath.exists():
        datas.append((str(fpath), "windows-app"))

a = Analysis(
    [str(WINDOWS_APP_DIR / "bootstrap.py")],
    pathex=[str(REPO_ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=["tkinter"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ORDAL",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,   # windowed app -- no black console box; progress via Tkinter dialog
    icon=str(WINDOWS_APP_DIR / "ordal_icon.ico") if (WINDOWS_APP_DIR / "ordal_icon.ico").exists() else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="ORDAL",
)
