import os
import re
import logging
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from pydantic import BaseModel, Field
from database import get_db, get_data_dir
from auth_utils import get_current_user

router = APIRouter()

# v42: Pakai get_data_dir() single source of truth dari database.py.
UPLOAD_DIR = os.path.join(get_data_dir(), "uploads", "cvs")
os.makedirs(UPLOAD_DIR, exist_ok=True)

def safe_filename(name: str) -> str:
    base = os.path.basename(name or "cv.pdf").strip() or "cv.pdf"
    base = re.sub(r"[\\/:*?\"<>|]+", "_", base)
    return base if base.lower().endswith(".pdf") else f"{base}.pdf"

def extract_pdf_text(file_path: str) -> str:
    """Extract text from PDF for Gemini context.

    Sebelumnya cuma pakai pdfplumber dan kalau gagal langsung `except: return ""`
    TANPA logging sama sekali — jadi kalau ekstraksi gagal untuk PDF tertentu
    (misal font/encoding yang tidak biasa, PDF hasil export dari aplikasi tertentu),
    tidak ada jejak error-nya sama sekali, cv_text di database jadi kosong padahal
    file PDF-nya valid & sudah ke-upload. User cuma lihat "CV tidak ditemukan" tanpa
    tahu itu masalah ekstraksi, dikira upload-nya gagal.

    Sekarang: coba pdfplumber dulu, kalau hasilnya kosong/gagal coba pypdf sebagai
    fallback (kadang satu library gagal tapi library lain berhasil untuk PDF yang
    sama), dan SEMUA kegagalan di-log supaya kelihatan di log backend.
    """
    text = ""
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception as e:
        logging.warning(f"[extract_pdf_text] pdfplumber gagal untuk {file_path}: {e}")

    if not text.strip():
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
            if text.strip():
                logging.info(f"[extract_pdf_text] pdfplumber kosong, berhasil pakai fallback pypdf: {file_path}")
        except Exception as e:
            logging.warning(f"[extract_pdf_text] fallback pypdf juga gagal untuk {file_path}: {e}")

    if not text.strip():
        logging.warning(
            f"[extract_pdf_text] Tidak ada teks yang berhasil diekstrak dari {file_path}. "
            "Kemungkinan PDF hasil scan/gambar tanpa lapisan teks (butuh OCR), "
            "atau file corrupt."
        )
    return text

def parse_cv_important_data(cv_text: str) -> dict:
    """Parse important data from CV text for 'memory' command."""
    if not cv_text:
        return {}
    
    low = cv_text.lower()
    data = {
        "education": [],
        "skills": [],
        "experience_years": 0,
        "positions": [],
        "languages": [],
        "certifications": [],
    }
    
    # Extract education
    edu_patterns = [
        r"(s2|magister|master|m\.sc|m\.t|mba)[^\n]{0,100}",
        r"(s1|sarjana|bachelor|b\.sc|b\.s|b\.eng|s\.t)[^\n]{0,100}",
        r"(d3|diploma|d-iii|a\.md)[^\n]{0,100}",
        r"(sma|smu|smk|senior high)[^\n]{0,100}",
    ]
    for pattern in edu_patterns:
        matches = re.findall(pattern, low)
        if matches:
            data["education"].extend(matches[:3])
    
    # Extract years of experience
    exp_match = re.search(r"(\d+)\+?\s*(?:tahun|years?)\s+(?:pengalaman|experience)", low)
    if exp_match:
        data["experience_years"] = int(exp_match.group(1))
    
    # Extract positions/job titles
    position_keywords = [
        r"((?:senior|junior|lead|principal|staff|specialist|manager|director|head|vp|chief)\s+(?:engineer|developer|analyst|designer|product|project|data|marketing|sales|hr|finance|operations|admin|support))",
        r"((?:software|frontend|backend|fullstack|mobile|devops|qa|tester|ui|ux|business|system|network|database)\s+(?:engineer|developer|architect|consultant))",
    ]
    for pattern in position_keywords:
        matches = re.findall(pattern, low)
        if matches:
            data["positions"].extend(list(set(matches))[:5])
    
    # Extract skills
    skill_keywords = [
        "python", "java", "javascript", "typescript", "react", "vue", "angular",
        "node", "django", "flask", "spring", "fastapi", "sql", "mongodb", "postgresql",
        "aws", "gcp", "azure", "docker", "kubernetes", "git", "agile", "scrum",
        "purchasing", "procurement", "sourcing", "buyer", "supply chain",
        "recruitment", "talent acquisition", "hris", "payroll",
        "financial analysis", "accounting", "tax", "audit",
        "sales", "business development", "key account", "crm",
        "marketing", "digital marketing", "seo", "sem", "content", "brand",
    ]
    for skill in skill_keywords:
        if skill in low:
            data["skills"].append(skill)
    data["skills"] = list(set(data["skills"]))[:15]
    
    # Extract languages
    lang_patterns = [
        r"(english|inggris)\s*(?:fluent|professional|proficient|intermediate|basic|native)?",
        r"(bahasa|indonesia|indonesian)\s*(?:fluent|professional|proficient|intermediate|basic|native)?",
    ]
    for pattern in lang_patterns:
        matches = re.findall(pattern, low)
        if matches:
            data["languages"].extend(matches[:3])
    
    return data

