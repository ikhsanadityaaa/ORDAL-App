import re


TARGET_STOPWORDS = {
    "and", "dan", "di", "the", "of", "for", "with", "in", "specialist",
    "manager", "senior", "junior", "executive", "officer", "lead", "head",
    "director", "coordinator", "associate", "assistant", "analyst", "consultant",
    "supervisor", "staff", "engineer", "administrator", "member", "team",
    "person", "representative", "representatives", "associate", "officer",
}

PURCHASING_FAMILY = {
    "purchasing", "purchase", "procurement", "procure", "buyer", "buying",
    "sourcing", "pengadaan", "pembelian",
    "supply", "chain", "supplychain", "scm", "ppic", "planning", "material",
    "materials", "demand",
}

ROLE_NOISE = {
    "admin", "administrator", "administrasi", "finance", "sales", "marketing",
    "warehouse", "inventory", "stock", "gudang", "logistic", "logistics",
}

ENTRY_LEVEL = {"intern", "internship", "magang", "trainee", "apprentice", "ojt"}
JUNIOR_LEVEL = {"junior", "jr"}
SENIOR_LEVEL = {"senior", "sr", "lead", "head", "manager", "supervisor", "spv"}
CONTRACT_TERMS = {
    "contractor", "contractual", "kontrak", "pkwt", "temporary",
    "temp", "freelance", "freelancer", "projectbased", "outsourcing",
}
PART_TIME_TERMS = {"parttime", "part", "paruh"}
FULL_TIME_TERMS = {"fulltime", "full", "permanent", "tetap"}

SALES_FAMILY = {
    "sales", "selling", "seller", "account", "accounts", "keyaccount", "kam",
    "development", "bd", "commercial", "revenue", "partnership", "partnerships",
    "merchant", "retail", "store", "telesales", "telemarketing",
}
MARKETING_FAMILY = {
    "marketing", "marketer", "digital", "seo", "sem", "content", "brand",
    "branding", "social", "media", "campaign", "campaigns", "crm", "growth",
    "performance", "copywriter", "copywriting", "community",
    # NB: "creative" sengaja tidak dimasukkan — juga dipakai di
    # DESIGN_FAMILY dan lebih sering merujuk ke role desain/visual
    # ("Creative Designer") daripada marketing generalist.
}
FINANCE_FAMILY = {
    "finance", "financial", "accounting", "accountant", "tax", "audit",
    "auditor", "treasury", "ar", "ap", "billing", "payroll", "bookkeeping",
    "bookkeeper", "controller", "budget", "costing", "collection",
    # Payroll/compensation & benefits: dulu ke-double di HR_FAMILY juga,
    # sehingga lowongan "Payroll Staff" salah kecocok dengan target
    # "HR Staff" / "Talent Acquisition". Payroll & C&B secara peran
    # spesifik beda dari HR generalist/rekrutmen, jadi cukup di sini saja.
    "compensation", "benefit", "benefits",
}
HR_FAMILY = {
    "hr", "human", "resources", "recruitment", "recruiter", "recruiting",
    "talent", "people", "culture", "ga", "affairs", "affair",
    # Varian umum di lowongan Indonesia — sering digabung jadi satu kata
    # atau pakai istilah lokal, tidak ke-tokenize sebagai "hr" terpisah.
    "hrga", "hrd", "hrbp", "personalia", "kepegawaian",
    # Learning & Development (L&D) — sering dianggap satu rumpun dengan HR.
    # Termasuk "training staff" yang disebut user sebagai posisi relevan
    # dengan "HR staff" / "General Affair" / "Talent Acquisition".
    # NB: "development" SENGAJA tidak dimasukkan di sini karena juga
    # dipakai di SALES_FAMILY ("business development") — cukup andalkan
    # "training"/"learning"/"ld" sebagai penanda L&D biar gak dobel.
    "training", "trainer", "learning", "ld",
    "organizational", "organization", "peopleops", "peopleoperations",
    "onboarding", "upskilling", "reskilling",
}

