import re
import asyncio
import html
import logging
from datetime import datetime
from difflib import SequenceMatcher

from database import get_db
from workers.gemini_service import answer_question


# ── Auto-apply mode state ──────────────────────────────────────────────
# Saat session berjalan dalam mode 'auto' (dari scheduler), kita skip
# blocking ask_user_question dan langsung pakai Gemini. Setelah Gemini
# menjawab, kirim notifikasi ke Telegram supaya user bisa edit nanti.
# Key: user_id -> {"main_loop": AbstractEventLoop, "chat_id": str}
_auto_mode_state: dict[int, dict] = {}


def set_auto_mode(user_id: int, main_loop=None, chat_id: str | None = None):
    """Aktifkan/nonaktifkan auto-apply mode untuk user tertentu."""
    if main_loop is not None and chat_id:
        _auto_mode_state[user_id] = {"main_loop": main_loop, "chat_id": chat_id}
    else:
        _auto_mode_state.pop(user_id, None)


def is_auto_mode(user_id: int) -> bool:
    return user_id in _auto_mode_state


def _notify_ai_answer(user_id: int, platform: str, question: str, answer: str):
    """Kirim notifikasi Telegram bahwa AI sudah menjawab pertanyaan baru."""
    state = _auto_mode_state.get(user_id)
    if not state:
        return
    main_loop = state.get("main_loop")
    chat_id = state.get("chat_id")
    if not main_loop or not chat_id:
        return
    try:
        from services.telegram_service import send_telegram_message
        msg = (
            "<b>🤖 AI menjawab pertanyaan baru</b>\n"
            f"Platform: <b>{html.escape(platform)}</b>\n"
            f"Pertanyaan: {html.escape(question[:280])}\n"
            f"Jawaban AI: <i>{html.escape(answer[:280])}</i>\n\n"
            "Jawaban ini sudah tersimpan & dipakai. "
            "Kirim /questions untuk lihat atau edit."
        )
        asyncio.run_coroutine_threadsafe(
            send_telegram_message(chat_id, msg), main_loop
        )
    except Exception:
        pass


def normalize_question(question: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]+", " ", (question or "").lower())).strip()


def _looks_like_salary(question: str) -> bool:
    q = normalize_question(question)
    return any(k in q for k in (
        "salary", "gaji", "compensation", "pay", "take home", "takehome",
        "remuneration", "expected monthly", "monthly base",
    ))

def _looks_like_expected_salary(question: str) -> bool:
    q = normalize_question(question)
    return _looks_like_salary(question) and any(k in q for k in (
        "expected", "expectation", "ekspektasi", "harapan", "desired", "target", "expected pay", "expected monthly",
        "salary expectation", "expected salary", "gaji yang diharapkan", "gaji harapan",
    ))

def _looks_like_current_salary(question: str) -> bool:
    q = normalize_question(question)
    return _looks_like_salary(question) and any(k in q for k in (
        "current", "present", "actual", "last", "previous", "saat ini", "sekarang", "terakhir",
        "current salary", "gaji sekarang", "gaji saat ini", "gaji terakhir",
    ))


def _looks_like_join_date(question: str) -> bool:
    q = normalize_question(question)
    return any(k in q for k in (
        "join", "available", "availability", "notice period",
        "mulai kerja", "bergabung", "bisa mulai", "kapan bisa",
        "kapan mulai", "kapan bergabung", "bisa bergabung",
        "start date", "earliest start", "earliest available",
        "when can you start", "when can you join",
        "starting date", "notice", "mulai bekerja",
        "tanggal mulai", "tanggal bergabung",
        "segera mulai", "ready to join", "siap bergabung",
    ))

def _numeric_answer(question: str, answer: str) -> str:
    q = normalize_question(question)
    raw = (answer or "").strip().lower()
    if not raw:
        return ""
    if _looks_like_join_date(question) and any(k in q for k in ("day", "days", "calendar", "hari", "decimal", "larger than")):
        if "immediate" in raw or "segera" in raw:
            return "1"
        match = re.search(r"\d+(?:[.,]\d+)?", raw)
        if match:
            value = float(match.group(0).replace(",", "."))
            if any(k in raw for k in ("month", "bulan")):
                value *= 30
            elif any(k in raw for k in ("week", "minggu")):
                value *= 7
            return str(max(1, int(round(value))))
        return "30"
    match = re.search(r"\d+(?:[.,]\d+)?", raw.replace(".", ""))
    return match.group(0).replace(",", ".") if match else raw

