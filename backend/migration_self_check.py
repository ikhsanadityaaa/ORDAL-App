import os
import tempfile


with tempfile.TemporaryDirectory() as directory:
    os.environ["ORDAL_DATA_DIR"] = directory
    import database

    connection = database.get_db()
    connection.executescript(database.SCHEMA_SQL)
    connection.execute("INSERT INTO local_users(id, email, name) VALUES ('user-1', 'test@example.com', 'Kia')")
    connection.execute("INSERT INTO user_preferences(user_id, expected_salary) VALUES ('user-1', '12000000')")
    connection.execute("INSERT INTO cvs(user_id, position_label, file_name, file_path) VALUES ('user-1', 'Data Analyst', 'cv.pdf', '/tmp/cv.pdf')")
    connection.commit()
    connection.close()

    database.init_db()
    connection = database.get_db()
    assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert connection.execute("SELECT name FROM local_users WHERE id='user-1'").fetchone()[0] == "Kia"
    assert connection.execute("SELECT expected_salary FROM user_preferences WHERE user_id='user-1'").fetchone()[0] == "12000000"
    assert connection.execute("SELECT file_name FROM cvs WHERE user_id='user-1'").fetchone()[0] == "cv.pdf"
    assert connection.execute("SELECT version FROM schema_migrations").fetchone()[0] == 1
    assert connection.execute("SELECT application_mode FROM user_preferences WHERE user_id='user-1'").fetchone()[0] == "auto_apply"
    connection.close()

print("migration_self_check: ok")