# v38: Pisahkan IT_DATA_FAMILY jadi 2 family terpisah.
# Sebelumnya "data" digabung dengan "it"/"system"/"network"/"security" dll
# → target "Data Analyst" match lowongan IT security/network/software engineer.
# Sekarang: DATA_ANALYTICS_FAMILY untuk data/analytics murni,
# IT_ENGINEERING_FAMILY untuk software/IT engineering.
DATA_ANALYTICS_FAMILY = {
    "data", "database", "sql", "bi", "etl",
    "analytics", "analytical", "dashboard", "reporting",
    "machine", "intelligence",
}
IT_ENGINEERING_FAMILY = {
    "software", "developer", "programmer", "frontend", "front", "backend",
    "back", "fullstack", "full", "stack", "mobile", "android", "ios", "web",
    "python", "java", "javascript", "devops",
    "cloud", "network", "security", "cyber", "system", "systems", "it",
    "qa", "tester", "testing",
    # NB: "learning" sengaja tidak dimasukkan — juga dipakai di HR_FAMILY
    # untuk "Learning & Development". "machine"/"ai" sudah cukup jadi
    # penanda role Machine Learning / AI Engineer tanpa perlu "learning".
    "ai",
}
OPERATIONS_FAMILY = {
    "operation", "operations", "operational", "logistic", "logistics", "warehouse",
    "gudang", "inventory", "stock", "fulfillment", "delivery", "transport",
    "transportation", "distribution", "planner", "fleet", "export",
    "import", "exim",
    # NB: "planning" sengaja tidak dimasukkan — juga dipakai di
    # PURCHASING_FAMILY untuk "demand planning". "planner" masih di sini
    # buat nangkep "Operations Planner"/"Fleet Planner" dll.
}
ADMIN_FAMILY = {
    "admin", "administrator", "administration", "administrasi", "secretary",
    "sekretaris", "clerical", "office", "document", "documentation", "dataentry",
}
CUSTOMER_SERVICE_FAMILY = {
    "customer", "service", "support", "cs", "care", "call", "contact", "center",
    "centre", "helpdesk", "help", "desk", "relation", "relations", "experience",
}
LEGAL_COMPLIANCE_FAMILY = {
    "legal", "law", "lawyer", "paralegal", "compliance", "contract", "contracts",
    "license", "licensing", "risk", "regulatory", "corporate",
    # NB: "secretary" sengaja tidak dimasukkan — juga dipakai di
    # ADMIN_FAMILY dan lebih sering merujuk ke sekretaris eksekutif/admin
    # daripada corporate secretary (legal).
}
DESIGN_FAMILY = {
    "design", "designer", "ui", "ux", "graphic", "graphics", "visual",
    "illustrator", "creative", "motion", "video", "editor", "photographer",
}
ENGINEERING_MANUFACTURING_FAMILY = {
    "manufacturing", "production", "maintenance", "mechanical", "electrical",
    "industrial", "technician", "technical", "operator", "process", "factory",
    "plant", "quality", "qc", "qa", "hse", "safety", "civil", "mep",
}
PRODUCT_PROJECT_FAMILY = {
    "product", "project", "program", "scrum", "agile", "pmo", "owner",
    "implementation",
}
HEALTH_EDUCATION_FAMILY = {
    "doctor", "dokter", "nurse", "perawat", "medical", "clinical", "pharmacy",
    "pharmacist", "teacher", "guru", "lecturer", "instructor", "education",
    # NB: "trainer" sengaja tidak dimasukkan — juga dipakai di HR_FAMILY
    # untuk corporate trainer/L&D, yang jauh lebih umum di lowongan kerja
    # daripada "trainer" pendidikan formal.
}

ROLE_FAMILIES = (
    PURCHASING_FAMILY,
    SALES_FAMILY,
    MARKETING_FAMILY,
    FINANCE_FAMILY,
    HR_FAMILY,
    DATA_ANALYTICS_FAMILY,
    IT_ENGINEERING_FAMILY,
    OPERATIONS_FAMILY,
    ADMIN_FAMILY,
    CUSTOMER_SERVICE_FAMILY,
    LEGAL_COMPLIANCE_FAMILY,
    DESIGN_FAMILY,
    ENGINEERING_MANUFACTURING_FAMILY,
    PRODUCT_PROJECT_FAMILY,
    HEALTH_EDUCATION_FAMILY,
)
ALL_FAMILY_WORDS = set().union(*ROLE_FAMILIES)