def _looks_like_resume_field(question: str) -> bool:
    q = normalize_question(question)
    if q in ("cv", "resume", "curriculum vitae", "riwayat hidup"):
        return True
    return any(k in q for k in (
        "silakan pilih resume", "pilih resume", "select resume", "choose resume",
        "pilih cv", "select cv", "choose cv", "curriculum vitae", "riwayat hidup",
        "upload resume", "unggah cv",
    ))

def _looks_like_experience_years(question: str) -> bool:
    q = normalize_question(question)
    return any(k in q for k in ("experience", "pengalaman", "work experience", "years"))


# ── Domain detection dari CV (generalisasi, bukan hardcoded purchasing) ──────
# Setiap domain punya set keyword posisi/skill. Kalau CV menyebut salah satu,
# kita anggap user punya pengalaman di domain itu. Ini dipakai untuk:
# 1. Estimasi tahun pengalaman relevan (bukan cuma purchasing)
# 2. Deteksi pertanyaan tidak relevan (mis. "supply chain experience" untuk
#    user HR → auto-answer "None" / "0" tanpa prompt manual)
DOMAIN_KEYWORDS = {
    "purchasing": (
        "purchasing", "purchase", "procurement", "procure", "buyer", "buying",
        "sourcing", "pengadaan", "pembelian", "supply chain", "scm", "vendor",
        "supplier", "material", "ppic", "planning",
    ),
    "hr": (
        "hr", "human resources", "recruitment", "recruiter", "recruiting",
        "talent acquisition", "talent", "people operations", "peopleops",
        "general affair", "general affairs", "ga", "hrga", "hrd", "hrbp",
        "personalia", "kepegawaian", "training", "trainer", "learning",
        "development", "onboarding", "compensation", "benefit", "payroll",
        "culture", "organizational",
    ),
    "it": (
        "software", "developer", "programmer", "frontend", "backend",
        "fullstack", "mobile", "android", "ios", "web", "data", "database",
        "sql", "python", "java", "javascript", "devops", "cloud", "network",
        "security", "system", "qa", "tester", "machine learning", "ai",
        "analytics", "bi", "etl", "it", "infrastructure",
    ),
    "finance": (
        "finance", "financial", "accounting", "accountant", "tax", "audit",
        "auditor", "treasury", "ar", "ap", "billing", "payroll", "bookkeeping",
        "controller", "budget", "costing", "collection",
    ),
    "sales": (
        "sales", "selling", "seller", "account", "key account", "kam",
        "business development", "bd", "commercial", "revenue", "partnership",
        "merchant", "retail", "telesales", "telemarketing",
    ),
    "marketing": (
        "marketing", "marketer", "digital marketing", "seo", "sem", "content",
        "brand", "branding", "social media", "campaign", "crm", "growth",
        "performance", "creative", "copywriter", "community",
    ),
    "operations": (
        "operation", "operations", "operational", "logistic", "logistics",
        "warehouse", "gudang", "inventory", "stock", "fulfillment", "delivery",
        "transport", "distribution", "planner", "fleet", "export", "import",
        "exim",
    ),
    "admin": (
        "admin", "administrator", "administration", "administrasi",
        "secretary", "sekretaris", "clerical", "office", "document",
        "documentation", "data entry", "filing", "arsip", "arsiparis",
        "back office", "back-office", "front office", "front-office",
        "office support", "office staff", "office administration",
        "staf administrasi", "staff administrasi", "administrative staff",
        "general administrative", "general admin",
        # Roles yang sehari-hari melakukan pekerjaan administratif:
        # customer relation, customer relations, customer service
        # (input data, follow-up, koordinasi internal), clearing / kliring
        # (re Konsil, validasi dokumen, rekonsiliasi), staf dalam negeri
        # (urusan administrasi kependudukan, surat-menyurat).
        "customer relation", "customer relations", "customer relationship",
        "clearing", "kliring", "reconciliation", "rekonsiliasi",
        "dalam negeri", "internal affairs", "domestic",
        "verifikasi dokumen", "dokumen", "verifikator", "verifikation",
        "koordinasi", "koordinator", "coordination", "coordinator",
        "operator", "entry", "input data", "inputting",
        "support staff", "supporting staff", "office boy", "office girl",
    ),
    "customer_service": (
        "customer service", "customer support", "cs", "customer care",
        "call center", "contact center", "helpdesk", "customer experience",
        "customer relations",
    ),
    "engineering_manufacturing": (
        "manufacturing", "production", "maintenance", "mechanical",
        "electrical", "industrial", "technician", "technical", "operator",
        "process", "factory", "plant", "quality control", "qc", "qa",
        "hse", "safety", "civil", "mep",
    ),
}


