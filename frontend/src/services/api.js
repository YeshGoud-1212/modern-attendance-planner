/**
 * src/services/api.js
 * Centralised API calls to FastAPI backend.
 * All fetch logic lives here — components stay clean.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

const DEFAULT_SCHEDULE = {
  Monday: 0,
  Tuesday: 0,
  Wednesday: 0,
  Thursday: 0,
  Friday: 0,
  Saturday: 0,
};

const LOCAL_DASHBOARD_KEY = "attentrack_dashboard_cache";

async function parseErrorResponse(res) {
  const err = await res.json().catch(() => ({ detail: "Unknown error" }));
  const detail = err.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join("; ");
  return `HTTP ${res.status}`;
}

/**
 * Retry wrapper for transient network failures.
 */
export async function withRetry(fn, { retries = 3, delayMs = 1000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Post raw attendance payload to backend.
 */
export async function postAttendance(payload) {
  return withRetry(async () => {
    const res = await fetch(`${BASE_URL}/api/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseErrorResponse(res));
    const data = await res.json();
    cacheDashboardLocally(data);
    return data;
  });
}

/**
 * Fetch cached dashboard from backend (after extension POST or demo).
 */
export async function fetchDashboard(studentId) {
  const path = studentId
    ? `/api/dashboard/${encodeURIComponent(studentId)}`
    : "/api/dashboard/latest";

  const res = await fetch(`${BASE_URL}${path}`, {
    signal: AbortSignal.timeout(5000),
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseErrorResponse(res));

  const body = await res.json();
  const data = body.data ?? body;
  const lastUpdated = body.last_updated ?? null;
  if (data) cacheDashboardLocally(data, lastUpdated);
  return { data, lastUpdated, studentId: body.student_id ?? data?.student_id };
}

/**
 * Health check — used by Dashboard to detect if backend is reachable.
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function cacheDashboardLocally(data, lastUpdated) {
  try {
    localStorage.setItem(
      LOCAL_DASHBOARD_KEY,
      JSON.stringify({
        data,
        lastUpdated: lastUpdated ?? new Date().toISOString(),
      })
    );
  } catch {
    /* storage full or private mode */
  }
}

function normalizeStudentId(value) {
  return String(value || "").trim().toUpperCase();
}

function isUnknownStudentId(value) {
  const normalized = normalizeStudentId(value);
  return !normalized || normalized === "UNKNOWN_STUDENT";
}

function canUseDashboardForRoll(data, studentId) {
  if (!studentId) return true;

  const dashboardStudentId = normalizeStudentId(data?.student_id);
  return dashboardStudentId === normalizeStudentId(studentId) || isUnknownStudentId(dashboardStudentId);
}

export function readLocalDashboardCache() {
  try {
    const raw = localStorage.getItem(LOCAL_DASHBOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.data) return parsed;
  } catch {
    return null;
  }
  return null;
}

/**
 * Read cached attendance data from Chrome extension storage.
 */
export function readExtensionData() {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) {
      resolve(null);
      return;
    }
    chrome.storage.local.get(["attendanceData", "lastUpdated"], ({ attendanceData, lastUpdated }) => {
      if (attendanceData) {
        cacheDashboardLocally(attendanceData, lastUpdated);
        resolve({ data: attendanceData, lastUpdated, source: "extension" });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Unified loader: extension → backend API → localStorage.
 */
export async function loadAttendanceData(studentId = null) {
  const ext = await readExtensionData();
  if (ext?.data && canUseDashboardForRoll(ext.data, studentId)) {
    return { ...ext, source: "extension" };
  }

  try {
    const latest = await fetchDashboard(null);
    if (latest?.data && canUseDashboardForRoll(latest.data, studentId)) {
      return { ...latest, source: "backend" };
    }
  } catch {
    /* continue */
  }

  if (studentId) {
    try {
      const fromApi = await fetchDashboard(studentId);
      if (fromApi?.data) return { ...fromApi, source: "backend" };
    } catch {
      /* try fallbacks below */
    }
  }

  const local = readLocalDashboardCache();
  if (local?.data && canUseDashboardForRoll(local.data, studentId)) {
    return { ...local, source: "local" };
  }

  return null;
}

export function saveSettings(settings) {
  const payload = {
    weeklySchedule: settings.weeklySchedule ?? settings.weekly_schedule ?? DEFAULT_SCHEDULE,
    semesterEndDate: settings.semesterEndDate ?? settings.semester_end_date ?? null,
    targetPercentage: settings.targetPercentage ?? settings.target_percentage ?? 75,
  };

  if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
    chrome.storage.sync.set(payload);
  }
  try {
    localStorage.setItem("attentrack_settings", JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadSettings() {
  if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          weeklySchedule: DEFAULT_SCHEDULE,
          semesterEndDate: null,
          targetPercentage: 75,
        },
        (synced) => {
          try {
            const local = localStorage.getItem("attentrack_settings");
            resolve(local ? { ...JSON.parse(local), ...synced } : synced);
          } catch {
            resolve(synced);
          }
        }
      );
    });
  }

  try {
    const stored = localStorage.getItem("attentrack_settings");
    return Promise.resolve(
      stored
        ? JSON.parse(stored)
        : { weeklySchedule: DEFAULT_SCHEDULE, semesterEndDate: null, targetPercentage: 75 }
    );
  } catch {
    return Promise.resolve({
      weeklySchedule: DEFAULT_SCHEDULE,
      semesterEndDate: null,
      targetPercentage: 75,
    });
  }
}
