"""
AI Service — Unified wrapper untuk multi-provider AI.

Provider yang didukung:
  - gemini      (Google Gemini 1.5 Flash) — default
  - openai      (GPT-4o-mini)
  - anthropic   (Claude 3.5 Haiku)
  - groq        (Llama 3.1 70B via Groq)
  - openrouter  (banyak model via OpenRouter)

API key masing-masing provider disimpan di tabel app_secrets (Fernet-encrypted).
Provider yang aktif disimpan di app_secrets juga, key="ACTIVE_AI_PROVIDER".

Fungsi utama:
  - get_active_provider()  → str ("gemini" | "openai" | ...)
  - set_active_provider(p) → None
  - list_providers()       → list of dict (label, model, key_required, configured)
  - chat(messages, **opts) → str (single response)
  - test_provider(p)       → dict {ok, detail}

Dipakai oleh workers/ (answer_question, generate_cover_letter, validate_email)
supaya bot bisa pakai provider apapun yang dipilih user.
"""
from __future__ import annotations

import os
from typing import Optional

import httpx

from app_secrets import get_secret, set_secret

# ── Provider registry ────────────────────────────────────────────────────────
PROVIDERS = {
    "gemini": {
        "label": "Google Gemini",
        "description": "Gemini (auto-update ke versi terbaru) — cepat, gratis untuk usage moderate.",
        "model": "gemini-flash-latest",
        "api_key_env": "GEMINI_API_KEY",
        "api_key_link": "https://aistudio.google.com/app/apikey",
        "api_key_label": "Gemini API Key",
    },
    "openai": {
        "label": "OpenAI",
        "description": "GPT-4o-mini — murah, banyak dipakai, quality tinggi.",
        "model": "gpt-4o-mini",
        "api_key_env": "OPENAI_API_KEY",
        "api_key_link": "https://platform.openai.com/api-keys",
        "api_key_label": "OpenAI API Key",
    },
    "anthropic": {
        "label": "Anthropic Claude",
        "description": "Claude 3.5 Haiku — cepat, ekonomis, terkenal untuk menulis.",
        "model": "claude-3-5-haiku-20241022",
        "api_key_env": "ANTHROPIC_API_KEY",
        "api_key_link": "https://console.anthropic.com/settings/keys",
        "api_key_label": "Anthropic API Key",
    },
    "groq": {
        "label": "Groq",
        "description": "Llama 3.1 70B via Groq — sangat cepat & murah (ada free tier).",
        "model": "llama-3.1-70b-versatile",
        "api_key_env": "GROQ_API_KEY",
        "api_key_link": "https://console.groq.com/keys",
        "api_key_label": "Groq API Key",
    },
    "openrouter": {
        "label": "OpenRouter",
        "description": "Akses ratusan model (paid & free) lewat satu API.",
        "model": "openai/gpt-4o-mini",
        "api_key_env": "OPENROUTER_API_KEY",
        "api_key_link": "https://openrouter.ai/keys",
        "api_key_label": "OpenRouter API Key",
    },
}

ACTIVE_KEY = "ACTIVE_AI_PROVIDER"
DEFAULT_PROVIDER = "gemini"


# ── Provider helpers ─────────────────────────────────────────────────────────
def get_active_provider() -> str:
    """Return key provider yang aktif. Default 'gemini'."""
    val = get_secret(ACTIVE_KEY, "")
    if val and val in PROVIDERS:
        return val
    return DEFAULT_PROVIDER


def set_active_provider(provider: str) -> None:
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider}")
    set_secret(ACTIVE_KEY, provider)


def list_providers() -> list[dict]:
    """List semua provider dengan status configured."""
    out = []
    for key, meta in PROVIDERS.items():
        api_key = get_secret(meta["api_key_env"], "")
        out.append({
            "key": key,
            "label": meta["label"],
            "description": meta["description"],
            "model": meta["model"],
            "api_key_env": meta["api_key_env"],
            "api_key_label": meta["api_key_label"],
            "api_key_link": meta["api_key_link"],
            "configured": bool(api_key),
            "masked": _mask(api_key) if api_key else "",
        })
    return out


def _mask(val: str) -> str:
    if not val:
        return ""
    if len(val) <= 8:
        return "••••"
    return f"{val[:4]}••••{val[-4:]}"


# ── Unified chat function ────────────────────────────────────────────────────
async def chat(
    prompt: str,
    *,
    system_prompt: Optional[str] = None,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    prefer_provider: Optional[str] = None,  # kalau None, pakai active
) -> str:
    """
    Kirim prompt ke AI provider, return text response.

    Args:
        prompt: User message (string)
        system_prompt: Optional system instruction
        max_tokens: Maksimum output tokens
        temperature: 0.0 - 1.0
        prefer_provider: Override active provider (untuk test)

    Returns:
        Text response. Empty string kalau gagal / API key tidak ada.
    """
    try:
        return await chat_raw(
            prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            prefer_provider=prefer_provider,
        )
    except Exception as e:
        print(f"[ai_service] Error calling {prefer_provider or get_active_provider()}: {e}")
        return ""


