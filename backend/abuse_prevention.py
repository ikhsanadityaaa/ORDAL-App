import hashlib
import hmac
import os
from datetime import datetime, timezone

from fastapi import HTTPException

from database import get_db, query_one


DEFAULT_DISPOSABLE_DOMAINS = {
    "10minutemail.com",
    "guerrillamail.com",
    "maildrop.cc",
    "mailinator.com",
    "temp-mail.org",
    "tempmail.com",
    "yopmail.com",
}


def canonicalize_email(email: str) -> str:
    value = (email or "").strip().lower()
    if "@" not in value:
        return value
    local, domain = value.rsplit("@", 1)
    local = local.split("+", 1)[0]
    if domain in {"gmail.com", "googlemail.com"}:
        local = local.replace(".", "")
        domain = "gmail.com"
    return f"{local}@{domain}"


def assert_email_allowed(email: str) -> None:
    domain = canonicalize_email(email).rsplit("@", 1)[-1]
    configured = {
        item.strip().lower()
        for item in os.getenv("BLOCKED_EMAIL_DOMAINS", "").split(",")
        if item.strip()
    }
    if domain in DEFAULT_DISPOSABLE_DOMAINS | configured:
        raise HTTPException(
            status_code=400,
            detail="Email sementara tidak dapat dipakai. Gunakan email utama yang bisa kamu akses.",
        )


def _hash_signal(value: str) -> str:
    secret = os.getenv("ABUSE_HASH_SECRET", "").strip()
    if not secret:
        secret = "ordal-development-only"
    return hmac.new(secret.encode(), value.encode(), hashlib.sha256).hexdigest()


def email_signal(email: str) -> str:
    return _hash_signal(f"email:{canonicalize_email(email)}")


def device_signal(fingerprint: str) -> str:
    return _hash_signal(f"device:{fingerprint}")


def register_attempt_allowed(device_hash: str) -> None:
    row = query_one(
        "SELECT COUNT(*) AS n FROM app_abuse_events "
        "WHERE event_type = 'register_attempt' AND subject_hash = ? "
        "AND created_at > NOW() - INTERVAL '1 hour'",
        (device_hash,),
    )
    if row and int(row["n"] or 0) >= 5:
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak percobaan pendaftaran dari perangkat ini. Coba lagi satu jam lagi.",
        )


def login_attempt_allowed(email_hash: str, device_hash: str) -> None:
    email_row = query_one(
        "SELECT COUNT(*) AS n FROM app_abuse_events "
        "WHERE event_type = 'login_failed' AND subject_hash = ? "
        "AND created_at > NOW() - INTERVAL '15 minutes'",
        (email_hash,),
    )
    device_row = query_one(
        "SELECT COUNT(*) AS n FROM app_abuse_events "
        "WHERE event_type = 'login_failed' AND subject_hash = ? "
        "AND created_at > NOW() - INTERVAL '15 minutes'",
        (device_hash,),
    )
    if int((email_row or {}).get("n") or 0) >= 8 or int((device_row or {}).get("n") or 0) >= 20:
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak percobaan login. Coba lagi 15 menit lagi.",
        )


def record_event(event_type: str, subject_hash: str, user_id: str | None = None, detail: str = "") -> None:
    db = get_db()
    try:
        db.execute(
            "INSERT INTO app_abuse_events (event_type, subject_hash, user_id, detail) VALUES (?, ?, ?, ?)",
            (event_type, subject_hash, user_id, detail[:500]),
        )
        db.commit()
    finally:
        db.close()


def claim_trial(user_id: str, email: str, fingerprint: str) -> dict:
    canonical_hash = email_signal(email)
    hardware_hash = device_signal(fingerprint)
    db = get_db()
    try:
        existing = db.execute(
            "SELECT user_id FROM app_trial_grants WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if existing:
            return {"email_hash": canonical_hash, "device_hash": hardware_hash}

        email_owner = db.execute(
            "SELECT user_id FROM app_trial_grants WHERE canonical_email_hash = ?",
            (canonical_hash,),
        ).fetchone()
        device_owner = db.execute(
            "SELECT user_id FROM app_trial_grants WHERE device_hash = ?",
            (hardware_hash,),
        ).fetchone()
        if (email_owner and email_owner["user_id"] != user_id) or (
            device_owner and device_owner["user_id"] != user_id
        ):
            db.execute(
                "INSERT INTO app_abuse_events (event_type, subject_hash, user_id, detail) "
                "VALUES ('trial_denied', ?, ?, ?)",
                (
                    hardware_hash,
                    user_id,
                    "canonical_email_reused" if email_owner else "device_reused",
                ),
            )
            db.commit()
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "TRIAL_NOT_ELIGIBLE",
                    "message": "Trial gratis sudah pernah dipakai oleh identitas atau perangkat ini.",
                },
            )

        db.execute(
            "INSERT INTO app_trial_grants (user_id, canonical_email_hash, device_hash) VALUES (?, ?, ?)",
            (user_id, canonical_hash, hardware_hash),
        )
        db.commit()
        return {"email_hash": canonical_hash, "device_hash": hardware_hash}
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def abuse_summary(user_id: str) -> dict:
    row = query_one(
        "SELECT granted_at FROM app_trial_grants WHERE user_id = ?",
        (user_id,),
    )
    granted_at = row.get("granted_at") if row else None
    if isinstance(granted_at, datetime):
        granted_at = granted_at.astimezone(timezone.utc).isoformat()
    return {"trial_identity_bound": bool(row), "trial_bound_at": granted_at}
