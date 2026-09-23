import os
import re
import logging
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
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


# ── Generate Cover Letter Template dari CV via AI ──────────────────────────
# Endpoint untuk generate template cover letter yang pakai placeholder
# {perusahaan} dan {posisi}. Template ini disimpan di target.cover_letter
# dan otomatis di-render saat apply ke lowongan spesifik.
#
# Bahasa mengikuti CV: kalau CV bahasa Indonesia, cover letter juga Indonesia.
# Kalau CV bahasa Inggris, cover letter English. AI detect dari teks CV.
@router.post("/{cv_id}/generate-cover-letter-template")
async def generate_cover_letter_template_from_cv(cv_id: int, user=Depends(get_current_user)):
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

    position_label = row["position_label"] or ""

    # ── Detect bahasa CV (Indonesia vs English) ──
    # Heuristic sederhana: kalau ada kata umum Indonesia, anggap Indonesia.
    cv_lower = cv_text.lower()
    indo_markers = ["pengalaman", "pendidikan", "keahlian", "lulusan", "sarjana",
                    "bekerja", "perusahaan", "posisi", "tanggung jawab",
                    "saya", "berpengalaman", "domisili", "umur"]
    indo_count = sum(1 for m in indo_markers if m in cv_lower)
    is_indonesian = indo_count >= 2  # threshold rendah supaya robust

    # ── Build prompt untuk AI ──
    # Penting:
    # - Output HARUS pakai placeholder {perusahaan} dan {posisi} — BUKAN nama
    #   perusahaan/posisi spesifik. Template ini dipakai untuk SEMUA lowongan
    #   yang cocok dengan target posisi user.
    # - Bahasa output mengikuti bahasa CV (Indonesia kalau CV Indonesia).
    # - Maks 200 kata, 3 paragraf.
    # - JANGAN pakai placeholder seperti [Nama Anda] — AI harus tulis langsung
    #   body content. Nama user akan di-append dari CV (kalau terbaca) atau
    #   dibiarkan kosong supaya user isi manual.

    if is_indonesian:
        prompt = f"""
Anda adalah career coach profesional. Tulis TEMPLATE cover letter (surat lamaran) dalam BAHASA INDONESIA berdasarkan profil kandidat dari CV di bawah.

PENTING:
1. Gunakan placeholder {{company}} dan {{position}} — JANGAN tulis nama perusahaan/posisi spesifik. Template ini akan dipakai untuk banyak lowongan.
2. Bahasa: INDONESIA (karena CV dalam Bahasa Indonesia).
3. Struktur: 4-5 paragraf singkat (maks 250 kata total):
   - Paragraf 1: Sapaan + perkenalan diri + minat pada posisi {position_label}
   - Paragraf 2: Pengalaman & keahlian utama dari CV (sebutkan secara spesifik)
   - Paragraf 3: Pengalaman tambahan/diverse yang relevan
   - Paragraf 4: Penutup + ajakan interview
   - Tanda tangan: nama, lokasi, phone, email, LinkedIn, portfolio (extract dari CV)
4. JANGAN pakai placeholder seperti [Nama Anda] — extract nama dari CV.
5. JANGAN pakai placeholder selain {{company}} dan {{position}}.
6. Extract informasi kontak dari CV (nama, lokasi, phone, email, LinkedIn, portfolio) dan sertakan di akhir.
7. Tone: profesional tapi natural, tidak kaku.

Contoh format yang diinginkan:

Dear Hiring Manager / HR Team at {{company}},

Saya menulis untuk menyampaikan ketertarikan saya pada posisi {{position}} di {{company}}.

Saya adalah profesional [sebutkan dari CV] dengan pengalaman [sebutkan dari CV]...

[Paragraf 2 - pengalaman relevan dari CV]

[Paragraf 3 - pengalaman tambahan]

Saya telah melampirkan Resume untuk pertimbangan Anda. Saya menyambut kesempatan untuk mendiskusikan bagaimana keahlian saya dapat memberikan kontribusi bagi tim di {{company}}.

Terima kasih atas waktu dan pertimbangan Anda.

Hormat saya,

[Nama dari CV]
[Lokasi dari CV]
Phone: [phone dari CV]
Email: [email dari CV]
LinkedIn: [LinkedIn dari CV]
Portfolio: [portfolio dari CV jika ada]

CV Kandidat:
{cv_text[:3000]}

Tulis template cover letter sekarang (hanya body, tanpa penjelasan tambaran):
"""
    else:
        prompt = f"""
You are a professional career coach. Write a cover letter TEMPLATE in ENGLISH based on the candidate's CV profile below.

IMPORTANT:
1. Use placeholders {{company}} and {{position}} — do NOT write specific company/position names. This template will be used for multiple job applications.
2. Language: ENGLISH (since the CV is in English).
3. Structure: 4-5 short paragraphs (max 250 words total):
   - Paragraph 1: Greeting + self-introduction + interest in the {position_label} position
   - Paragraph 2: Main experience & skills from CV (be specific)
   - Paragraph 3: Additional/diverse experience that's relevant
   - Paragraph 4: Closing + call to interview
   - Signature: name, location, phone, email, LinkedIn, portfolio (extract from CV)
4. Do NOT use placeholders like [Your Name] — extract the name from the CV.
5. Do NOT use any placeholders other than {{company}} and {{position}}.
6. Extract contact information from the CV (name, location, phone, email, LinkedIn, portfolio) and include at the end.
7. Tone: professional but natural, not stiff.

Example format:

Dear Hiring Manager / HR Team at {{company}},

My name is [Name from CV], and I am writing to express my enthusiastic interest in the {{position}} position at {{company}}.

I am a [qualifications from CV] with hands-on experience in [experience from CV]...

[Paragraph 2 - relevant experience from CV]

[Paragraph 3 - additional experience]

I have attached my Resume for your consideration. I would welcome the opportunity to discuss how my skills and background can add value to the team at {{company}}.

Thank you for your time and consideration. I look forward to hearing from you.

Best regards,

[Name from CV]
[Location from CV]
Phone: [phone from CV]
Email: [email from CV]
LinkedIn: [LinkedIn URL from CV]
Portfolio: [portfolio URL from CV if any]

Candidate CV:
{cv_text[:3000]}

Write the cover letter template now (body only, no additional explanation):
"""

    # ── Call AI service ──
    try:
        from workers.gemini_service import answer_question
        template = await answer_question(
            user_id=user["id"],
            question=prompt,
            field_type="textarea",
            cv_text=cv_text,
            job_title=position_label,
        )
    except Exception as e:
        logging.error(f"[generate_cover_letter_template] AI call failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Gagal generate cover letter via AI: {str(e)[:200]}",
        )

    template = (template or "").strip()
    if not template:
        raise HTTPException(
            status_code=500,
            detail="AI tidak mengembalikan template. Coba lagi atau set API key AI di halaman AI.",
        )

    # ── Validasi: pastikan kedua placeholder ada ──
    # v18: support {company}/{position} (English) DAN {perusahaan}/{posisi} (Indonesia).
    # AI kadang hanya mengembalikan salah satu placeholder; template tetap terlihat
    # berhasil, tetapi posisi/perusahaan tidak pernah terisi saat apply.
    has_company = any(token in template for token in ("{company}", "{perusahaan}"))
    has_position = any(token in template for token in ("{position}", "{posisi}"))
    if not has_company:
        template = template.replace("di perusahaan", "di {company}")
        template = template.replace("at the company", "at {company}")
        has_company = any(token in template for token in ("{company}", "{perusahaan}"))
    if not has_position:
        if has_company:
            template = template.replace("posisi ini", "posisi {position}")
            template = template.replace("this position", "the {position} position")
        if not any(token in template for token in ("{position}", "{posisi}")):
            template += "\n\nSaya tertarik melamar posisi {position} di {company}."
    if not has_company:
        template += "\n\nSaya tertarik bergabung dengan {company}."


    return {
        "ok": True,
        "template": template,
        "language": "id" if is_indonesian else "en",
        "cv_id": cv_id,
        "position_label": position_label,
    }
