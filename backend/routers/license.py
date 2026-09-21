"""ORDAL v3.1 — Lisensi: free trial 3 hari + pembayaran (QRIS BCA / PayPal)
+ activation code (tersimpan di server per email user, kompatibel dengan
kolom "User"."activationCode" milik ORDAL-Web).

Alur:
1. TRIAL 3 HARI dimulai saat user pertama kali klik "Cari Kerja"
   (POST /api/trial/start — lazy, TIDAK dibuat saat register).
   Karena trial tercatat di DB pusat per akun, install ulang app /
   ganti komputer TIDAK mereset trial (guard anti-restart).
2. Trial habis → semua akses auto-apply diblokir server-side (403
   TRIAL_EXPIRED) → app menampilkan pop-up pembayaran.
3. Pembayaran QRIS (BCA, via Midtrans kalau dikonfigurasi, atau transfer
   manual ke rekening BCA + verifikasi admin) atau PayPal (Orders API).
   Verifikasi instan: webhook Midtrans / polling gateway / satu-klik
   admin → user langsung melihat status VERIFIED di app (polling 3 dtk).
4. Setelah verified → activation code personal (ORD-XXXX-XXXX-XXXX)
   diterbitkan (idempotent — satu kode per user selamanya, persis logika
   web), dikirim ke email user, dan bisa dimasukkan ke app.
5. Activation code dipakai untuk membuka app (masukkan via pop-up).
   Lupa kode → POST /api/activation/resend → kode dikirim ulang ke email.
6. Kode admin (env ADMIN_ACTIVATION_CODE) bisa dipakai untuk membuka
   akun mana pun — untuk testing.

Env baru (lihat .env.example):
  TRIAL_HOURS=72
  LICENSE_PRICE_IDR=179000
  LICENSE_PRICE_USD=12.00
  LICENSE_DURATION_DAYS=0            # 0 = selamanya
  INVOICE_TTL_MINUTES=60
  PAYMENTS_SIMULATION=false          # true = mode demo (tombol simulasi)
  ADMIN_ACTIVATION_CODE=ORD-ADMIN-XXXXXX
  ADMIN_TOKEN=...                    # utk endpoint /api/admin/*
  ADMIN_EMAIL=...                    # notifikasi pembayaran manual
  BCA_ACCOUNT_NAME= / BCA_ACCOUNT_NUMBER= / BCA_QRIS_IMAGE=
  PAYPAL_CLIENT_ID= / PAYPAL_CLIENT_SECRET= / PAYPAL_PRODUCTION=false # sama dengan ORDAL-Web
  PAYPAL_ME_LINK=                    # fallback tanpa API (paypal.me/...)
  MIDTRANS_SERVER_KEY= / MIDTRANS_PRODUCTION=false # sama dengan ORDAL-Web
"""
import base64
import hashlib
import os
import secrets
import string
import threading
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import get_db, query_one, query_all
from auth_utils import get_current_user
from services.email_sender import (
    is_smtp_configured,
    send_activation_email,
    send_admin_notification,
)
from abuse_prevention import abuse_summary, claim_trial
from auth_utils import get_device_fingerprint

router = APIRouter()

# ── Konfigurasi ───────────────────────────────────────────────────────────
TRIAL_HOURS = float(os.getenv("TRIAL_HOURS", "72") or 72)
LICENSE_PRICE_IDR = int(os.getenv("LICENSE_PRICE_IDR", "179000") or 179000)
LICENSE_PRICE_USD = float(os.getenv("LICENSE_PRICE_USD", "12.00") or 12.00)
LICENSE_DURATION_DAYS = int(os.getenv("LICENSE_DURATION_DAYS", "0") or 0)
INVOICE_TTL_MINUTES = int(os.getenv("INVOICE_TTL_MINUTES", "60") or 60)
PAYMENTS_SIMULATION = os.getenv("PAYMENTS_SIMULATION", "").strip().lower() in ("1", "true", "yes", "on")
ADMIN_ACTIVATION_CODE = os.getenv("ADMIN_ACTIVATION_CODE", "").strip().upper()
ADMIN_TOKEN_ENV = os.getenv("ADMIN_TOKEN", "").strip()
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip()
BCA_ACCOUNT_NAME = os.getenv("BCA_ACCOUNT_NAME", "").strip()
BCA_ACCOUNT_NUMBER = os.getenv("BCA_ACCOUNT_NUMBER", "").strip()
BCA_QRIS_IMAGE = os.getenv("BCA_QRIS_IMAGE", "").strip()
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "").strip()
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "").strip()
PAYPAL_MODE = os.getenv("PAYPAL_MODE", "").strip().lower() or (
    "live" if os.getenv("PAYPAL_PRODUCTION", "").strip().lower() in ("1", "true", "yes", "on") else "sandbox"
)
PAYPAL_ME_LINK = os.getenv("PAYPAL_ME_LINK", "").strip()
MIDTRANS_SERVER_KEY = os.getenv("MIDTRANS_SERVER_KEY", "").strip()
MIDTRANS_IS_PRODUCTION = (
    os.getenv("MIDTRANS_IS_PRODUCTION", "").strip().lower()
    or os.getenv("MIDTRANS_PRODUCTION", "").strip().lower()
) in ("1", "true", "yes", "on")

CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_resend_lock = threading.Lock()
_activation_resend_last: dict[str, datetime] = {}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(dt) -> datetime:
    """Pastikan datetime aware-UTC (psycopg2 kadang kirim naive)."""
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _fmt_idr(amount: int) -> str:
    return f"Rp {amount:,}".replace(",", ".")


