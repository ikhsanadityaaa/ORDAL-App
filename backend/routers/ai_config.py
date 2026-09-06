"""
AI Config Router — endpoint untuk multi-provider AI configuration.

Endpoints:
  GET    /api/ai_config              → list providers + active provider
  PUT    /api/ai_config/active       → set active provider
  GET    /api/ai_config/{provider}/key → get API key (masked)
  PUT    /api/ai_config/{provider}/key → set API key
  POST   /api/ai_config/{provider}/test → test connection
  POST   /api/ai_config/chat          → chat playground (input prompt, get response)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user
from workers import ai_service

router = APIRouter()


class ActiveProviderUpdate(BaseModel):
    provider: str


class ChatRequest(BaseModel):
    prompt: str
    system_prompt: str | None = None
    max_tokens: int = 1000
    temperature: float = 0.7


class ApiKeyUpdate(BaseModel):
    value: str


@router.get("")
def list_all(user: dict = Depends(get_current_user)):
    """List semua provider AI + status configured + active provider."""
    providers = ai_service.list_providers()
    active = ai_service.get_active_provider()
    return {
        "providers": providers,
        "active": active,
        "any_configured": any(p["configured"] for p in providers),
    }


@router.put("/active")
def set_active(body: ActiveProviderUpdate, user: dict = Depends(get_current_user)):
    """Set provider yang aktif (yang dipakai bot)."""
    try:
        ai_service.set_active_provider(body.provider)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    meta = ai_service.PROVIDERS[body.provider]
    return {
        "ok": True,
        "active": body.provider,
        "label": meta["label"],
        "model": meta["model"],
    }


@router.get("/{provider}/key")
def get_key(provider: str, user: dict = Depends(get_current_user)):
    """Get API key untuk provider tertentu (masked)."""
    if provider not in ai_service.PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    meta = ai_service.PROVIDERS[provider]
    from app_secrets import get_secret
    val = get_secret(meta["api_key_env"], "")
    return {
        "provider": provider,
        "configured": bool(val),
        "masked": _mask(val) if val else "",
    }


def _mask(val: str) -> str:
    if not val:
        return ""
    if len(val) <= 8:
        return "••••"
    return f"{val[:4]}••••{val[-4:]}"


@router.put("/{provider}/key")
def set_key(provider: str, body: ApiKeyUpdate, user: dict = Depends(get_current_user)):
    """Set API key untuk provider tertentu."""
    if provider not in ai_service.PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    meta = ai_service.PROVIDERS[provider]
    from app_secrets import set_secret
    value = (body.value or "").strip()
    set_secret(meta["api_key_env"], value)
    return {
        "provider": provider,
        "configured": bool(value),
        "masked": _mask(value) if value else "",
    }


@router.delete("/{provider}/key")
def delete_key(provider: str, user: dict = Depends(get_current_user)):
    if provider not in ai_service.PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    meta = ai_service.PROVIDERS[provider]
    from app_secrets import set_secret
    set_secret(meta["api_key_env"], "")
    return {"provider": provider, "configured": False}


@router.post("/{provider}/test")
async def test_provider(provider: str, user: dict = Depends(get_current_user)):
    """Test koneksi ke provider."""
    if provider not in ai_service.PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    result = await ai_service.test_provider(provider)
    return result


# ── Suggest positions from CV ─────────────────────────────────────────────────
class SuggestPositionsRequest(BaseModel):
    cv_text: str
    max_positions: int = 8


@router.post("/suggest_positions")
async def suggest_positions(body: SuggestPositionsRequest, user: dict = Depends(get_current_user)):
    """Generate daftar posisi pekerjaan relevan dari CV text.

    Dipakai di halaman Cari Kerja untuk bantu user input posisi yang lebih bervariasi
    (mis. "HR Staff" → AI suggest "General Affair, Talent Acquisition, Training Staff").
    """
    if not body.cv_text or not body.cv_text.strip():
        raise HTTPException(status_code=400, detail="CV text tidak boleh kosong")

    active = ai_service.get_active_provider()
    meta = ai_service.PROVIDERS[active]
    from app_secrets import get_secret
    if not get_secret(meta["api_key_env"], ""):
        raise HTTPException(
            status_code=400,
            detail=f"API key untuk {meta['label']} belum di-set. Set dulu di kartu provider yang dipilih.",
        )

    result = await ai_service.suggest_positions_from_cv(
        body.cv_text,
        max_positions=max(1, min(body.max_positions, 15)),
    )
    return result


@router.post("/chat")
async def chat(body: ChatRequest, user: dict = Depends(get_current_user)):
    """
    Playground chat — input prompt, get response dari active provider.
    Berguna untuk test quality sebelum dipakai bot.

    Guard: prompt yang minta kode / hal di luar scope karir & lamaran kerja
    akan ditolak dengan pesan standar supaya AI tidak 'nyampang' ke topik
    lain (menulis kode, mengerjakan PR, dsb). AI di ORDAL khusus dipakai
    untuk: cover letter, jawab pertanyaan form, analisis lowongan, dan
    hal terkait pencarian kerja.

    URUTAN PENTING: guard dijalankan SEBELUM cek API key supaya prompt
    yang ditolak guard tetap dapat respons standar meskipun API key belum
    di-set (berguna untuk demo guard tanpa konfigurasi).
    """
    if not body.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt tidak boleh kosong")

    # ── Guard: tolak request di luar scope karir/lamaran kerja ──────────────
    # Jalankan lebih dulu supaya respons guard bisa diberikan tanpa API key.
    prompt_text = body.prompt.strip()
    guard_block, guard_reason = _guard_prompt(prompt_text)
    if guard_block:
        active = ai_service.get_active_provider()
        meta = ai_service.PROVIDERS[active]
        return {
            "ok": True,
            "provider": active,
            "model": meta["model"],
            "response": guard_reason,
            "guarded": True,
            "error": None,
        }

    active = ai_service.get_active_provider()
    meta = ai_service.PROVIDERS[active]
    from app_secrets import get_secret
    if not get_secret(meta["api_key_env"], ""):
        raise HTTPException(
            status_code=400,
            detail=f"API key untuk {meta['label']} belum di-set. Set dulu di kartu provider yang dipilih.",
        )

    # ── Default system prompt: batasi scope AI ke topik karir ──
    # User-supplied system_prompt (jika ada) akan di-append SETELAH guard
    # supaya user tidak bisa override guard.
    default_system = (
        "You are ORDAL Assistant, an AI helper inside an auto-apply job-search app. "
        "Your scope is STRICTLY limited to: writing cover letters, drafting emails to recruiters, "
        "answering job-application form questions, analyzing job postings, CV/resume advice, "
        "interview preparation, and other career-related topics. "
        "If the user asks for anything outside this scope (writing code, debugging, homework, "
        "general knowledge, medical/legal/financial advice, etc.), politely refuse and remind "
        "them of your scope. Reply in the same language as the user's prompt."
    )
    final_system = default_system
    if body.system_prompt and body.system_prompt.strip():
        final_system = default_system + "\n\nAdditional instructions:\n" + body.system_prompt.strip()

    response = await ai_service.chat(
        body.prompt,
        system_prompt=final_system,
        max_tokens=body.max_tokens,
        temperature=body.temperature,
    )

    return {
        "ok": bool(response),
        "provider": active,
        "model": meta["model"],
        "response": response,
        "guarded": False,
        "error": None if response else "Response kosong. Cek API key atau quota provider.",
    }


# ── Guard helpers ────────────────────────────────────────────────────────────
_OFFTOPIC_KEYWORDS = [
    # Kode / programming
    "write code", "write a function", "write a script", "write a program",
    "debug this", "fix this code", "fix the bug", "refactor",
    "implement ", "code review", "pull request", "git push", "git commit",
    "python code", "javascript code", "java code", "c++ code", "rust code",
    "html code", "css code", "sql query", "regex for",
    "api endpoint", "rest api", "graphql",
    # PR / tugas sekolah
    "do my homework", "solve this exercise", "assignment",
    # Hal non-karir lain
    "medical advice", "diagnose", "legal advice", "investment advice",
    "stock pick", "crypto prediction", "lottery number",
]

_OFFTOPIC_PATTERNS = [
    r"\b(write|generate|create|fix|debug|refactor|optimize)\b\s+(a |an |the )?\b(python|javascript|java|c\+\+|rust|golang|ruby|php|html|css|sql|regex|script|function|class|component|api|endpoint|algorithm|program)\b",
    r"\b(write|generate|create|fix|debug|refactor)\b.*\b(code|function|script|program|class|method)\b",
    r"\b(debug|fix|solve)\b.*\b(error|bug|exception|traceback|stacktrace)\b",
    r"```",  # Markdown code block biasanya muncul saat minta kode
]


def _guard_prompt(prompt: str) -> tuple[bool, str]:
    """Return (block, reason). Kalau block=True, kembalikan reason ke user."""
    p = prompt.lower()

    # Cek keyword eksplisit
    for kw in _OFFTOPIC_KEYWORDS:
        if kw in p:
            return True, (
                "Maaf, saya adalah ORDAL Assistant — AI yang khusus membantu urusan karir & "
                "lamaran kerja (cover letter, email ke recruiter, jawab pertanyaan form, "
                "analisis lowongan, persiapan interview, dsb).\n\n"
                "Saya tidak bisa membantu menulis/mendebug kode, mengerjakan PR/tugas, "
                "atau topik di luar konteks pencarian kerja. Silakan ajukan pertanyaan "
                "terkait karir ya."
            )

    # Cek pattern regex (mis. "write a python function", "fix the bug in my code")
    import re
    for pat in _OFFTOPIC_PATTERNS:
        if re.search(pat, p):
            return True, (
                "Maaf, saya adalah ORDAL Assistant — AI yang khusus membantu urusan karir & "
                "lamaran kerja (cover letter, email ke recruiter, jawab pertanyaan form, "
                "analisis lowongan, persiapan interview, dsb).\n\n"
                "Saya tidak bisa membantu menulis/mendebug kode, mengerjakan PR/tugas, "
                "atau topik di luar konteks pencarian kerja. Silakan ajukan pertanyaan "
                "terkait karir ya."
            )

    return False, ""
