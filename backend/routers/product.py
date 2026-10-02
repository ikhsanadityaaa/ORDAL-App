from __future__ import annotations

import platform
import sys

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_utils import get_app_version, get_current_user, get_token_for_user
from database import get_db
from ordal_api import request
from workers.career_progress import build_career_progress


router = APIRouter()
FEEDBACK_CATEGORIES = {"bug", "suggestion", "automation", "account", "payment", "other"}


class FeedbackCreate(BaseModel):
    category: str
    message: str = Field(min_length=1, max_length=4000)
    include_diagnostics: bool = False


@router.post("/feedback")
def send_feedback(body: FeedbackCreate, user=Depends(get_current_user)):
    if body.category not in FEEDBACK_CATEGORIES:
        raise HTTPException(status_code=400, detail="Kategori feedback tidak valid")
    diagnostics = None
    if body.include_diagnostics:
        diagnostics = {
            "app_version": get_app_version(),
            "os": f"{platform.system()} {platform.release()}",
            "python": platform.python_version(),
            "architecture": platform.machine(),
        }
    return request(
        "POST",
        "/feedback",
        token=get_token_for_user(user["id"]),
        json={
            "category": body.category,
            "message": body.message.strip(),
            "diagnostics": diagnostics,
        },
    )


@router.get("/updates/latest")
def latest_update(user=Depends(get_current_user)):
    return request("GET", f"/releases/latest?platform={sys.platform}&current={get_app_version()}", token=get_token_for_user(user["id"]))


@router.get("/career-progress")
def career_progress(user=Depends(get_current_user)):
    db = get_db()
    try:
        return build_career_progress(db, user["id"])
    finally:
        db.close()