def _mask_email(email: str) -> str:
    try:
        name, domain = email.split("@")
    except ValueError:
        return "***"
    if len(name) <= 1:
        return f"*@{domain}"
    return f"{name[0]}{'•' * max(2, len(name) - 1)}@{domain}"


# ── Admin token: env atau auto-generate sekali (disimpan app_secrets) ─────
def _get_admin_token() -> str:
    if ADMIN_TOKEN_ENV:
        return ADMIN_TOKEN_ENV
    row = query_one("SELECT value FROM app_secrets WHERE key = 'admin_token'")
    if row and row.get("value"):
        return row["value"]
    token = "ordal-admin-" + secrets.token_hex(12)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO app_secrets (key, value) VALUES ('admin_token', ?) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (token,),
        )
        db.commit()
    finally:
        db.close()
    # Audit Phase 1 temuan S6: token TIDAK lagi dicetak penuh ke stdout
    # (bocor ke log proses). Tampilkan versi tersamar + cara mengambilnya.
    masked = token[:12] + "…" + f"({len(token)} karakter)"
    print(f"[ADMIN] ADMIN_TOKEN belum di-set → token baru dibuat: {masked}")
    print("[ADMIN] Token lengkap tersimpan di tabel app_secrets (key='admin_token'); "
          "set ADMIN_TOKEN di .env untuk kontrol penuh.")
    return token


def _require_admin(request: Request):
    token = (request.headers.get("X-Admin-Token") or "").strip()
    if not token or token != _get_admin_token():
        raise HTTPException(status_code=401, detail="Admin token tidak valid (header X-Admin-Token)")


# ── Status akses (dipakai juga oleh sessions.py & scheduler) ──────────────
def _get_license(user_id: str) -> dict | None:
    row = query_one(
        "SELECT code, method, payment_id, activated_at, expires_at FROM app_licenses WHERE user_id = ?",
        (user_id,),
    )
    if not row:
        return None
    expires_at = row.get("expires_at")
    if expires_at and _utcnow() > _as_aware(expires_at):
        return None  # lisensi kedaluwarsa → dianggap tidak ada
    return {
        "code": row["code"],
        "method": row.get("method") or "payment",
        "activated_at": row.get("activated_at"),
        "expires_at": expires_at,
    }


def _get_trial(user_id: str) -> dict | None:
    row = query_one(
        'SELECT "startedAt", "expiresAt", "status" FROM "Trial" WHERE "userId" = ?',
        (user_id,),
    )
    if not row:
        return None
    expires_at = _as_aware(row["expiresAt"])
    started_at = _as_aware(row["startedAt"])
    minimum_expiry = started_at + timedelta(hours=TRIAL_HOURS)
    if expires_at < minimum_expiry:
        expires_at = minimum_expiry
        upgraded_status = "active" if expires_at > _utcnow() else "expired"
        db = get_db()
        try:
            db.execute(
                'UPDATE "Trial" SET "expiresAt" = ?, "status" = ?, "updatedAt" = NOW() WHERE "userId" = ?',
                (expires_at, upgraded_status, user_id),
            )
            db.commit()
        finally:
            db.close()
    remaining = int((expires_at - _utcnow()).total_seconds())
    status = "active"
    if remaining <= 0:
        status = "expired"
        if row["status"] != "expired":
            db = get_db()
            try:
                db.execute('UPDATE "Trial" SET "status" = ?, "updatedAt" = NOW() WHERE "userId" = ?', ("expired", user_id))
                db.commit()
            finally:
                db.close()
    return {
        "started": True,
        "started_at": started_at.isoformat(),
        "expires_at": expires_at.isoformat(),
        "remaining_seconds": max(0, remaining),
        "status": status,
    }


def get_access_status(user_id: str) -> dict:
    """Status akses lengkap: license + trial + apakah boleh pakai fitur apply."""
    license_info = _get_license(user_id)
    if license_info:
        trial = _get_trial(user_id)
        return {
            "activated": True,
            "license": {
                "code": license_info["code"],
                "code_masked": _mask_license_code(license_info["code"]),
                "method": license_info["method"],
                "activated_at": license_info["activated_at"].isoformat() if isinstance(license_info["activated_at"], datetime) else license_info["activated_at"],
                "expires_at": license_info["expires_at"].isoformat() if isinstance(license_info["expires_at"], datetime) else license_info["expires_at"],
            },
            "trial": trial,
            "access": {"allowed": True, "reason": "activated"},
        }
    trial = _get_trial(user_id)
    if trial is None:
        return {
            "activated": False,
            "license": None,
            "trial": {"started": False, "status": "not_started"},
            "access": {"allowed": True, "reason": "not_started"},  # trial belum dimulai → masih bisa mulai
        }
    if trial["status"] == "active":
        return {
            "activated": False,
            "license": None,
            "trial": trial,
            "access": {"allowed": True, "reason": "trial_active"},
        }
    return {
        "activated": False,
        "license": None,
        "trial": trial,
        "access": {"allowed": False, "reason": "trial_expired"},
    }


def _mask_license_code(code: str) -> str:
    """ORD-ABCD-EFGH-JKLM → ORD-••••-••••-JKLM (segmen terakhir terlihat)."""
    parts = code.split("-")
    if len(parts) == 4:
        return f"{parts[0]}-••••-••••-{parts[3]}"
    if len(parts) == 3:  # kode admin: ORD-ADMIN-XXXXXX
        return f"{parts[0]}-{parts[1]}-••••"
    return code[:6] + "••••"


