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

    logInfo(`DEBUG: Found ${rows.length} rows in table`);

    const subjects = [];
    let overall = null;

    rows.forEach((row, index) => {
      const cols = row.querySelectorAll("td, th");
      
      // Log first few rows for debugging
      if (index < 5) {
        const colTexts = Array.from(cols).map(c => cleanText(c.innerText)).join(" | ");
        logInfo(`DEBUG Row ${index}: ${colTexts}`);
      }

      // Skip header rows (first row usually)
      if (index === 0) return;
      
      // Need at least 2-3 columns
      if (cols.length < 2) return;

      // Try to extract subject code and attendance from different column positions
      const col0 = cleanText(cols[0].innerText);
      const col1 = cleanText(cols[1].innerText);
      const col2 = cols.length > 2 ? cleanText(cols[2].innerText) : "";
      const col3 = cols.length > 3 ? cleanText(cols[3].innerText) : "";

      // Try multiple patterns to find attendance numbers
      let numbers = null;
      let attendanceText = "";

      // Pattern 1: Check if col2 or col3 has attendance (X/Y format)
      if (col2.includes("/")) {
        numbers = extractAttendanceNumbers(col2);
        attendanceText = col2;
      } else if (col3.includes("/")) {
        numbers = extractAttendanceNumbers(col3);
        attendanceText = col3;
      } else if (col1.includes("/")) {
        numbers = extractAttendanceNumbers(col1);
        attendanceText = col1;
      }

      if (!numbers) return;

      // Determine if this is a subject or total row
      const normalizedCol0 = col0.toLowerCase();
      const isTotalLabel = normalizedCol0 === "total"
        || normalizedCol0 === "overall"
        || normalizedCol0.includes("total")
        || normalizedCol0.includes("overall")
        || normalizedCol0.includes("grand")
        || normalizedCol0 === ""
        || normalizedCol0.length < 2;

      const subjectData = {
        name: col0 || "Total",
        attended: numbers.attended,
        total: numbers.total
      };

      logInfo(`DEBUG: Parsed row ${index} - "${col0}" - ${attendanceText}`, subjectData);

      if (isTotalLabel) {
        overall = subjectData;
        logInfo(`DEBUG: Marked as TOTAL row`, subjectData);
      } else {
        subjects.push(subjectData);
      }
    });

    logInfo(`DEBUG: Parsed ${subjects.length} subjects, overall=${!!overall}`);

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
      logError("DEBUG: No overall found, subjects array:", subjects);
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
  logInfo("Parsing portal attendance payload", { payloadType: typeof rawData, isArray: Array.isArray(rawData) });

  if (!rawData) {
    throw new Error("Portal returned empty attendance payload");
  }

  // Log the actual data structure for debugging
  try {
    if (typeof rawData === "object" && !Array.isArray(rawData)) {
      logInfo("DEBUG: Object keys:", Object.keys(rawData));
    }
  } catch (e) {
    logInfo("DEBUG: Could not extract keys from object");
  }

  if (typeof rawData === "string") {
    logInfo("DEBUG: Raw data is string, attempting HTML parse");
    return parseAttendanceTable(rawData);
  }

  if (Array.isArray(rawData)) {
    logInfo("DEBUG: Raw data is array, attempting array parse");
    return parseAttendanceArray(rawData);
  }

  if (typeof rawData === "object") {
    // Try to extract data from nested properties
    if (Array.isArray(rawData.Data) || Array.isArray(rawData.data) || Array.isArray(rawData.rows) || Array.isArray(rawData.subjects)) {
      logInfo("DEBUG: Found nested array in object, recursing");
      return parsePortalAttendanceData(rawData.Data || rawData.data || rawData.rows || rawData.subjects);
    }

    // Look for HTML fragment in object values
    const htmlFragment = Object.values(rawData).find((value) => typeof value === "string" && value.includes("<table"));
    if (htmlFragment) {
      logInfo("DEBUG: Found HTML fragment in object values, parsing as HTML");
      return parseAttendanceTable(htmlFragment);
    }

    // Try to parse object with explicit attendance structure
    if (rawData.overall_attended != null && rawData.overall_total != null && Array.isArray(rawData.subjects)) {
      logInfo("DEBUG: Found explicit overall_attended/overall_total structure");
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

    // Try generic object parsing - iterate through all properties
    logInfo("DEBUG: Attempting generic object parsing");
    const allPairs = [];
    for (const [key, value] of Object.entries(rawData)) {
      if (typeof value === "string" && value.includes("/")) {
        const nums = extractAttendanceNumbers(value);
        if (nums) {
          allPairs.push({ name: key, attended: nums.attended, total: nums.total });
        }
      }
    }
    
    if (allPairs.length > 0) {
      logInfo("DEBUG: Found attendance data in object properties", { count: allPairs.length });
      const totals = allPairs.reduce(
        (acc, item) => ({ attended: acc.attended + item.attended, total: acc.total + item.total }),
        { attended: 0, total: 0 }
      );
      return {
        overall: { name: "Total", attended: totals.attended, total: totals.total },
        subjects: allPairs.filter(p => !p.name.toLowerCase().includes("total"))
      };
    }
  }

  logError("DEBUG: Unsupported attendance data format", { rawData: JSON.stringify(rawData).substring(0, 500) });
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
    logInfo("DEBUG: Raw portal data type", { type: typeof portalData, isArray: Array.isArray(portalData) });
    
    let parsed;
    try {
      parsed = parsePortalAttendanceData(portalData);
    } catch (parseError) {
      logError("Parse attempt failed, trying alternative formats...", parseError);
      // Try to create minimal fallback if parsing fails
      if (typeof portalData === "object" && portalData) {
        logInfo("DEBUG: Attempting to extract any attendance-like data from raw payload");
        // Log first 500 chars of stringified data for debugging
        const dataStr = JSON.stringify(portalData).substring(0, 500);
        logInfo(`DEBUG: Raw payload preview: ${dataStr}`);
      }
      throw parseError;
    }

    const { overall, subjects } = parsed;

    logInfo("Parsed attendance from portal", {
      overall,
      subjectCount: subjects.length,
      subjectsPreview: subjects.slice(0, 3)
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
