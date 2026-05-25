/**
 * attendance-extension/popup.js
 * 
 * Popup UI Controller for Atten-Track Extension
 * 
 * Responsibilities:
 *   - Handle user interactions (fetch button clicks)
 *   - Communicate with content script via messages
 *   - Retrieve stored data from chrome.storage
 *   - Update UI with attendance data
 *   - Manage loading/error/success states
 */

console.log("popup.js: Script loading...");

// ── DOM Elements ──────────────────────────────────────────────────────────

const elements = {
  statusSection: document.getElementById("statusSection"),
  statusIndicator: document.getElementById("statusIndicator"),
  statusText: document.getElementById("statusText"),
  lastUpdatedText: document.getElementById("lastUpdatedText"),

  loadingSection: document.getElementById("loadingSection"),
  errorSection: document.getElementById("errorSection"),
  errorMessage: document.getElementById("errorMessage"),
  successSection: document.getElementById("successSection"),
  emptySection: document.getElementById("emptySection"),

  fetchButton: document.getElementById("fetchButton"),
  analyzeButton: document.getElementById("analyzeButton"),
  retryButton: document.getElementById("retryButton"),
  clearButton: document.getElementById("clearButton"),

  overallPercentage: document.getElementById("overallPercentage"),
  progressBar: document.getElementById("progressBar"),
  attendanceNumbers: document.getElementById("attendanceNumbers"),
  safeBunks: document.getElementById("safeBunks"),
  riskStatus: document.getElementById("riskStatus"),
  fetchedAtText: document.getElementById("fetchedAtText")
};

console.log("popup.js: DOM elements loaded", elements);

// ── Logger ────────────────────────────────────────────────────────────────

function logPopup(message, data = null) {
  const prefix = "[Popup]";
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function logError(message, error = null) {
  const prefix = "[Popup ERROR]";
  if (error) {
    console.error(`${prefix} ${message}`, error);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

// ── UI State Management ───────────────────────────────────────────────────

function hideAllSections() {
  elements.statusSection.classList.add("hidden");
  elements.loadingSection.classList.add("hidden");
  elements.errorSection.classList.add("hidden");
  elements.successSection.classList.add("hidden");
  elements.emptySection.classList.add("hidden");
}

function showLoadingState() {
  hideAllSections();
  elements.loadingSection.classList.remove("hidden");
  elements.fetchButton.disabled = true;
  elements.fetchButton.textContent = "⏳ Fetching...";
  logPopup("Showing loading state");
}

function showErrorState(errorMessage) {
  hideAllSections();
  elements.statusSection.classList.remove("hidden");
  elements.statusIndicator.className = "status-indicator error";
  elements.statusText.textContent = "Failed to fetch attendance";
  elements.lastUpdatedText.textContent = "";

  elements.errorSection.classList.remove("hidden");
  elements.errorMessage.textContent = errorMessage || "An unknown error occurred";
  elements.fetchButton.disabled = false;
  elements.fetchButton.textContent = "📊 Fetch Attendance";
  elements.analyzeButton.classList.add("hidden");

  logPopup("Showing error state", { error: errorMessage });
}

function showSuccessState(data) {
  hideAllSections();
  elements.statusSection.classList.remove("hidden");
  elements.statusIndicator.className = "status-indicator success";
  elements.statusText.textContent = "Attendance fetched successfully";

  elements.successSection.classList.remove("hidden");

  // Update data display
  const percentage = data.percentage || 0;
  elements.overallPercentage.textContent = percentage.toFixed(1) + "%";
  elements.progressBar.style.width = percentage + "%";
  elements.attendanceNumbers.textContent = `${data.attended} / ${data.total} classes`;
  elements.safeBunks.textContent = data.safe_bunks || 0;

  // Determine risk status
  let riskClass = "status-safe";
  let riskText = "✓ Safe";
  if (percentage < 75) {
    riskClass = "status-danger";
    riskText = "⚠ Danger";
  } else if (percentage < 85) {
    riskClass = "status-warning";
    riskText = "⚡ Warning";
  }
  elements.riskStatus.textContent = riskText;
  elements.riskStatus.className = `data-value ${riskClass}`;

  // Update timestamp
  if (data.fetchedAt || data.timestamp) {
    const date = new Date(data.fetchedAt || data.timestamp);
    const updatedText = `Last updated: ${date.toLocaleString()}`;
    elements.fetchedAtText.textContent = updatedText;
    elements.lastUpdatedText.textContent = updatedText;
  } else {
    elements.fetchedAtText.textContent = "";
    elements.lastUpdatedText.textContent = "";
  }

  elements.fetchButton.disabled = false;
  elements.fetchButton.textContent = "📊 Fetch Attendance";
  elements.analyzeButton.classList.remove("hidden");

  logPopup("Showing success state", { percentage, safeBunks: data.safe_bunks });
}

function showEmptyState() {
  hideAllSections();
  elements.emptySection.classList.remove("hidden");
  elements.fetchButton.disabled = false;
  elements.fetchButton.textContent = "📊 Fetch Attendance";
  elements.analyzeButton.classList.add("hidden");
  elements.lastUpdatedText.textContent = "";
  logPopup("Showing empty state");
}

async function initializePopup() {
  logPopup("Initializing popup and reading stored data");

  try {
    const stored = await getStoredAttendanceData();
    if (stored) {
      showSuccessState(stored);
    } else {
      showEmptyState();
    }
  } catch (error) {
    logError("Popup initialization failed", error);
    showErrorState(error.message);
  }
}

// ── Data Retrieval ────────────────────────────────────────────────────────

/**
 * Fetch stored attendance data from chrome.storage.local
 */
async function getStoredAttendanceData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["attendanceData", "lastUpdated"], (items) => {
      if (chrome.runtime.lastError) {
        logError("Error reading storage", chrome.runtime.lastError);
        resolve(null);
        return;
      }

      if (items.attendanceData) {
        logPopup("Found stored attendance data", {
          lastUpdated: items.lastUpdated,
          studentId: items.attendanceData.student_id
        });
        resolve({
          ...items.attendanceData,
          fetchedAt: items.lastUpdated
        });
      } else {
        logPopup("No stored attendance data found");
        resolve(null);
      }
    });
  });
}

