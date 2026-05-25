"""
In-memory cache of last computed dashboard per student.
Enables the React app to load data without Chrome extension storage.
"""

from datetime import datetime, timezone
from typing import Optional

from models import DashboardResponse

_store: dict[str, dict] = {}


def save_dashboard(student_id: str, response: DashboardResponse) -> str:
    updated_at = datetime.now(timezone.utc).isoformat()
    _store[student_id] = {
        "data": response,
        "last_updated": updated_at,
    }
    return updated_at


def get_dashboard(student_id: str) -> Optional[dict]:
    entry = _store.get(student_id)
    if not entry:
        return None
    return {
        "data": entry["data"],
        "last_updated": entry["last_updated"],
    }


def get_latest_dashboard() -> Optional[dict]:
    if not _store:
        return None
    student_id = max(_store, key=lambda k: _store[k]["last_updated"])
    return {
        "student_id": student_id,
        **get_dashboard(student_id),
    }
