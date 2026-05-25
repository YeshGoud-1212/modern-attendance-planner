"""
API integration tests — run: python -m pytest test_api.py -q
Or: python test_api.py
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

SAMPLE_PAYLOAD = {
    "student_id": "23IT101",
    "student_name": "Alex Johnson",
    "overall_attended": 45,
    "overall_total": 60,
    "subjects": [
        {"name": "Data Structures", "attended": 12, "total": 15},
        {"name": "Operating Systems", "attended": 8, "total": 12},
    ],
    "holidays": [{"name": "Republic Day", "date": "26-01-2025"}],
    "weekly_schedule": {
        "Monday": 4,
        "Tuesday": 4,
        "Wednesday": 4,
        "Thursday": 4,
        "Friday": 4,
        "Saturday": 0,
    },
    "semester_end_date": "2025-11-30",
    "target_percentage": 75,
}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_post_attendance_and_get_dashboard():
    r = client.post("/api/attendance", json=SAMPLE_PAYLOAD)
    assert r.status_code == 200
    body = r.json()
    assert body["student_id"] == "23IT101"
    assert body["percentage"] == 75.0
    assert "safe_bunks" in body

    cached = client.get("/api/dashboard/23IT101")
    assert cached.status_code == 200
    assert cached.json()["data"]["student_id"] == "23IT101"

    latest = client.get("/api/dashboard/latest")
    assert latest.status_code == 200
    assert latest.json()["student_id"] == "23IT101"


def test_get_dashboard_not_found():
    r = client.get("/api/dashboard/NONEXISTENT")
    assert r.status_code == 404


def test_invalid_attendance_payload():
    bad = {**SAMPLE_PAYLOAD, "overall_attended": 100, "overall_total": 60}
    r = client.post("/api/attendance", json=bad)
    assert r.status_code == 422


if __name__ == "__main__":
    test_health()
    test_post_attendance_and_get_dashboard()
    test_get_dashboard_not_found()
    test_invalid_attendance_payload()
    print("All tests passed.")