def ensure_trial_started(user_id: str) -> tuple[dict, bool]:
    """Mulai trial kalau belum pernah dimulai (idempotent). Return (status, just_started).
    Dipanggil saat user klik 'Cari Kerja' — trial TIDAK dimulai saat register,
    jadi user punya waktu penuh 3 hari sejak pemakaian pertama."""
    user = query_one('SELECT "email" FROM "User" WHERE "id" = ?', (user_id,))
    if not user:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    claim_trial(user_id, user["email"], get_device_fingerprint())

    existing = query_one('SELECT "id" FROM "Trial" WHERE "userId" = ?', (user_id,))
    if existing:
        return get_access_status(user_id), False
    db = get_db()
    try:
        db.execute(
            'INSERT INTO "Trial" ("id", "userId", "startedAt", "expiresAt", "status", "createdAt", "updatedAt") '
            f"VALUES (?, ?, NOW(), NOW() + INTERVAL '{max(TRIAL_HOURS, 0.01)} hours', 'active', NOW(), NOW())",
            (_gen_cuid_like(), user_id),
        )
        db.commit()
    except Exception:
        db.rollback()
        # race: baris sudah dibuat proses lain → abaikan
        pass
    finally:
        db.close()
    return get_access_status(user_id), True


def require_access(user_id: str) -> dict:
    """Guard server-side untuk semua fitur auto-apply.
    Raise 403 TRIAL_EXPIRED kalau trial habis & belum aktivasi."""
    status = get_access_status(user_id)
    if not status["access"]["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "TRIAL_EXPIRED",
                "message": "Trial gratis sudah berakhir. Aktivasi untuk melanjutkan menggunakan ORDAL.",
            },
        )
    return status


def _gen_cuid_like() -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    return "c" + "".join(secrets.choice(alphabet) for _ in range(24))


# ── Endpoint trial ────────────────────────────────────────────────────────
@router.get("/api/trial/status")
def trial_status(user=Depends(get_current_user)):
    st = get_access_status(user["id"])
    st["abuse_protection"] = abuse_summary(user["id"])
    st["pricing"] = {
        "idr": LICENSE_PRICE_IDR,
        "usd": LICENSE_PRICE_USD,
        "display_idr": _fmt_idr(LICENSE_PRICE_IDR),
        "display_usd": f"US$ {LICENSE_PRICE_USD:.2f}",
        "duration_days": LICENSE_DURATION_DAYS,
    }
    st["payments_simulated"] = PAYMENTS_SIMULATION
    st["payment_options"] = {
        "qris_bca": {
            "available": True,
            "dynamic_qris": bool(MIDTRANS_SERVER_KEY),
            "account_name": BCA_ACCOUNT_NAME or None,
            "account_number": BCA_ACCOUNT_NUMBER or None,
        },
        "paypal": {
            "available": True,
            "api": bool(PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET),
            "me_link": PAYPAL_ME_LINK or None,
        },
    }
    return st


@router.post("/api/trial/start")
def trial_start(user=Depends(get_current_user)):
    """Dipanggil saat user klik 'Cari Kerja'. Mulai trial sekali saja (server-side,
    anti-restart: install ulang app tidak reset trial)."""
    st, just_started = ensure_trial_started(user["id"])
    if not st["access"]["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "TRIAL_EXPIRED",
                "message": "Trial gratis sudah berakhir. Aktivasi untuk melanjutkan menggunakan ORDAL.",
                "status": st,
            },
        )
    st["just_started"] = just_started
    return st


# ── Helpers payment ───────────────────────────────────────────────────────
def _gen_payment_id() -> str:
    return "PAY-" + "".join(secrets.choice(CODE_CHARSET) for _ in range(8))


def _gen_reference() -> str:
    return "ORD" + "".join(secrets.choice(string.digits) for _ in range(6))


def _issue_activation_code(db, user_id: str) -> tuple[str, bool]:
    """Terbitkan kode activation personal (ORD-XXXX-XXXX-XXXX) — idempotent:
    kalau user sudah punya kode, pakai kode lama (PERSIS logika /api/activation/generate
    di ORDAL-Web: satu kode per user selamanya, tidak pernah diganti)."""
    row = query_one('SELECT "activationCode" FROM "User" WHERE "id" = ?', (user_id,))
    existing = (row or {}).get("activationCode")
    if existing:
        return existing, True
    for _ in range(5):
        seg = lambda: "".join(secrets.choice(CODE_CHARSET) for _ in range(4))  # noqa: E731
        code = f"ORD-{seg()}-{seg()}-{seg()}"
        clash = query_one('SELECT "id" FROM "User" WHERE "activationCode" = ?', (code,))
        if not clash:
            db.execute(
                'UPDATE "User" SET "activationCode" = ?, "updatedAt" = NOW() WHERE "id" = ?',
                (code, user_id),
            )
            db.commit()
            return code, False
    raise HTTPException(status_code=500, detail="Gagal membuat kode aktivasi, coba lagi")


def _mark_payment_verified(payment_id: str, gateway_ref: str | None = None, note: str | None = None) -> dict:
    """Tandai pembayaran verified (idempotent) + terbitkan kode activation
    + kirim email ke user. Dipanggil dari: webhook Midtrans, polling gateway,
    simulasi, dan verifikasi admin."""
    p = query_one("SELECT * FROM app_payments WHERE id = ?", (payment_id,))
    if not p:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")
    user = query_one('SELECT "email", "name", "activationCode" FROM "User" WHERE "id" = ?', (p["user_id"],))

    if p["status"] == "verified":
        # sudah verified sebelumnya — pastikan kode tetap tersedia
        code = (user or {}).get("activationCode") or ""
        return {"activation_code": code, "email_sent": False, "already": True}

    db = get_db()
    try:
        db.execute(
            "UPDATE app_payments SET status = 'verified', verified_at = NOW(), "
            "gateway_ref = COALESCE(?, gateway_ref), note = COALESCE(?, note) WHERE id = ?",
            (gateway_ref, note, payment_id),
        )
        db.commit()
        code, _already = _issue_activation_code(db, p["user_id"])
    finally:
        db.close()

    email_sent = False
    dev_code = None
    if is_smtp_configured() and user and user.get("email"):
        try:
            send_activation_email(user["email"], code, _fmt_idr(p["amount"]))
            email_sent = True
        except Exception as e:
            print(f"[WARN] Gagal kirim email activation: {e}")
            dev_code = code  # fallback supaya user tetap bisa melihat kode di app
    elif user and user.get("email"):
        dev_code = code  # mode pengembangan: SMTP belum diisi → kode tampil di app
    return {"activation_code": code, "email_sent": email_sent, "dev_code": dev_code}


