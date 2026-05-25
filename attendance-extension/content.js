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
const AUTO_EXTRACTION_DELAY = 2000; // wait until portal is ready
const API_RETRY_ATTEMPTS = 3;
const API_RETRY_DELAY = 1000; // 1 second

let autoExtractionTriggered = false;

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

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (parseError) {
      logInfo("Portal returned non-JSON response, falling back to raw text");
      data = text;
    }

    const apiPayload = (typeof data === "object" && data !== null)
      ? data.Data ?? data.data ?? data
      : data;

    if (!apiPayload) {
      throw new Error("Portal returned empty attendance data");
    }

    logInfo("Successfully fetched attendance from portal", {
      payloadType: typeof apiPayload,
      isArray: Array.isArray(apiPayload)
    });
    return apiPayload;
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

      const normalizedLabel = subjectCode.toLowerCase();
      const isTotalLabel = normalizedLabel === "total"
        || normalizedLabel === "overall"
        || normalizedLabel.includes("total")
        || normalizedLabel.includes("overall")
        || normalizedLabel.includes("grand");

      if (isTotalLabel) {
        overall = subjectData;
      } else {
        subjects.push(subjectData);
      }
    });

    if (!overall && subjects.length > 0) {
      const totals = subjects.reduce(
        (acc, item) => ({ attended: acc.attended + item.attended, total: acc.total + item.total }),
        { attended: 0, total: 0 }
      );

      if (totals.total > 0) {
        overall = {
          name: "Total",
          attended: totals.attended,
          total: totals.total
        };
        logInfo("Fallback overall totals computed from subject rows", totals);
      }
    }

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

function parseAttendanceArray(items) {
  const subjects = [];
  let overall = null;

  items.forEach((item) => {
    if (!item) return;

    if (typeof item === "string") {
      if (item.includes("<table")) {
        const parsed = parseAttendanceTable(item);
        subjects.push(...parsed.subjects);
        overall = parsed.overall;
        return;
      }
      return;
    }

    if (typeof item !== "object") return;

    const rawName = item.subjectName || item.Subject || item.name || item.SubjectCode || item.code || item.subject_code || item.SubjectName || item.subject || "";
    const rawAttendance = item.attendance || item.Attended || item.Cumulative || item.Total || item.value || item.attended || item.total || "";

    const subjectCode = cleanText(String(rawName));
    const numbers = extractAttendanceNumbers(String(rawAttendance));
    if (!subjectCode || !numbers) return;

    const subjectData = {
      name: subjectCode,
      attended: numbers.attended,
      total: numbers.total
    };

    if (subjectCode.toLowerCase().includes("total")) {
      overall = subjectData;
    } else {
      subjects.push(subjectData);
    }
  });

  if (!overall && subjects.length > 0) {
    const totals = subjects.reduce(
      (acc, item) => ({ attended: acc.attended + item.attended, total: acc.total + item.total }),
      { attended: 0, total: 0 }
    );
    if (totals.total > 0) {
      overall = totals;
    }
  }

  if (!overall) {
    throw new Error("Could not identify overall attendance totals from portal payload");
  }

  logInfo("Successfully parsed attendance array payload", { subjectCount: subjects.length });
  return { overall, subjects };
}

function parsePortalAttendanceData(rawData) {
  logInfo("Parsing portal attendance payload", { payloadType: typeof rawData });

  if (!rawData) {
    throw new Error("Portal returned empty attendance payload");
  }

  if (typeof rawData === "string") {
    return parseAttendanceTable(rawData);
  }

  if (Array.isArray(rawData)) {
    return parseAttendanceArray(rawData);
  }

  if (typeof rawData === "object") {
    if (Array.isArray(rawData.Data) || Array.isArray(rawData.data) || Array.isArray(rawData.rows) || Array.isArray(rawData.subjects)) {
      return parsePortalAttendanceData(rawData.Data || rawData.data || rawData.rows || rawData.subjects);
    }

    const htmlFragment = Object.values(rawData).find((value) => typeof value === "string" && value.includes("<table"));
    if (htmlFragment) {
      return parseAttendanceTable(htmlFragment);
    }

    if (rawData.overall_attended != null && rawData.overall_total != null && Array.isArray(rawData.subjects)) {
      const subjects = rawData.subjects.map((sub) => {
        const code = cleanText(String(sub.subjectName || sub.Subject || sub.name || sub.SubjectCode || sub.code || sub.subject_code || ""));
        const numbers = extractAttendanceNumbers(String(sub.attendance || sub.Attended || sub.Cumulative || sub.Total || ""));
        return code && numbers ? { name: code, attended: numbers.attended, total: numbers.total } : null;
      }).filter(Boolean);

      if (subjects.length > 0) {
        return {
          overall: {
            name: "Total",
            attended: Number(rawData.overall_attended),
            total: Number(rawData.overall_total)
          },
          subjects
        };
      }
    }
  }

  throw new Error("Unsupported attendance data format from portal");
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
    logInfo("Requesting background to post attendance to backend...");
    return await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "POST_TO_BACKEND", payload }, (response) => {
        if (chrome.runtime.lastError) {
          logError("Error sending message to background", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }

        if (response?.success) {
          logInfo("Background posted attendance to backend successfully");
          resolve(response.result);
        } else {
          logError("Background failed to post attendance to backend", response?.error);
          reject(new Error(response?.error || "Background post failed"));
        }
      });
    });
  } catch (error) {
    logError("Failed to delegate posting attendance to background", error);
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
    const portalData = await fetchAttendanceFromPortal();
    const { overall, subjects } = parsePortalAttendanceData(portalData);

    logInfo("Parsed attendance from portal", {
      overall,
      subjectCount: subjects.length,
      subjectsPreview: subjects.slice(0, 5)
    });
    console.log("[Atten-Track Content] Confirmed attendance:", { overall, subjects });
    
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

  setTimeout(async () => {
    if (!autoExtractionTriggered) {
      autoExtractionTriggered = true;
      logInfo("Triggering automatic attendance fetch after content script load");
      const result = await runAttendanceExtraction();
      if (result.success) {
        logInfo("Automatic attendance extraction completed successfully", result.data);
      } else {
        logError("Automatic attendance extraction failed", result.error);
      }
    }
  }, AUTO_EXTRACTION_DELAY);

  // Optionally log portal page structure for debugging
  setTimeout(() => {
    const tables = document.querySelectorAll("table");
    logInfo(`Found ${tables.length} tables on page`);
    const buttons = document.querySelectorAll("button, a[role='button']");
    logInfo(`Found ${buttons.length} interactive elements`);
  }, 1000);
}