def _detect_user_domains(cv_text: str) -> set[str]:
    """Deteksi domain keahlian user dari CV text. Return set of domain keys.

    v39: Pakai word-boundary regex (\\bkw\\b) bukan substring check.
    Sebelumnya, keyword pendek seperti "ar", "ap", "hr", "it", "ga" cocok
    sebagai substring di kata lain ("March", "April", "Jakarta", "target")
    → false positive → semua domain dianggap ada di CV.
    """
    if not cv_text:
        return set()
    low = cv_text.lower()
    domains = set()
    for domain, keywords in DOMAIN_KEYWORDS.items():
        for kw in keywords:
            # Word-boundary: hanya match kata utuh, bukan substring
            if re.search(rf"\b{re.escape(kw)}\b", low):
                domains.add(domain)
                break
    return domains


def _question_domain(question: str) -> str | None:
    """Deteksi domain apa yang ditanyakan oleh question.

    v39: Pakai word-boundary regex, bukan substring check.
    """
    q = normalize_question(question)
    if not q:
        return None
    for domain, keywords in DOMAIN_KEYWORDS.items():
        for kw in keywords:
            if re.search(rf"\b{re.escape(kw)}\b", q):
                return domain
    return None


def _is_question_irrelevant_to_cv(question: str, cv_text: str) -> bool:
    """Cek apakah pertanyaan menanyakan domain yang TIDAK ada di CV user.

    Contoh: question "How many years of supply chain experience do you have?"
    untuk user dengan CV HR-only → return True (pertanyaan tidak relevan).

    Ini mencegah bot mem-prompt user untuk pertanyaan yang jawabannya
    sudah jelas "0" atau "None of these".
    """
    q_domain = _question_domain(question)
    if not q_domain:
        return False
    user_domains = _detect_user_domains(cv_text)
    if not user_domains:
        # CV tidak detect domain apa-apa — jangan anggap irrelevant
        return False
    return q_domain not in user_domains