def _expire_stale_invoice(p: dict) -> dict:
    """Invoice pending/verifying yang lewat TTL → tandai expired (lazy)."""
    if p["status"] in ("pending", "verifying") and p.get("expires_at"):
        if _utcnow() > _as_aware(p["expires_at"]):
            db = get_db()
            try:
                db.execute("UPDATE app_payments SET status = 'expired' WHERE id = ?", (p["id"],))
                db.commit()
            finally:
                db.close()
            p = dict(p)
            p["status"] = "expired"
    return p


def _serialize_payment(p: dict, user_id: str) -> dict:
    """Bentuk response pembayaran untuk frontend (termasuk instruksi + kode)."""
    currency = p.get("currency") or "IDR"
    if currency == "USD" and p.get("amount_usd"):
        amount_display = f"US$ {float(p['amount_usd']):.2f}"
    else:
        amount_display = _fmt_idr(int(p["amount"]))
    out = {
        "id": p["id"],
        "method": p["method"],
        "status": p["status"],
        "gateway": p.get("gateway") or "manual",
        "amount": int(p["amount"]),
        "base_amount": int(p["base_amount"]),
        "unique_suffix": int(p.get("unique_suffix") or 0),
        "amount_display": amount_display,
        "reference": p["reference"],
        "qr_string": p.get("qr_string"),
        "qr_url": p.get("qr_url"),
        "approve_url": p.get("approve_url"),
        "expires_at": p["expires_at"].isoformat() if isinstance(p.get("expires_at"), datetime) else p.get("expires_at"),
        "created_at": p["created_at"].isoformat() if isinstance(p.get("created_at"), datetime) else p.get("created_at"),
        "verified_at": p["verified_at"].isoformat() if isinstance(p.get("verified_at"), datetime) else p.get("verified_at"),
    }
    # Instruksi khusus per metode
    if p["method"] == "qris_bca":
        out["instructions"] = {
            "channel": "QRIS — Bank BCA",
            "use_dynamic_qris": p.get("gateway") == "midtrans",
            "account_name": BCA_ACCOUNT_NAME or None,
            "account_number": BCA_ACCOUNT_NUMBER or None,
            "static_qris_url": _static_qris_url(),
            "exact_amount": out["amount_display"],
            "reference": p["reference"],
            "steps": [
                f"Buka aplikasi mobile banking / e-wallet apa pun yang mendukung QRIS",
                f"Scan QR dan bayar tepat sebesar {out['amount_display']}",
                f"Pembayaran terverifikasi otomatis — jangan tutup jendela ini",
            ] if p.get("gateway") == "midtrans" else [
                f"Transfer BCA ke a.n. {BCA_ACCOUNT_NAME or '(set BCA_ACCOUNT_NAME di .env)'} — "
                f"No. Rek {BCA_ACCOUNT_NUMBER or '(set BCA_ACCOUNT_NUMBER di .env)'}",
                f"Nominal HARUS PERSIS {out['amount_display']} (termasuk 3 angka unik di belakang)",
                f"Masukkan BERITA/REFERENCE: {p['reference']}",
                f"Klik tombol 'Saya Sudah Bayar' setelah transfer berhasil",
            ],
        }
    elif p["method"] == "paypal":
        out["instructions"] = {
            "channel": "PayPal",
            "use_api": p.get("gateway") == "paypal",
            "amount_display": f"US$ {float(p.get('amount_usd') or LICENSE_PRICE_USD):.2f}",
            "me_link": PAYPAL_ME_LINK or None,
            "steps": [
                f"Klik tombol 'Bayar dengan PayPal' — kamu akan diarahkan ke PayPal",
                f"Login dan selesaikan pembayaran US$ {float(p.get('amount_usd') or LICENSE_PRICE_USD):.2f}",
                f"Kembali ke app — status pembayaran dicek otomatis",
            ] if p.get("gateway") == "paypal" else [
                f"Bayar via PayPal ke {PAYPAL_ME_LINK or '(set PAYPAL_ME_LINK di .env)'}",
                f"Nominal US$ {float(p.get('amount_usd') or LICENSE_PRICE_USD):.2f}",
                f"Simpan bukti transfer lalu klik 'Saya Sudah Bayar'",
            ],
        }
    # Kode activation tampil setelah verified (juga dikirim via email)
    if p["status"] == "verified":
        u = query_one('SELECT "activationCode" FROM "User" WHERE "id" = ?', (user_id,))
        if u and u.get("activationCode"):
            out["activation"] = {"code": u["activationCode"]}
    return out


