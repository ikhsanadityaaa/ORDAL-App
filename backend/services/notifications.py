from __future__ import annotations

from database import get_db


def create_notification(user_id: str, kind: str, title: str, message: str = "", action_url: str = "") -> int:
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO notifications(user_id, kind, title, message, action_url) VALUES (?, ?, ?, ?, ?)",
            (user_id, kind[:40], title[:160], message[:1000], action_url[:500] or None),
        )
        db.commit()
        return int(cursor.lastrowid)
    finally:
        db.close()
