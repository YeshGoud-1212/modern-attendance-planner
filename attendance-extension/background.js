/**
 * attendance-extension/background.js
 * 
 * Service Worker for Atten-Track Chrome Extension
 * 
 * Manifest V3 Service Worker — handles:
 *   - Extension state management
 *   - Message routing
 *   - Storage coordination
 *   - Badge/icon updates based on status
 */

// ── Logger ────────────────────────────────────────────────────────────────

function logBackground(message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[BG ${timestamp}]`;
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ── State Management ──────────────────────────────────────────────────────

const STATE = {
  isExtracting: false,
  lastExtraction: null,
  lastError: null,
  currentData: null
};

// ── Backend Configuration ─────────────────────────────────────────────────
const BACKEND_URL = "http://localhost:8000/api/attendance";
const API_RETRY_ATTEMPTS_BG = 3;
const API_RETRY_DELAY_BG = 1000;

async function postToBackend(payload, attempt = 1) {
  try {
    logBackground(`Posting attendance to backend (attempt ${attempt}/${API_RETRY_ATTEMPTS_BG})`);

    const resp = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-By": "attendance-extension"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Backend returned ${resp.status}: ${errText}`);
    }

    const result = await resp.json();
    logBackground("Backend returned processed attendance", { result });
    return result;
  } catch (err) {
    if (attempt < API_RETRY_ATTEMPTS_BG) {
      logBackground(`Retrying backend post in ${API_RETRY_DELAY_BG}ms...`);
      await new Promise(r => setTimeout(r, API_RETRY_DELAY_BG));
      return postToBackend(payload, attempt + 1);
    }
    logBackground("Failed to post to backend after retries", { error: err.message });
    throw err;
  }
}

// ── Storage Helpers ──────────────────────────────────────────────────────

async function getStoredData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["attendanceData", "lastUpdated"], (items) => {
      resolve({
        data: items.attendanceData || null,
        lastUpdated: items.lastUpdated || null
      });
    });
  });
}

async function clearStoredData() {
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => {
      logBackground("Stored data cleared");
      resolve();
    });
  });
}

// ── Message Handler ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logBackground("Received message", { type: request.type, sender: sender.url });

  switch (request.type) {
    case "EXTRACTION_COMPLETE":
      handleExtractionComplete(request, sendResponse);
      break;

    case "GET_STATUS":
      handleGetStatus(sendResponse);
      break;

    case "CLEAR_DATA":
      handleClearData(sendResponse);
      break;

    case "GET_STORED_DATA":
      handleGetStoredData(sendResponse);
      break;

      case "POST_TO_BACKEND":
        (async () => {
          try {
            const result = await postToBackend(request.payload);
            sendResponse({ success: true, result });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        break;

    default:
      logBackground(`Unknown message type: ${request.type}`);
      sendResponse({ success: false, error: "Unknown message type" });
  }

  return true; // Keep channel open for async response
});

// ── Message Handlers ─────────────────────────────────────────────────────

function handleExtractionComplete(request, sendResponse) {
  STATE.isExtracting = false;

  if (request.success) {
    logBackground("Extraction succeeded", {
      studentId: request.data?.student_id,
      attended: request.data?.attended,
      percentage: request.data?.percentage
    });
    
    STATE.lastExtraction = new Date().toISOString();
    STATE.lastError = null;
    STATE.currentData = request.data;

    // Update extension icon to show success
    updateBadge("✓", "#10b981");

  } else {
    logBackground("Extraction failed", { error: request.error });
    STATE.lastError = request.error;

    // Update extension icon to show error
    updateBadge("!", "#ef4444");
  }

  sendResponse({ received: true });
}

function handleGetStatus(sendResponse) {
  sendResponse({
    isExtracting: STATE.isExtracting,
    lastExtraction: STATE.lastExtraction,
    lastError: STATE.lastError,
    hasData: !!STATE.currentData
  });
}

async function handleClearData(sendResponse) {
  await clearStoredData();
  STATE.currentData = null;
  STATE.lastExtraction = null;
  STATE.lastError = null;
  updateBadge("", null);
  sendResponse({ success: true });
}

async function handleGetStoredData(sendResponse) {
  const stored = await getStoredData();
  sendResponse(stored);
}

// ── Badge Management ────────────────────────────────────────────────────

function updateBadge(text, color) {
  try {
    if (text) {
      chrome.action.setBadgeText({ text });
      if (color) {
        chrome.action.setBadgeBackgroundColor({ color });
      }
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (error) {
    console.error("Failed to update badge:", error);
  }
}

// ── Initialization ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    logBackground("Extension installed");
    chrome.action.setBadgeText({ text: "new" });
    chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
  } else if (details.reason === "update") {
    logBackground("Extension updated");
  }
});

// Restore state on startup
(async () => {
  const stored = await getStoredData();
  if (stored.data) {
    STATE.currentData = stored.data;
    STATE.lastExtraction = stored.lastUpdated;
    updateBadge("✓", "#10b981");
    logBackground("Service worker started - restored previous data");
  } else {
    logBackground("Service worker started - no stored data");
  }
})();

logBackground("Background service worker initialized");
