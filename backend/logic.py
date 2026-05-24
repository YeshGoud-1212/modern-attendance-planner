"""
Atten-Track — Core Attendance Logic
All formulas are mathematically verified and edge-case safe.

Portal update note (new structure):
  • subject.name = subject CODE (e.g. "22HS2EN301"), not a display name
  • overall_attended / overall_total come from the "Total" row in the HTML table
  • overall_percentage is computed server-side from A/T for consistency

Symbols:
  A   = attended classes so far
  T   = total classes held so far
  R   = remaining classes (computed from schedule + semester end + holidays)
  X   = safe bunks
  tg  = target percentage (0–100)
"""

from datetime import date, timedelta
from dateutil.parser import parse as parse_date
from models import AttendancePayload, DashboardResponse, SubjectAnalytics
import logging

logger = logging.getLogger(__name__)

# Default semester end date — overridden by UI date picker
DEFAULT_SEMESTER_END = date(2025, 11, 30)


# ── Date utilities ─────────────────────────────────────────────────────────────

def parse_flexible_date(date_str: str) -> date | None:
    """
    Handle all date string formats the portal or UI may produce:
      "26-01-2025", "January 26, 2025", "2025-01-26", "26/01/2025"
    Returns None on failure — never raises.
    """
    if not date_str:
        return None
    try:
        return parse_date(date_str, dayfirst=True).date()
    except Exception:
        try:
            return parse_date(date_str).date()
        except Exception:
            logger.warning(f"Could not parse date string: {date_str!r}")
            return None


def normalise_holidays(raw_holidays: list) -> set[date]:
    """
    Convert holiday list (from extension) into a set of date objects.
    Skips entries with unparseable dates — never crashes.
    """
    result = set()
    for h in raw_holidays:
        d = parse_flexible_date(h.date)
        if d:
            result.add(d)
    return result


# ── Remaining Classes ──────────────────────────────────────────────────────────

WEEKDAY_MAP = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday",
}

def compute_remaining_classes(
    weekly_schedule,        # WeeklySchedule pydantic model
    semester_end: date,
    holidays: set[date],
) -> int:
    """
    Count total class slots from tomorrow through semester_end (inclusive).

    For each calendar day:
      • Skip Sundays  (no classes defined)
      • Skip holidays (fetched from portal, passed by extension)
      • Add classes_per_day[weekday_name] from weekly_schedule
    """
    today = date.today()

    if semester_end <= today:
        return 0

    total = 0
    current = today + timedelta(days=1)

    while current <= semester_end:
        day_name = WEEKDAY_MAP.get(current.weekday(), "Sunday")

        if day_name == "Sunday":
            current += timedelta(days=1)
            continue

        if current in holidays:
            current += timedelta(days=1)
            continue

        total += getattr(weekly_schedule, day_name, 0)
        current += timedelta(days=1)

    return total


# ── Core Maths ─────────────────────────────────────────────────────────────────

def attendance_percentage(A: int, T: int) -> float:
    """
    attendance = (A / T) × 100
    Returns 0.0 safely when T = 0.
    """
    if T == 0:
        return 0.0
    return round((A / T) * 100, 2)


def compute_safe_bunks(A: int, T: int, R: int, tg: float) -> int:
    """
    Find maximum X (classes that can be skipped) such that:
        A / (T + X) >= tg / 100

    Derivation:
        A >= (tg/100) × (T + X)
        A / (tg/100) >= T + X
        X <= A/(tg/100) - T
        X_max = floor( A/(tg/100) - T )

    Clamped to [0, R] — can never skip more classes than remain.

    Edge cases:
      tg = 0   → can skip everything → return R
      tg = 100 → must attend all     → return 0
      T = 0    → no classes held yet → compute normally (A=0 gives 0)
    """
    if tg <= 0:
        return R
    if tg >= 100:
        return 0

    tg_frac = tg / 100.0
    max_total_allowed = A / tg_frac   # maximum (T + X) while still meeting target
    x = max_total_allowed - T
    safe = int(x)                     # floor — conservative
    return max(0, min(safe, R))


