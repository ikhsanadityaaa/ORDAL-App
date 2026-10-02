from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_utils import get_current_user
from database import get_db
from services.notifications import create_notification
from workers.intelligence import ensure_reference_cache, normalize_cv, normalize_job, score_match


router = APIRouter()
ALLOWED_STATUSES = {"ready", "needs_review", "approved", "removed", "applied", "failed"}
ALLOWED_MODES = {"find_only", "review_queue", "auto_apply"}


class QueueCreate(BaseModel):
    target_id: int | None = None
    platform: str = Field(min_length=1, max_length=40)
    job_title: str = Field(min_length=1, max_length=240)
    company: str = Field(default="", max_length=240)
    job_url: str = Field(min_length=1, max_length=1000)
    location: str = Field(default="", max_length=240)
    description: str = Field(default="", max_length=30000)
    work_mode: str = Field(default="", max_length=40)
    salary_min: int = Field(default=0, ge=0)
    salary_max: int = Field(default=0, ge=0)
    missing_fields: list[str] = Field(default_factory=list)


class QueueAnswers(BaseModel):
    answers: dict[str, str]


class ModeUpdate(BaseModel):
    mode: str


class SchedulingUpdate(BaseModel):
    search_strategy: str
    platform_priority: list[str]
    sound_enabled: bool = True


def _owned_item(db, item_id: int, user_id: str):
    item = db.execute("SELECT * FROM application_queue WHERE id = ? AND user_id = ?", (item_id, user_id)).fetchone()
    if not item:
        raise HTTPException(status_code=404, detail="Antrean lamaran tidak ditemukan")
    return item


@router.get("")
def list_queue(status: str = "", user=Depends(get_current_user)):
    db = get_db()
    try:
        params: list[object] = [user["id"]]
        where = "user_id = ?"
        if status:
            if status not in ALLOWED_STATUSES:
                raise HTTPException(status_code=400, detail="Status antrean tidak valid")
            where += " AND status = ?"
            params.append(status)
        rows = db.execute(
            f"SELECT * FROM application_queue WHERE {where} ORDER BY created_at DESC LIMIT 250",
            params,
        ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            for key, fallback in (("match_explanation", {}), ("missing_fields", []), ("answer_data", {}), ("question_metadata", {})):
                try:
                    item[key] = json.loads(item[key] or "")
                except json.JSONDecodeError:
                    item[key] = fallback
            items.append(item)
        return items
    finally:
        db.close()


@router.post("")
def enqueue(body: QueueCreate, user=Depends(get_current_user)):
    db = get_db()
    try:
        target = None
        if body.target_id is not None:
            target = db.execute(
                "SELECT * FROM job_targets WHERE id = ? AND user_id = ?",
                (body.target_id, user["id"]),
            ).fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="Target kerja tidak ditemukan")
        else:
            target = db.execute(
                "SELECT * FROM job_targets WHERE user_id = ? AND active = 1 ORDER BY id LIMIT 1",
                (user["id"],),
            ).fetchone()
        target_data = dict(target) if target else {}
        cv = db.execute(
            "SELECT id, file_name, cv_text FROM cvs WHERE id = ? AND user_id = ?",
            (target_data.get("cv_id"), user["id"]),
        ).fetchone() if target_data.get("cv_id") else None
        candidate = normalize_cv(str(cv["cv_text"] or "") if cv else "", str(target_data.get("position") or ""))
        job = normalize_job(body.model_dump())
        ensure_reference_cache(db)
        db.execute(
            """INSERT INTO candidate_profiles(user_id, cv_id, normalized_profile, normalizer_version, updated_at)
               VALUES (?, ?, ?, ?, datetime('now'))
               ON CONFLICT(user_id) DO UPDATE SET
                 cv_id=excluded.cv_id, normalized_profile=excluded.normalized_profile,
                 normalizer_version=excluded.normalizer_version, updated_at=datetime('now')""",
            (user["id"], cv["id"] if cv else None, json.dumps(candidate, ensure_ascii=False), candidate["version"]),
        )
        db.execute(
            """INSERT INTO job_snapshots(user_id, platform, job_url, raw_data, normalized_job, normalizer_version)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, platform, job_url) DO UPDATE SET
                 raw_data=excluded.raw_data, normalized_job=excluded.normalized_job,
                 normalizer_version=excluded.normalizer_version""",
            (
                user["id"], body.platform, body.job_url.strip(),
                json.dumps(body.model_dump(), ensure_ascii=False),
                json.dumps(job, ensure_ascii=False), job["version"],
            ),
        )
        snapshot_id = db.execute(
            "SELECT id FROM job_snapshots WHERE user_id=? AND platform=? AND job_url=?",
            (user["id"], body.platform, body.job_url.strip()),
        ).fetchone()[0]
        explanation = score_match(candidate, job, {
            "location": target_data.get("location", ""),
            "excluded_positions": target_data.get("excluded_positions", ""),
            "excluded_companies": target_data.get("excluded_companies", ""),
        })
        status = "needs_review" if body.missing_fields or not explanation["eligible"] else "ready"
        db.execute(
            """INSERT INTO application_queue(
                   user_id, target_id, job_snapshot_id, platform, job_title, company, job_url, location,
                   status, match_score, match_explanation, missing_fields
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, platform, job_url) DO UPDATE SET
                   target_id=excluded.target_id, job_snapshot_id=excluded.job_snapshot_id,
                   job_title=excluded.job_title,
                   company=excluded.company, location=excluded.location,
                   status=excluded.status, match_score=excluded.match_score,
                   match_explanation=excluded.match_explanation,
                   missing_fields=excluded.missing_fields, updated_at=datetime('now')""",
            (
                user["id"], body.target_id, snapshot_id, body.platform, body.job_title.strip(), body.company.strip(),
                body.job_url.strip(), body.location.strip(), status, explanation["score"],
                json.dumps(explanation, ensure_ascii=False), json.dumps(body.missing_fields, ensure_ascii=False),
            ),
        )
        db.commit()
        item_id = int(db.execute(
            "SELECT id FROM application_queue WHERE user_id=? AND platform=? AND job_url=?",
            (user["id"], body.platform, body.job_url.strip()),
        ).fetchone()[0])
        return {"id": item_id, "status": status, "match": explanation}
    finally:
        db.close()


