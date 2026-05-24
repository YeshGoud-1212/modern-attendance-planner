/**
 * attendance-extension/content.js
 * 
 * Chrome Extension Content Script — Atten-Track
 * 
 * Responsibilities:
 *   1. Extract attendance data from VNR portal HTML
 *   2. Send extracted data to backend API for processing
 *   3. Store processed results in extension storage
 *   4. Notify background script and popup of completion
 * 
 * Data Flow:
 *   Portal HTML → Parse → Extract → API POST → Backend Processing → Storage → Popup Notification
 */

// ── Configuration ─────────────────────────────────────────────────────────

const PORTAL_URL = "https://automation.vnrvjiet.ac.in/Academic/Shared/GetStdAttPer";
const BACKEND_URL = "http://localhost:8000/api/attendance";
const EXTRACTION_TIMEOUT = 30000; // 30 seconds
const API_RETRY_ATTEMPTS = 3;
const API_RETRY_DELAY = 1000; // 1 second

// ── Logging Utilities ─────────────────────────────────────────────────────

function logInfo(message, data = null) {
  const prefix = "[Atten-Track Content]";
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function logError(message, error = null) {
  const prefix = "[Atten-Track Content ERROR]";
  if (error) {
    console.error(`${prefix} ${message}`, error);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

// ── Text Processing ──────────────────────────────────────────────────────

function cleanText(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

function extractAttendanceNumbers(text) {
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  return {
    attended: Number(match[1]),
    total: Number(match[2])
  };
}

// ── Data Extraction ───────────────────────────────────────────────────────

/**
 * Fetch attendance data from VNR portal.
 * Uses credentials to maintain authentication context.
 */
async function fetchAttendanceFromPortal() {
  try {
    logInfo("Fetching attendance data from portal...");
    
    const response = await fetch(PORTAL_URL, {
      credentials: "include",
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`Portal responded with status ${response.status}`);
    }

    const data = await response.json();
    if (!data.Data) {
      throw new Error("Portal returned empty attendance data");
    }

    logInfo("Successfully fetched attendance from portal");
    return data.Data;
  } catch (error) {
    logError("Failed to fetch attendance from portal", error);
    throw error;
  }
}

/**
 * Parse HTML attendance table from portal.
 * Extracts subject-wise attendance and overall totals.
 */
function parseAttendanceTable(htmlString) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const rows = doc.querySelectorAll("table tr");

    const subjects = [];
    let overall = null;

    rows.forEach((row, index) => {
      // Skip header rows
      if (index < 2) return;

      const cols = row.querySelectorAll("td, th");
      if (cols.length < 3) return;

      const subjectCode = cleanText(cols[0].innerText);
      const cumulativeText = cleanText(cols[2].innerText);
      const numbers = extractAttendanceNumbers(cumulativeText);

      if (!numbers) return;

      const subjectData = {
        name: subjectCode,
        attended: numbers.attended,
        total: numbers.total
      };

      // Check if this is the total row
      if (subjectCode.toLowerCase() === "total") {
        overall = subjectData;
      } else {
        subjects.push(subjectData);
      }
    });

    if (!overall) {
      throw new Error("Could not find overall attendance totals in portal data");
    }

    logInfo("Successfully parsed attendance table", { subjectCount: subjects.length });

    return {
      overall,
      subjects
    };
  } catch (error) {
    logError("Failed to parse attendance table", error);
    throw error;
  }
}

// ── Backend Communication ─────────────────────────────────────────────────

/**
 * Extract student ID from the page DOM.
 * Looks for common patterns in the portal.
 */
function extractStudentId() {
  try {
    // Try multiple selectors to find student ID
    const selectors = [
      "[data-student-id]",
      ".student-id",
      "#studentId",
      "[aria-label*='Student']"
    ];

    for (const selector of selectors) {
      const elem = document.querySelector(selector);
      if (elem) {
        const id = elem.textContent?.trim() || elem.getAttribute("data-student-id");
        if (id) return id;
      }
    }

    // Fallback: try to extract from any visible text containing common ID patterns
    const bodyText = document.body.innerText;
    const idMatch = bodyText.match(/(?:Reg|Roll|ID|Student)\s*#?\s*[:]?\s*(\d{2}[A-Z]{2}\d{1,5}|\d{8,12})/i);
    if (idMatch) return idMatch[1];

    return "UNKNOWN_STUDENT";
  } catch (error) {
    logError("Failed to extract student ID", error);
    return "UNKNOWN_STUDENT";
  }
}

/**
 * Send extracted attendance to backend for processing.
 * Implements retry logic for resilience.
 */
async function sendAttendanceToBackend(payload, attempt = 1) {
  try {
    logInfo(`Sending attendance to backend (attempt ${attempt}/${API_RETRY_ATTEMPTS})...`);

    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-By": "attendance-extension"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    logInfo("Successfully sent attendance to backend and received processed results");
    return result;
  } catch (error) {
    if (attempt < API_RETRY_ATTEMPTS) {
      logInfo(`Retrying in ${API_RETRY_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, API_RETRY_DELAY));
      return sendAttendanceToBackend(payload, attempt + 1);
    }
    logError("Failed to send attendance to backend after retries", error);
    throw error;
  }
}

// ── Storage & Notification ───────────────────────────────────────────────

/**
 * Store processed attendance data in extension storage.
 * Also caches in memory for quick access.
 */
async function storeAttendanceData(attendanceData) {
  try {
    const storageData = {
      attendanceData,
      lastUpdated: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      chrome.storage.local.set(storageData, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          logInfo("Attendance data stored successfully in extension storage");
          resolve();
        }
      });
    });
  } catch (error) {
    logError("Failed to store attendance data", error);
    throw error;
  }
}

/**
 * Notify background script that extraction is complete.
 */
function notifyExtractionComplete(success, data = null, error = null) {
  try {
    chrome.runtime.sendMessage({
      type: "EXTRACTION_COMPLETE",
      success,
      data,
      error,
      timestamp: new Date().toISOString()
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Background script not ready:", chrome.runtime.lastError.message);
      } else {
        logInfo("Notified background script of extraction completion");
      }
    });
  } catch (error) {
    logError("Failed to notify background script", error);
  }
}

// ── Main Extraction Pipeline ──────────────────────────────────────────────

/**
 * Main orchestration function.
 * Coordinates the full data extraction → processing → storage pipeline.
 */
async function runAttendanceExtraction() {
  try {
    logInfo("=== Starting Attendance Extraction Pipeline ===");

    // Step 1: Extract attendance from portal
    const htmlData = await fetchAttendanceFromPortal();
    const { overall, subjects } = parseAttendanceTable(htmlData);
    
    // Step 2: Prepare payload
    const studentId = extractStudentId();
    const payload = {
      student_id: studentId,
      student_name: "Student",
      overall_attended: overall.attended,
      overall_total: overall.total,
      subjects: subjects,
      holidays: [],
      weekly_schedule: {
        Monday: 0,
        Tuesday: 0,
        Wednesday: 0,
        Thursday: 0,
        Friday: 0,
        Saturday: 0
      },
      semester_end_date: null,
      target_percentage: 75.0
    };

    logInfo("Prepared attendance payload", { studentId, subjectCount: subjects.length });

    // Step 3: Send to backend for processing
    const processedData = await sendAttendanceToBackend(payload);

    // Step 4: Store results
    await storeAttendanceData(processedData);

    // Step 5: Notify completion
    notifyExtractionComplete(true, processedData);

    logInfo("=== Attendance Extraction Pipeline Complete ===");
    return { success: true, data: processedData };

  } catch (error) {
    logError("Attendance extraction pipeline failed", error);
    notifyExtractionComplete(false, null, error.message);
    return { success: false, error: error.message };
  }
}

// ── Initialization ────────────────────────────────────────────────────────

// ── Message Listener ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logInfo("Received message from popup", { type: request.type });
  
  if (request.type === "FETCH_ATTENDANCE") {
    logInfo("Starting attendance extraction...");
    
    runAttendanceExtraction()
      .then(result => {
        logInfo("Extraction successful, sending response", result);
        sendResponse({ success: true, data: result.data });
      })
      .catch(error => {
        logError("Extraction failed", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
});

// ── Initialization ───────────────────────────────────────────────────────

if (window.location.href.includes("automation.vnrvjiet.ac.in")) {
  logInfo("✓ Content script loaded on VNR portal - ready for extraction");
  
  // Optionally log portal page structure for debugging
  setTimeout(() => {
    const tables = document.querySelectorAll("table");
    logInfo(`Found ${tables.length} tables on page`);
    const buttons = document.querySelectorAll("button, a[role='button']");
    logInfo(`Found ${buttons.length} interactive elements`);
  }, 1000);
}