def compute_must_attend(A: int, T: int, R: int, tg: float) -> int:
    """
    Of the R remaining classes, how many must the student attend
    to reach tg% by semester end?

    Required total attended at end  = ceil( (tg/100) × (T + R) )
    Already have                    = A
    Must additionally attend        = max(0, required - A)
    Capped at R (can't attend more than what remains).
    """
    if R == 0:
        return 0

    required_exact = (tg / 100.0) * (T + R)
    # ceil without math.ceil
    required_int   = int(required_exact)
    if required_exact > required_int:
        required_int += 1

    must = required_int - A
    return max(0, min(R, must))


def projected_attendance(A: int, T: int, R: int, attend_x: int) -> float:
    """
    If student attends `attend_x` of the remaining R classes:
        final% = (A + attend_x) / (T + R) × 100
    """
    if T + R == 0:
        return 0.0
    attend_x = max(0, min(attend_x, R))
    return round((A + attend_x) / (T + R) * 100, 2)


# ── Subject Analytics ──────────────────────────────────────────────────────────

def subject_status(pct: float, tg: float) -> str:
    """
    "safe"    — at or above target
    "warning" — within 5% below target
    "danger"  — more than 5% below target
    """
    if pct >= tg:
        return "safe"
    if pct >= tg - 5:
        return "warning"
    return "danger"


def analyse_subject(subj, tg: float) -> SubjectAnalytics:
    """
    Per-subject analytics.
    subject.name is a subject CODE (e.g. "22HS2EN301") from the new portal.

    For safe_bunks and must_attend we use the subject's own attended/total
    since we don't have per-subject remaining class counts.
    """
    A = subj.attended
    T = subj.total
    pct    = attendance_percentage(A, T)
    status = subject_status(pct, tg)

    # Safe bunks relative to current total only
    if tg <= 0:
        safe = T
    elif tg >= 100:
        safe = 0
    else:
        tg_frac  = tg / 100.0
        safe     = max(0, int(A / tg_frac - T))

    # Must attend (using current total as proxy for remaining)
    required_exact = (tg / 100.0) * T
    required_int   = int(required_exact)
    if required_exact > required_int:
        required_int += 1
    must = max(0, required_int - A) if required_exact > A else 0

    return SubjectAnalytics(
        name=subj.name,         # subject code preserved exactly
        attended=A,
        total=T,
        percentage=pct,
        status=status,
        safe_bunks=safe,
        must_attend=must,
    )


# ── Main Entry Point ───────────────────────────────────────────────────────────

def compute_dashboard(payload: AttendancePayload) -> DashboardResponse:
    """
    Called by POST /api/attendance.
    Accepts AttendancePayload from extension → returns DashboardResponse to frontend.
    """
    A  = payload.overall_attended
    T  = payload.overall_total
    tg = payload.target_percentage

    # Input validation
    if A > T:
        raise ValueError(
            f"Attended ({A}) cannot exceed total classes held ({T}). "
            "Check the data returned by the portal."
        )
    if not (0 <= tg <= 100):
        raise ValueError(f"Target percentage must be between 0 and 100, got {tg}.")

    # Semester end date — UI value overrides backend default
    if payload.semester_end_date:
        sem_end = parse_flexible_date(payload.semester_end_date)
        if not sem_end:
            logger.warning(
                f"Could not parse semester_end_date={payload.semester_end_date!r} — "
                "using default"
            )
            sem_end = DEFAULT_SEMESTER_END
    else:
        sem_end = DEFAULT_SEMESTER_END

    # Normalise holidays (portal-supplied)
    holidays = normalise_holidays(payload.holidays)

    # Remaining classes: today → semester end, minus Sundays + holidays
    R = compute_remaining_classes(payload.weekly_schedule, sem_end, holidays)

    # Overall stats
    pct        = attendance_percentage(A, T)
    safe_bunks = compute_safe_bunks(A, T, R, tg)
    must_attend = compute_must_attend(A, T, R, tg)

    # Per-subject analytics
    subject_list = [analyse_subject(s, tg) for s in payload.subjects]

    return DashboardResponse(
        student_id=payload.student_id,
        student_name=payload.student_name or "Student",
        attended=A,
        total=T,
        percentage=pct,
        safe_bunks=safe_bunks,
        must_attend=must_attend,
        remaining_classes=R,
        target_percentage=tg,
        subjects=subject_list,
        semester_end_date=sem_end.isoformat(),
        holidays_count=len(holidays),
    )
