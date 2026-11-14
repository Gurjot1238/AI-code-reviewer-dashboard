# ReviewBot — AI Code Reviewer

A full-stack web app that reviews code with AI. Paste a snippet or a whole GitHub repository and get
line-by-line errors, warnings and suggestions with fixes, a quality score, history, analytics and PDF reports.

## Features
| Feature | What it does |
|---|---|
| **AI code review** | Sends code to **Google Gemini** and gets structured JSON issues (line, severity, category, message, fix). |
| **Rule-engine fallback** | If Gemini isn't configured or fails, a built-in static analyzer reviews the code, so the app never breaks. |
| **GitHub repo scan** | Fetches a public repo's file tree via the GitHub API, reviews up to 25 code files in the background, and scores each file. |
| **Quality score** | 0–100 score from issue severity (error −18, warning −7, suggestion −2). |
| **Login and signup** | Passwords hashed with **bcrypt**, sessions with **JWT** (7 days). Every user only sees their own data. |
| **History** | Search, filter by result, pagination, delete. |
| **Analytics** | MongoDB **aggregation pipelines**: reviews per day, score trend, issue categories, languages, repeat mistakes (Chart.js). |
| **PDF reports** | Server-side PDFs for a review or a whole repo scan (**pdfkit**). |

## Tech stack
- **Frontend:** HTML, CSS, vanilla JavaScript (multi-page), Chart.js
- **Backend:** Node.js, Express (REST API)
- **Database:** MongoDB Atlas with Mongoose
- **AI:** Google Gemini API (structured JSON output)
- **Auth:** bcryptjs, jsonwebtoken

## Project structure
```
server.js              Express app: middleware, routes, static files
config/db.js           MongoDB connection
models/                Mongoose schemas: User, Review, RepoScan, issue
middleware/auth.js     JWT check for protected routes
services/
  gemini.js            Gemini API client (prompt + JSON schema)
  rules.js             Rule-based analyzer + scoring
  reviewer.js          Picks Gemini or rules
  github.js            GitHub API: parse URL, list files, download files
  pdf.js               PDF report generation
routes/
  auth.js              /api/auth   signup, login, me
  reviews.js           /api/reviews  create, list, get, delete, pdf
  scans.js             /api/scans    start scan, poll, list, get, delete, pdf
  analytics.js         /api/analytics  aggregation stats
public/                Frontend pages
  index.html           Landing
  login.html, signup.html
  dashboard.html       Overview
  review.html          Code editor + review
  scan.html            Repo scan + per-file results
  history.html         All reviews and scans
  report.html          Single review report
  analytics.html       Charts
  css/style.css, js/*.js
```

## API
| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | /api/auth/signup | – | Create account |
| POST | /api/auth/login | – | Log in, returns JWT |
| GET | /api/auth/me | ✔ | Current user |
| POST | /api/reviews | ✔ | Review a snippet |
| GET | /api/reviews?q=&status=&page= | ✔ | List reviews |
| GET | /api/reviews/:id | ✔ | One review |
| GET | /api/reviews/:id/pdf | ✔ | PDF report |
| DELETE | /api/reviews/:id | ✔ | Delete |
| POST | /api/scans | ✔ | Start a repo scan |
| GET | /api/scans/:id | ✔ | Scan progress / results |
| GET | /api/scans/:id/pdf | ✔ | Scan PDF |
| GET | /api/analytics?days=30 | ✔ | Stats for charts |
| GET | /api/health | – | Server, database and AI status |

## Setup
1. Install **Node.js** (LTS).
2. Fill in `.env` (see `.env.example`):
   - `MONGODB_URI` — MongoDB Atlas connection string
   - `GEMINI_API_KEY` — free key from https://aistudio.google.com/apikey (optional: without it the rule engine is used)
   - `GITHUB_TOKEN` — optional, raises GitHub's rate limit for repo scans
3. Double-click **start.bat** (or run `npm install` then `npm start`).
4. Open http://localhost:3000 and create an account.

## File uploads, authentication and roles

**Multer file upload** – On *Review code*, click **Upload file** or drag a code file onto the editor.
The file goes to `POST /api/reviews/upload` as `multipart/form-data`. Multer (`middleware/upload.js`)
keeps it in memory, only accepts code extensions (.js, .py, .java, .cpp …) and rejects files over 200 KB.
The code is reviewed and saved in MongoDB with `source: "upload"` and the file name.

**Authentication** – Signup/login hash passwords with bcrypt and return a JWT (7 days).
`middleware/auth.js` checks the token on every API call and loads the user (and role) from MongoDB,
so a role change or a removed account takes effect straight away.

**Authorization (roles)** – `middleware/authorize.js` → `authorize('admin')` / `authorize('reviewer','admin')`.

| Role | Can do |
|---|---|
| user | Review code, scan repos, see only their own work |
| reviewer | + read everyone's reviews and scans (Admin panel, read only) |
| admin | + change roles, remove users (and their data) |

Set `ADMIN_EMAIL=you@example.com` in `.env`; that account becomes admin when it signs up or next logs in.
Admins can promote others from the **Admin panel** (`/admin.html`). Admin API: `GET /api/admin/stats`,
`GET /api/admin/reviews`, `GET /api/admin/scans`, `GET /api/admin/users`, `PATCH /api/admin/users/:id/role`,
`DELETE /api/admin/users/:id`.
