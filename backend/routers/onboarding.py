"""ORDAL v3 — Onboarding router.

Wizard onboarding interaktif (muncul setelah login + verifikasi email):
  Langkah 1: Upload CV
  Langkah 2: Preferensi kerja (posisi, lokasi, gaji, join, tipe, exclude opsional)
  Langkah 3: Cover letter (dengan contoh {company}/{position})
  Langkah 4: Pilih job platform (jobstreet / linkedin jobs / linkedin posts)
  Langkah 5: (otomatis kalau pilih linkedin_posts) hubungkan email SMTP
  Langkah 6: Login job platform (jobstreet/linkedin — wajib minimal satu)

Semua progress tersimpan di tabel app_onboarding (DB pusat) → bisa
dilanjutkan di device lain / setelah app update.
"""
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_db, query_one, query_all
from auth_utils import get_current_user

router = APIRouter()

VALID_PLATFORMS = {"jobstreet", "linkedin_jobs", "linkedin_posts"}


def _get_or_create_row(db, user_id: str) -> dict:
    row = query_one("SELECT * FROM app_onboarding WHERE user_id = ?", (user_id,))
    if not row:
        db.execute(
            "INSERT INTO app_onboarding (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING",
            (user_id,),
        )
        db.commit()
        row = query_one("SELECT * FROM app_onboarding WHERE user_id = ?", (user_id,))
    return row


def _platform_login_status(user_id: str) -> dict:
    """Status login job platform (cookies ter-capture)."""
    rows = query_all(
        "SELECT platform FROM user_credentials WHERE user_id = ?",
        (user_id,),
    )
    linkedin = any(r["platform"] == "linkedin" for r in rows)
    jobstreet = any(r["platform"] == "jobstreet" for r in rows)
    return {"linkedin": linkedin, "jobstreet": jobstreet}


def _email_connected(user_id: str) -> bool:
    row = query_one(
        "SELECT id FROM email_configs WHERE user_id = ? AND sender_email != '' LIMIT 1",
        (user_id,),
    )
    return row is not None


def _parse_prefs(raw) -> dict:
    try:
        data = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:
        data = {}
    defaults = {
        "positions": [],
        "locations": [],
        "expected_salary": "",
        "available_join": "",
        "employment_type": "full_time",
        "excluded_positions": [],
        "excluded_companies": [],
    }
    defaults.update({k: v for k, v in data.items() if k in defaults})
    return defaults


class OnboardingSaveRequest(BaseModel):
    step: int
    cv_id: int | None = None
    preferences: dict | None = None
    cover_letter: str | None = None
    platforms: list[str] | None = None


@router.get("/status")
def get_status(user=Depends(get_current_user)):
    db = get_db()
    try:
        row = _get_or_create_row(db, user["id"])
    finally:
        db.close()

    prefs = _parse_prefs(row.get("preferences"))
    cvs = query_all(
        "SELECT id, position_label, file_name, created_at FROM cvs WHERE user_id = ? ORDER BY id DESC",
        (user["id"],),
    )
    for cv in cvs:
        if isinstance(cv.get("created_at"), object) and hasattr(cv["created_at"], "isoformat"):
            cv["created_at"] = cv["created_at"].isoformat()

    platforms = [p for p in (row.get("platforms") or "").split(",") if p]

    return {
        "completed": bool(row.get("completed")),
        "current_step": int(row.get("current_step") or 1),
        "cv_id": row.get("cv_id"),
        "cvs": cvs,
        "preferences": prefs,
        "cover_letter": row.get("cover_letter") or "",
        "platforms": platforms,
        "platform_logins": _platform_login_status(user["id"]),
        "email_connected": _email_connected(user["id"]),
    }


@router.post("/save")
def save_progress(req: OnboardingSaveRequest, user=Depends(get_current_user)):
    db = get_db()
    try:
        row = _get_or_create_row(db, user["id"])

        cv_id = row.get("cv_id")
        if req.cv_id is not None:
            # pastikan CV milik user ini
            owned = query_one("SELECT id FROM cvs WHERE id = ? AND user_id = ?", (req.cv_id, user["id"]))
            if not owned:
                raise HTTPException(status_code=400, detail="CV tidak ditemukan")
            cv_id = req.cv_id

        prefs = _parse_prefs(row.get("preferences"))
        if req.preferences is not None:
            incoming = {k: v for k, v in req.preferences.items()
                        if k in ("positions", "locations", "expected_salary", "available_join",
                                 "employment_type", "excluded_positions", "excluded_companies")}
            prefs.update(incoming)

        cover_letter = row.get("cover_letter") or ""
        if req.cover_letter is not None:
            cover_letter = req.cover_letter

        platforms_csv = row.get("platforms") or ""
        if req.platforms is not None:
            bad = [p for p in req.platforms if p not in VALID_PLATFORMS]
            if bad:
                raise HTTPException(status_code=400, detail=f"Platform tidak dikenal: {bad}")
            platforms_csv = ",".join(req.platforms)

        db.execute(
            """UPDATE app_onboarding
               SET current_step = ?, cv_id = ?, preferences = ?, cover_letter = ?, platforms = ?, updated_at = NOW()
               WHERE user_id = ?""",
            (int(req.step), cv_id, json.dumps(prefs), cover_letter, platforms_csv, user["id"]),
        )
        db.commit()
        return {"ok": True, "current_step": int(req.step)}
    finally:
        db.close()


