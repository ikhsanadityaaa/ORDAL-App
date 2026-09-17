"""Trial, payment, and activation facade backed by ORDAL-Web."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth_utils import get_current_user
from control_plane import request, saved_session


router = APIRouter()


class CreatePaymentIn(BaseModel):
    method: str = Field(pattern=r"^(qris_bca|paypal)$")


class ActivateIn(BaseModel):
    code: str = Field(min_length=6, max_length=80)


def _token(req: Request) -> str:
    header = req.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


def _user_token(user: dict[str, Any] | str) -> str:
    if isinstance(user, dict):
        token = str(user.get("token") or "")
        user_id = str(user.get("id") or "")
    else:
        token = ""
        user_id = str(user)
    token = token or saved_session(user_id)
    if not token:
        raise HTTPException(status_code=401, detail="Sesi ORDAL tidak tersedia. Silakan login ulang")
    return token


def get_access_status(user: dict[str, Any] | str) -> dict[str, Any]:
    return request("GET", "/trial/status", token=_user_token(user))


def require_access(user: dict[str, Any] | str) -> dict[str, Any]:
    status = get_access_status(user)
    access = status.get("access") or {}
    if not access.get("allowed"):
        reason = access.get("reason")
        code = "TRIAL_NOT_ELIGIBLE" if reason == "trial_not_eligible" else "TRIAL_EXPIRED"
        raise HTTPException(
            status_code=403,
            detail={"code": code, "message": "Akses ORDAL tidak tersedia", "status": status},
        )
    return status


def ensure_trial_started(user: dict[str, Any] | str) -> tuple[dict[str, Any], bool]:
    status = request("POST", "/trial/start", token=_user_token(user))
    return status, bool(status.get("just_started"))


@router.get("/api/trial/status")
def trial_status(req: Request, user=Depends(get_current_user)):
    return request("GET", "/trial/status", token=_token(req))


@router.post("/api/trial/start")
def trial_start(req: Request, user=Depends(get_current_user)):
    return request("POST", "/trial/start", token=_token(req))


@router.post("/api/payments/create")
def create_payment(body: CreatePaymentIn, req: Request, user=Depends(get_current_user)):
    return request("POST", "/payments/create", token=_token(req), json=body.model_dump())


@router.get("/api/payments/{payment_id}")
def get_payment(payment_id: str, req: Request, user=Depends(get_current_user)):
    return request("POST", f"/payments/{payment_id}/check", token=_token(req))


@router.post("/api/payments/{payment_id}/check")
def check_payment(payment_id: str, req: Request, user=Depends(get_current_user)):
    return request("POST", f"/payments/{payment_id}/check", token=_token(req))


@router.post("/api/payments/{payment_id}/confirm")
def confirm_payment(payment_id: str, req: Request, user=Depends(get_current_user)):
    return request("POST", f"/payments/{payment_id}/confirm", token=_token(req))


@router.post("/api/payments/{payment_id}/simulate")
def simulate_payment(payment_id: str, user=Depends(get_current_user)):
    raise HTTPException(status_code=404, detail="Simulasi pembayaran hanya tersedia pada test server")


@router.post("/api/activation/activate")
def activate(body: ActivateIn, req: Request, user=Depends(get_current_user)):
    return request("POST", "/activation/activate", token=_token(req), json={"code": body.code})


@router.get("/api/activation/info")
def activation_info(req: Request, user=Depends(get_current_user)):
    return request("GET", "/activation/info", token=_token(req))


@router.post("/api/activation/resend")
def activation_resend(req: Request, user=Depends(get_current_user)):
    return request("POST", "/activation/resend", token=_token(req))
