import os
import platform
from typing import Any

import httpx
from fastapi import HTTPException


BASE_URL = os.getenv("ORDAL_API_URL", "https://ordal-web.vercel.app/api/app").rstrip("/")


def _device_payload() -> dict[str, str]:
    from auth_utils import get_app_version, get_device_fingerprint, get_device_name

    return {
        "device_fingerprint": get_device_fingerprint(),
        "device_name": get_device_name(),
        "os": f"{platform.system()} {platform.release()}".strip(),
        "app_version": get_app_version(),
    }


def _detail(response: httpx.Response) -> Any:
    try:
        data = response.json()
    except ValueError:
        return "Server ORDAL tidak memberi respons yang valid"
    return data.get("detail", data.get("error", data)) if isinstance(data, dict) else data


def request(
    method: str,
    path: str,
    *,
    token: str = "",
    json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {**(json or {}), **_device_payload()}
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        response = httpx.request(
            method,
            f"{BASE_URL}/{path.lstrip('/')}",
            json=payload if method.upper() != "GET" else None,
            headers=headers,
            timeout=20,
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail="Server ORDAL tidak dapat dihubungi") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=_detail(response))
    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Respons server ORDAL tidak valid") from exc