# Kata-kata ini masih dianggap bagian dari family-nya (dipakai buat cocokin
# judul lowongan yang singkat/spesifik, mis. "Training Staff"), TAPI sering
# muncul sebagai boilerplate umum di ISI deskripsi lowongan apa pun — bukan
# cuma di lowongan yang benar-benar relevan. Contoh: hampir semua lowongan
# di Indonesia nyantumin "benefit: BPJS, training, payroll tepat waktu"
# di bagian benefit/tunjangan, padahal lowongannya sendiri bisa posisi
# apa saja (Sekretaris, Sales, dll).
#
# Kalau kata-kata ini dipakai buat matching di teks PANJANG/bebas (deskripsi
# lowongan), bukan di judul, gampang salah kecocok. Makanya saat mode
# strict=True (dipakai untuk fallback matching di detail_text), kata-kata
# di bawah ini TIDAK dihitung sebagai penanda family.
LOOSE_FAMILY_WORDS = {
    "training", "trainer", "learning", "ld",
    "compensation", "benefit", "benefits",
    "planning", "planner",
    "development",
    "growth", "performance",
}


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]+", " ", (value or "").lower())).strip()


def _tokens(value: str) -> set[str]:
    return set(normalize_text(value).split())


def _has_family(tokens: set[str], family: set[str], strict: bool = False) -> bool:
    if strict:
        return any(token in family and token not in LOOSE_FAMILY_WORDS for token in tokens)
    return any(token in family for token in tokens)

def _families_for(tokens: set[str], strict: bool = False) -> list[set[str]]:
    return [family for family in ROLE_FAMILIES if _has_family(tokens, family, strict=strict)]

def _level_ok(title_tokens: set[str], target_tokens: set[str]) -> bool:
    """Cek kecocokan level karir antara lowongan dan target.
    
    Aturan:
    - Jika target entry-level, hanya terima entry-level
    - Jika target senior/manager, tolak entry/junior
    - Jika target mid-level, tolak senior/manager yang terlalu tinggi
    """
    # Jika lowongan entry-level tapi target bukan entry-level -> skip
    if title_tokens & ENTRY_LEVEL and not target_tokens & ENTRY_LEVEL:
        return False
    
    # Jika target明确要求 senior/manager level
    if target_tokens & SENIOR_LEVEL:
        # Tolak jika lowongan entry/junior
        if title_tokens & (ENTRY_LEVEL | JUNIOR_LEVEL):
            return False
        # Terima jika lowongan juga senior level atau mid-level tanpa entry/junior marker
        return bool(title_tokens & SENIOR_LEVEL) or not (title_tokens & (ENTRY_LEVEL | JUNIOR_LEVEL))
    
    # Jika target mid-level (staff/specialist tanpa senior marker)
    # Tolak lowongan yang terlalu senior (manager/director/head/ supervisor)
    if not (target_tokens & (SENIOR_LEVEL | ENTRY_LEVEL | JUNIOR_LEVEL)):
        overqualified_tokens = {"manager", "director", "head", "vp", "vice president", "chief", "c-level", "supervisor", "spv"}
        if title_tokens & overqualified_tokens:
            return False
    
    # Jika lowongan senior tapi target entry/junior -> skip
    if title_tokens & SENIOR_LEVEL and target_tokens & (ENTRY_LEVEL | JUNIOR_LEVEL):
        return False
    
    return True


def matches_position(text: str, position: str, strict: bool = False) -> bool:
    """Cek apakah `text` (judul/isi lowongan) cocok dengan `position` (target).

    Args:
        strict: Kalau True, kata-kata "loose" (lihat LOOSE_FAMILY_WORDS) tidak
            dihitung sebagai penanda family di sisi `text`. Pakai strict=True
            saat `text` adalah teks bebas yang panjang (mis. isi deskripsi
            lowongan), karena di situ kata boilerplate seperti "training"/
            "benefit"/"payroll" sering muncul tanpa hubungan sama posisi
            lowongan sebenarnya. Target (`position`) selalu dicek longgar
            (non-strict) karena itu input terstruktur dari user sendiri.
    """
    title_tokens = _tokens(text)
    target_tokens = _tokens(position)
    if not target_tokens:
        return True
    if not _level_ok(title_tokens, target_tokens):
        return False

    target_families = _families_for(target_tokens)
    if target_families:
        if not any(_has_family(title_tokens, family, strict=strict) for family in target_families):
            return False

        if _has_family(target_tokens, PURCHASING_FAMILY):
            # Allow if post contains a purchasing family word (e.g. "Admin Purchasing")
            has_purchasing_in_title = any(t in PURCHASING_FAMILY for t in title_tokens)
            if "ppic" in title_tokens and "ppic" not in target_tokens and not has_purchasing_in_title:
                return False
            if "operator" in title_tokens and "operator" not in target_tokens and not has_purchasing_in_title:
                return False
            if (title_tokens & ROLE_NOISE) and not (target_tokens & ROLE_NOISE) and not has_purchasing_in_title:
                return False

        target_core = {
            w for w in target_tokens
            if len(w) >= 3 and w not in TARGET_STOPWORDS and w not in ALL_FAMILY_WORDS
        }
        if target_core and not (target_core & title_tokens):
            return False
        return True

    # v38: Hapus fail-open "if not words: return True".
    # Sebelumnya, kalau target cuma berisi kata generik/stopword (mis. "Analyst"
    # yang ada di TARGET_STOPWORDS), words jadi kosong → return True → match SEMUA.
    # Sekarang: return False (skip) kalau tidak ada kata spesifik.
    words = [w for w in target_tokens if len(w) >= 4 and w not in TARGET_STOPWORDS]
    if not words:
        return False
    return any(w in title_tokens for w in words)


