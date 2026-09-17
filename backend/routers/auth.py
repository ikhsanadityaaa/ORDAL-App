import webbrowser

from fastapi import APIRouter, Body, Depends

from auth_utils import get_current_user, invalidate_token
from ordal_api import request


router = APIRouter()


def _sync(result: dict) -> dict:
    from database import sync_local_user

    if result.get("user"):
        sync_local_user(result["user"])
    return result


@router.post("/register")
def register(body: dict = Body(...)):
    return request("POST", "/auth/register", json=body)


@router.post("/login")
def login(body: dict = Body(...)):
    return _sync(request("POST", "/auth/login", json=body))


@router.post("/verify")
def verify(body: dict = Body(...)):
    return _sync(request("POST", "/auth/verify", json=body))


@router.post("/resend")
def resend(body: dict = Body(...)):
    return request("POST", "/auth/resend", json=body)


@router.get("/me")
def me(user=Depends(get_current_user)):
    return _sync(request("GET", "/auth/me", token=user["token"]))


@router.post("/logout")
def logout(user=Depends(get_current_user)):
    result = request("POST", "/auth/logout", token=user["token"])
    invalidate_token(user["token"])
    return result


@router.get("/devices")
def devices(user=Depends(get_current_user)):
    return request("GET", "/auth/devices", token=user["token"])


@router.delete("/devices/{device_id}")
def remove_device(device_id: str, user=Depends(get_current_user)):
    return request("DELETE", f"/auth/devices/{device_id}", token=user["token"])


@router.post("/devices/limit-remove")
def remove_device_at_limit(body: dict = Body(...)):
    return request("POST", "/auth/devices/limit-remove", json=body)


@router.get("/google/config")
def google_config():
    return request("GET", "/auth/google/config")


@router.post("/google/start")
def google_start():
    result = request("POST", "/auth/google/start", json={})
    webbrowser.open(result["url"])
    return {"state": result["state"]}


@router.post("/google/poll")
def google_poll(body: dict = Body(...)):
    return _sync(request("POST", "/auth/google/poll", json=body))
