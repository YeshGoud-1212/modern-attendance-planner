# 🎓 Atten-Track — Full Stack Attendance Tracker

Real attendance data from VNR EduPrime portal via Chrome Extension → FastAPI analytics → React dashboard.

---

## 🏗️ Architecture

```
College Portal (vnrvjiet.ac.in)
        │
        │  User logs in normally (no credentials in our system)
        ▼
Chrome Extension (attendance-extension/)
        │  Fetches portal attendance HTML with browser auth
        │  Parses subject and overall attendance
        │  POSTs structured payload to FastAPI
        ▼
FastAPI Backend (backend/) — localhost:8000
        │  Computes analytics and bunk projections
        │  Returns structured dashboard data
        │  Extension caches results in chrome.storage.local
        ▼
React Frontend (frontend/) — localhost:5173
        │  Reads cached extension data every 5 seconds
        │  Displays dashboard, charts, and bunk calculator
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

API docs (auto-generated): http://localhost:8000/docs

---

### Step 2 — Start the Frontend

```bash
cd frontend
npm install
cp .env.example .env.development   # optional — enables demo buttons in dev
npm run dev
# Runs on http://localhost:5173 (proxies /api → backend)
```

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend URL (`http://localhost:8000` or empty to use Vite proxy) |
| `VITE_ENABLE_DEMO` | `true` shows demo buttons that POST sample data to the API |

---

### Step 3 — Install the Chrome Extension

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `attendance-extension/` folder from this project
5. The 🎓 Atten-Track icon will appear in your toolbar

---

## 📋 How to Use (Every Session)

1. Open [VNR Portal](https://automation.vnrvjiet.ac.in/eduprime3) in Chrome
2. Log in with your college credentials (we never see these)
3. Click the **Atten-Track** extension icon in the toolbar
4. Click **📊 Fetch Attendance**
5. Open `http://localhost:5173`
6. Enter your roll number on the home page → **Open Dashboard**
7. View analytics at `/dashboard?roll=YOUR_ROLL`

**Without the extension (dev/demo):** set `VITE_ENABLE_DEMO=true`, start backend, click **Demo 23IT101** on the home page.

> The dashboard polls `chrome.storage.local` every 5 seconds, so it updates automatically after the extension saves data.

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
atten-track-v2/
├── backend/
│   ├── main.py          # FastAPI app, CORS, routes
│   ├── models.py        # Pydantic request/response models
│   ├── logic.py         # All attendance math (edge-case safe)
│   └── requirements.txt
│
├── attendance-extension/
│   ├── manifest.json    # Chrome Extension MV3 config
│   ├── background.js    # Background service worker
│   ├── content.js       # Portal extraction + backend POST
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
| Dashboard empty but extension ran | Backend must be running when extension fetches; dashboard also reads `GET /api/dashboard/{roll}` |

---

## 🔌 API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service health check |
| `POST` | `/api/attendance` | Raw portal data → computed dashboard (cached) |
| `GET` | `/api/dashboard/latest` | Most recently cached dashboard |
| `GET` | `/api/dashboard/{student_id}` | Cached dashboard for a student |

Run API tests:

```bash
cd backend
python test_api.py
```

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
