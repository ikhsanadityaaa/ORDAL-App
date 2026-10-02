from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

from workers.intelligence import normalize_cv, reference_data
from workers.match_utils import normalize_text, parse_positions


def _json(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value or "")
    except (json.JSONDecodeError, TypeError):
        return fallback


def _percent(value: float) -> int:
    return max(0, min(100, round(value)))


def build_career_progress(connection, user_id: str) -> dict[str, Any]:
    cvs = connection.execute(
        "SELECT * FROM cvs WHERE user_id = ? ORDER BY created_at DESC, id DESC", (user_id,)
    ).fetchall()
    targets = connection.execute(
        "SELECT * FROM job_targets WHERE user_id = ? AND active = 1 ORDER BY id", (user_id,)
    ).fetchall()
    queue = connection.execute(
        "SELECT platform, job_title, company, match_score, status FROM application_queue WHERE user_id = ? AND status != 'removed'",
        (user_id,),
    ).fetchall()
    applications = connection.execute(
        """SELECT l.platform, l.match_score
           FROM apply_logs l JOIN apply_sessions s ON s.id = l.session_id
           WHERE s.user_id = ? AND l.status = 'applied' AND l.confirmed_at IS NOT NULL""",
        (user_id,),
    ).fetchall()
    connected = connection.execute(
        "SELECT COUNT(*) FROM user_credentials WHERE user_id = ? AND cookie_valid = 1", (user_id,)
    ).fetchone()[0]
    answer_count = connection.execute(
        "SELECT COUNT(*) FROM question_bank WHERE user_id = ?", (user_id,)
    ).fetchone()[0]

    best_cv = None
    best_ats = 0
    for row in cvs:
        report = _json(row["ats_report"], {})
        score = int(report.get("score") or 0)
        if best_cv is None or score > best_ats:
            best_cv, best_ats = row, score

    target_text = ", ".join(str(row["position"] or "") for row in targets)
    candidate = normalize_cv(str(best_cv["cv_text"] or "") if best_cv else "", target_text)
    profile_score = _percent(
        (30 if candidate["role_terms"] else 0)
        + min(35, len(candidate["skills"]) * 5)
        + (20 if candidate["experience_years"] else 0)
        + (10 if candidate["education"] else 0)
        + (5 if best_cv and len(str(best_cv["cv_text"] or "")) >= 500 else 0)
    )

    target_scores = []
    for row in targets:
        target_scores.append(sum((
            20 if row["position"] else 0,
            20 if row["location"] else 0,
            20 if row["platform"] else 0,
            15 if row["employment_type"] else 0,
            15 if row["expected_salary"] else 0,
            10 if row["available_join"] else 0,
        )))
    target_score = _percent(sum(target_scores) / len(target_scores)) if target_scores else 0

    cover_letter_ready = any(str(row["cover_letter"] or "").strip() for row in targets)
    application_score = _percent(
        (30 if connected else 0)
        + (25 if cover_letter_ready else 0)
        + min(25, answer_count * 5)
        + (20 if best_cv and targets else 0)
    )
    cv_score = best_ats if best_cv else 0
    overall = _percent(profile_score * 0.30 + cv_score * 0.30 + target_score * 0.25 + application_score * 0.15)

    queue_scores = [int(row["match_score"] or 0) for row in queue if row["match_score"] is not None]
    average_match = _percent(sum(queue_scores) / len(queue_scores)) if queue_scores else None
    if len(queue_scores) < 5:
        reality = {
            "status": "learning",
            "title": "Belum cukup data pasar",
            "message": "ORDAL perlu sedikitnya 5 lowongan yang sudah dianalisis sebelum menilai kekuatan targetmu.",
            "title_en": "Not enough market data yet",
            "message_en": "ORDAL needs at least 5 analyzed jobs before assessing how your target performs.",
            "sample_size": len(queue_scores),
        }
    elif average_match >= 75:
        reality = {
            "status": "aligned",
            "title": "Targetmu terlihat selaras",
            "message": f"Rata-rata kecocokan {average_match}% dari {len(queue_scores)} lowongan. Pertahankan target, lalu tinjau kualitas peluangnya.",
            "title_en": "Your target looks aligned",
            "message_en": f"Average match is {average_match}% across {len(queue_scores)} jobs. Keep the target and review opportunity quality.",
            "sample_size": len(queue_scores),
        }
    elif average_match >= 55:
        reality = {
            "status": "developing",
            "title": "Targetmu masuk akal, tetapi masih bisa diperkuat",
            "message": f"Rata-rata kecocokan {average_match}% dari {len(queue_scores)} lowongan. Periksa skill dan bukti yang paling sering belum cocok.",
            "title_en": "Your target is reasonable but can be strengthened",
            "message_en": f"Average match is {average_match}% across {len(queue_scores)} jobs. Review the skills and evidence most often missing.",
            "sample_size": len(queue_scores),
        }
    else:
        reality = {
            "status": "ambitious",
            "title": "Targetmu cukup ambisius untuk profil saat ini",
            "message": f"Rata-rata kecocokan {average_match}% dari {len(queue_scores)} lowongan. Kamu tetap boleh mengejarnya sambil memperkuat CV, skill, atau rentang target.",
            "title_en": "Your target is ambitious for the current profile",
            "message_en": f"Average match is {average_match}% across {len(queue_scores)} jobs. You can keep pursuing it while strengthening your CV, skills, or target range.",
            "sample_size": len(queue_scores),
        }

    target_terms = {normalize_text(value) for value in parse_positions(target_text)}
    stretch = []
    for family in candidate["role_families"]:
        for role in reference_data()["roles"].get(family, []):
            if normalize_text(role) not in target_terms:
                stretch.append({
                    "role": role.title(),
                    "reason": f"Masih satu keluarga peran {family.replace('_', ' ')} dengan profil CV-mu.",
                    "reason_en": f"This role shares the {family.replace('_', ' ')} family found in your CV.",
                })
            if len(stretch) == 3:
                break
        if len(stretch) == 3:
            break

    source_rows: dict[str, dict[str, Any]] = defaultdict(lambda: {"found": 0, "strong": 0, "applied": 0, "scores": []})
    for row in queue:
        source = source_rows[str(row["platform"])]
        score = int(row["match_score"] or 0)
        source["found"] += 1
        source["strong"] += int(score >= 80)
        source["scores"].append(score)
    for row in applications:
        source_rows[str(row["platform"])]["applied"] += 1
    source_performance = []
    for platform, values in source_rows.items():
        source_performance.append({
            "platform": platform,
            "found": values["found"],
            "strong": values["strong"],
            "applied": values["applied"],
            "average_match": _percent(sum(values["scores"]) / len(values["scores"])) if values["scores"] else None,
        })
    source_performance.sort(key=lambda item: (item["strong"], item["average_match"] or 0, item["found"]), reverse=True)

    strong_count = sum(1 for score in queue_scores if score >= 80)
    milestones = [
        {"key": "cv", "label": "CV pertama siap", "label_en": "First CV ready", "complete": bool(cvs)},
        {"key": "ats", "label": "CV mencapai skor ATS 70+", "label_en": "CV reaches ATS score 70+", "complete": best_ats >= 70},
        {"key": "target", "label": "Target kerja aktif", "label_en": "Active job target", "complete": bool(targets)},
        {"key": "platform", "label": "Platform kerja terhubung", "label_en": "Job platform connected", "complete": connected > 0},
        {"key": "strong_match", "label": "Kecocokan kuat pertama", "label_en": "First strong match", "complete": strong_count > 0},
        {"key": "application", "label": "Lamaran pertama terkirim", "label_en": "First application sent", "complete": bool(applications)},
    ]

    recommendations = []
    if not cvs:
        recommendations.append({"id": "Unggah CV agar ORDAL bisa membaca kekuatan profilmu.", "en": "Upload a CV so ORDAL can read your profile strengths."})
    elif best_ats < 70:
        recommendations.append({"id": "Naikkan kesiapan ATS CV ke minimal 70 dengan memperjelas struktur dan pencapaian terukur.", "en": "Raise CV ATS readiness to at least 70 by clarifying structure and measurable achievements."})
    if not targets:
        recommendations.append({"id": "Buat target posisi, lokasi, dan platform agar pencarian punya arah jelas.", "en": "Set a target role, location, and platform to give the search a clear direction."})
    elif target_score < 80:
        recommendations.append({"id": "Lengkapi gaji harapan dan waktu mulai agar filter lowongan lebih tepat.", "en": "Complete expected salary and availability so job filters are more precise."})
    if not connected:
        recommendations.append({"id": "Hubungkan minimal satu platform kerja sebelum memulai pencarian.", "en": "Connect at least one job platform before starting a search."})
    if answer_count < 3:
        recommendations.append({"id": "Isi bank jawaban untuk mengurangi interupsi saat formulir lamaran muncul.", "en": "Fill the answer bank to reduce interruptions during application forms."})

    return {
        "overall": overall,
        "dimensions": {
            "profile_strength": profile_score,
            "cv_readiness": cv_score,
            "target_readiness": target_score,
            "application_readiness": application_score,
        },
        "evidence": {
            "cv_count": len(cvs),
            "best_cv": best_cv["file_name"] if best_cv else None,
            "active_targets": len(targets),
            "connected_platforms": connected,
            "saved_answers": answer_count,
            "jobs_analyzed": len(queue_scores),
            "strong_matches": strong_count,
            "applications": len(applications),
        },
        "milestones": milestones,
        "reality_check": reality,
        "stretch_opportunities": stretch,
        "source_performance": source_performance,
        "recommendations": recommendations[:4],
    }
