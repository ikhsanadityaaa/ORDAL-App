"""Deterministic ATS audit and safe CV optimization helpers."""
from __future__ import annotations

import json
import os
import re
from collections import Counter
from html import escape


SECTION_PATTERNS = {
    "contact": r"(?:email|phone|telephone|telepon|linkedin|contact|kontak)",
    "summary": r"(?:summary|profile|about me|professional profile|ringkasan|profil)",
    "experience": r"(?:experience|employment|work history|pengalaman|riwayat kerja)",
    "education": r"(?:education|academic|pendidikan)",
    "skills": r"(?:skills|competencies|keahlian|kompetensi)",
}

ACTION_VERBS = {
    "achieved", "built", "created", "delivered", "developed", "improved", "increased",
    "led", "managed", "optimized", "reduced", "resolved", "saved", "streamlined",
    "mencapai", "membangun", "membuat", "mengembangkan", "meningkatkan", "memimpin",
    "mengelola", "mengoptimalkan", "mengurangi", "menyelesaikan", "menghemat",
}


def _criterion(key: str, label: str, maximum: int, score: int, evidence: str, recommendation: str) -> dict:
    score = max(0, min(maximum, int(score)))
    return {
        "key": key,
        "label": label,
        "score": score,
        "max_score": maximum,
        "status": "good" if score >= maximum * 0.8 else "warning" if score >= maximum * 0.5 else "poor",
        "evidence": evidence,
        "recommendation": recommendation,
    }