# ── Multi-position support ────────────────────────────────────────────────────
# User bisa input beberapa posisi sekaligus sebagai tag, dipisah koma/slash/pipe.
# Contoh: "HR Staff, General Affair, Talent Acquisition"
# Semua posisi yang tercantum akan dianggap target. Bot akan lamar lowongan yang
# cocok dengan SALAH SATU posisi tersebut — bukan harus match persis.
#
# Ditambah lagi, family-based matching (mis. "HR Staff" match "Training Staff"
# karena keduanya di HR_FAMILY) memastikan posisi yang relevan tapi tidak
# tercantum di tag tetap dilamar.

_POSITION_DELIMITERS = re.compile(r"[,/;|]|&| dan | and | atau | or ")


def parse_positions(value: str) -> list[str]:
    """Parse string multi-posisi menjadi list posisi bersih.

    Contoh:
      "HR Staff, General Affair" -> ["HR Staff", "General Affair"]
      "HR Staff / Talent Acquisition" -> ["HR Staff", "Talent Acquisition"]
      "Admin & Receptionist" -> ["Admin", "Receptionist"]
      "Purchasing Specialist" -> ["Purchasing Specialist"]
    """
    if not value:
        return []
    # Split by delimiters
    parts = _POSITION_DELIMITERS.split(value)
    positions = []
    for p in parts:
        clean = " ".join(p.strip().lower().split())
        if clean and clean not in positions:
            positions.append(clean)
    return positions


def matches_any_position(text: str, positions_value: str, strict: bool = False) -> tuple[bool, str]:
    """Cek apakah `text` cocok dengan salah satu posisi di `positions_value`.

    Args:
        text: Judul lowongan / teks kartu lowongan.
        positions_value: String berisi satu atau lebih posisi, dipisah
                         koma/slash/pipe/dan/atau.
        strict: Teruskan True kalau `text` adalah teks bebas yang panjang
                (mis. isi deskripsi lowongan) supaya kata boilerplate umum
                ("training", "benefit", "payroll", dll — lihat
                LOOSE_FAMILY_WORDS) tidak dihitung sebagai kecocokan family.
                Pakai default (False) untuk judul lowongan yang singkat.

    Returns:
        Tuple (matched, matched_position_label).
        - matched=True + label posisi yang cocok (atau "sesuai family") bila match.
        - matched=False + alasan singkat bila tidak match.
    """
    if not text or not positions_value:
        # Kalau positions kosong, anggap match semua (jangan filter)
        return True, "Posisi: semua"

    positions = parse_positions(positions_value)
    if not positions:
        return True, "Posisi: semua"

    # Cek match untuk masing-masing posisi
    for pos in positions:
        if matches_position(text, pos, strict=strict):
            return True, f"Match: {pos}"

    # Tidak ada yang match persis — cek family-level matching untuk reasoning
    text_tokens = _tokens(text)
    text_families = _families_for(text_tokens, strict=strict)
    target_families = set()
    for pos in positions:
        for fam in _families_for(_tokens(pos)):
            target_families.add(id(fam))

    if text_families and target_families:
        # Ada family overlap tapi tidak match persis — tetap tidak cocok
        return False, "Posisi tidak sesuai (se-rumpun tapi beda spesialisasi)"

    return False, "Posisi tidak sesuai"