def _estimate_relevant_experience_years(cv_text: str, question: str = "", job_title: str = "") -> int:
    """Estimasi tahun pengalaman relevan berdasarkan domain yang ditanyakan.

    Generalisasi: deteksi domain dari question/job_title/CV, lalu hitung
    tahun pengalaman di domain itu dari CV. Tidak lagi hardcoded ke purchasing.

    Contoh:
    - Question "How many years of HR experience?" + CV HR → estimasi dari
      rentang tanggal di CV yang mengandung keyword HR.
    - Question "supply chain experience?" + CV HR (tanpa supply chain) →
      return 0 (pertanyaan tidak relevan, biar pilih "None of these").
    """
    text = cv_text or ""
    low_context = normalize_question(" ".join([question or "", job_title or ""]))

    # Tentukan domain yang ditanyakan
    target_domain = _question_domain(question or "") or _question_domain(job_title or "")

    # Kalau question spesifik ke domain tertentu, dan CV user TIDAK ada
    # domain itu, return 0 (user tidak punya pengalaman di domain tsb)
    if target_domain:
        user_domains = _detect_user_domains(text)
        if user_domains and target_domain not in user_domains:
            return 0
        relevant_role_words = DOMAIN_KEYWORDS.get(target_domain, ())
    else:
        # Tidak spesifik domain — pakai semua keyword domain yang ada di CV
        user_domains = _detect_user_domains(text)
        if not user_domains:
            return 0
        relevant_role_words = ()
        for d in user_domains:
            relevant_role_words += DOMAIN_KEYWORDS.get(d, ())

    if not relevant_role_words:
        return 0

    months = {
        "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
        "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
        "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
        "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
    }
    now = datetime.now()
    ranges = []
    # Pattern: tangkap sampai 200 char sebelum date (termasuk newline) supaya
    # bisa capture role title yang ada di baris sebelum date.
    # Contoh CV:
    #   "Recruitment Specialist\nPT ABC\nJan 2022 - Present"
    # Role "Recruitment Specialist" ada 2 baris di atas date — butuh context window besar.
    pattern = re.compile(
        r"(?P<line>[\s\S]{0,200}?)\b(?P<m1>Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?P<y1>20\d{2}|19\d{2})\s*[–\-]\s*(?:(?P<m2>Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?P<y2>20\d{2}|19\d{2})|(?P<present>Present|Current|Now))",
        re.I,
    )
    for match in pattern.finditer(text):
        # Ambil context 200 char sebelum date, normalisasi ke satu baris
        line = normalize_question(match.group("line") or "")
        if not any(word in line for word in relevant_role_words):
            continue
        y1 = int(match.group("y1")); m1 = months[(match.group("m1") or "").lower()[:3]]
        if match.group("present"):
            y2 = now.year; m2 = now.month
        else:
            y2 = int(match.group("y2")); m2 = months[(match.group("m2") or "").lower()[:3]]
        total_months = max(0, (y2 - y1) * 12 + (m2 - m1))
        if total_months:
            ranges.append(total_months)
    years = sum(ranges) / 12 if ranges else 0
    if years <= 0:
        # v39: Fallback generik HANYA untuk pertanyaan tanpa domain spesifik.
        # Sebelumnya, fallback ini ambil angka dari kalimat ringkasan CV
        # ("4 years of experience") TANPA peduli domain apa yang ditanya.
        # Akibatnya: semua pertanyaan experience dijawab angka yang sama.
        # Sekarang: kalau target_domain spesifik (mis. "auditor" → finance),
        # JANGAN pakai fallback generik — return 0 kalau tidak ada bukti
        # tanggal kerja yang cocok. Fallback hanya untuk pertanyaan generik
        # ("berapa tahun pengalaman kerja Anda" tanpa nyebut bidang).
        if not target_domain:
            summary_match = re.search(r"(\d+)\+?\s+years?\s+of\s+experience", text, re.I)
            years = float(summary_match.group(1)) if summary_match else 0
    if years >= 5:
        return 5
    if years >= 4:
        return 4
    if years >= 3:
        return 3
    return max(0, int(round(years)))

def _experience_answer(question: str, field_type: str, cv_text: str, job_title: str) -> str:
    years = _estimate_relevant_experience_years(cv_text, question, job_title)
    if years <= 0:
        # Jika pertanyaan spesifik domain yang TIDAK ada di CV, jawab "0"/"None"
        # supaya bot bisa pilih opsi "0 years" / "None of these" tanpa prompt manual.
        if _is_question_irrelevant_to_cv(question, cv_text):
            q_norm = normalize_question(question)
            if "more than" in q_norm or "lebih dari" in q_norm:
                return ""  # jangan jawab "more than" kalau 0
            if field_type == "number":
                return "0"
            # Untuk dropdown, kembalikan opsi yang menandakan "tidak punya"
            return "None of these"
        return ""
    q = question or ""
    q_norm = normalize_question(q)
    if field_type == "number":
        return str(years)
    if "more than 5 years" in q_norm and years >= 5:
        return "More than 5 years"
    if "lebih dari 5" in q_norm and years >= 5:
        return "Lebih dari 5 tahun"
    if "5 years" in q_norm and years >= 5:
        return "5 years"
    if "5 tahun" in q_norm and years >= 5:
        return "5 tahun"
    return f"{years} years"


# ── Auto-answer pertanyaan umum dari CV ──────────────────────────────────────
# Pertanyaan JobStreet yang sering muncul & jawabannya bisa di-infer dari CV:
# - Education level (S1, S2, D3, SMA)
# - Languages (English, Bahasa Indonesia)
# - Willingness to relocate / travel
# - Marital status, dll (privacy — skip)

def _looks_like_education_question(question: str) -> bool:
    q = normalize_question(question)
    return any(k in q for k in (
        "education", "pendidikan", "degree", "gelar", "qualification",
        "kualifikasi", "academic", "last education",
    ))