async def chat_raw(
    prompt: str,
    *,
    system_prompt: Optional[str] = None,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    prefer_provider: Optional[str] = None,
) -> str:
    """
    Sama seperti chat(), tapi TIDAK menelan exception — dipakai oleh test_provider()
    supaya error asli dari provider (model tidak ditemukan, API key invalid, quota habis,
    dsb) bisa ditampilkan ke user alih-alih pesan generik "response kosong".
    """
    provider = prefer_provider or get_active_provider()
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider}")

    meta = PROVIDERS[provider]
    api_key = get_secret(meta["api_key_env"], "")
    if not api_key:
        raise ValueError(f"{meta['api_key_label']} belum di-set.")

    try:
        if provider == "gemini":
            model = meta["model"]
            try:
                return await _call_gemini(api_key, model, prompt, system_prompt, max_tokens, temperature)
            except RuntimeError as e:
                # Model spesifik di-deprecate Google ("no longer available to new users",
                # dsb) — otomatis fallback ke alias yang selalu nunjuk ke model
                # terbaru yang direkomendasikan, supaya app tidak perlu update manual
                # tiap kali Google pensiunkan versi model.
                if model != "gemini-flash-latest" and (
                    "no longer available" in str(e).lower() or "not found" in str(e).lower()
                ):
                    return await _call_gemini(api_key, "gemini-flash-latest", prompt, system_prompt, max_tokens, temperature)
                raise
        elif provider == "openai":
            return await _call_openai(api_key, meta["model"], prompt, system_prompt, max_tokens, temperature)
        elif provider == "anthropic":
            return await _call_anthropic(api_key, meta["model"], prompt, system_prompt, max_tokens, temperature)
        elif provider == "groq":
            return await _call_groq(api_key, meta["model"], prompt, system_prompt, max_tokens, temperature)
        elif provider == "openrouter":
            return await _call_openrouter(api_key, meta["model"], prompt, system_prompt, max_tokens, temperature)
        raise ValueError(f"Unknown provider: {provider}")
    except httpx.ConnectTimeout as e:
        raise RuntimeError(
            f"Koneksi ke {meta['label']} timeout. Internet Anda mungkin lambat atau tidak stabil — coba lagi."
        ) from e
    except httpx.ConnectError as e:
        # Ini exception yang sama dipakai httpx untuk semua kegagalan koneksi level-OS
        # (DNS gagal resolve / offline / firewall / proxy salah), baik di Mac
        # ("[Errno 8] nodename nor servname provided, or not known") maupun Windows
        # ("[Errno 11001] getaddrinfo failed") — pesannya beda per-OS tapi artinya
        # sama: aplikasi tidak bisa menjangkau internet sama sekali. Kita seragamkan
        # jadi satu pesan yang actionable untuk user, bukan errno mentah yang membingungkan.
        raise RuntimeError(
            f"Tidak bisa terhubung ke server {meta['label']}. Cek koneksi internet Anda "
            f"(WiFi/data aktif?), lalu coba Test lagi. Kalau pakai VPN/proxy/firewall "
            f"kantor, pastikan domain Google/AI API tidak diblokir. "
            f"(Detail teknis: {e})"
        ) from e
    except httpx.RequestError as e:
        # Kelas induk semua error request-level httpx lainnya (read timeout, SSL
        # error, dsb) yang belum ditangani secara spesifik di atas.
        raise RuntimeError(f"Gagal menghubungi {meta['label']}: {e}") from e


def _raise_for_provider_error(data: dict, provider_label: str) -> None:
    """Provider APIs (Gemini/OpenAI-compatible/Anthropic) return a JSON body with an
    'error' key on failure instead of raising an HTTP-level exception in some cases.
    Surface that message instead of letting the caller silently see an empty response."""
    if isinstance(data, dict) and "error" in data:
        err = data["error"]
        if isinstance(err, dict):
            msg = err.get("message") or err.get("status") or str(err)
        else:
            msg = str(err)
        raise RuntimeError(f"{provider_label} error: {msg}")


