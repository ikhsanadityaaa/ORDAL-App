import sys
import os
import asyncio
import logging

# Windows: paksa ProactorEventLoop sebelum uvicorn load apapun
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# Setup logging supaya log dari telegram_service (ordal-telegram logger)
# dan polling watchdog kelihatan di stdout. Tanpa ini, info/warning log
# tidak akan tampil → susah debug masalah Telegram callback.
logging.basicConfig(
    level=os.getenv("ORDAL_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

import uvicorn

if __name__ == "__main__":
    # Production: reload=False supaya scheduler & session tidak terputus
    # Development: set ORDAL_DEV=1 untuk enable reload
    reload = os.getenv("ORDAL_DEV", "0") == "1"
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=reload,
        loop="asyncio",
    )
