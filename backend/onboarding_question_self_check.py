import asyncio
import os
import tempfile
from pathlib import Path


async def main() -> None:
    root = Path(__file__).resolve().parents[1]
    translations = (root / "frontend/src/stores/i18nStore.js").read_text(encoding="utf-8")
    styles = (root / "frontend/src/index.css").read_text(encoding="utf-8")
    assert "Hai! Kamu biasa dipanggil apa?" in translations
    assert "Kami boleh memanggilmu siapa?" not in translations
    assert "Bricolage Grotesque" in styles
    assert "prefers-reduced-motion: reduce" in styles

    with tempfile.TemporaryDirectory() as data_dir:
        os.environ["ORDAL_DATA_DIR"] = data_dir

        import database
        from routers.question_bank import _validate_typed_answer
        from services.telegram_service import prompt_kind
        from workers import answer_helper

        database.init_db()

        assert prompt_kind("text", "How many years have you worked?") == "text"
        assert prompt_kind("number", "Years of experience") == "number"
        assert prompt_kind("text", "Availability\nOptions: Now; Two weeks") == "dropdown"

        _validate_typed_answer("Availability\nOptions: Now; Two weeks", "Now", "dropdown")
        _validate_typed_answer("Portfolio URL", "https://example.com", "text")
        _validate_typed_answer("Years of experience", "4", "number")

        for question, answer, field_type in (
            ("Availability\nOptions: Now; Two weeks", "Someday", "dropdown"),
            ("Years of experience", "four", "number"),
        ):
            try:
                _validate_typed_answer(question, answer, field_type)
            except Exception:
                pass
            else:
                raise AssertionError(f"invalid {field_type} answer was accepted")

        called_ai = False

        async def fake_ai(*_args, **_kwargs):
            nonlocal called_ai
            called_ai = True
            return "Invented answer"

        answer_helper.answer_question = fake_ai
        result = await answer_helper.answer_application_question(
            user_id="self-check",
            platform="linkedin",
            question="What is your preferred management style?",
            field_type="text",
            cv_text="Experienced software engineer with documented Python and PostgreSQL project work." * 2,
            job_title="Software Engineer",
            ask_user_question=None,
        )
        assert result == ""
        assert not called_ai

        async def ask_user(*_args, **_kwargs):
            return "Collaborative and direct"

        result = await answer_helper.answer_application_question(
            user_id="self-check",
            platform="linkedin",
            question="What is your preferred management style?",
            field_type="text",
            cv_text="Experienced software engineer with documented Python and PostgreSQL project work." * 2,
            job_title="Software Engineer",
            ask_user_question=ask_user,
        )
        assert result == "Collaborative and direct"

    print("onboarding and question self-check passed")


if __name__ == "__main__":
    asyncio.run(main())