@router.post("/complete")
def complete_onboarding(user=Depends(get_current_user)):
    db = get_db()
    try:
        row = _get_or_create_row(db, user["id"])
        if row.get("completed"):
            return {"ok": True, "already_completed": True}

        prefs = _parse_prefs(row.get("preferences"))
        platforms = [p for p in (row.get("platforms") or "").split(",") if p]
        cv_id = row.get("cv_id")
        cover_letter = row.get("cover_letter") or ""

        # ── Validasi kelengkapan ──
        if not cv_id:
            raise HTTPException(status_code=400, detail="Upload CV dulu sebelum menyelesaikan onboarding")
        cv = query_one("SELECT id FROM cvs WHERE id = ? AND user_id = ?", (cv_id, user["id"]))
        if not cv:
            raise HTTPException(status_code=400, detail="CV tidak ditemukan — upload ulang")
        if not prefs.get("positions"):
            raise HTTPException(status_code=400, detail="Pilih minimal satu posisi yang diincar")
        if not prefs.get("locations"):
            raise HTTPException(status_code=400, detail="Pilih minimal satu lokasi kerja")
        if not platforms:
            raise HTTPException(status_code=400, detail="Pilih minimal satu job platform")
        if not cover_letter.strip():
            raise HTTPException(status_code=400, detail="Cover letter belum diisi")
        logins = _platform_login_status(user["id"])
        if not (logins["linkedin"] or logins["jobstreet"]):
            raise HTTPException(
                status_code=400,
                detail="Login minimal satu job platform (JobStreet atau LinkedIn) dulu",
            )

        # ── Buat job targets (posisi × lokasi × platform) ──
        platform_token_map = {"jobstreet": "jobstreet", "linkedin_jobs": "linkedin", "linkedin_posts": "linkedin_posts"}
        excluded_positions = ",".join(prefs.get("excluded_positions") or [])
        excluded_companies = ",".join(prefs.get("excluded_companies") or [])
        existing_targets = query_all("SELECT position, location, platform FROM job_targets WHERE user_id = ?", (user["id"],))
        existing_set = {(t["position"].lower(), t["location"].lower(), t["platform"]) for t in existing_targets}

        created = 0
        for position in prefs["positions"]:
            for location in prefs["locations"]:
                for platform in platforms:
                    token = platform_token_map[platform]
                    key = (position.strip().lower(), location.strip().lower(), token)
                    if key in existing_set:
                        continue
                    db.execute(
                        """INSERT INTO job_targets
                           (user_id, cv_id, position, location, platform, employment_type,
                            expected_salary, available_join, excluded_positions, excluded_companies, cover_letter, active)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
                        (user["id"], cv_id, position.strip(), location.strip(), token,
                         prefs.get("employment_type") or "full_time",
                         prefs.get("expected_salary") or "",
                         prefs.get("available_join") or "",
                         excluded_positions, excluded_companies, cover_letter),
                    )
                    created += 1

        # ── Simpan preferensi umum ──
        db.execute(
            """INSERT INTO user_preferences (user_id, expected_salary, available_join, updated_at)
               VALUES (?, ?, ?, NOW())
               ON CONFLICT (user_id) DO UPDATE SET
                 expected_salary = excluded.expected_salary,
                 available_join = excluded.available_join,
                 updated_at = NOW()""",
            (user["id"], prefs.get("expected_salary") or "", prefs.get("available_join") or ""),
        )

        # ── Tandai selesai ──
        db.execute(
            "UPDATE app_onboarding SET completed = TRUE, completed_at = NOW(), current_step = 7, updated_at = NOW() WHERE user_id = ?",
            (user["id"],),
        )
        db.execute(
            "INSERT INTO app_user_profile (user_id, onboarding_completed) VALUES (?, TRUE) "
            "ON CONFLICT (user_id) DO UPDATE SET onboarding_completed = TRUE, updated_at = NOW()",
            (user["id"],),
        )
        db.commit()
        return {"ok": True, "targets_created": created}
    finally:
        db.close()
