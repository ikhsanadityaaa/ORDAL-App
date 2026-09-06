from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth_utils import get_current_user
from database import get_db

router = APIRouter()


class PreferenceUpdate(BaseModel):
    expected_salary: str = ""
    available_join: str = ""
    headless_mode: bool = False
    testing_email_mode: bool = False
    # v21: auto_apply fields — SEBELUMNYA TIDAK ADA di model, jadi frontend
    # kirim auto_apply_enabled tapi Pydantic ignore → tidak tersimpan → toggle reset.
    auto_apply_enabled: int | None = None
    auto_apply_hour: int | None = None
    auto_apply_minute: int | None = None
    auto_apply_days: str | None = None


@router.get("")
@router.get("/")
def get_preferences(user=Depends(get_current_user)):
    db = get_db()
    row = db.execute(
        """
        SELECT expected_salary, available_join,
               COALESCE(headless_mode, 0) AS headless_mode,
               COALESCE(testing_email_mode, 0) AS testing_email_mode,
               COALESCE(auto_apply_enabled, 0) AS auto_apply_enabled,
               COALESCE(auto_apply_hour, 9) AS auto_apply_hour,
               COALESCE(auto_apply_minute, 0) AS auto_apply_minute,
               COALESCE(auto_apply_days, 'mon,tue,wed,thu,fri') AS auto_apply_days
        FROM user_preferences
        WHERE user_id = ?
        """,
        (user["id"],),
    ).fetchone()
    db.close()
    if not row:
        return {
            "expected_salary": "", "available_join": "",
            "headless_mode": False, "testing_email_mode": False,
            "auto_apply_enabled": 0, "auto_apply_hour": 9,
            "auto_apply_minute": 0, "auto_apply_days": "mon,tue,wed,thu,fri",
        }
    data = dict(row)
    data["headless_mode"] = bool(data.get("headless_mode"))
    data["testing_email_mode"] = bool(data.get("testing_email_mode"))
    data["auto_apply_enabled"] = int(data.get("auto_apply_enabled") or 0)
    return data


@router.put("")
@router.put("/")
def update_preferences(body: PreferenceUpdate, user=Depends(get_current_user)):
    expected_salary = (body.expected_salary or "").strip()
    available_join = (body.available_join or "").strip()
    headless_mode = 1 if body.headless_mode else 0
    testing_email_mode = 1 if body.testing_email_mode else 0

    # v21: auto_apply fields — build SET clause dinamis.
    # Kalau field None (tidak dikirim frontend), JANGAN overwrite — biarkan nilai lama.
    set_clauses = [
        "expected_salary = excluded.expected_salary",
        "available_join = excluded.available_join",
        "headless_mode = excluded.headless_mode",
        "testing_email_mode = excluded.testing_email_mode",
        "updated_at = datetime('now')",
    ]
    params = [user["id"], expected_salary, available_join, headless_mode, testing_email_mode]

    # Tambah auto_apply fields kalau dikirim (tidak None)
    auto_fields = {
        "auto_apply_enabled": body.auto_apply_enabled,
        "auto_apply_hour": body.auto_apply_hour,
        "auto_apply_minute": body.auto_apply_minute,
        "auto_apply_days": body.auto_apply_days,
    }
    for field, value in auto_fields.items():
        if value is not None:
            set_clauses.append(f"{field} = ?")
            params.append(value)

    db = get_db()
    db.execute(
        f"""
        INSERT INTO user_preferences (user_id, expected_salary, available_join, headless_mode, testing_email_mode, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
            {', '.join(set_clauses)}
        """,
        params,
    )
    db.commit()

    # Return updated preferences
    row = db.execute(
        """
        SELECT expected_salary, available_join,
               COALESCE(headless_mode, 0) AS headless_mode,
               COALESCE(testing_email_mode, 0) AS testing_email_mode,
               COALESCE(auto_apply_enabled, 0) AS auto_apply_enabled,
               COALESCE(auto_apply_hour, 9) AS auto_apply_hour,
               COALESCE(auto_apply_minute, 0) AS auto_apply_minute,
               COALESCE(auto_apply_days, 'mon,tue,wed,thu,fri') AS auto_apply_days
        FROM user_preferences WHERE user_id = ?
        """,
        (user["id"],),
    ).fetchone()
    db.close()
    if not row:
        return {"expected_salary": expected_salary, "available_join": available_join,
                "headless_mode": bool(headless_mode), "testing_email_mode": bool(testing_email_mode)}
    data = dict(row)
    data["headless_mode"] = bool(data.get("headless_mode"))
    data["testing_email_mode"] = bool(data.get("testing_email_mode"))
    data["auto_apply_enabled"] = int(data.get("auto_apply_enabled") or 0)
    return data