def _education_answer_from_cv(cv_text: str, question: str) -> str:
    """Deteksi jenjang pendidikan tertinggi dari CV.

    Pakai regex word-boundary + pola gelar yang spesifik, BUKAN substring
    mentah. Sebelumnya "master" di-substring-match, jadi istilah kerja umum
    di bidang procurement/supply chain seperti "master data", "vendor
    master", "material master" salah kedeteksi sebagai gelar Master (S2)
    padahal itu bukan soal pendidikan sama sekali.
    """
    if not cv_text:
        return ""
    low = cv_text.lower()

    def has(*patterns):
        return any(re.search(p, low) for p in patterns)

    s2 = has(
        r"\bs\.?\s?2\b", r"\bmagister\b",
        r"\bmaster'?s degree\b", r"\bmaster of (arts|science|business|engineering|management)\b",
        r"\bm\.\s?sc\b", r"\bmba\b", r"\bm\.\s?t\b", r"\bm\.\s?m\b", r"\bm\.\s?si\b",
    )
    s1 = has(
        r"\bs\.?\s?1\b", r"\bsarjana\b", r"\bbachelor'?s? degree\b",
        r"\bbachelor of (arts|science|engineering|management)\b",
        r"\bb\.\s?sc\b", r"\bb\.\s?eng\b", r"\bs\.\s?t\b", r"\bs\.\s?kom\b",
        r"\bs\.\s?e\b", r"\bs\.\s?ikom\b", r"\bs\.\s?psi\b", r"\bs\.\s?ip\b",
    )
    d3 = has(r"\bd3\b", r"\bd-?iii\b", r"\bdiploma\b", r"\ba\.\s?md\b")
    sma = has(r"\bsma\b", r"\bsmu\b", r"\bsmk\b", r"\bsenior high\b", r"\bhigh school\b")

    # Prioritaskan jenjang tertinggi kalau ada beberapa yang match
    if s2:
        return "Master Degree (S2)"
    if s1:
        return "Bachelor Degree (S1)"
    if d3:
        return "Diploma (D3)"
    if sma:
        return "Senior High School (SMA/SMK)"
    return ""


def _looks_like_language_question(question: str) -> bool:
    q = normalize_question(question)
    return any(k in q for k in (
        "language", "bahasa", "speak", "speaking", "fluency", "proficiency",
        "english", "indonesia",
    ))


def _language_answer_from_cv(cv_text: str, question: str) -> str:
    """Deteksi jawaban bahasa dari CV."""
    if not cv_text:
        return ""
    q = normalize_question(question)
    low = cv_text.lower()
    if "english" in q or "inggris" in q:
        if any(k in low for k in ("fluent", "professional", "proficient", "c1", "c2")):
            return "Speaks proficiently in a professional setting"
        if any(k in low for k in ("intermediate", "b1", "b2", "working")):
            return "Speaks conversational English"
        # Default untuk CV Indonesia yang menyebut "English"
        return "Speaks proficiently in a professional setting"
    if "indonesia" in q or "bahasa" in q:
        return "Native or bilingual proficiency"
    return ""


def _auto_answer_common_question(question: str, cv_text: str, field_type: str) -> str:
    """Coba jawab pertanyaan umum dari CV tanpa perlu prompt manual.

    Return empty string kalau tidak bisa di-auto-answer.
    """
    if not cv_text or not question:
        return ""

    # Education
    if _looks_like_education_question(question):
        ans = _education_answer_from_cv(cv_text, question)
        if ans:
            return ans

    # Language
    if _looks_like_language_question(question):
        ans = _language_answer_from_cv(cv_text, question)
        if ans:
            return ans

    return ""


def get_preferences(user_id: int) -> dict:
    db = get_db()
    row = db.execute(
        "SELECT expected_salary, available_join FROM user_preferences WHERE user_id=?",
        (user_id,),
    ).fetchone()
    db.close()
    return dict(row) if row else {"expected_salary": "", "available_join": ""}


