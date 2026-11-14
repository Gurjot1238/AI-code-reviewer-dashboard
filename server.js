// ReviewBot AI - backend server
// Express REST API + MongoDB (Mongoose) + Gemini AI reviews + GitHub repo scans.
// JWT authentication, role-based authorization (user / reviewer / admin), Multer file uploads.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { connectDB, isConnected } = require('./config/db');
const requireAuth = require('./middleware/auth');
const reviewer = require('./services/reviewer');

// JWT secret: created automatically the first time and saved to .env
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  try {
    fs.appendFileSync(path.join(__dirname, '.env'), `\nJWT_SECRET=${process.env.JWT_SECRET}\n`);
    console.log('Created a JWT_SECRET and saved it to .env');
  } catch (e) { /* .env not writable: secret lasts until restart */ }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// Health check (used by the pages to show database + AI status)
app.get('/api/health', (req, res) => {
  res.json({ server: 'ok', database: isConnected() ? 'connected' : 'disconnected', engine: reviewer.activeEngine() });
});

// Everything below needs the database
app.use('/api', (req, res, next) => {
  if (!isConnected()) return res.status(503).json({ error: 'Database is not connected. Check MONGODB_URI in .env and your internet.' });
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/reviews', requireAuth, require('./routes/reviews'));
app.use('/api/scans', requireAuth, require('./routes/scans'));
app.use('/api/analytics', requireAuth, require('./routes/analytics'));
app.use('/api/admin', requireAuth, require('./routes/admin'));   // role checks inside (reviewer / admin)
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route.' }));

// Frontend pages (only the public folder is exposed - never .env or server code)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, async () => {
  console.log(`ReviewBot AI running at http://localhost:${PORT}`);
  console.log(`Review engine: ${reviewer.activeEngine() === 'gemini' ? 'Gemini AI' : 'Rule engine (add GEMINI_API_KEY to .env for AI reviews)'}`);
  await connectDB(process.env.MONGODB_URI);
});
