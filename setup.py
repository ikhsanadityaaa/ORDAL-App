"""
py2app setup script untuk ORDAL Mac App
=========================================
Build dengan:  python setup.py py2app

Output: dist/ORDAL.app

Catatan:
- Frontend (React) harus sudah di-build ke frontend/dist/ sebelum build app.
- Backend/ harus sudah ada di parent directory (Contents/Resources/backend).
- Launcher meletakkan backend/ & frontend/dist/ di Contents/Resources/.
"""
from setuptools import setup
import os
import shutil
from pathlib import Path

APP = ["mac-app/launcher.py"]
APP_NAME = "ORDAL"
APP_VERSION = "2.0.0"

# Path ke backend & frontend dist (relatif ke repo root)
REPO_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

# Data files: backend source + frontend dist + .env.example
DATA_FILES = []
if BACKEND_DIR.exists():
    # Bundle seluruh folder backend/ ke Contents/Resources/backend/
    DATA_FILES.append(("backend", [str(p) for p in BACKEND_DIR.rglob("*") if p.is_file()]))
else:
    print("WARNING: backend/ tidak ditemukan. App tidak akan jalan.")

if FRONTEND_DIST.exists():
    # Bundle seluruh folder frontend/dist/ ke Contents/Resources/frontend/dist/
    DATA_FILES.append(("frontend/dist", [str(p) for p in FRONTEND_DIST.rglob("*") if p.is_file()]))
else:
    print("WARNING: frontend/dist/ tidak ditemukan. Jalankan `npm run build` di frontend/ dulu.")

OPTIONS = {
    "argv_emulation": False,
    # iconfile dihilangkan kalau file icns tidak ada. py2app akan pakai icon default.
    "iconfile": "mac-app/ordal.icns" if os.path.exists("mac-app/ordal.icns") else "",
    "packages": [
        # Backend deps yang py2app harus include
        "fastapi",
        "uvicorn",
        "pydantic",
        "bcrypt",
        "cryptography",
        "jwt",
        "httpx",
        "dotenv",
        "pdfplumber",
        "playwright",
        "webview",
    ],
    "includes": [
        # Modules yang di-import secara lazy / via string (perlu explicit include)
        "uvicorn.logging",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "email.mime.multipart",
        "email.mime.text",
        "email.mime.base",
        "smtplib",
        "sqlite3",
        "html.parser",
    ],
    "excludes": [
        # Tidak perlu module ini
        "tkinter",
        "matplotlib",
        "numpy",
        "pandas",
        "PIL",
        "tests",
        "pytest",
        # Module opsional yang di-comment dari requirements
        "libsql",
        "steel",
        "scrapling",
        "crawl4ai",
    ],
    "resources": [],  # Diisi lewat DATA_FILES
    "plist": {
        "CFBundleName": APP_NAME,
        "CFBundleDisplayName": "ORDAL",
        "CFBundleIdentifier": "com.ordal.app",
        "CFBundleVersion": APP_VERSION,
        "CFBundleShortVersionString": APP_VERSION,
        "CFBundleExecutable": APP_NAME,
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "11.0",
        "NSAppTransportSecurity": {
            "NSAllowsLocalNetworking": True,
            "NSAllowsArbitraryLoads": True,
        },
        "LSUIElement": False,
        "NSCameraUsageDescription": "ORDAL tidak menggunakan kamera.",
        "NSAppleEventsUsageDescription": "ORDAL mengontrol Chrome via AppleScript untuk capture session platform.",
    },
    "site_packages": True,
}

setup(
    name=APP_NAME,
    app=APP,
    data_files=DATA_FILES,
    options={"py2app": OPTIONS},
    setup_requires=["py2app"],
)