async def _call_gemini(api_key, model, prompt, system_prompt, max_tokens, temperature):
    """Gemini API — generateContent format."""
    parts = []
    if system_prompt:
        parts.append({"text": system_prompt})
    parts.append({"text": prompt})

    async def _post(effective_max_tokens: int, disable_thinking: bool):
        generation_config = {"maxOutputTokens": effective_max_tokens, "temperature": temperature}
        if disable_thinking:
            # Model "thinking" (mis. gemini-2.5-flash / gemini-flash-latest) memakai
            # sebagian besar maxOutputTokens untuk proses berpikir internal sebelum
            # menulis jawaban. Dengan budget kecil (mis. saat test koneksi), semua
            # token habis untuk thinking dan jawaban asli tidak sempat ter-generate,
            # sehingga finishReason=MAX_TOKENS padahal tidak ada masalah nyata.
            # thinkingBudget: 0 mematikan thinking supaya token sepenuhnya dipakai
            # untuk jawaban.
            generation_config["thinkingConfig"] = {"thinkingBudget": 0}
        async with httpx.AsyncClient(timeout=30) as client:
            return await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                json={
                    "contents": [{"parts": [{"text": (system_prompt + "\n\n" + prompt) if system_prompt else prompt}]}],
                    "generationConfig": generation_config,
                },
            )

    resp = await _post(max_tokens, disable_thinking=True)
    try:
        data = resp.json()
    except Exception:
        resp.raise_for_status()
        raise RuntimeError(f"Gemini: respons tidak valid (HTTP {resp.status_code})")

    # Model lama / model generasi baru (mis. yang dipakai oleh alias
    # "gemini-flash-latest") kadang menolak field thinkingConfig atau nilai
    # thinkingBudget tertentu dengan error generik "Request contains an
    # invalid argument." — TANPA menyebut kata "thinkingConfig" di pesannya.
    # Karena itu kita tidak bisa menebak dari isi pesan; setiap kali request
    # pertama (yang menyertakan thinkingConfig) gagal dengan status 400, coba
    # lagi sekali tanpa field itu supaya tetap kompatibel dengan semua model.
    if resp.status_code == 400:
        resp = await _post(max_tokens, disable_thinking=False)
        try:
            data = resp.json()
        except Exception:
            resp.raise_for_status()
            raise RuntimeError(f"Gemini: respons tidak valid (HTTP {resp.status_code})")

    _raise_for_provider_error(data, "Gemini")
    if resp.status_code >= 400:
        raise RuntimeError(f"Gemini HTTP {resp.status_code}: {data}")
    try:
        candidate = data["candidates"][0]
    except (KeyError, IndexError):
        raise RuntimeError(f"Gemini: respons tidak terduga (kemungkinan diblokir safety filter): {data}")
    finish_reason = candidate.get("finishReason")
    try:
        return candidate["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError):
        if finish_reason == "MAX_TOKENS":
            # Safety net terakhir: retry sekali dengan token budget jauh lebih besar
            # sebelum benar-benar menyerah dan melapor error ke user.
            retry_tokens = max(max_tokens * 8, 256)
            if retry_tokens > max_tokens:
                resp2 = await _post(retry_tokens, disable_thinking=True)
                try:
                    data2 = resp2.json()
                    candidate2 = data2["candidates"][0]
                    return candidate2["content"]["parts"][0]["text"].strip()
                except Exception:
                    pass
            raise RuntimeError("Gemini: response terpotong (max_tokens terlalu kecil).")
        raise RuntimeError(f"Gemini: tidak ada teks di respons (finishReason={finish_reason}).")


async def _call_openai(api_key, model, prompt, system_prompt, max_tokens, temperature):
    """OpenAI Chat Completions API (kompatibel dengan Groq & OpenRouter)."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
        data = resp.json()
        _raise_for_provider_error(data, "OpenAI")
        if resp.status_code >= 400:
            raise RuntimeError(f"OpenAI HTTP {resp.status_code}: {data}")
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError):
            raise RuntimeError(f"OpenAI: respons tidak terduga: {data}")


async def _call_anthropic(api_key, model, prompt, system_prompt, max_tokens, temperature):
    """Anthropic Messages API."""
    async with httpx.AsyncClient(timeout=30) as client:
        body = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            body["system"] = system_prompt
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=body,
        )
        data = resp.json()
        _raise_for_provider_error(data, "Anthropic")
        if resp.status_code >= 400:
            raise RuntimeError(f"Anthropic HTTP {resp.status_code}: {data}")
        try:
            return data["content"][0]["text"].strip()
        except (KeyError, IndexError):
            raise RuntimeError(f"Anthropic: respons tidak terduga: {data}")


async def _call_groq(api_key, model, prompt, system_prompt, max_tokens, temperature):
    """Groq — OpenAI-compatible API."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
        data = resp.json()
        _raise_for_provider_error(data, "Groq")
        if resp.status_code >= 400:
            raise RuntimeError(f"Groq HTTP {resp.status_code}: {data}")
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError):
            raise RuntimeError(f"Groq: respons tidak terduga: {data}")