// ── Message Communication ─────────────────────────────────────────────────

/**
 * Send message to content script to trigger attendance extraction
 */
async function triggerAttendanceExtraction() {
  try {
    logPopup("Sending fetch request to content script...");
    
    // Get the active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab) {
      throw new Error("No active tab found");
    }

    if (!tab.url?.includes("automation.vnrvjiet.ac.in")) {
      throw new Error(
        "Please open the VNR portal (https://automation.vnrvjiet.ac.in) in the active tab first"
      );
    }

    // Send message to content script
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: "FETCH_ATTENDANCE" },
        (response) => {
          if (chrome.runtime.lastError) {
            logError("Error communicating with content script", chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (response?.success) {
            logPopup("Content script returned success", response.data);
            resolve(response.data);
          } else {
            logError("Content script returned error", response?.error);
            reject(new Error(response?.error || "Unknown error from content script"));
          }
        }
      );
    });
  } catch (error) {
    logError("Failed to trigger extraction", error);
    throw error;
  }
}

// ── Event Handlers ────────────────────────────────────────────────────────

/**
 * Handle fetch button click
 */
elements.fetchButton.addEventListener("click", async () => {
  logPopup("Fetch button clicked");
  showLoadingState();

  try {
    const result = await triggerAttendanceExtraction();
    logPopup("Extraction successful", result);
    showSuccessState(result);
  } catch (error) {
    logError("Extraction failed", error);
    showErrorState(error.message);
  }
});

elements.retryButton.addEventListener("click", () => {
  logPopup("Retry button clicked");
  elements.fetchButton.click();
});

elements.clearButton.addEventListener("click", async () => {
  logPopup("Clear button clicked");
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        logError("Failed to clear stored data", chrome.runtime.lastError);
        showErrorState(chrome.runtime.lastError.message);
      } else {
        logPopup("Cleared stored attendance data from storage");
        showEmptyState();
      }
      resolve();
    });
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRACTION_COMPLETE") {
    logPopup("Received extraction completion event", request);

    if (request.success && request.data) {
      showSuccessState({ ...request.data, fetchedAt: new Date().toISOString() });
    } else {
      showErrorState(request.error || "Extraction failed during background fetch");
    }

    sendResponse({ received: true });
  }
  return true;
});

initializePopup();

/**
 * Handle analyze button click
 * Opens the analysis dashboard URL
 */
elements.analyzeButton.addEventListener("click", () => {
  logPopup("Analyze button clicked - opening dashboard...");
  // Try localhost:5173 first (dev server), fall back to production
  const dashboardUrls = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173"
  ];
  
  // Open the first available dashboard
  chrome.tabs.create({ url: dashboardUrls[0] }, () => {
    logPopup("Dashboard tab opened");
  });
});

/**
 * Handle retry button click
 */
elements.retryButton.addEventListener("click", () => {
  logPopup("Retry button clicked");
  elements.fetchButton.click();
});

/**
 * Handle clear button click
 */
elements.clearButton.addEventListener("click", async () => {
  logPopup("Clear button clicked");
  
  // Message background script to clear data
  chrome.runtime.sendMessage({ type: "CLEAR_DATA" }, (response) => {
    if (chrome.runtime.lastError) {
      logError("Error clearing data", chrome.runtime.lastError);
    } else {
      logPopup("Data cleared successfully");
      showEmptyState();
    }
  });
});

// ── Initialization ────────────────────────────────────────────────────────

/**
 * Initialize popup on load
 * Check for stored data and display appropriate state
 */
async function initializePopup() {
  try {
    logPopup("Initializing popup...");

    const storedData = await getStoredAttendanceData();

    if (storedData) {
      showSuccessState(storedData);
    } else {
      showEmptyState();
    }

    logPopup("Popup initialization complete");
  } catch (error) {
    logError("Failed to initialize popup", error);
    showErrorState("Failed to load attendance data");
  }
}

// Initialize when popup loads
document.addEventListener("DOMContentLoaded", initializePopup);
