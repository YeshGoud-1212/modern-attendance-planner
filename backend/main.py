"""
Atten-Track FastAPI Backend
Receives attendance data from Chrome Extension → computes all analytics
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import logging

from models import AttendancePayload, DashboardResponse
from logic import compute_dashboard
from cache import save_dashboard, get_dashboard, get_latest_dashboard

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Atten-Track API",
    description="Attendance analytics backend",
    version="1.0.0"
)

# Allow React dev server and production origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "https://automation.vnrvjiet.ac.in",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "atten-track-api"}


@app.post("/api/attendance", response_model=DashboardResponse)
def post_attendance(payload: AttendancePayload):
    """
    Receives raw attendance data from Chrome Extension.
    Computes all analytics and returns structured dashboard data.
    Caches result for GET /api/dashboard/{student_id}.
    """
    try:
        logger.info(f"Received attendance data for student: {payload.student_id}")
        result = compute_dashboard(payload)
        save_dashboard(payload.student_id, result)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal computation error")


@app.get("/api/dashboard/latest")
def get_latest_dashboard_route():
    """Return the most recently updated dashboard (any student)."""
    cached = get_latest_dashboard()
    if not cached:
        raise HTTPException(status_code=404, detail="No dashboard data cached yet")
    return cached


@app.get("/api/dashboard/{student_id}")
def get_dashboard_by_student(student_id: str):
    """Return last computed dashboard for a student (extension or demo POST)."""
    cached = get_dashboard(student_id)
    if not cached:
        raise HTTPException(status_code=404, detail=f"No dashboard data for student {student_id}")
    return cached


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