def find_saved_answer(user_id: int, platform: str, question: str, field_type: str = ""):
    normalized = normalize_question(question)
    if not normalized:
        return None
    intent = ""
    if _looks_like_current_salary(question):
        intent = "current_salary"
    elif _looks_like_expected_salary(question):
        intent = "expected_salary"
    elif _looks_like_join_date(question):
        intent = "join_date"

    db = get_db()
    rows = db.execute(
        """
        SELECT id, question, normalized, answer
        FROM question_bank
        WHERE user_id = ? AND (platform = ? OR platform = '')
        ORDER BY platform DESC, updated_at DESC
        """,
        (user_id, platform or ""),
    ).fetchall()

    if intent:
        intent_checks = {
            "current_salary": _looks_like_current_salary,
            "expected_salary": _looks_like_expected_salary,
            "join_date": _looks_like_join_date,
        }
        for row in rows:
            if intent_checks[intent](row["question"] or row["normalized"] or ""):
                answer = row["answer"]
                db.close()
                save_question_answer(user_id, platform, question, answer, field_type, source="reused")
                return answer

    best = None
    best_score = 0.0
    for row in rows:
        saved_normalized = row["normalized"] or normalize_question(row["question"])
        score = SequenceMatcher(None, normalized, saved_normalized).ratio()
        current_tokens = set(normalized.split())
        saved_tokens = set(saved_normalized.split())
        overlap = len(current_tokens & saved_tokens) / max(1, min(len(current_tokens), len(saved_tokens)))
        score = max(score, overlap)
        if score > best_score:
            best = row
            best_score = score
    if best and best_score >= 0.72:
        db.close()
        save_question_answer(user_id, platform, question, best["answer"], field_type, source="reused")
        return best["answer"]
    db.close()
    return None


def save_question_answer(user_id: int, platform: str, question: str, answer: str, field_type: str, source="ai"):
    question = (question or "").strip()
    answer = (answer or "").strip()
    if not question or not answer:
        return
    normalized = normalize_question(question)
    db = get_db()
    db.execute(
        """
        INSERT INTO question_bank (user_id, platform, question, normalized, answer, field_type, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, platform, normalized) DO UPDATE SET
            question = excluded.question,
            answer = CASE
                WHEN question_bank.source = 'manual' AND excluded.source NOT IN ('cv', 'preference') THEN question_bank.answer
                ELSE excluded.answer
            END,
            field_type = CASE WHEN excluded.field_type != '' THEN excluded.field_type ELSE question_bank.field_type END,
            source = CASE
                WHEN question_bank.source = 'manual' AND excluded.source NOT IN ('cv', 'preference') THEN 'manual'
                ELSE excluded.source
            END,
            use_count = question_bank.use_count + 1,
            updated_at = datetime('now')
        """,
        (user_id, platform or "", question, normalized, answer, field_type or "", source),
    )
    db.commit()
    db.close()


def _grounded_ai_answer(answer: str) -> str:
    value = (answer or "").strip()
    if value.upper() in {"NEEDS_USER_INPUT", "ASK_USER", "UNKNOWN"}:
        return ""
    return value