def _static_qris_url() -> str | None:
    """Gambar QRIS statis BCA milik owner (env BCA_QRIS_IMAGE = path file atau URL).
    Path file di-copy ke uploads supaya bisa di-serve dari /uploads/qris-bca.png."""
    if not BCA_QRIS_IMAGE:
        return None
    if BCA_QRIS_IMAGE.startswith(("http://", "https://", "/")):
        return BCA_QRIS_IMAGE
    import os as _os
    import shutil
    if not _os.path.exists(BCA_QRIS_IMAGE):
        return None
    try:
        from database import get_data_dir
        dest = _os.path.join(get_data_dir(), "uploads", "qris-bca.png")
        if not _os.path.exists(dest) or _os.path.getmtime(BCA_QRIS_IMAGE) > _os.path.getmtime(dest):
            shutil.copyfile(BCA_QRIS_IMAGE, dest)
        return "/uploads/qris-bca.png"
    except Exception as e:
        print(f"[WARN] Gagal copy QRIS statis: {e}")
        return None


# ── Gateway: Midtrans (QRIS dinamis — verifikasi instan via webhook/poll) ──
def _midtrans_base() -> str:
    return "https://api.midtrans.com" if MIDTRANS_IS_PRODUCTION else "https://api.sandbox.midtrans.com"


def _midtrans_headers() -> dict:
    auth = base64.b64encode(f"{MIDTRANS_SERVER_KEY}:".encode()).decode()
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Basic {auth}",
    }


def _midtrans_create_qris(order_id: str, amount_idr: int) -> dict:
    """Buat QRIS dinamis via Midtrans Core API. Return {qr_string, qr_url}."""
    payload = {
        "payment_type": "qris",
        "transaction_details": {"order_id": order_id, "gross_amount": int(amount_idr)},
        "custom_expiry": {"expiry_duration": INVOICE_TTL_MINUTES, "unit": "minute"},
    }
    with httpx.Client(timeout=20) as client:
        res = client.post(f"{_midtrans_base()}/v2/charge", json=payload, headers=_midtrans_headers())
    data = res.json()
    if res.status_code >= 400 or data.get("status_code") not in ("200", "201", "202"):
        raise RuntimeError(f"Midtrans error: {data.get('status_message') or res.text}")
    qr_url = None
    qr_string = data.get("qr_string")
    for act in data.get("actions") or []:
        if act.get("name") == "generate-qr-code":
            qr_url = act.get("url")
    if not qr_url:
        qr_url = f"{_midtrans_base()}/v2/qris/{order_id}/qr-code"
    return {"qr_string": qr_string, "qr_url": qr_url}


def _midtrans_get_status(order_id: str) -> dict:
    with httpx.Client(timeout=20) as client:
        res = client.get(f"{_midtrans_base()}/v2/{order_id}/status", headers=_midtrans_headers())
    if res.status_code >= 400:
        return {"transaction_status": "unknown"}
    return res.json()


# ── Gateway: PayPal Orders API v2 (verifikasi instan via capture) ─────────
def _paypal_base() -> str:
    return "https://api-m.paypal.com" if PAYPAL_MODE == "live" else "https://api-m.sandbox.paypal.com"


_paypal_token_cache: dict = {"token": None, "expires": 0.0}


def _paypal_access_token() -> str:
    import time
    if _paypal_token_cache["token"] and time.time() < _paypal_token_cache["expires"] - 60:
        return _paypal_token_cache["token"]
    auth = base64.b64encode(f"{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}".encode()).decode()
    with httpx.Client(timeout=20) as client:
        res = client.post(
            f"{_paypal_base()}/v1/oauth2/token",
            headers={"Authorization": f"Basic {auth}"},
            data={"grant_type": "client_credentials"},
        )
    if res.status_code >= 400:
        raise RuntimeError(f"PayPal auth error: {res.text}")
    data = res.json()
    _paypal_token_cache["token"] = data["access_token"]
    _paypal_token_cache["expires"] = time.time() + int(data.get("expires_in", 300))
    return data["access_token"]


def _paypal_create_order(payment_id: str, amount_usd: float) -> dict:
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": payment_id,
            "amount": {"currency_code": "USD", "value": f"{amount_usd:.2f}"},
            "description": "ORDAL License Activation",
        }],
        "application_context": {
            "brand_name": "ORDAL",
            "user_action": "PAY_NOW",
            "shipping_preference": "NO_SHIPPING",
        },
    }
    with httpx.Client(timeout=20) as client:
        res = client.post(
            f"{_paypal_base()}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {_paypal_access_token()}", "Content-Type": "application/json"},
            json=payload,
        )
    data = res.json()
    if res.status_code >= 400:
        raise RuntimeError(f"PayPal create order error: {data.get('message') or res.text}")
    approve_url = next((l["href"] for l in data.get("links", []) if l.get("rel") == "approve"), None)
    return {"order_id": data["id"], "approve_url": approve_url}


def _paypal_get_order(order_id: str) -> dict:
    with httpx.Client(timeout=20) as client:
        res = client.get(
            f"{_paypal_base()}/v2/checkout/orders/{order_id}",
            headers={"Authorization": f"Bearer {_paypal_access_token()}"},
        )
    if res.status_code >= 400:
        return {"status": "UNKNOWN"}
    return res.json()


def _paypal_capture_order(order_id: str) -> dict:
    with httpx.Client(timeout=20) as client:
        res = client.post(
            f"{_paypal_base()}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {_paypal_access_token()}", "Content-Type": "application/json"},
            json={},
        )
    if res.status_code >= 400:
        return {"status": "CAPTURE_ERROR"}
    return res.json()


# ── Endpoint pembayaran ───────────────────────────────────────────────────
class CreatePaymentIn(BaseModel):
    method: str  # "qris_bca" | "paypal"