@router.post("/{item_id}/approve")
def approve(item_id: int, user=Depends(get_current_user)):
    db = get_db()
    try:
        item = _owned_item(db, item_id, user["id"])
        missing = json.loads(item["missing_fields"] or "[]")
        answers = json.loads(item["answer_data"] or "{}")
        unanswered = [field for field in missing if not str(answers.get(field, "")).strip()]
        if unanswered:
            raise HTTPException(status_code=400, detail={"message": "Lengkapi jawaban dulu", "fields": unanswered})
        db.execute("UPDATE application_queue SET status='approved', updated_at=datetime('now') WHERE id=?", (item_id,))
        db.commit()
    finally:
        db.close()
    create_notification(user["id"], "queue", "Lamaran siap diproses", f"{item['job_title']} di {item['company']}", "/antrean-lamaran")
    return {"ok": True, "status": "approved"}


@router.put("/{item_id}/answers")
def save_answers(item_id: int, body: QueueAnswers, user=Depends(get_current_user)):
    cleaned = {str(key)[:160]: str(value).strip()[:2000] for key, value in body.answers.items() if str(value).strip()}
    db = get_db()
    try:
        _owned_item(db, item_id, user["id"])
        db.execute(
            "UPDATE application_queue SET answer_data=?, updated_at=datetime('now') WHERE id=?",
            (json.dumps(cleaned, ensure_ascii=False), item_id),
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.delete("/{item_id}")
def remove(item_id: int, user=Depends(get_current_user)):
    db = get_db()
    try:
        _owned_item(db, item_id, user["id"])
        db.execute("UPDATE application_queue SET status='removed', updated_at=datetime('now') WHERE id=?", (item_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.get("/mode/current")
def get_mode(user=Depends(get_current_user)):
    db = get_db()
    try:
        row = db.execute("SELECT application_mode FROM user_preferences WHERE user_id=?", (user["id"],)).fetchone()
        return {"mode": row[0] if row else "auto_apply"}
    finally:
        db.close()


@router.put("/mode/current")
def set_mode(body: ModeUpdate, user=Depends(get_current_user)):
    if body.mode not in ALLOWED_MODES:
        raise HTTPException(status_code=400, detail="Mode lamaran tidak valid")
    db = get_db()
    try:
        db.execute("INSERT OR IGNORE INTO user_preferences(user_id) VALUES (?)", (user["id"],))
        db.execute("UPDATE user_preferences SET application_mode=?, updated_at=datetime('now') WHERE user_id=?", (body.mode, user["id"]))
        db.commit()
        return {"mode": body.mode}
    finally:
        db.close()


@router.get("/settings/current")
def get_scheduling(user=Depends(get_current_user)):
    db = get_db()
    try:
        row = db.execute(
            "SELECT search_strategy, platform_priority, sound_enabled FROM user_preferences WHERE user_id=?",
            (user["id"],),
        ).fetchone()
        try:
            priority = json.loads(row["platform_priority"] or "[]") if row else []
        except json.JSONDecodeError:
            priority = []
        return {
            "search_strategy": row["search_strategy"] if row else "round_robin",
            "platform_priority": priority,
            "sound_enabled": bool(row["sound_enabled"]) if row else True,
        }
    finally:
        db.close()


@router.put("/settings/current")
def set_scheduling(body: SchedulingUpdate, user=Depends(get_current_user)):
    allowed = {"linkedin", "linkedin_posts", "jobstreet", "glints", "indeed"}
    if body.search_strategy not in {"round_robin", "priority_focus"}:
        raise HTTPException(status_code=400, detail="Strategi pencarian tidak valid")
    if len(body.platform_priority) != len(set(body.platform_priority)) or any(value not in allowed for value in body.platform_priority):
        raise HTTPException(status_code=400, detail="Prioritas platform tidak valid")
    db = get_db()
    try:
        db.execute("INSERT OR IGNORE INTO user_preferences(user_id) VALUES (?)", (user["id"],))
        db.execute(
            "UPDATE user_preferences SET search_strategy=?, platform_priority=?, sound_enabled=?, updated_at=datetime('now') WHERE user_id=?",
            (body.search_strategy, json.dumps(body.platform_priority), 1 if body.sound_enabled else 0, user["id"]),
        )
        db.commit()
        return body.model_dump()
    finally:
        db.close()
