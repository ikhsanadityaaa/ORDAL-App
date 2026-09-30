import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user
from database import get_db
from workers.answer_helper import normalize_question
from workers.session_manager import session_manager

router = APIRouter()
VALID_FIELD_TYPES = {"", "text", "textarea", "number", "yes_no", "checkbox", "dropdown", "select", "choice", "radio"}


def _question_options(question: str) -> list[str]:
    match = re.search(r"options?\s*:\s*([\s\S]+)$", question or "", re.I)
    if not match:
        return []
    return [item.strip() for item in re.split(r"[;,]\s*|\n+", match.group(1)) if item.strip()]


def _validate_typed_answer(question: str, answer: str, field_type: str) -> None:
    normalized_type = (field_type or "").strip().lower()
    if normalized_type not in VALID_FIELD_TYPES:
        raise HTTPException(status_code=400, detail="Tipe jawaban tidak dikenal")
    options = _question_options(question)
    if options and not any(answer.casefold() == option.casefold() for option in options):
        raise HTTPException(status_code=400, detail="Jawaban harus dipilih dari opsi dropdown")
    if normalized_type == "number" and not re.fullmatch(r"-?\d+(?:[.,]\d+)?", answer):
        raise HTTPException(status_code=400, detail="Jawaban untuk field number harus berupa angka")
    if normalized_type in {"yes_no", "checkbox"} and answer.casefold() not in {"yes", "no", "ya", "tidak"}:
        raise HTTPException(status_code=400, detail="Jawaban harus Yes atau No")


class QuestionUpdate(BaseModel):
    question: str
    answer: str
    platform: str = ""
    field_type: str = ""


class PromptAnswer(BaseModel):
    answer: str


@router.get("/")
def list_questions(user=Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        """
        SELECT id, platform, question, answer, field_type, source, use_count, created_at, updated_at
        FROM question_bank
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC
        """,
        (user["id"],),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/")
def create_question(body: QuestionUpdate, user=Depends(get_current_user)):
    question = (body.question or "").strip()
    answer = (body.answer or "").strip()
    platform = (body.platform or "").strip()
    if not question or not answer:
        raise HTTPException(status_code=400, detail="Pertanyaan dan jawaban wajib diisi")
    _validate_typed_answer(question, answer, body.field_type)
    normalized = normalize_question(question)
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO question_bank (user_id, platform, question, normalized, answer, field_type, source)
        VALUES (?, ?, ?, ?, ?, ?, 'manual')
        ON CONFLICT(user_id, platform, normalized) DO UPDATE SET
            question = excluded.question,
            answer = excluded.answer,
            field_type = excluded.field_type,
            source = 'manual',
            updated_at = datetime('now')
        """,
        (user["id"], platform, question, normalized, answer, body.field_type or ""),
    )
    db.commit()
    row_id = cur.lastrowid or db.execute(
        "SELECT id FROM question_bank WHERE user_id=? AND platform=? AND normalized=?",
        (user["id"], platform, normalized),
    ).fetchone()["id"]
    db.close()
    return {"id": row_id, "question": question, "answer": answer, "platform": platform}


@router.post("/prompts/{prompt_id}/answer")
async def answer_prompt(prompt_id: str, body: PromptAnswer, user=Depends(get_current_user)):
    answer = (body.answer or "").strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Jawaban wajib diisi")
    ok = await session_manager.answer_question_prompt(user["id"], prompt_id, answer)
    if not ok:
        raise HTTPException(status_code=404, detail="Pertanyaan sudah tidak aktif")
    return {"message": "Jawaban diterima"}


@router.put("/{question_id}")
def update_question(question_id: int, body: QuestionUpdate, user=Depends(get_current_user)):
    answer = (body.answer or "").strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Jawaban wajib diisi")
    db = get_db()
    row = db.execute(
        "SELECT id, question, platform FROM question_bank WHERE id = ? AND user_id = ?",
        (question_id, user["id"]),
    ).fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="Pertanyaan tidak ditemukan")
    _validate_typed_answer(body.question or row["question"], answer, body.field_type)
    db.execute(
        """
        UPDATE question_bank
        SET answer=?, source='manual', updated_at=datetime('now')
        WHERE id=? AND user_id=?
        """,
        (answer, question_id, user["id"]),
    )
    db.commit()
    db.close()
    return {"id": question_id, "question": row["question"], "answer": answer, "platform": row["platform"]}


@router.delete("/{question_id}")
def delete_question(question_id: int, user=Depends(get_current_user)):
    db = get_db()
    cur = db.execute("DELETE FROM question_bank WHERE id = ? AND user_id = ?", (question_id, user["id"]))
    db.commit()
    db.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Pertanyaan tidak ditemukan")
    return {"message": "Pertanyaan dihapus"}