def analyze_cv(file_path: str, cv_text: str, position_label: str = "") -> dict:
    """Return transparent ATS heuristic. This is not a recruiter ATS verdict."""
    pages = []
    table_count = image_count = 0
    font_names: Counter[str] = Counter()
    font_sizes: Counter[float] = Counter()
    page_sizes = set()
    try:
        import pdfplumber

        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                pages.append(page_text)
                page_sizes.add((round(page.width), round(page.height)))
                image_count += len(page.images or [])
                try:
                    table_count += len(page.find_tables() or [])
                except Exception:
                    pass
                for char in page.chars or []:
                    if char.get("fontname"):
                        font_names[str(char["fontname"])] += 1
                    if char.get("size"):
                        font_sizes[round(float(char["size"]), 1)] += 1
    except Exception:
        pages = [cv_text]

    text = (cv_text or "").strip()
    lower = text.lower()
    page_count = max(1, len(pages))
    char_count = len(text)
    words = re.findall(r"\b[\w+#.-]+\b", lower)
    email = bool(re.search(r"\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b", lower))
    phone = bool(re.search(r"(?:\+?62|0)[\d\s().-]{8,}", lower))
    linkedin = "linkedin.com/" in lower
    sections = {name: bool(re.search(pattern, lower, re.I)) for name, pattern in SECTION_PATTERNS.items()}
    date_hits = len(re.findall(r"\b(?:19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:19|20)\d{2}\b", lower, re.I))
    quantified = len(re.findall(r"(?:\b\d+(?:[.,]\d+)?\s?(?:%|x|k|m|juta|ribu|million|billion)\b|rp\s?\d+|\$\s?\d+)", lower, re.I))
    action_hits = sum(1 for word in words if word in ACTION_VERBS)
    bullet_lines = len(re.findall(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+", text))
    target_words = [w for w in re.findall(r"[a-z0-9+#]+", position_label.lower()) if len(w) >= 3]
    target_hits = sum(1 for word in set(target_words) if word in lower)

    text_score = 15 if char_count >= 1500 else 11 if char_count >= 800 else 6 if char_count >= 300 else 2
    contact_score = min(10, (4 if email else 0) + (4 if phone else 0) + (2 if linkedin else 0))
    section_count = sum(sections.values())
    section_score = min(15, section_count * 3)
    chronology_score = 10 if date_hits >= 6 else 7 if date_hits >= 3 else 3 if date_hits else 0
    achievement_score = min(20, quantified * 3 + min(action_hits, 6) + min(bullet_lines, 5))
    keyword_score = min(10, 4 + target_hits * 2) if target_words else min(10, 4 + min(len(set(words)) // 120, 6))

    layout_penalty = 0
    layout_notes = []
    if page_count > 2:
        layout_penalty += min(6, (page_count - 2) * 2)
        layout_notes.append(f"{page_count} halaman")
    if table_count:
        layout_penalty += min(5, table_count * 2)
        layout_notes.append(f"{table_count} tabel terdeteksi")
    if image_count > 1:
        layout_penalty += min(4, image_count - 1)
        layout_notes.append(f"{image_count} gambar terdeteksi")
    layout_score = max(0, 15 - layout_penalty)

    common_sizes = [size for size, _ in font_sizes.most_common(8)]
    readable_sizes = [size for size in common_sizes if 8 <= size <= 18]
    consistency_score = 5
    if len(page_sizes) > 1:
        consistency_score -= 2
    if font_sizes and len(readable_sizes) < max(1, len(common_sizes) // 2):
        consistency_score -= 2
    if len(font_names) > 5:
        consistency_score -= 1

    criteria = [
        _criterion("text", "Teks dapat dibaca ATS", 15, text_score, f"{char_count:,} karakter terbaca dari {page_count} halaman.", "Gunakan PDF berbasis teks, bukan scan atau gambar."),
        _criterion("contact", "Kontak utama", 10, contact_score, f"Email: {'ada' if email else 'tidak ada'}, telepon: {'ada' if phone else 'tidak ada'}, LinkedIn: {'ada' if linkedin else 'tidak ada'}.", "Cantumkan email profesional, nomor aktif, dan LinkedIn bila tersedia."),
        _criterion("sections", "Struktur bagian", 15, section_score, f"Bagian terdeteksi: {', '.join(name for name, found in sections.items() if found) or 'belum jelas'}.", "Gunakan judul standar: Ringkasan, Pengalaman, Pendidikan, Keahlian."),
        _criterion("chronology", "Tanggal dan kronologi", 10, chronology_score, f"{date_hits} penanda tahun atau periode ditemukan.", "Tulis bulan dan tahun secara konsisten untuk pengalaman dan pendidikan."),
        _criterion("achievements", "Dampak dan pencapaian", 20, achievement_score, f"{quantified} hasil terukur, {action_hits} kata kerja aksi, {bullet_lines} bullet terbaca.", "Ubah tugas menjadi pencapaian: tindakan, konteks, lalu hasil terukur tanpa mengarang."),
        _criterion("keywords", "Kata kunci posisi", 10, keyword_score, f"{target_hits} kata target cocok dengan label posisi." if target_words else "Belum ada posisi target spesifik untuk pembandingan.", "Sesuaikan skill dan istilah dengan lowongan yang dituju, hanya jika benar dimiliki."),
        _criterion("layout", "Format ramah ATS", 15, layout_score, ", ".join(layout_notes) or "Tidak ada masalah besar pada jumlah halaman, tabel, atau gambar.", "Pakai satu kolom, tanpa tabel kompleks, ikon sebagai informasi utama, header/footer penting, atau grafik skill."),
        _criterion("consistency", "Kerapihan dan konsistensi", 5, consistency_score, f"{len(font_names)} font internal, ukuran dominan: {', '.join(map(str, common_sizes[:5])) or 'tidak terbaca'}.", "Gunakan maksimal dua keluarga font, ukuran isi 10-12 pt, heading konsisten, dan jarak antarbagian seragam."),
    ]
    score = sum(item["score"] for item in criteria)
    rating = "excellent" if score >= 85 else "good" if score >= 70 else "needs_work" if score >= 55 else "weak"
    return {
        "score": score,
        "rating": rating,
        "criteria": criteria,
        "format": {
            "page_count": page_count,
            "table_count": table_count,
            "image_count": image_count,
            "font_count": len(font_names),
            "dominant_font_sizes": common_sizes[:5],
            "consistent_page_size": len(page_sizes) <= 1,
        },
        "disclaimer": "Skor ini audit heuristik transparan, bukan jaminan lolos ATS atau keputusan recruiter.",
    }


def build_external_optimization_prompt(cv_text: str, ats_report: dict, positions: list[str]) -> str:
    recommendations = "\n".join(
        f"- {item['label']}: {item['recommendation']}"
        for item in ats_report.get("criteria", [])
        if item.get("score", 0) < item.get("max_score", 0)
    )
    target = ", ".join(positions) or "posisi yang paling relevan dengan pengalaman kandidat"
    return f"""Bantu optimalkan CV berikut agar lebih mudah dibaca ATS dan recruiter untuk target: {target}.

ATURAN WAJIB:
1. Jangan mengarang pengalaman, angka, tanggal, jabatan, skill, pendidikan, sertifikasi, atau pencapaian.
2. Jika informasi penting tidak ada, tulis [TANYAKAN KANDIDAT: ...], jangan menebak.
3. Gunakan satu kolom, urutan: nama dan kontak, ringkasan profesional, keahlian inti, pengalaman, pendidikan, sertifikasi, bahasa.
4. Gunakan heading standar. Hindari tabel, text box, grafik skill, foto, ikon sebagai pengganti teks, header/footer penting, dan lebih dari dua font.
5. Ukuran halaman A4, margin 16-20 mm, font isi 10-11 pt, heading 12-14 pt, nama 18-22 pt, spasi baris 1.05-1.2.
6. Maksimal dua halaman. Gunakan bullet singkat dengan pola tindakan + konteks + hasil. Tambahkan angka hanya jika angka itu ada di CV sumber.
7. Masukkan kata kunci target secara alami hanya jika didukung fakta CV.
8. Keluarkan CV final lengkap yang siap ditempel ke Google Docs atau Microsoft Word, lalu jelaskan cara ekspor sebagai PDF dengan teks tetap dapat dipilih.

TEMUAN AUDIT ATS:
{recommendations or '- Pertahankan fakta dan buat format satu kolom yang konsisten.'}

CV SUMBER:
{cv_text[:14000]}
"""


def build_structured_optimization_prompt(cv_text: str, ats_report: dict, positions: list[str]) -> str:
    target = ", ".join(positions) or "role most supported by the CV"
    return f"""Rewrite this CV into accurate ATS-friendly structured data for target roles: {target}.

Never invent facts. Preserve names, employers, dates, education, skills, and metrics exactly. If a field is absent, use an empty string or empty list. Improve wording only. Return valid JSON only, no markdown.

JSON schema:
{{
  "name": "",
  "headline": "",
  "contact": {{"email": "", "phone": "", "location": "", "linkedin": ""}},
  "summary": "",
  "skills": [""],
  "experience": [{{"role": "", "company": "", "location": "", "start": "", "end": "", "bullets": [""]}}],
  "education": [{{"degree": "", "school": "", "location": "", "start": "", "end": "", "details": [""]}}],
  "certifications": [""],
  "languages": [""]
}}

Formatting rules applied by ORDAL: A4, one column, no tables, no photo, selectable text, 10-11 pt body, consistent headings, maximum two pages.

CV source:
{cv_text[:14000]}
"""


def parse_structured_cv(raw: str) -> dict:
    text = (raw or "").strip()
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError("AI tidak mengembalikan JSON CV yang bisa diproses.")
    data = json.loads(match.group(0))
    if not isinstance(data, dict) or not (data.get("name") or data.get("experience") or data.get("education")):
        raise ValueError("Struktur CV dari AI tidak lengkap.")
    return data


def _clean(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def render_optimized_pdf(data: dict, output_path: str) -> None:
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer
    except ImportError as exc:
        raise RuntimeError("Generator PDF belum terpasang. Gunakan prompt optimasi eksternal yang disediakan.") from exc

    styles = getSampleStyleSheet()
    body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.6, leading=11.5, textColor=colors.HexColor("#222222"), spaceAfter=3)
    small = ParagraphStyle("Small", parent=body, fontSize=8.7, leading=10.2, textColor=colors.HexColor("#444444"))
    name_style = ParagraphStyle("Name", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=22, alignment=TA_CENTER, textColor=colors.HexColor("#111111"), spaceAfter=4)
    headline_style = ParagraphStyle("Headline", parent=body, fontName="Helvetica-Bold", fontSize=10.5, leading=12.5, alignment=TA_CENTER, spaceAfter=3)
    contact_style = ParagraphStyle("Contact", parent=small, alignment=TA_CENTER, spaceAfter=8)
    heading = ParagraphStyle("Heading", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, leading=13, textColor=colors.HexColor("#111111"), spaceBefore=7, spaceAfter=4, borderWidth=0, borderColor=colors.HexColor("#333333"), borderPadding=(0, 0, 2, 0))
    item_title = ParagraphStyle("ItemTitle", parent=body, fontName="Helvetica-Bold", fontSize=9.8, leading=11.5, spaceAfter=1)
    bullet = ParagraphStyle("Bullet", parent=body, leftIndent=10, firstLineIndent=-7, bulletIndent=0, spaceAfter=2)

    doc = SimpleDocTemplate(output_path, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=15 * mm, bottomMargin=15 * mm, title=_clean(data.get("name")) or "Optimized CV", author="ORDAL")
    story = []

    def p(value, style=body):
        value = _clean(value)
        if value:
            story.append(Paragraph(escape(value), style))

    def section(title):
        story.append(Paragraph(escape(title.upper()), heading))

    p(data.get("name") or "CV", name_style)
    p(data.get("headline"), headline_style)
    contact = data.get("contact") or {}
    contact_line = " | ".join(_clean(contact.get(key)) for key in ("email", "phone", "location", "linkedin") if _clean(contact.get(key)))
    p(contact_line, contact_style)

    if _clean(data.get("summary")):
        section("Professional Summary")
        p(data.get("summary"))
    skills = [_clean(item) for item in (data.get("skills") or []) if _clean(item)]
    if skills:
        section("Core Skills")
        p(" | ".join(skills), small)

    experience = data.get("experience") or []
    if experience:
        section("Experience")
        for item in experience:
            title = " - ".join(part for part in (_clean(item.get("role")), _clean(item.get("company"))) if part)
            dates = " - ".join(part for part in (_clean(item.get("start")), _clean(item.get("end"))) if part)
            meta = " | ".join(part for part in (dates, _clean(item.get("location"))) if part)
            block = [Paragraph(escape(title), item_title)]
            if meta:
                block.append(Paragraph(escape(meta), small))
            for value in item.get("bullets") or []:
                clean = _clean(value)
                if clean:
                    block.append(Paragraph(f"- {escape(clean)}", bullet))
            story.append(KeepTogether(block))
            story.append(Spacer(1, 3))

    education = data.get("education") or []
    if education:
        section("Education")
        for item in education:
            title = " - ".join(part for part in (_clean(item.get("degree")), _clean(item.get("school"))) if part)
            meta = " | ".join(part for part in (" - ".join(filter(None, (_clean(item.get("start")), _clean(item.get("end"))))), _clean(item.get("location"))) if part)
            p(title, item_title)
            p(meta, small)
            for value in item.get("details") or []:
                clean = _clean(value)
                if clean:
                    story.append(Paragraph(f"- {escape(clean)}", bullet))

    for title, key in (("Certifications", "certifications"), ("Languages", "languages")):
        values = [_clean(item) for item in (data.get(key) or []) if _clean(item)]
        if values:
            section(title)
            p(" | ".join(values), small)

    doc.build(story)
    if not os.path.exists(output_path) or os.path.getsize(output_path) < 800:
        raise RuntimeError("PDF hasil optimasi gagal dibuat.")
