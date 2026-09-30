from fastapi import APIRouter, Body, Depends, HTTPException

from auth_utils import get_current_user, get_token_for_user
from ordal_api import request


router = APIRouter()


def get_access_status(user_id: str) -> dict:
    return request("GET", "/trial/status", token=get_token_for_user(user_id))


def ensure_trial_started(user_id: str) -> tuple[dict, bool]:
    status = request("POST", "/trial/start", token=get_token_for_user(user_id))
    return status, bool(status.get("just_started"))


def require_access(user_id: str) -> dict:
    status = get_access_status(user_id)
    if not status.get("access", {}).get("allowed"):
        code = "TRIAL_NOT_ELIGIBLE" if status.get("access", {}).get("reason") == "trial_not_eligible" else "TRIAL_EXPIRED"
        raise HTTPException(status_code=403, detail={"code": code, "status": status})
    return status


@router.get("/api/trial/status")
def trial_status(user=Depends(get_current_user)):
    return request("GET", "/trial/status", token=user["token"])


@router.post("/api/trial/start")
def trial_start(user=Depends(get_current_user)):
    return request("POST", "/trial/start", token=user["token"])


@router.post("/api/payments/create")
def create_payment(body: dict = Body(...), user=Depends(get_current_user)):
    return request("POST", "/payments/create", token=user["token"], json=body)


@router.post("/api/payments/{payment_id}/check")
def check_payment(payment_id: str, user=Depends(get_current_user)):
    return request("POST", f"/payments/{payment_id}/check", token=user["token"])


@router.post("/api/payments/{payment_id}/confirm")
def confirm_payment(payment_id: str, user=Depends(get_current_user)):
    return request("POST", f"/payments/{payment_id}/confirm", token=user["token"])


@router.post("/api/payments/{payment_id}/simulate")
def simulate_payment(payment_id: str, user=Depends(get_current_user)):
    raise HTTPException(status_code=404, detail="Simulasi pembayaran dinonaktifkan")


@router.get("/api/activation/info")
def activation_info(user=Depends(get_current_user)):
    return request("GET", "/activation/info", token=user["token"])


@router.post("/api/activation/activate")
def activation_activate(body: dict = Body(...), user=Depends(get_current_user)):
    return request("POST", "/activation/activate", token=user["token"], json=body)


@router.post("/api/activation/resend")
def activation_resend(user=Depends(get_current_user)):
    return request("POST", "/activation/resend", token=user["token"])