@router.post("/api/payments/create")
def create_payment(body: CreatePaymentIn, user=Depends(get_current_user)):
    """Buat invoice pembayaran. QRIS BCA → Midtrans dinamis (kalau dikonfigurasi,
    verifikasi instan otomatis) atau transfer manual BCA + verifikasi admin.
    PayPal → Orders API (instan) atau fallback link."""
    method = body.method.strip().lower()
    if method not in ("qris_bca", "paypal"):
        raise HTTPException(status_code=400, detail="Metode tidak dikenal (qris_bca / paypal)")
    if _get_license(user["id"]):
        raise HTTPException(status_code=400, detail="Akun kamu sudah aktif — tidak perlu membayar lagi")

    payment_id = _gen_payment_id()
    reference = _gen_reference()
    gateway = "manual"
    qr_string = qr_url = approve_url = gateway_ref = None
    amount = LICENSE_PRICE_IDR
    unique_suffix = 0
    amount_usd = LICENSE_PRICE_USD if method == "paypal" else None

    try:
        if method == "qris_bca":
            if MIDTRANS_SERVER_KEY:
                gateway = "midtrans"
                gateway_ref = payment_id  # order_id Midtrans = payment_id
                amount = LICENSE_PRICE_IDR
                qris = _midtrans_create_qris(payment_id, amount)
                qr_string, qr_url = qris["qr_string"], qris["qr_url"]
            else:
                # Transfer manual: nominal unik (base + 100..999) utk pencocokan
                unique_suffix = secrets.randbelow(900) + 100
                amount = LICENSE_PRICE_IDR + unique_suffix
        elif method == "paypal":
            if PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET:
                gateway = "paypal"
                order = _paypal_create_order(payment_id, LICENSE_PRICE_USD)
                gateway_ref = order["order_id"]
                approve_url = order["approve_url"]
            elif PAYPAL_ME_LINK:
                approve_url = f"{PAYPAL_ME_LINK.rstrip('/')}/{LICENSE_PRICE_USD:.2f}"
    except RuntimeError as e:
        print(f"[WARN] Gateway error saat create payment: {e}")
        raise HTTPException(status_code=502, detail=f"Gagal membuat invoice pembayaran: {e}")

    db = get_db()
    try:
        db.execute(
            "INSERT INTO app_payments (id, user_id, method, amount, base_amount, unique_suffix, "
            "amount_usd, currency, status, reference, gateway, gateway_ref, qr_string, qr_url, approve_url, expires_at) "
            f"VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, NOW() + INTERVAL '{INVOICE_TTL_MINUTES} minutes')",
            (
                payment_id, user["id"], method, amount, LICENSE_PRICE_IDR, unique_suffix,
                amount_usd, "USD" if method == "paypal" else "IDR",
                reference, gateway, gateway_ref, qr_string, qr_url, approve_url,
            ),
        )
        db.commit()
    finally:
        db.close()
    p = query_one("SELECT * FROM app_payments WHERE id = ?", (payment_id,))
    return _serialize_payment(p, user["id"])


@router.get("/api/payments/{payment_id}")
def get_payment(payment_id: str, user=Depends(get_current_user)):
    p = query_one("SELECT * FROM app_payments WHERE id = ?", (payment_id,))
    if not p or p["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")
    p = _expire_stale_invoice(p)
    return _serialize_payment(p, user["id"])


@router.post("/api/payments/{payment_id}/check")
def check_payment(payment_id: str, user=Depends(get_current_user)):
    """Polling gateway — verifikasi INSTAN begitu pembayaran valid terdeteksi:
    - Midtrans: cek status transaksi (settlement/capture → verified)
    - PayPal: order APPROVED → capture → COMPLETED → verified
    - manual: tidak ada gateway — menunggu verifikasi admin (email notifikasi)."""
    p = query_one("SELECT * FROM app_payments WHERE id = ?", (payment_id,))
    if not p or p["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")
    p = _expire_stale_invoice(p)

    if p["status"] in ("pending", "verifying"):
        gateway = p.get("gateway") or "manual"
        try:
            if gateway == "midtrans" and p.get("gateway_ref"):
                mt = _midtrans_get_status(p["gateway_ref"])
                ts = (mt.get("transaction_status") or "").lower()
                if ts in ("settlement", "capture"):
                    _mark_payment_verified(p["id"], gateway_ref=p["gateway_ref"], note=f"midtrans:{ts}")
                elif ts in ("expire", "cancel", "deny"):
                    db = get_db()
                    try:
                        db.execute("UPDATE app_payments SET status = 'failed', note = ? WHERE id = ?", (f"midtrans:{ts}", p["id"]))
                        db.commit()
                    finally:
                        db.close()
            elif gateway == "paypal" and p.get("gateway_ref"):
                pp = _paypal_get_order(p["gateway_ref"])
                st = (pp.get("status") or "").upper()
                if st == "APPROVED":
                    cap = _paypal_capture_order(p["gateway_ref"])
                    st = (cap.get("status") or "").upper()
                if st == "COMPLETED":
                    _mark_payment_verified(p["id"], gateway_ref=p["gateway_ref"], note="paypal:COMPLETED")
        except Exception as e:
            print(f"[WARN] Poll gateway gagal: {e}")

    p = query_one("SELECT * FROM app_payments WHERE id = ?", (payment_id,))
    return _serialize_payment(p, user["id"])


