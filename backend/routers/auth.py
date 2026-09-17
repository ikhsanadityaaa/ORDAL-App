"""Thin auth facade over ORDAL-Web's server-authoritative API."""
from __future__ import annotations

import webbrowser
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from control_plane import attach_session, clear_session, device_payload, request
from database import query_one


router = APIRouter()


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=100)


class VerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(pattern=r"^\d{6}$")


class ResendIn(BaseModel):
    email: EmailStr


class GooglePollIn(BaseModel):
    state: str = Field(min_length=10, max_length=200)


class DeviceLimitRemoveIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=100)
    device_id: str = Field(min_length=1, max_length=200)


def _token(req: Request) -> str:
    header = req.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


def _onboarding(user_id: str) -> dict[str, Any]:
    row = query_one(
        "SELECT completed, current_step FROM app_onboarding WHERE user_id = ?",
        (user_id,),
    )
    return {
        "completed": bool(row and row.get("completed")),
        "current_step": int(row.get("current_step") or 1) if row else 1,
    }


def _with_local_state(data: dict[str, Any]) -> dict[str, Any]:
    user = data.get("user")
    if isinstance(user, dict) and user.get("id"):
        data["onboarding"] = _onboarding(str(user["id"]))
    return attach_session(data)


@router.post("/register")
def register(body: RegisterIn):
    return request("POST", "/auth/register", json={**body.model_dump(mode="json"), **device_payload()})


@router.post("/login")
def login(body: LoginIn):
    data = request("POST", "/auth/login", json={**body.model_dump(mode="json"), **device_payload()})
    return _with_local_state(data)


@router.post("/verify")
def verify(body: VerifyIn):
    data = request("POST", "/auth/verify", json={**body.model_dump(mode="json"), **device_payload()})
    return _with_local_state(data)


@router.post("/resend")
def resend(body: ResendIn):
    return request("POST", "/auth/resend", json=body.model_dump(mode="json"))


@router.get("/me")
def me(req: Request):
    return _with_local_state(request("GET", "/auth/me", token=_token(req)))


@router.post("/logout")
def logout(req: Request):
    token = _token(req)
    user_id = ""
    try:
        from control_plane import validate_session
        user_id = str(validate_session(token).get("id", ""))
    except HTTPException:
        pass
    data = request("POST", "/auth/logout", token=token)
    clear_session(user_id)
    return data


@router.get("/devices")
def devices(req: Request):
    return request("GET", "/auth/devices", token=_token(req))


@router.delete("/devices/{device_id}")
def remove_device(device_id: str, req: Request):
    return request("DELETE", f"/auth/devices/{device_id}", token=_token(req))


@router.post("/devices/limit-remove")
def remove_device_at_limit(body: DeviceLimitRemoveIn):
    return request("POST", "/auth/devices/limit-remove", json=body.model_dump(mode="json"))


@router.get("/google/config")
def google_config():
    return request("GET", "/auth/google/config")


@router.post("/google/start")
def google_start():
    data = request("POST", "/auth/google/start", json=device_payload())
    auth_url = data.get("auth_url") or data.get("url")
    if isinstance(auth_url, str) and auth_url.startswith("https://"):
        webbrowser.open(auth_url)
    return data


@router.post("/google/poll")
def google_poll(body: GooglePollIn):
    data = request("POST", "/auth/google/poll", json={"state": body.state, **device_payload()})
    return _with_local_state(data)