async def answer_application_question(user_id: int, platform: str, question: str, field_type: str,
                                      cv_text: str, job_title: str, ask_user_question=None,
                                      options: list = None) -> str:
    if _looks_like_resume_field(question):
        return ""

    # ── GUARD: Pastikan CV sudah dibaca & dipahami sebelum menjawab ──
    # Jika cv_text kosong atau sangat pendek (<50 char), jangan jawab dengan asumsi.
    # Langsung trigger ask_user_question untuk minta konfirmasi user.
    if not cv_text or len(cv_text.strip()) < 50:
        if ask_user_question:
            # Popup ke user cukup tampilkan pertanyaannya saja (tanpa boilerplate
            # "CV tidak ditemukan..." di depannya) — detail alasannya cukup di log
            # backend, tidak perlu bikin popup jadi panjang buat user.
            logging.info(
                f"[answer_helper] CV text kosong/pendek (user_id={user_id}, platform={platform}), "
                f"minta jawaban manual untuk: {question!r}"
            )
            answer = await ask_user_question(platform, question, field_type, job_title, options)
            if answer:
                save_question_answer(user_id, platform, question, answer, field_type, source="manual")
                return answer
        return ""

    auto_mode = is_auto_mode(user_id)

    # ── Auto-answer common questions dari CV (education, language, dll) ──
    # Ini dipakai SEBELUM cek experience/salary/join_date supaya pertanyaan
    # umum yang jawabannya ada di CV tidak perlu prompt manual.
    common_ans = _auto_answer_common_question(question, cv_text, field_type)
    if common_ans:
        save_question_answer(user_id, platform, question, common_ans, field_type, source="cv")
        return common_ans

    if _looks_like_experience_years(question):
        answer = _experience_answer(question, field_type, cv_text, job_title)
        if answer:
            save_question_answer(user_id, platform, question, answer, field_type, source="cv")
            return answer

    prefs = get_preferences(user_id)

    if _looks_like_expected_salary(question) and prefs.get("expected_salary"):
        answer = prefs["expected_salary"]
        save_question_answer(user_id, platform, question, answer, field_type, source="preference")
        return answer
    if _looks_like_join_date(question) and prefs.get("available_join"):
        answer = prefs["available_join"]
        if field_type == "number":
            answer = _numeric_answer(question, answer)
        save_question_answer(user_id, platform, question, answer, field_type, source="preference")
        return answer

    # ── Skip saved answer untuk pertanyaan join_date kalau preference kosong ──
    # Sebelumnya, kalau user belum set preference "available_join" (kosong),
    # bot ambil jawaban lama dari question_bank (mis. "1 bulan" dari lamaran
    # dulu). Ini salah karena jawaban lama bisa tidak relevan lagi — user
    # bisa saja sekarang sudah bisa "immediately". Lebih baik prompt user
    # supaya jawaban selalu up-to-date.
    # Preference selalu menang vs saved answer; kalau preference kosong,
    # jangan pakai saved answer lama untuk join_date — prompt user manual.
    skip_saved_for_join_date = _looks_like_join_date(question) and not prefs.get("available_join")

    if not skip_saved_for_join_date:
        saved = find_saved_answer(user_id, platform, question, field_type)
        if saved:
            return _numeric_answer(question, saved) if field_type == "number" else saved

    # ── Auto-apply mode: skip blocking user prompt, go straight to AI ──
    # v37: Guard groundedness — kalau pertanyaan TIDAK bisa dijawab dari CV
    # (bukan pengalaman/pendidikan/bahasa/salary/join_date yang sudah di-handle
    # di atas), JANGAN auto-jawab dengan AI. Prompt user via Telegram.
    if auto_mode:
        # Cek apakah pertanyaan bisa dijawab dari info yang sudah ada
        # (CV, preference, saved answer). Kalau tidak → prompt user.
        can_auto_answer = (
            _looks_like_experience_years(question)
            or _looks_like_education_question(question)
            or _looks_like_language_question(question)
            or _looks_like_expected_salary(question)
            or _looks_like_join_date(question)
        )
        if can_auto_answer:
            answer = _grounded_ai_answer(await answer_question(user_id, question, field_type, cv_text, job_title))
            if answer and field_type == "number":
                answer = _numeric_answer(question, answer)
            if answer:
                save_question_answer(user_id, platform, question, answer, field_type, source="ai")
                _notify_ai_answer(user_id, platform, question, answer)
                return answer
            if ask_user_question:
                answer = await ask_user_question(platform, question, field_type, job_title, options)
                if answer:
                    save_question_answer(user_id, platform, question, answer, field_type, source="manual")
                    return answer
            return ""
        else:
            # Tidak bisa auto-answer → prompt user via Telegram (blocking)
            if ask_user_question:
                answer = await ask_user_question(platform, question, field_type, job_title, options)
                if answer:
                    save_question_answer(user_id, platform, question, answer, field_type, source="manual")
                    return answer
            return ""

    # ── Manual mode: block up to 10 min waiting for user reply ──
    if _looks_like_current_salary(question):
        if ask_user_question:
            answer = await ask_user_question(platform, question, field_type, job_title, options)
            if answer:
                save_question_answer(user_id, platform, question, answer, field_type, source="manual")
                return answer
        return ""

    if ask_user_question:
        answer = await ask_user_question(platform, question, field_type, job_title, options)
        if answer:
            save_question_answer(user_id, platform, question, answer, field_type, source="manual")
            return answer

    # Tanpa jalur untuk bertanya kepada user, lebih aman melewati field daripada
    # mengirim fakta pribadi yang dibuat AI.
    return ""