def is_excluded_position(text: str, excluded_positions_str: str) -> tuple[bool, str]:
    """Cek apakah `text` (judul lowongan) mengandung posisi yang dikecualikan user.

    Dipakai bareng di LinkedIn Jobs, LinkedIn Posts, dan JobStreet bot supaya
    behaviornya konsisten di semua platform — sebelumnya exclusion cuma
    ditegakkan di JobStreet, jadi lowongan yang harusnya dihindari (mis.
    "payroll", "sekretaris") tetap kelolos kalau apply-nya lewat LinkedIn.

    Pencocokan pakai TOKEN (kata utuh), bukan substring mentah, supaya kata
    pendek tidak salah nangkep kata lain yang kebetulan mengandung huruf
    yang sama (mis. exclude "it" jangan sampai match "recruIT-er").

    Kalau user isi excluded position dengan beberapa kata (mis. "payroll
    staff"), SEMUA kata itu harus muncul di judul supaya dianggap match —
    biar exclude "payroll staff" gak asal kena "staff" doang.

    Returns:
        Tuple (excluded, matched_excluded_label).
    """
    if not excluded_positions_str or not text:
        return False, ""

    title_tokens = _tokens(text)
    for raw in excluded_positions_str.split(","):
        ex_clean = raw.strip()
        if not ex_clean:
            continue
        ex_tokens = _tokens(ex_clean)
        if not ex_tokens:
            continue
        if ex_tokens.issubset(title_tokens):
            return True, ex_clean

    return False, ""


def matches_employment_type(text: str, employment_type: str = "full_time") -> tuple[bool, str]:
    target = normalize_text(employment_type or "full_time").replace(" ", "_")
    if target in ("", "any", "all", "semua"):
        return True, ""

    tokens = _tokens(text)
    compact = normalize_text(text).replace(" ", "")
    has_entry = bool(tokens & ENTRY_LEVEL) or any(term in compact for term in ("internship", "magang", "trainee"))
    has_contract = bool(tokens & CONTRACT_TERMS) or any(term in compact for term in ("contractbased", "contractbase", "projectbased", "pkwt"))
    has_part_time = bool(tokens & PART_TIME_TERMS) or "parttime" in compact or "parttimer" in compact
    has_full_time = bool(tokens & FULL_TIME_TERMS) or "fulltime" in compact or "fulltimer" in compact

    if target == "full_time":
        if has_entry:
            return False, "Tipe kerja intern/magang"
        if has_contract:
            return False, "Tipe kerja contract"
        if has_part_time:
            return False, "Tipe kerja part-time"
        return True, "Full-time" if has_full_time else ""

    if target == "contract":
        if has_entry:
            return False, "Tipe kerja intern/magang"
        if has_contract:
            return True, "Contract"
        return False, "Bukan contract"

    if target == "intern":
        if has_entry:
            return True, "Intern"
        return False, "Bukan intern"

    return True, ""


def parse_salary_amounts(value: str) -> list[int]:
    text = (value or "").lower()
    if not text:
        return []

    unit_million = bool(re.search(r"\b(juta|jt|million)\b", text))
    amounts: list[int] = []
    for raw in re.findall(r"\d+(?:[.,]\d+)*", text):
        cleaned = raw.strip(".,")
        if not cleaned:
            continue
        if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", cleaned):
            number = int(re.sub(r"[.,]", "", cleaned))
        else:
            try:
                number_float = float(cleaned.replace(",", "."))
            except ValueError:
                continue
            number = int(number_float)
            if unit_million and number_float < 1000:
                number = int(number_float * 1_000_000)
        if unit_million and number < 1000:
            number *= 1_000_000
        if number >= 100_000:
            amounts.append(number)
    return amounts


def parse_expected_salary(value: str) -> int:
    amounts = parse_salary_amounts(value)
    if amounts:
        return max(amounts)
    digits = re.sub(r"\D", "", value or "")
    return int(digits) if digits else 0


def salary_matches(expected_salary: str, salary_text: str) -> tuple[bool, str]:
    expected = parse_expected_salary(expected_salary)
    if expected <= 0:
        return True, ""
    amounts = parse_salary_amounts(salary_text)
    if not amounts:
        return True, "Gaji tidak tercantum"
    max_salary = max(amounts)
    if max_salary >= expected:
        return True, f"Gaji cocok: max Rp{max_salary:,}".replace(",", ".")
    return False, f"Gaji di bawah target: max Rp{max_salary:,}".replace(",", ".")


def get_expected_salary(user_id: int) -> str:
    try:
        from database import get_db
        db = get_db()
        row = db.execute(
            "SELECT expected_salary FROM user_preferences WHERE user_id=?",
            (user_id,),
        ).fetchone()
        db.close()
        return (row["expected_salary"] if row else "") or ""
    except Exception:
        return ""
