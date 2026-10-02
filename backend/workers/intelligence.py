from __future__ import annotations

import json
import re
from hashlib import sha256
from functools import lru_cache
from pathlib import Path
from typing import Any

from workers.match_utils import matches_position, normalize_text, parse_positions


REFERENCE_PATH = Path(__file__).resolve().parent.parent / "data" / "intelligence_v1.json"
WEIGHTS = {
    "role": 30,
    "skills": 25,
    "experience": 15,
    "location": 10,
    "salary": 10,
    "education": 5,
    "quality": 5,
}


@lru_cache(maxsize=1)
def reference_data() -> dict[str, Any]:
    with REFERENCE_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_reference_cache(connection) -> None:
    payload = json.dumps(reference_data(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    connection.execute(
        """INSERT INTO reference_cache(cache_key, version, payload, checksum, updated_at)
           VALUES ('intelligence', ?, ?, ?, datetime('now'))
           ON CONFLICT(cache_key) DO UPDATE SET
             version=excluded.version, payload=excluded.payload,
             checksum=excluded.checksum, updated_at=datetime('now')
           WHERE reference_cache.checksum != excluded.checksum""",
        (reference_data()["version"], payload, sha256(payload.encode("utf-8")).hexdigest()),
    )


def _phrases_found(text: str, phrases: list[str]) -> list[str]:
    haystack = f" {normalize_text(text)} "
    return sorted({phrase for phrase in phrases if f" {normalize_text(phrase)} " in haystack})


def _years(text: str) -> int:
    values = [int(value) for value in re.findall(r"\b(\d{1,2})\s*(?:\+\s*)?(?:tahun|years?|yrs?)\b", text.lower())]
    return max(values, default=0)


def normalize_cv(cv_text: str, target_positions: str = "") -> dict[str, Any]:
    refs = reference_data()
    text = cv_text or ""
    role_hits = {
        family: _phrases_found(f"{target_positions} {text}", roles)
        for family, roles in refs["roles"].items()
    }
    return {
        "version": refs["version"],
        "target_positions": parse_positions(target_positions),
        "role_families": sorted(family for family, hits in role_hits.items() if hits),
        "role_terms": sorted({item for hits in role_hits.values() for item in hits}),
        "skills": _phrases_found(text, refs["skills"]),
        "experience_years": _years(text),
        "education": _phrases_found(text, ["sma", "smk", "diploma", "d3", "d4", "sarjana", "s1", "s2", "bachelor", "master"]),
    }


def normalize_job(job: dict[str, Any]) -> dict[str, Any]:
    refs = reference_data()
    title = str(job.get("title") or job.get("job_title") or "").strip()
    description = str(job.get("description") or job.get("detail_text") or "").strip()
    combined = f"{title} {description}"
    role_hits = {
        family: _phrases_found(title, roles)
        for family, roles in refs["roles"].items()
    }
    return {
        "version": refs["version"],
        "title": title,
        "company": str(job.get("company") or "").strip(),
        "location": str(job.get("location") or job.get("job_location") or "").strip(),
        "work_mode": str(job.get("work_mode") or "").strip().lower(),
        "salary_min": int(job.get("salary_min") or 0),
        "salary_max": int(job.get("salary_max") or 0),
        "role_families": sorted(family for family, hits in role_hits.items() if hits),
        "skills": _phrases_found(combined, refs["skills"]),
        "experience_years": _years(combined),
        "education": _phrases_found(combined, ["sma", "smk", "diploma", "d3", "d4", "sarjana", "s1", "s2", "bachelor", "master"]),
        "description": description,
        "posted_at": str(job.get("posted_at") or ""),
    }


def hard_filter(candidate: dict[str, Any], job: dict[str, Any], preferences: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    title = job.get("title", "")
    targets = candidate.get("target_positions") or []
    if targets and not any(matches_position(title, target) for target in targets):
        reasons.append("Posisi tidak sesuai target")

    excluded_positions = parse_positions(str(preferences.get("excluded_positions") or ""))
    if any(matches_position(title, value) for value in excluded_positions):
        reasons.append("Posisi masuk daftar pengecualian")

    company = normalize_text(job.get("company", ""))
    excluded_companies = parse_positions(str(preferences.get("excluded_companies") or ""))
    if any(normalize_text(value) in company for value in excluded_companies if normalize_text(value)):
        reasons.append("Perusahaan masuk daftar pengecualian")

    required_mode = normalize_text(str(preferences.get("work_mode") or ""))
    if required_mode and job.get("work_mode") and required_mode != normalize_text(job["work_mode"]):
        reasons.append("Mode kerja tidak sesuai")
    return reasons


def score_match(candidate: dict[str, Any], job: dict[str, Any], preferences: dict[str, Any] | None = None) -> dict[str, Any]:
    preferences = preferences or {}
    blocked = hard_filter(candidate, job, preferences)
    if blocked:
        return {"eligible": False, "score": 0, "hard_filters": blocked, "criteria": {}}

    candidate_roles = set(candidate.get("role_families") or [])
    job_roles = set(job.get("role_families") or [])
    role = WEIGHTS["role"] if candidate_roles & job_roles else 0

    candidate_skills = set(candidate.get("skills") or [])
    job_skills = set(job.get("skills") or [])
    matched_skills = sorted(candidate_skills & job_skills)
    skill_ratio = len(matched_skills) / max(1, len(job_skills)) if job_skills else 1
    skills = round(WEIGHTS["skills"] * min(1, skill_ratio))

    required_years = int(job.get("experience_years") or 0)
    candidate_years = int(candidate.get("experience_years") or 0)
    experience = WEIGHTS["experience"] if not required_years or candidate_years >= required_years else round(WEIGHTS["experience"] * candidate_years / required_years)

    wanted_location = normalize_text(str(preferences.get("location") or ""))
    job_location = normalize_text(str(job.get("location") or ""))
    location = WEIGHTS["location"] if not wanted_location or wanted_location in job_location or "remote" in job_location else 0

    expected_salary = int(preferences.get("salary_min") or 0)
    offered_salary = int(job.get("salary_max") or job.get("salary_min") or 0)
    salary = WEIGHTS["salary"] if not expected_salary or not offered_salary or offered_salary >= expected_salary else 0

    required_education = set(job.get("education") or [])
    education = WEIGHTS["education"] if not required_education or required_education & set(candidate.get("education") or []) else 0
    quality = WEIGHTS["quality"] if job.get("description") else 2

    criteria = {
        "role": {"score": role, "max": WEIGHTS["role"]},
        "skills": {"score": skills, "max": WEIGHTS["skills"], "matched": matched_skills},
        "experience": {"score": experience, "max": WEIGHTS["experience"]},
        "location": {"score": location, "max": WEIGHTS["location"]},
        "salary": {"score": salary, "max": WEIGHTS["salary"]},
        "education": {"score": education, "max": WEIGHTS["education"]},
        "quality": {"score": quality, "max": WEIGHTS["quality"]},
    }
    return {
        "eligible": True,
        "score": sum(item["score"] for item in criteria.values()),
        "hard_filters": [],
        "criteria": criteria,
    }
