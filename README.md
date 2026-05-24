# 🎓 Atten-Track — Full Stack Attendance Tracker

Real attendance data from VNR EduPrime portal via Chrome Extension → FastAPI analytics → React dashboard.

---

## 🏗️ Architecture

```
College Portal (vnrvjiet.ac.in)
        │
        │  User logs in normally (no credentials in our system)
        ▼
Chrome Extension (extension/)
        │  Reads DOM after authentication
        │  Calls internal portal API using browser session
        │  POSTs structured data to FastAPI
        ▼
FastAPI Backend (backend/) — localhost:8000
        │  Computes all analytics
        │  Returns DashboardResponse JSON
        │  Stores result via extension → chrome.storage.local
        ▼
React Frontend (frontend/) — localhost:5173
        │  Reads from chrome.storage.local (polls every 5s)
        │  Displays dashboard, charts, bunk calculator
```

---

## 🚀 Setup (3 steps)

### Step 1 — Start the Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8000
```

Verify: open http://localhost:8000/health → should return `{"status":"ok"}`

---

### Step 2 — Start the Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

---

### Step 3 — Install the Chrome Extension

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project
5. The 🎓 Atten-Track icon will appear in your toolbar

---

## 📋 How to Use (Every Session)

1. Open [VNR Portal](https://automation.vnrvjiet.ac.in/eduprime3) in Chrome
2. Log in with your college credentials (we never see these)
3. Click the **Atten-Track** extension icon in the toolbar
4. Click **⚡ Fetch Attendance**
5. Switch to http://localhost:5173/dashboard — data loads automatically

---

## ⚙️ First-Time Configuration

On first visit to the dashboard, you'll be prompted to set:

| Setting | Where | Default |
|---|---|---|
| Classes per weekday | Schedule dialog | 0 (must set) |
| Semester end date | Schedule dialog | Nov 30, 2025 |
| Attendance target % | Schedule dialog or inline edit | 75% |

Settings are saved to Chrome extension storage and sent with every fetch.

---

## 🔢 Math Reference

### Attendance Percentage
```
attendance = (A / T) × 100
```

### Safe Bunks (X = max classes you can skip)
```
Find max X such that: A / (T + X) ≥ target/100
Solving: X = floor(A / (target/100) - T)
Capped at R (remaining classes)
```

### Must Attend
```
required_total = ceil((target/100) × (T + R))
must_attend = max(0, required_total - A)
```

### Projected Attendance (Bunk Impact Calculator)
```
projected = (A + attended_future) / (T + R) × 100
```

### Remaining Classes
```
R = Σ classes_per_day for each day in [today+1 .. semester_end]
    excluding: Sundays, holidays from portal
```

---

## 📁 Project Structure

```
atten-track-full/
├── backend/
│   ├── main.py          # FastAPI app, CORS, routes
│   ├── models.py        # Pydantic request/response models
│   ├── logic.py         # All attendance math (edge-case safe)
│   └── requirements.txt
│
├── extension/
│   ├── manifest.json    # Chrome Extension MV3
│   ├── content.js       # Runs on portal, scrapes + sends data
│   ├── popup.html       # Extension popup UI
│   ├── popup.js         # Popup logic + messaging
│   └── icons/           # Extension icons
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── Home.jsx          # Login-style entry page
    │   │   └── Dashboard.jsx     # Main dashboard (real data)
    │   ├── components/
    │   │   ├── AttendanceChart.jsx
    │   │   ├── FloatingShapes.jsx
    │   │   ├── NoDataPrompt.jsx  # Shown when extension hasn't run
    │   │   └── ui/               # shadcn-style components
    │   ├── hooks/
    │   │   └── useAttendance.js  # Data polling hook
    │   ├── services/
    │   │   └── api.js            # API + storage abstraction
    │   └── data/
    │       └── students.js       # DAYS constant + mock fallback
    ├── package.json
    ├── vite.config.js
    └── tailwind.config.js
```

---

## 🛡️ Security Design

- ❌ We never collect, store, or transmit login credentials
- ❌ No session cookies are handled by our code
- ✅ User authenticates directly with the college portal
- ✅ Extension uses the browser's own authenticated session
- ✅ Only processed attendance numbers reach our backend
- ✅ Backend runs locally — no data leaves your machine

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| Dashboard shows "No Data" | Run the extension on the portal first |
| Extension says "Backend unreachable" | Start `python main.py` in `backend/` |
| "Student ID not found" | Navigate to the attendance page, not just the portal home |
| Extension not appearing | Enable Developer Mode in chrome://extensions |
| CORS error in console | Make sure backend is running on port 8000 |

---

## 🔄 Portal Update Notes (New Structure)

The extension `content.js` has been updated for the **restructured VNR EduPrime portal**.

### What changed
| | Old portal | New portal |
|---|---|---|
| Student ID | Numeric `studentId` from JS variable | `xLockId` token (Base64url, long string) |
| API endpoint | `GetStdAttPer?studentId=&semId=undefined` | `GetStdAttPer?studentId=<xLockId>&semId=<real>` |
| Subject column | `<td>` | `<th>` (subject CODE e.g. `22HS2EN301`) |
| Fraction format | `"45/60"` | `"36 / 42"` or `"257/392(65.56)"` |
| Grand total | No dedicated row | `<th>Total</th>` row |
| semId | `undefined` (broken) | Real semId intercepted from URL |

### How `content.js` gets the real semId
The extension installs a `fetch` interceptor **before** clicking `#attp`.
When the portal calls `GetStdAttPer` internally, the interceptor:
1. Captures the full response JSON (`json.Data` = attendance HTML)
2. Reads the real `semId` from the request URL query string
3. Parses the HTML table and sends structured data to FastAPI

No manual Axios call needed — we reuse the portal's own authenticated request.
