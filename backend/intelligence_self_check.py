from workers.intelligence import normalize_cv, normalize_job, score_match


candidate = normalize_cv(
    "Data analyst dengan pengalaman 3 tahun menggunakan SQL, Python, Excel dan Power BI.",
    "Data Analyst",
)
job = normalize_job({
    "title": "Data Analyst",
    "description": "Butuh pengalaman 2 tahun, SQL, Excel, dan Power BI.",
    "location": "Jakarta",
})
result = score_match(candidate, job, {"location": "Jakarta"})
assert result["eligible"] is True
assert result["score"] >= 80, result

blocked = score_match(candidate, normalize_job({"title": "Sales Executive"}), {})
assert blocked["eligible"] is False
assert blocked["hard_filters"] == ["Posisi tidak sesuai target"]

print("intelligence_self_check: ok")
