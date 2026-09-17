"""Client for ORDAL's server-authoritative web control plane."""
from __future__ import annotations

import os
import platform
import threading
import time
from typing import Any

import httpx
from fastapi import HTTPException

from app_secrets import get_user_secret, set_user_secret
from auth_utils import (
    get_app_version,
    get_device_fingerprint,
    get_device_name,
)


DEFAULT_BASE_URL = "https://ordal-web.vercel.app/api/app"
REQUEST_TIMEOUT_SECONDS = 20.0
SESSION_SECRET_KEY = "ORDAL_APP_SESSION"

_cache_lock = threading.Lock()
_user_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def base_url() -> str:
    return os.getenv("ORDAL_API_BASE_URL", DEFAULT_BASE_URL).strip().rstrip("/")


def device_payload() -> dict[str, str]:
    return {
        "device_fingerprint": get_device_fingerprint(),
        "device_name": get_device_name(),
        "os": f"{platform.system()} {platform.release()}".strip(),
        "app_version": get_app_version(),
    }


def _detail(response: httpx.Response) -> Any:
    try:
        body = response.json()
    except ValueError:
        return "Layanan ORDAL mengembalikan respons tidak valid"
    return body.get("detail", body) if isinstance(body, dict) else body


def request(
    method: str,
    path: str,
    *,
    token: str | None = None,
    json: dict[str, Any] | None = None,
    timeout: float = REQUEST_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = httpx.request(
            method,
            f"{base_url()}/{path.lstrip('/')}",
            headers=headers,
            json=json,
            timeout=timeout,
            follow_redirects=False,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Layanan ORDAL tidak merespons") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Layanan ORDAL tidak dapat dihubungi") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=_detail(response))
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respons layanan ORDAL tidak valid") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Format respons layanan ORDAL tidak valid")
    return data


def save_session(user_id: str, token: str) -> None:
    if user_id and token:
        set_user_secret(user_id, SESSION_SECRET_KEY, token)


def saved_session(user_id: str) -> str:
    return get_user_secret(user_id, SESSION_SECRET_KEY, "")


def clear_session(user_id: str) -> None:
    if user_id:
        set_user_secret(user_id, SESSION_SECRET_KEY, "")
    with _cache_lock:
        for token, (_, user) in list(_user_cache.items()):
            if str(user.get("id")) == str(user_id):
                _user_cache.pop(token, None)


def remember_user(token: str, user: dict[str, Any], ttl: float = 30.0) -> None:
    with _cache_lock:
        _user_cache[token] = (time.monotonic() + ttl, dict(user))


def validate_session(token: str, *, use_cache: bool = True) -> dict[str, Any]:
    if use_cache:
        with _cache_lock:
            cached = _user_cache.get(token)
            if cached and cached[0] > time.monotonic():
                return dict(cached[1])
    data = request("GET", "/auth/me", token=token)
    user = data.get("user")
    if not isinstance(user, dict) or not user.get("id"):
        raise HTTPException(status_code=502, detail="Data akun dari layanan ORDAL tidak valid")
    normalized = dict(user)
    normalized["token"] = token
    remember_user(token, normalized)
    save_session(str(normalized["id"]), token)
    return normalized


def attach_session(data: dict[str, Any]) -> dict[str, Any]:
    token = data.get("token")
    user = data.get("user")
    if isinstance(token, str) and isinstance(user, dict) and user.get("id"):
        enriched = dict(user)
        enriched["token"] = token
        remember_user(token, enriched)
        save_session(str(user["id"]), token)
    return data
