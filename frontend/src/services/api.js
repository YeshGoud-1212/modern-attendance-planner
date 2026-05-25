/**
 * src/services/api.js
 * Centralised API calls to FastAPI backend.
 * All fetch logic lives here — components stay clean.
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Post raw attendance payload to backend.
 * Used internally (extension posts directly, but this can be used for testing).
 */
export async function postAttendance(payload) {
  const res = await fetch(`${BASE_URL}/api/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
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

/**
 * Fetch latest attendance data from backend.
 * This is the primary way to get data for the dashboard.
 */
export async function fetchLatestAttendance() {
  try {
    const res = await fetch(`${BASE_URL}/api/attendance/latest`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      return await res.json();
    }
    return null;
  } catch (err) {
    console.warn("Failed to fetch from backend:", err.message);
    return null;
  }
}

/**
 * Read cached attendance data from Chrome extension storage.
 * Returns null if extension is not installed or no data yet.
 */
export function readExtensionData() {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) {
      resolve(null);
      return;
    }
    chrome.storage.local.get(["attendanceData", "lastUpdated"], ({ attendanceData, lastUpdated }) => {
      if (attendanceData) {
        resolve({ data: attendanceData, lastUpdated });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Save user settings to extension storage (schedule, target, sem end).
 * Falls back to localStorage if extension not present.
 */
export function saveSettings(settings) {
  if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
    chrome.storage.sync.set(settings);
  } else {
    localStorage.setItem("attentrack_settings", JSON.stringify(settings));
  }
}

export function loadSettings() {
  if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          weeklySchedule: { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 },
          semesterEndDate: null,
          targetPercentage: 75,
        },
        resolve
      );
    });
  }
  // Fallback: localStorage
  try {
    const stored = localStorage.getItem("attentrack_settings");
    return Promise.resolve(
      stored
        ? JSON.parse(stored)
        : { weeklySchedule: { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 }, semesterEndDate: null, targetPercentage: 75 }
    );
  } catch {
    return Promise.resolve({ weeklySchedule: {}, semesterEndDate: null, targetPercentage: 75 });
  }
}