@router.post("/upload")
async def upload_cv(
    position_label: str = Form(...),
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    # Save with original filename under user folder so platform upload name matches PDF name.
    original_name = safe_filename(file.filename)
    user_dir = os.path.join(UPLOAD_DIR, str(user["id"]))
    os.makedirs(user_dir, exist_ok=True)
    file_path = os.path.join(user_dir, original_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Extract text - WAJIB, upload gagal jika teks tidak bisa diekstrak
    cv_text = extract_pdf_text(file_path)
    
    if not cv_text.strip():
        # Hapus file yang sudah ter-upload karena ekstraksi gagal
        try:
            os.remove(file_path)
        except FileNotFoundError:
            pass
        raise HTTPException(
            status_code=400, 
            detail="CV PDF tidak mengandung teks yang bisa dibaca. Kemungkinan PDF hasil scan/gambar tanpa lapisan teks. Silakan gunakan PDF dengan teks asli atau lakukan OCR terlebih dahulu."
        )
    
    # Parse important data for "memory" command
    cv_memory = parse_cv_important_data(cv_text)

    # Save to DB
    db = get_db()
    cur = db.execute(
        "INSERT INTO cvs (user_id, position_label, file_name, file_path, cv_text, cv_memory) VALUES (?, ?, ?, ?, ?, ?)",
        (user["id"], position_label, file.filename, file_path, cv_text, str(cv_memory))
    )
    db.commit()
    cv_id = cur.lastrowid
    db.close()

    return {
        "id": cv_id,
        "position_label": position_label,
        "file_name": file.filename,
        "file_url": f"/uploads/cvs/{user['id']}/{original_name}",
        "has_text": bool(cv_text),
        "cv_memory": cv_memory
    }

@router.get("/")
def list_cvs(user=Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        "SELECT id, position_label, file_name, file_path, cv_text, cv_memory, created_at FROM cvs WHERE user_id = ? ORDER BY created_at DESC",
        (user["id"],)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]

@router.delete("/{cv_id}")
def delete_cv(cv_id: int, user=Depends(get_current_user)):
    db = get_db()
    row = db.execute("SELECT * FROM cvs WHERE id = ? AND user_id = ?", (cv_id, user["id"])).fetchone()
    if not row:
        db.close()
        raise HTTPException(status_code=404, detail="CV not found")

    # Delete file from disk
    try:
        os.remove(row["file_path"])
    except FileNotFoundError:
        pass

    db.execute("DELETE FROM job_targets WHERE cv_id = ? AND user_id = ?", (cv_id, user["id"]))
    db.execute("DELETE FROM cvs WHERE id = ?", (cv_id,))
    db.commit()
    db.close()
    return {"message": "CV deleted"}


class CoverLetterTemplateRequest(BaseModel):
    positions: list[str] = Field(default_factory=list)


def normalize_target_positions(values: list[str], fallback: str = "") -> list[str]:
    positions = []
    source_values = values if any((value or "").strip() for value in values) else [fallback]
    for value in source_values:
        for part in re.split(r"[,/;|]+|\sdan\s|\sand\s|\satau\s|\sor\s", value or "", flags=re.I):
            clean = part.strip()[:100]
            if clean and clean.casefold() not in {item.casefold() for item in positions}:
                positions.append(clean)
            if len(positions) == 10:
                return positions
    return positions


def build_cover_letter_template_prompt(cv_text: str, positions: list[str], language: str) -> str:
    target_positions = ", ".join(positions) or "Target role from the CV"
    output_language = "Bahasa Indonesia" if language == "id" else "English"
    return f"""Create one reusable cover-letter template from the candidate CV.

OUTPUT LANGUAGE: {output_language}
TARGET POSITIONS SELECTED BY USER: {target_positions}

REQUIREMENTS:
1. Tailor the content to the candidate's real experience and the selected target positions.
2. Use only facts explicitly present in the CV. Never invent skills, experience, achievements, education, certifications, contact details, or personal data.
3. Use the exact placeholders {{company}} and {{position}}. They must both appear naturally in the letter because ORDAL replaces them for each vacancy.
4. Do not write a specific company name or replace {{position}} with one target-position name.
5. Use no other placeholders. Include identity and contact details only when present in the CV; otherwise omit them.
6. Write 4 to 5 short paragraphs, maximum 250 words, with a professional but natural tone.
7. Return only the finished cover-letter body. No title, notes, markdown fences, or explanation.

CANDIDATE CV:
{cv_text[:6000]}
"""


def normalize_cover_letter_placeholders(template: str) -> str:
    normalized = re.sub(r"\{\s*(perusahaan|nama perusahaan|company name)\s*\}", "{company}", template, flags=re.I)
    return re.sub(r"\{\s*(posisi|nama posisi|job title|position name)\s*\}", "{position}", normalized, flags=re.I)


@router.post("/{cv_id}/generate-cover-letter-template")
async def generate_cover_letter_template_from_cv(
    cv_id: int,
    body: CoverLetterTemplateRequest | None = None,
    user=Depends(get_current_user),
):
    db = get_db()
    row = db.execute(
        "SELECT id, position_label, cv_text FROM cvs WHERE id = ? AND user_id = ?",
        (cv_id, user["id"]),
    ).fetchone()
    db.close()

    if not row:
        raise HTTPException(status_code=404, detail="CV tidak ditemukan")

    cv_text = row["cv_text"] or ""
    if len(cv_text.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="CV tidak punya teks yang cukup untuk generate cover letter. "
                   "Pastikan CV PDF punya lapisan teks (bukan hasil scan).",
        )

    positions = normalize_target_positions(body.positions if body else [], row["position_label"] or "")
    cv_lower = cv_text.lower()
    indo_markers = ["pengalaman", "pendidikan", "keahlian", "lulusan", "sarjana",
                    "bekerja", "perusahaan", "posisi", "tanggung jawab",
                    "saya", "berpengalaman", "domisili", "umur"]
    indo_count = sum(1 for m in indo_markers if m in cv_lower)
    language = "id" if indo_count >= 2 else "en"
    prompt = build_cover_letter_template_prompt(cv_text, positions, language)

    try:
        from workers.ai_service import chat_raw
        template = await chat_raw(
            user["id"],
            prompt,
            system_prompt=(
                "You write accurate cover letters grounded only in supplied CV facts. "
                "Follow placeholder and output-format requirements exactly."
            ),
            max_tokens=1000,
            temperature=0.4,
        )
    except Exception as e:
        logging.error(f"[generate_cover_letter_template] AI call failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Gagal generate cover letter via AI: {str(e)[:200]}",
        )

    template = normalize_cover_letter_placeholders((template or "").strip())
    if not template:
        raise HTTPException(
            status_code=502,
            detail="AI tidak mengembalikan template. Coba lagi atau set API key AI di halaman AI.",
        )
    if "{company}" not in template or "{position}" not in template:
        raise HTTPException(
            status_code=502,
            detail="AI belum mengikuti format placeholder {company} dan {position}. Coba buat ulang.",
        )

    return {
        "ok": True,
        "template": template,
        "language": language,
        "cv_id": cv_id,
        "positions": positions,
    }
