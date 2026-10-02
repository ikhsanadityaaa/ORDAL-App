import os
import tempfile


with tempfile.TemporaryDirectory() as directory:
    os.environ["ORDAL_DATA_DIR"] = directory

    from database import get_db, init_db
    from routers.application_queue import (
        ModeUpdate, QueueCreate, SchedulingUpdate, approve, enqueue,
        get_mode, get_scheduling, list_queue, set_mode, set_scheduling,
    )
    from routers.notifications import list_notifications

    init_db()
    db = get_db()
    db.execute("INSERT INTO local_users(id, email, name) VALUES ('user-1', 'test@example.com', 'Kia')")
    db.execute("INSERT INTO user_preferences(user_id) VALUES ('user-1')")
    cv_id = db.execute(
        "INSERT INTO cvs(user_id, position_label, file_name, file_path, cv_text) VALUES (?, ?, ?, ?, ?)",
        ('user-1', 'Data Analyst', 'cv.pdf', '/tmp/cv.pdf', 'Data analyst 3 tahun. SQL, Python, Excel, Power BI.'),
    ).lastrowid
    target_id = db.execute(
        "INSERT INTO job_targets(user_id, cv_id, position, location, platform) VALUES (?, ?, ?, ?, ?)",
        ('user-1', cv_id, 'Data Analyst', 'Jakarta', 'linkedin'),
    ).lastrowid
    db.commit()
    db.close()

    user = {"id": "user-1"}
    created = enqueue(QueueCreate(
        target_id=target_id,
        platform="linkedin",
        job_title="Data Analyst",
        company="ORDAL Labs",
        job_url="https://example.com/jobs/1",
        location="Jakarta",
        description="Butuh SQL, Python, Excel, Power BI dan pengalaman 2 tahun.",
    ), user=user)
    assert created["status"] == "ready"
    assert created["match"]["score"] >= 80
    assert len(list_queue(user=user)) == 1
    db = get_db()
    assert db.execute("SELECT COUNT(*) FROM candidate_profiles").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM job_snapshots").fetchone()[0] == 1
    assert db.execute("SELECT version FROM reference_cache WHERE cache_key='intelligence'").fetchone()[0] == "1.0.0"
    db.close()

    set_mode(ModeUpdate(mode="review_queue"), user=user)
    assert get_mode(user=user)["mode"] == "review_queue"
    set_scheduling(SchedulingUpdate(
        search_strategy="priority_focus",
        platform_priority=["jobstreet", "linkedin", "glints"],
        sound_enabled=False,
    ), user=user)
    assert get_scheduling(user=user)["platform_priority"][0] == "jobstreet"
    assert get_scheduling(user=user)["sound_enabled"] is False
    assert approve(created["id"], user=user)["status"] == "approved"
    assert list_notifications(user=user)["unread"] == 1

print("product_foundation_self_check: ok")
