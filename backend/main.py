import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# ── Setup logging SEGE LÁ mungkin ────────────────────────────────────────
# Harus dipanggil sebelum import modul yang pakai logger (services, workers).
# Tanpa ini, log di app mode (Mac/Windows build) tidak akan nulis ke file,
# dan user tidak bisa debug masalah Telegram callback / JobStreet apply.
from logging_config import setup_logging as _setup_logging
_setup_logging()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import os
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db, restore_persisted_files, get_data_dir
from routers import auth, credentials, cv, targets, sessions, preferences, question_bank, telegram, onboarding
from routers.license import router as license_router
from routers.email_config import router as email_router
from routers.app_config import router as app_config_router
from routers.ai_config import router as ai_config_router

# v42: Pakai get_data_dir() single source of truth untuk uploads/cookies.
_DATA_DIR = get_data_dir()
UPLOADS_DIR = os.path.join(_DATA_DIR, "uploads")
COOKIES_DIR = os.path.join(_DATA_DIR, "cookies")
os.makedirs(os.path.join(UPLOADS_DIR, "cvs"), exist_ok=True)
os.makedirs(COOKIES_DIR, exist_ok=True)

# Frontend dist (jika sudah di-build dan di-bundle ke .app)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_FRONTEND_DIST = os.getenv("ORDAL_FRONTEND_DIST", "").strip()
if not _FRONTEND_DIST:
    _FRONTEND_DIST = os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist")


def _get_cors_origins() -> list[str]:
    """
    Allow localhost (dev Vite + pywebview desktop) + CORS_ORIGINS dari env.
    """
    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://localhost,http://127.0.0.1:5173,http://127.0.0.1:3000,http://127.0.0.1",
    )
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or ["http://localhost:5173"]


app = FastAPI(title="ORDAL API", version="3.2.3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

app.include_router(auth.router,        prefix="/api/auth",        tags=["Auth"])
app.include_router(license_router,                             tags=["License (trial/pembayaran/aktivasi)"])
app.include_router(onboarding.router, prefix="/api/onboarding", tags=["Onboarding"])
app.include_router(credentials.router, prefix="/api/credentials", tags=["Credentials"])
app.include_router(cv.router,          prefix="/api/cvs",         tags=["CVs"])
app.include_router(targets.router,     prefix="/api/targets",     tags=["Targets"])
app.include_router(sessions.router,    prefix="/api/sessions",    tags=["Sessions"])
app.include_router(email_router,       prefix="/api/email",       tags=["Email"])
app.include_router(preferences.router, prefix="/api/preferences", tags=["Preferences"])
app.include_router(question_bank.router, prefix="/api/questions", tags=["Questions"])
app.include_router(telegram.router, prefix="/api/telegram", tags=["Telegram"])
app.include_router(app_config_router, prefix="/api/app_config", tags=["App Config"])
app.include_router(ai_config_router, prefix="/api/ai_config", tags=["AI Config"])


@app.on_event("startup")
async def startup():
    init_db()
    restore_persisted_files()
    db = get_db()
    db.execute("UPDATE apply_sessions SET status='stopped', ended_at=NOW() WHERE status='running'")
    db.commit()
    db.close()
    from services.telegram_service import start_background_tasks
    start_background_tasks()
    from services.auto_apply_scheduler import start_auto_apply_scheduler
    start_auto_apply_scheduler()


@app.on_event("shutdown")
async def shutdown():
    from services.telegram_service import stop_background_tasks
    await stop_background_tasks()
    from services.auto_apply_scheduler import stop_auto_apply_scheduler
    await stop_auto_apply_scheduler()


@app.get("/api")
def api_root():
    return {
        "status": "ORDAL API v3 running",
        "auth_required": True,
        "frontend_dist_exists": os.path.exists(_FRONTEND_DIST),
    }


# ── Debug endpoints: akses file log tanpa buka Finder/Explorer ──────────────
# Saat app di-build (Mac/Windows), user tidak punya cara mudah untuk lihat
# log backend. Endpoint ini kembalikan:
# - path absolut file log (supaya user tahu lokasinya)
# - N baris terakhir isi log (default 200, max 1000)
# Auth: wajib login (v3: selalu multi-user, APP_MODE dihapus).
from auth_utils import get_current_user
from fastapi import Depends

@app.get("/api/debug/log")
def get_debug_log(lines: int = 200, user=Depends(get_current_user)):
    from logging_config import get_log_file_path, get_log_tail
    lines = max(1, min(int(lines), 1000))
    return {
        "log_file_path": get_log_file_path(),
        "lines": lines,
        "content": get_log_tail(lines=lines),
    }


@app.post("/api/debug/log/open")
def open_log_folder(user=Depends(get_current_user)):
    """Buka folder tempat file log berada di file explorer native
    (Finder di Mac, Explorer di Windows). Dipanggil dari tombol 'Buka Log'
    di halaman Settings."""
    import subprocess
    import sys as _sys
    from logging_config import get_log_file_path
    log_path = get_log_file_path()
    if not log_path or not os.path.exists(log_path):
        return {"ok": False, "error": f"File log tidak ditemukan: {log_path}"}
    try:
        if _sys.platform == "darwin":
            # Mac: buka folder di Finder & select file log
            subprocess.Popen(["open", "-R", log_path])
        elif _sys.platform == "win32":
            # Windows: buka Explorer & select file
            subprocess.Popen(["explorer", "/select,", log_path])
        else:
            # Linux: buka folder
            subprocess.Popen(["xdg-open", os.path.dirname(log_path)])
        return {"ok": True, "log_file_path": log_path}
    except Exception as e:
        return {"ok": False, "error": str(e), "log_file_path": log_path}


# ── Mac app mode: serve frontend dist dari backend ────────────────────────────
# Saat di-bundle ke .app, frontend/dist di-serve oleh backend langsung dari /
# (root URL). pywebview me-load http://127.0.0.1:PORT/.
if os.path.isdir(_FRONTEND_DIST):
    # Mount static assets (js, css, images) dari /assets/
    _assets_dir = os.path.join(_FRONTEND_DIST, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    # Serve favicon PNG dari frontend/dist/ root (Vite copy public/ordal-icon.png
    # ke dist/ordal-icon.png saat build). Penting supaya WebView2/EdgeChromium
    # bisa load favicon untuk title bar icon di Windows app.
    _favicon_path = os.path.join(_FRONTEND_DIST, "ordal-icon.png")
    if os.path.exists(_favicon_path):
        @app.get("/ordal-icon.png")
        def serve_favicon():
            return FileResponse(_favicon_path)


    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        """
        SPA fallback: semua path yang tidak match API route → kembalikan index.html.
        Penting agar React Router handle client-side routing.
        """
        # Jangan intercept API routes
        if full_path.startswith(("api/", "uploads/", "assets/")):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        index_html = os.path.join(_FRONTEND_DIST, "index.html")
        if os.path.exists(index_html):
            return FileResponse(index_html)
        return JSONResponse({"detail": "Frontend not built"}, status_code=404)
else:
    @app.get("/")
    def root():
        return {
            "status": "ORDAL API v3.1 running",
            "auth_required": True,
            "frontend_dist": "not built (run `npm run build` in frontend/)",
            "frontend_dist_expected_at": _FRONTEND_DIST,
        }
