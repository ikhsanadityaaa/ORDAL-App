from routers.cv import (
    build_cover_letter_template_prompt,
    normalize_cover_letter_placeholders,
    normalize_target_positions,
)


positions = normalize_target_positions(
    ["HR Staff", "Talent Acquisition", "hr staff"],
    "General Affair, Trainer",
)
assert positions == ["HR Staff", "Talent Acquisition"]
assert normalize_target_positions([], "General Affair, Trainer") == ["General Affair", "Trainer"]

prompt = build_cover_letter_template_prompt(
    "Datari has recruitment and onboarding experience.",
    positions,
    "en",
)
assert "HR Staff, Talent Acquisition" in prompt
assert "{company}" in prompt
assert "{position}" in prompt
assert "Never invent" in prompt

normalized = normalize_cover_letter_placeholders(
    "Dear {perusahaan}, I am applying for {posisi}."
)
assert normalized == "Dear {company}, I am applying for {position}."

print("cover letter prompt self-check passed")
