from fastapi import APIRouter, Depends, HTTPException

from auth_utils import get_current_user
from database import get_db


router = APIRouter()


@router.get("")
def list_notifications(limit: int = 50, user=Depends(get_current_user)):
    db = get_db()
    try:
        rows = db.execute(
            """SELECT id, kind, title, message, action_url, read_at, created_at
               FROM notifications
               WHERE user_id = ? AND dismissed_at IS NULL
               ORDER BY created_at DESC LIMIT ?""",
            (user["id"], max(1, min(limit, 100))),
        ).fetchall()
        unread = db.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL",
            (user["id"],),
        ).fetchone()[0]
        return {"items": [dict(row) for row in rows], "unread": unread}
    finally:
        db.close()


def _change(notification_id: int, user_id: str, sql: str) -> None:
    db = get_db()
    try:
        cursor = db.execute(sql, (notification_id, user_id))
        if not cursor.rowcount:
            raise HTTPException(status_code=404, detail="Notifikasi tidak ditemukan")
        db.commit()
    finally:
        db.close()


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, user=Depends(get_current_user)):
    _change(notification_id, user["id"], "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ? AND user_id = ?")
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(user=Depends(get_current_user)):
    db = get_db()
    try:
        db.execute(
            "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')) WHERE user_id = ? AND dismissed_at IS NULL",
            (user["id"],),
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.delete("/{notification_id}")
def dismiss(notification_id: int, user=Depends(get_current_user)):
    _change(notification_id, user["id"], "UPDATE notifications SET dismissed_at = datetime('now') WHERE id = ? AND user_id = ?")
    return {"ok": True}
