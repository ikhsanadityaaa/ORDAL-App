import importlib
import os
import sqlite3
import sys
import tempfile
from pathlib import Path


root = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory() as data_dir:
    os.environ["ORDAL_DATA_DIR"] = data_dir
    sys.path.insert(0, str(root / "backend"))
    database = importlib.import_module("database")
    database.init_db()
    connection = sqlite3.connect(database.get_database_path())
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    connection.close()

assert {"local_users", "cvs", "job_targets", "apply_sessions", "app_user_profile"} <= tables

for relative in ("windows-app/launcher.py", "mac-app/launcher.py"):
    source = (root / relative).read_text(encoding="utf-8")
    assert "DATABASE_URL" not in source
    assert "psycopg2" not in source

telegram = (root / "backend/services/telegram_service.py").read_text(encoding="utf-8")
assert "verify_password" not in telegram
assert "hash_password" not in telegram

print("desktop security self-check passed")