@router.post("/api/payments/{payment_id}/confirm")
def confirm_payment(payment_id: str, user=Depends(get_current_user)):
    """'Saya Sudah Bayar' (gateway manual) → status verifying + email notifikasi
    ke admin (kalau ADMIN_EMAIL diisi) supaya bisa diverifikasi sekali klik.
    User mendeteksi status verified secara instan via polling."""
    p = query_one("SELECT * FROM app_payments WHERE id = ?", (payment_id,))
    if not p or p["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")
    if p["status"] == "pending":
        db = get_db()
        try:
            db.execute("UPDATE app_payments SET status = 'verifying' WHERE id = ?", (payment_id,))
            db.commit()
        finally:
            db.close()
        if ADMIN_EMAIL and is_smtp_configured():
            try:
                send_admin_notification(
                    ADMIN_EMAIL,
                    "ORDAL — Konfirmasi pembayaran manual (perlu verifikasi)",
                    f"User: {user['email']}\nInvoice: {payment_id}\nMetode: {p['method']}\n"
                    f"Nominal: {_fmt_idr(int(p['amount']))}\nReference: {p['reference']}\n\n"
                    f"Verifikasi via: POST /api/admin/payments/{payment_id}/verify (header X-Admin-Token)",
                )
            except Exception as e:
                print(f"[WARN] Gagal kirim email admin: {e}")
    p = query_one("SELECT * FROM app_payments WHERE id = ?", (payment_id,))
    p = _expire_stale_invoice(p)
    return _serialize_payment(p, user["id"])


@router.post("/api/payments/{payment_id}/simulate")
def simulate_payment(payment_id: str, user=Depends(get_current_user)):
    """MODE SIMULASI (env PAYMENTS_SIMULATION=true — hanya untuk demo/testing):
    tandai pembayaran verified tanpa uang sungguhan. Nonaktif di production!"""
    if not PAYMENTS_SIMULATION:
        raise HTTPException(status_code=403, detail="Mode simulasi tidak aktif (PAYMENTS_SIMULATION=false)")
    p = query_one("SELECT * FROM app_payments WHERE id = ?", (payment_id,))
    if not p or p["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")
    result = _mark_payment_verified(payment_id, gateway_ref="simulation", note="simulate:demo-mode")
    p = query_one("SELECT * FROM app_payments WHERE id = ?", (payment_id,))
    out = _serialize_payment(p, user["id"])
    out["simulate"] = result
    return out


