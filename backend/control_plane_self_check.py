"""Run with: python backend/control_plane_self_check.py"""
import sys
from pathlib import Path

import httpx
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent))

import control_plane


original_request = control_plane.httpx.request


def fake_request(method, url, **kwargs):
    assert url == "https://ordal-web.vercel.app/api/app/auth/google/config"
    assert kwargs["headers"]["Authorization"] == "Bearer opaque-token"
    return httpx.Response(200, json={"configured": True})


control_plane.httpx.request = fake_request
assert control_plane.request("GET", "/auth/google/config", token="opaque-token") == {"configured": True}


def forbidden_request(*args, **kwargs):
    return httpx.Response(403, json={"detail": {"code": "TRIAL_EXPIRED", "message": "expired"}})


control_plane.httpx.request = forbidden_request
try:
    control_plane.request("POST", "/trial/start", token="opaque-token")
    raise AssertionError("403 response must raise HTTPException")
except HTTPException as error:
    assert error.status_code == 403
    assert error.detail["code"] == "TRIAL_EXPIRED"
finally:
    control_plane.httpx.request = original_request

print("control plane self-check passed")
