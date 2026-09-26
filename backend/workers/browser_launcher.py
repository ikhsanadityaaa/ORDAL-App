"""
Helper terpusat untuk membuka browser Playwright.

- Kalau STEEL_API_KEY diisi di .env: connect ke browser remote Steel.dev
  lewat CDP. Dipakai kalau backend dijalankan di host dengan RAM kecil
  (misalnya Render free tier 512MB) yang tidak sanggup menjalankan Chromium
  lokal berbarengan dengan FastAPI + scheduler.
- Kalau STEEL_API_KEY kosong: tetap launch Chromium lokal seperti sebelumnya
  (dipakai kalau backend jalan di VPS dengan RAM cukup, misalnya Oracle
  ARM Ampere 24GB).

Dipakai sebagai pengganti langsung `p.chromium.launch(...)` di
jobstreet_bot.py, linkedin_bot.py, dan linkedin_posts_bot.py.

Performa Mac (v12):
- Tambah launch args Mac-specific untuk optimasi (disable GPU software rendering,
  disable features berat, dll). Mac pakai GPU Metal tapi Chromium headless
  sering pakai software rendering yang lambat di Mac.
- Default Mac lebih lambat dari Windows karena:
  1. Chromium di Mac pakai lebih banyak resource untuk rendering.
  2. Network stack Mac (CFNetwork) kadang lebih lambat dari Windows (WinHTTP).
  3. Playwright di Mac sering pakai Chromium ARM build yang kurang optimal.
  Fix: tambah args --disable-gpu (force software rendering yang lebih cepat
  untuk headless), --single-process (kurang memory), dll.
"""

import os
import sys

STEEL_API_KEY = os.getenv("STEEL_API_KEY")

# Launch args umum (semua platform)
LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
]

# ── Mac-specific launch args untuk performa ─────────────────────────────────
# Mac lebih lambat dari Windows karena Chromium di Mac pakai GPU Metal yang
# overhead-nya tinggu untuk rendering headless. Args ini force software
# rendering yang lebih cepat untuk bot (tidak butuh GPU 3D).
MAC_LAUNCH_ARGS = [
    "--disable-gpu",                          # Mac: software rendering lebih cepat untuk headless
    "--disable-software-rasterizer",          # Mac: skip rasterizer yang berat
    "--disable-features=site-per-process",    # Mac: kurang process overhead
    "--disable-features=IsolateOrigins",      # Mac: kurang process isolation overhead
    "--disable-features=TranslateUI",         # Mac: skip Google Translate
    "--disable-extensions",                   # Mac: skip extension loading
    "--disable-plugins",                      # Mac: skip plugin loading
    "--disable-default-apps",                 # Mac: skip default apps
    "--disable-component-extensions-with-background-pages",
    "--disable-background-networking",        # Mac: skip background network (analytics, update check)
    "--disable-sync",                         # Mac: skip Chrome sync
    "--disable-translate",                    # Mac: skip translate
    "--disable-ipc-flooding-protection",      # Mac: allow rapid IPC (bot butuh komunikasi cepat)
    "--enable-features=NetworkService,NetworkServiceInProcess",  # Mac: network service in-process lebih cepat
    "--disable-renderer-backgrounding",       # Mac: jangan throttle renderer saat background
    "--disable-background-timer-throttling",  # Mac: jangan throttle timer saat background
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",                     # Mac: skip crash reporter
    "--disable-client-side-phishing-detection",
    "--metrics-recording-only",               # Mac: skip metrics upload
    "--no-first-run",                         # Mac: skip first-run setup
    "--no-default-browser-check",
]

# ── Windows-specific launch args ────────────────────────────────────────────
# Windows biasanya lebih cepat dengan GPU hardware acceleration, jadi JANGAN
# disable GPU di Windows. Tapi tambah args lain yang bantu performa.
WIN_LAUNCH_ARGS = [
    # GPU dibiarkan aktif di Windows (hardware acceleration lebih cepat).
    "--disable-features=site-per-process",
    "--disable-features=TranslateUI",
    "--disable-extensions",
    "--disable-plugins",
    "--disable-default-apps",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-translate",
    "--disable-ipc-flooding-protection",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
]


def _get_launch_args() -> list[str]:
    """Return launch args sesuai platform. Mac dapat args tambahan untuk
    optimasi performa (software rendering + disable features berat)."""
    args = list(LAUNCH_ARGS)  # base args
    if sys.platform == "darwin":
        args.extend(MAC_LAUNCH_ARGS)
    elif sys.platform == "win32":
        args.extend(WIN_LAUNCH_ARGS)
    else:
        # Linux: pakai args umum + beberapa Mac args (GPU software rendering
        # biasanya lebih cepat di Linux headless juga).
        args.extend([
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--disable-extensions",
            "--disable-plugins",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-breakpad",
            "--no-first-run",
        ])
    return args


def _system_chrome_path() -> str | None:
    candidates = []
    if sys.platform == "darwin":
        candidates.append("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    elif sys.platform == "win32":
        for root in (os.getenv("PROGRAMFILES"), os.getenv("PROGRAMFILES(X86)"), os.getenv("LOCALAPPDATA")):
            if root:
                candidates.append(os.path.join(root, "Google", "Chrome", "Application", "chrome.exe"))
    else:
        candidates.extend(("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"))
    return next((path for path in candidates if os.path.isfile(path)), None)


async def launch_browser(p, headless: bool = True, prefer_system_chrome: bool = False):
    """Return objek Browser dari Playwright. Pemanggil tetap pakai
    browser.new_context(...) dan browser.close() persis seperti sebelumnya —
    tidak perlu tahu apakah browsernya lokal atau remote Steel.dev.

    v12: tambah platform-specific launch args untuk optimasi performa,
    terutama di Mac yang default-nya lebih lambat dari Windows.
    """

    if STEEL_API_KEY:
        try:
            from steel import Steel
        except ImportError as e:
            raise RuntimeError(
                "STEEL_API_KEY diisi tapi package 'steel-sdk' belum terinstall. "
                "Jalankan: pip install steel-sdk"
            ) from e

        client = Steel(steel_api_key=STEEL_API_KEY)
        session = client.sessions.create()

        browser = await p.chromium.connect_over_cdp(
            f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
        )

        # Supaya session Steel dilepas otomatis begitu code yang sudah ada
        # manggil browser.close() (tidak perlu ubah call site lain).
        original_close = browser.close

        async def _close_and_release():
            try:
                await original_close()
            finally:
                try:
                    client.sessions.release(session.id)
                except Exception:
                    pass

        browser.close = _close_and_release
        return browser

    # Default: Chromium lokal (perilaku sebelum ada Steel.dev)
    # v12: pakai platform-specific launch args untuk optimasi performa.
    launch_args = _get_launch_args()
    chrome_path = _system_chrome_path() if prefer_system_chrome else None
    kwargs = {"headless": headless, "args": launch_args}
    if chrome_path:
        kwargs["executable_path"] = chrome_path
        # Google menolak browser manual-login yang mengiklankan automation.
        kwargs["ignore_default_args"] = ["--enable-automation"]
    return await p.chromium.launch(**kwargs)
