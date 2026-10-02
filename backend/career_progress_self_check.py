import json
import os
import tempfile


with tempfile.TemporaryDirectory() as directory:
    os.environ["ORDAL_DATA_DIR"] = directory

    from database import get_db, init_db
    from workers.career_progress import build_career_progress

    init_db()
    db = get_db()
    db.execute("INSERT INTO local_users(id, email, name) VALUES ('career-1', 'career@example.com', 'Rina')")
    cv_id = db.execute(
        """INSERT INTO cvs(user_id, position_label, file_name, file_path, cv_text, ats_report)
           VALUES (?, ?, ?, ?, ?, ?)""",
        ('career-1', 'Data Analyst', 'rina.pdf', '/tmp/rina.pdf',
         'Data analyst 3 tahun. SQL Python Excel Power BI. Sarjana. ' * 20,
         json.dumps({"score": 82})),
    ).lastrowid
    target_id = db.execute(
        """INSERT INTO job_targets(user_id, cv_id, position, location, platform, expected_salary, available_join, cover_letter)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        ('career-1', cv_id, 'Data Analyst', 'Jakarta', 'linkedin', '8000000', '2 weeks', 'Cover letter'),
    ).lastrowid
    db.execute("INSERT INTO user_credentials(user_id, platform, email, cookie_valid) VALUES ('career-1', 'linkedin', 'career@example.com', 1)")
    db.execute("INSERT INTO question_bank(user_id, platform, question, normalized, answer) VALUES ('career-1', 'linkedin', 'Notice?', 'notice', '2 weeks')")
    for index, score in enumerate((88, 84, 80, 76, 72), 1):
        db.execute(
            """INSERT INTO application_queue(user_id, target_id, platform, job_title, company, job_url, match_score)
               VALUES (?, ?, 'linkedin', 'Data Analyst', 'Company', ?, ?)""",
            ('career-1', target_id, f'https://example.com/{index}', score),
        )
    db.commit()

    result = build_career_progress(db, 'career-1')
    assert result["overall"] >= 70, result
    assert result["reality_check"]["status"] == "aligned"
    assert result["source_performance"][0]["strong"] == 3
    assert result["stretch_opportunities"]
    assert result["evidence"]["best_cv"] == "rina.pdf"
    db.close()

print("career_progress_self_check: ok")