async def _call_openrouter(api_key, model, prompt, system_prompt, max_tokens, temperature):
    """OpenRouter — OpenAI-compatible API."""
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://ordal.app",
                "X-Title": "ORDAL",
            },
            json={
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
        data = resp.json()
        _raise_for_provider_error(data, "OpenRouter")
        if resp.status_code >= 400:
            raise RuntimeError(f"OpenRouter HTTP {resp.status_code}: {data}")
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError):
            raise RuntimeError(f"OpenRouter: respons tidak terduga: {data}")


# ── Test connection ──────────────────────────────────────────────────────────
async def test_provider(provider: str) -> dict:
    """
    Test koneksi ke provider dengan prompt sederhana.
    Return {ok, detail} atau {ok: False, error}.
    """
    if provider not in PROVIDERS:
        return {"ok": False, "error": f"Unknown provider: {provider}"}

    meta = PROVIDERS[provider]
    api_key = get_secret(meta["api_key_env"], "")
    if not api_key:
        return {"ok": False, "error": f"{meta['api_key_label']} belum di-set."}

    try:
        result = await chat_raw(
            "Reply with the single word: OK",
            system_prompt="You are a test bot. Reply with just 'OK'.",
            max_tokens=256,
            temperature=0,
            prefer_provider=provider,
        )
        if result and len(result) < 200:
            return {
                "ok": True,
                "detail": f"Provider {meta['label']} ({meta['model']}) valid. Response: {result[:60]}",
                "response": result,
            }
        elif result:
            return {
                "ok": True,
                "detail": f"Provider {meta['label']} valid (response: {result[:80]}...).",
                "response": result[:200],
            }
        return {"ok": False, "error": "Response kosong. Cek API key atau quota."}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ── CV-based position suggestion ──────────────────────────────────────────────
async def suggest_positions_from_cv(cv_text: str, max_positions: int = 8) -> dict:
    """Generate list posisi pekerjaan yang relevan dengan CV.

    Dipakai oleh halaman Cari Kerja untuk bantu user menemukan posisi alternatif
    yang mungkin belum terpikir. Mis. dari CV "HR Staff" → AI bisa suggest
    "General Affair", "Talent Acquisition", "Training Staff", "Recruitment
    Officer", "People Operations", dst.

    Returns:
        {
            "ok": bool,
            "positions": ["HR Staff", "General Affair", ...],
            "raw_response": "..."
        }
    """
    if not cv_text or not cv_text.strip():
        return {"ok": False, "error": "CV text kosong.", "positions": []}

    # Potong CV supaya tidak terlalu panjang (token budget)
    cv_excerpt = cv_text.strip()[:4000]

    system_prompt = (
        "Anda adalah asisten karir yang membantu user menemukan posisi pekerjaan yang "
        "relevan dengan CV mereka. Berdasarkan CV yang diberikan, sebutkan 5-8 posisi "
        "pekerjaan yang cocok. Sertakan posisi yang sudah disebut di CV ditambah varian/"
        "sinonim yang relevan (mis. untuk HR: General Affair, Talent Acquisition, "
        "Training Staff, Recruitment Officer, People Operations, dll). "
        "Format jawaban: HANYA daftar posisi dipisah koma, tanpa nomor, tanpa penjelasan. "
        "Contoh: HR Staff, General Affair, Talent Acquisition, Training Staff"
    )
    prompt = (
        f"Berikut adalah isi CV saya. Sebutkan 5-8 posisi pekerjaan yang relevan:\n\n"
        f"{cv_excerpt}\n\n"
        f"Jawaban (hanya daftar posisi dipisah koma):"
    )

    try:
        response = await chat(
            prompt,
            system_prompt=system_prompt,
            max_tokens=300,
            temperature=0.3,
        )
    except Exception as e:
        return {"ok": False, "error": str(e), "positions": []}

    if not response:
        return {
            "ok": False,
            "error": "Response kosong. Pastikan API key AI sudah di-set dan aktif.",
            "positions": [],
        }

    # Parse response: split by koma / newline / titik koma
    import re as _re
    parts = _re.split(r"[,\n;|]+", response)
    positions = []
    seen = set()
    for p in parts:
        clean = " ".join(p.strip().split())
        # Buang prefix nomor seperti "1.", "2)", dll
        clean = _re.sub(r"^\d+[\.\)\-:]\s*", "", clean)
        # Buang prefix "Posisi:", "-" dll
        clean = _re.sub(r"^(posisi|position|role)\s*[:\-]\s*", "", clean, flags=_re.IGNORECASE)
        clean = clean.strip(" -—–")
        if clean and len(clean) >= 2 and len(clean) <= 60:
            key = clean.lower()
            if key not in seen:
                seen.add(key)
                positions.append(clean)
        if len(positions) >= max_positions:
            break

    return {
        "ok": bool(positions),
        "positions": positions,
        "raw_response": response[:500],
        "error": None if positions else "Tidak bisa parse posisi dari response AI.",
    }
