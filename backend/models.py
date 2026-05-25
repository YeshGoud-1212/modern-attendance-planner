"""
Pydantic models — request payload from extension, response to frontend
"""

from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date


# ── Incoming from Chrome Extension ────────────────────────────────

class SubjectData(BaseModel):
    name: str
    attended: int
    total: int

    @field_validator("attended", "total")
    @classmethod
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("attended/total cannot be negative")
        return v


class Holiday(BaseModel):
    name: str
    date: str  # "DD-MM-YYYY" or "Month DD, YYYY" — normalised in logic layer


class WeeklySchedule(BaseModel):
    """Number of classes per weekday. 0 = no classes that day."""
    Monday: int = 0
    Tuesday: int = 0
    Wednesday: int = 0
    Thursday: int = 0
    Friday: int = 0
    Saturday: int = 0

    @field_validator("Monday","Tuesday","Wednesday","Thursday","Friday","Saturday")
    @classmethod
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("Classes per day cannot be negative")
        return v


class AttendancePayload(BaseModel):
    """
    Posted by Chrome Extension after scraping the college portal.
    """
    student_id: str
    student_name: Optional[str] = "Student"
    overall_attended: int           # A — total attended so far
    overall_total: int              # T — total classes held so far
    subjects: list[SubjectData]
    holidays: list[Holiday] = []
    weekly_schedule: WeeklySchedule = WeeklySchedule()
    semester_end_date: Optional[str] = None   # "YYYY-MM-DD", overrides backend default
    target_percentage: float = 75.0           # default 75%, user-configurable


# ── Outgoing to React Frontend ─────────────────────────────────────

class SubjectAnalytics(BaseModel):
    name: str
    attended: int
    total: int
    percentage: float
    status: str           # "safe" | "warning" | "danger"
    safe_bunks: int       # bunks left for this subject
    must_attend: int      # classes must attend to reach target


class DashboardResponse(BaseModel):
    student_id: str
    student_name: str

    # Overall stats
    attended: int
    total: int
    percentage: float

    # Bunk logic
    safe_bunks: int          # can skip this many and still hit target
    must_attend: int         # must attend this many of remaining classes

    # Remaining classes
    remaining_classes: int   # computed from schedule + semester end + holidays

    # Target
    target_percentage: float

    # Subjects
    subjects: list[SubjectAnalytics]

    # Semester info
    semester_end_date: str
    holidays_count: int