@router.post("/api/payments/webhook/midtrans")
async def midtrans_webhook(request: Request):
    """Webhook Midtrans (server-to-server) — verifikasi signature SHA512.
    Kalau hosting backend punya URL publik, daftarkan URL ini di Midtrans
    Dashboard → Settings → Configuration → Payment Notification URL."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Body JSON tidak valid")
    if not MIDTRANS_SERVER_KEY:
        raise HTTPException(status_code=404, detail="Midtrans tidak dikonfigurasi")

    order_id = str(body.get("order_id") or "")
    status_code = str(body.get("status_code") or "")
    gross_amount = str(body.get("gross_amount") or "")
    signature = str(body.get("signature_key") or "")
    expected = hashlib.sha512(f"{order_id}{status_code}{gross_amount}{MIDTRANS_SERVER_KEY}".encode()).hexdigest()
    if signature != expected:
        raise HTTPException(status_code=401, detail="Signature webhook tidak valid")

    p = query_one("SELECT * FROM app_payments WHERE id = ?", (order_id,))
    if not p:
        return {"received": True, "matched": False}
    ts = str(body.get("transaction_status") or "").lower()
    if ts in ("settlement", "capture"):
        _mark_payment_verified(order_id, gateway_ref=order_id, note=f"webhook:{ts}")
    elif ts in ("expire", "cancel", "deny"):
        db = get_db()
        try:
            db.execute("UPDATE app_payments SET status = 'failed', note = ? WHERE id = ?", (f"webhook:{ts}", order_id))
            db.commit()
        finally:
            db.close()
    return {"received": True, "matched": True}


# ── Activation code ───────────────────────────────────────────────────────
class ActivateIn(BaseModel):
    code: str


def _activate_license(user: dict, code: str, method: str, payment_id: str | None) -> dict:
    """Buat lisensi (idempotent). Return status akses terbaru."""
    existing = _get_license(user["id"])
    if existing:
        return get_access_status(user["id"]) | {"already_activated": True}
    expires_at = None
    if LICENSE_DURATION_DAYS > 0:
        expires_at = (_utcnow() + timedelta(days=LICENSE_DURATION_DAYS)).isoformat()
    db = get_db()
    try:
        db.execute(
            "INSERT INTO app_licenses (id, user_id, code, method, payment_id, expires_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                _gen_cuid_like(), user["id"], code, method, payment_id,
                expires_at,
            ),
        )
        db.commit()
    finally:
        db.close()
    return get_access_status(user["id"]) | {"already_activated": False}


@router.post("/api/activation/activate")
def activate(body: ActivateIn, user=Depends(get_current_user)):
    """Masukkan activation code → buka app.
    Kode valid kalau:
    (a) sama dengan kode personal user (kolom "User"."activationCode" — kode yang
        diterbitkan saat pembayaran verified, tersimpan di server sesuai email), atau
    (b) sama dengan kode admin (env ADMIN_ACTIVATION_CODE) — untuk testing.
    Setelah aktivasi, lisensi tercatat di DB pusat → berlaku di semua device
    (max 2) dan tidak hilang saat install ulang."""
    code = (body.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Masukkan kode aktivasi")

    # Kode admin (untuk owner/testing — bisa dipakai di akun mana pun)
    if ADMIN_ACTIVATION_CODE and code == ADMIN_ACTIVATION_CODE:
        st = _activate_license(user, code, method="admin", payment_id=None)
        st["activated_via"] = "admin"
        return st

    # Kode personal user
    row = query_one('SELECT "activationCode" FROM "User" WHERE "id" = ?', (user["id"],))
    personal = (row or {}).get("activationCode")
    if personal and code == personal.strip().upper():
        payment = query_one(
            "SELECT id FROM app_payments WHERE user_id = ? AND status = 'verified' ORDER BY verified_at DESC LIMIT 1",
            (user["id"],),
        )
        if not payment:
            raise HTTPException(
                status_code=403,
                detail="Kode ditemukan, tetapi pembayaran belum terverifikasi.",
            )
        st = _activate_license(user, personal, method="payment", payment_id=payment["id"])
        st["activated_via"] = "payment"
        return st

    raise HTTPException(status_code=400, detail="Kode aktivasi salah. Cek ulang email kamu, atau minta kirim ulang kode.")


@router.get("/api/activation/info")
def activation_info(user=Depends(get_current_user)):
    """Info utk UI: apakah user sudah punya kode (pernah bayar) + email masked."""
    row = query_one('SELECT "activationCode" FROM "User" WHERE "id" = ?', (user["id"],))
    code = (row or {}).get("activationCode")
    return {
        "has_code": bool(code),
        "code_masked": _mask_license_code(code) if code else None,
        "email": _mask_email(user["email"]),
        "smtp_configured": is_smtp_configured(),
    }


@router.post("/api/activation/resend")
def activation_resend(user=Depends(get_current_user)):
    """Lupa kode activation → kirim ulang kode ke email user.
    Kode personal tersimpan di server sesuai email user (kolom "User"."activationCode")."""
    row = query_one('SELECT "activationCode" FROM "User" WHERE "id" = ?', (user["id"],))
    code = (row or {}).get("activationCode")
    if not code:
        raise HTTPException(status_code=400, detail="Belum ada kode aktivasi untuk akun kamu — kode diterbitkan setelah pembayaran diverifikasi.")

    # Cooldown 60 detik per email
    with _resend_lock:
        last = _activation_resend_last.get(user["email"])
        if last and (_utcnow() - last).total_seconds() < 60:
            wait = int(60 - (_utcnow() - last).total_seconds())
            raise HTTPException(status_code=429, detail=f"Tunggu {wait} detik sebelum kirim ulang kode")
        _activation_resend_last[user["email"]] = _utcnow()

    if is_smtp_configured():
        try:
            send_activation_email(user["email"], code, _fmt_idr(LICENSE_PRICE_IDR))
            return {"sent": True, "dev_code": None, "smtp_configured": True}
        except Exception as e:
            print(f"[WARN] Gagal kirim ulang kode activation: {e}")
            raise HTTPException(status_code=502, detail=f"Gagal mengirim email: {e}")
    # Mode pengembangan: SMTP belum diisi → kode tampil di layar
    return {"sent": False, "dev_code": code, "smtp_configured": False}


# ── Endpoint admin (X-Admin-Token) ────────────────────────────────────────
@router.get("/api/admin/payments")
def admin_list_payments(status: str = "", limit: int = 100, request: Request = None, user=Depends(get_current_user)):
    """Daftar pembayaran (utk owner memverifikasi transfer manual BCA).
    Header: X-Admin-Token (env ADMIN_TOKEN)."""
    _require_admin(request)
    limit = max(1, min(limit, 500))
    if status:
        rows = query_all(
            'SELECT p.*, "User"."email" AS user_email FROM app_payments p '
            'JOIN "User" ON "User"."id" = p.user_id WHERE p.status = ? '
            "ORDER BY p.created_at DESC LIMIT ?",
            (status, limit),
        )
    else:
        rows = query_all(
            'SELECT p.*, "User"."email" AS user_email FROM app_payments p '
            'JOIN "User" ON "User"."id" = p.user_id '
            "ORDER BY p.created_at DESC LIMIT ?",
            (limit,),
        )
    return {
        "payments": [
            {
                "id": r["id"],
                "user_email": r.get("user_email"),
                "method": r["method"],
                "gateway": r.get("gateway"),
                "amount": int(r["amount"]),
                "amount_display": _fmt_idr(int(r["amount"])),
                "status": r["status"],
                "reference": r["reference"],
                "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else r.get("created_at"),
                "verified_at": r["verified_at"].isoformat() if isinstance(r.get("verified_at"), datetime) else r.get("verified_at"),
            }
            for r in rows
        ],
    }


@router.post("/api/admin/payments/{payment_id}/verify")
def admin_verify_payment(payment_id: str, request: Request = None, user=Depends(get_current_user)):
    """Verifikasi manual oleh admin (transfer BCA dicek di m-banking).
    Sekali klik → pembayaran verified + kode activation diterbitkan & dikirim
    ke email user → user melihat statusnya berubah INSTAN di app (polling).
    Header: X-Admin-Token."""
    _require_admin(request)
    result = _mark_payment_verified(payment_id, gateway_ref="admin", note="admin:manual-verify")
    return {"ok": True, "payment_id": payment_id, "activation_code": result["activation_code"], "email_sent": result["email_sent"]}


@router.post("/api/admin/grant")
def admin_grant_license(body: dict, request: Request = None, user=Depends(get_current_user)):
    """Beri lisensi langsung ke email user (tanpa pembayaran — mis. hadiah/refund).
    Body: {"email": "..."} → Header: X-Admin-Token."""
    _require_admin(request)
    email = str((body or {}).get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Body: {\"email\": \"...\"}")
    target = query_one('SELECT "id", "email", "activationCode" FROM "User" WHERE "email" = ?', (email,))
    if not target:
        raise HTTPException(status_code=404, detail=f"User {email} tidak ditemukan")
    if _get_license(target["id"]):
        return {"ok": True, "email": email, "already_licensed": True}
    db = get_db()
    try:
        code, _ = _issue_activation_code(db, target["id"])
        db.execute(
            "INSERT INTO app_licenses (id, user_id, code, method, payment_id) VALUES (?, ?, ?, 'admin', NULL)",
            (_gen_cuid_like(), target["id"], code),
        )
        db.commit()
    finally:
        db.close()
    return {"ok": True, "email": email, "activation_code": code}
