# Automated Code Reviewer (GitHub AI Webhook Simulation)

A web dashboard simulating an automated GitHub Pull Request (PR) code review pipeline, with review history stored in **MongoDB Atlas**.

## Features
- **PR Simulation Pipeline:** Visual 5-step execution sequence.
- **Rule-Based Static Analysis Engine:**
  - Detects **Hard Errors** (mismatched `{ }`, `( )`, missing `;`).
  - Detects **Code Quality Warnings** (`var` usage, unhandled `console.log` / `System.out.println`).
- **MongoDB Storage:** Every review (full code, feedback, result type, time) is saved to a MongoDB database through a Node.js + Express backend.
- **Offline Fallback:** If the database or server is unavailable, reviews are saved in browser localStorage, so the dashboard never breaks.

## Tech Stack
- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js, Express
- Database: MongoDB Atlas (cloud) with Mongoose

## File Structure
- `index.html` - Dashboard interface
- `style.css` - UI layout and pipeline styling
- `script.js` - Pipeline, analysis engine, and API calls (with localStorage fallback)
- `server.js` - Express server, MongoDB connection, and REST API
- `package.json` - Project dependencies
- `.env` - Your database connection string (private, never share or upload)
- `.env.example` - Template for `.env`

## API Endpoints
| Method | Route | What it does |
|---|---|---|
| GET | `/api/health` | Shows whether the database is connected |
| GET | `/api/reviews` | Gets the latest 50 reviews |
| POST | `/api/reviews` | Saves a new review |
| DELETE | `/api/reviews` | Deletes all reviews |
| GET | `/api/stats` | Count of reviews by result (error / warning / suggestion / pass) |

## Database Schema (`reviews` collection)
| Field | Type | Meaning |
|---|---|---|
| `code` | String | Full code snippet submitted |
| `feedback` | String | Reviewer comment |
| `status` | String | `error`, `warning`, `suggestion` or `pass` |
| `lines` | Number | Lines of code in the snippet |
| `createdAt` / `updatedAt` | Date | Added automatically |

## Setup

### 1. Install Node.js
Download the LTS version from https://nodejs.org and install it.

### 2. Create a free MongoDB Atlas database
1. Sign up at https://www.mongodb.com/cloud/atlas/register
2. Create a free **M0** cluster.
3. **Database Access** → Add a database user (username + password).
4. **Network Access** → Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`), so it works on any laptop on eval day.
5. **Connect** → **Drivers** → copy the connection string.

### 3. Add the connection string
Open `.env` and replace the `MONGODB_URI` line with your string. Put your password in place of `<password>` and add `/reviewbot` before the `?`:
```
MONGODB_URI=mongodb+srv://rohan:MyPass123@cluster0.abcde.mongodb.net/reviewbot?retryWrites=true&w=majority
```

### 4. Install and run
Easiest: double-click `start.bat`. It installs everything, starts the server and opens the site.

Or manually, open a terminal in this folder:
```
npm install
npm start
```
You should see `Connected to MongoDB: reviewbot`. Open http://localhost:3000.

The sidebar shows **MongoDB Connected** when the database is working. To see saved data, open Atlas → **Browse Collections** → `reviewbot` → `reviews`.

### Offline option
Install MongoDB Community Server and change `.env` to:
```
MONGODB_URI=mongodb://127.0.0.1:27017/reviewbot
```
