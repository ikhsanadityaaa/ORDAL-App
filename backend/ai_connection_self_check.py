import asyncio
import os
import tempfile


async def main():
    with tempfile.TemporaryDirectory() as temp_dir:
        os.environ["ORDAL_DATA_DIR"] = temp_dir

        from app_secrets import set_user_secret
        from database import init_db
        from workers import ai_service

        init_db()
        user_id = "ai-self-check"
        set_user_secret(user_id, "GEMINI_API_KEY", "test-key")

        original_call_gemini = ai_service._call_gemini

        async def capture_key(api_key, *_args, **_kwargs):
            assert api_key == "test-key"
            return "OK"

        try:
            ai_service._call_gemini = capture_key
            assert await ai_service.chat_raw(user_id, "test", prefer_provider="gemini") == "OK"
        finally:
            ai_service._call_gemini = original_call_gemini

        original = ai_service.chat_raw

        async def success(*_args, **_kwargs):
            return "OK"

        async def failure(*_args, **_kwargs):
            raise RuntimeError("invalid key")

        try:
            ai_service.chat_raw = success
            result = await ai_service.test_provider(user_id, "gemini")
            assert result["ok"] is True
            assert ai_service.is_provider_verified(user_id, "gemini") is True

            ai_service.chat_raw = failure
            result = await ai_service.test_provider(user_id, "gemini")
            assert result["ok"] is False
            assert ai_service.is_provider_verified(user_id, "gemini") is False
        finally:
            ai_service.chat_raw = original


asyncio.run(main())
print("AI connection self-check passed")
