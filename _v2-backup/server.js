// ReviewBot AI - backend server
// Serves the dashboard and saves every code review to MongoDB.

require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(express.json({ limit: '1mb' }));

// Allow the page to call the API even if index.html is opened directly (file://)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- Database model ----------
// One document = one code review
const reviewSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },          // full code snippet submitted
    feedback: { type: String, required: true },      // reviewer comment (HTML)
    status: {                                        // result category
      type: String,
      enum: ['error', 'warning', 'suggestion', 'pass'],
      default: 'pass'
    },
    lines: { type: Number, default: 0 }              // number of lines in the snippet
  },
  { timestamps: true }                               // adds createdAt / updatedAt
);

const Review = mongoose.model('Review', reviewSchema);

function dbReady() {
  return mongoose.connection.readyState === 1;
}

// ---------- API routes ----------

// Health check: is the database connected?
app.get('/api/health', (req, res) => {
  res.json({ server: 'ok', database: dbReady() ? 'connected' : 'disconnected' });
});

// Get latest reviews (newest first)
app.get('/api/reviews', async (req, res) => {
  if (!dbReady()) return res.status(503).json({ error: 'Database not connected' });
  try {
    const reviews = await Review.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save a new review
app.post('/api/reviews', async (req, res) => {
  if (!dbReady()) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { code, feedback, status } = req.body;
    if (!code || !feedback) {
      return res.status(400).json({ error: 'code and feedback are required' });
    }
    const review = await Review.create({
      code,
      feedback,
      status,
      lines: code.split('\n').length
    });
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all reviews
app.delete('/api/reviews', async (req, res) => {
  if (!dbReady()) return res.status(503).json({ error: 'Database not connected' });
  try {
    const result = await Review.deleteMany({});
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Quick stats for the dashboard
app.get('/api/stats', async (req, res) => {
  if (!dbReady()) return res.status(503).json({ error: 'Database not connected' });
  try {
    const counts = await Review.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const stats = { total: 0, error: 0, warning: 0, suggestion: 0, pass: 0 };
    counts.forEach(c => { stats[c._id] = c.count; stats.total += c.count; });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Frontend files ----------
// Only these files are public (so .env and server code are never exposed)
const publicFiles = ['index.html', 'style.css', 'script.js'];
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
publicFiles.forEach(file => {
  app.get('/' + file, (req, res) => res.sendFile(path.join(__dirname, file)));
});

// ---------- Start ----------
async function start() {
  app.listen(PORT, () => {
    console.log(`ReviewBot AI running at http://localhost:${PORT}`);
  });

  if (!MONGODB_URI || MONGODB_URI.includes('<username>')) {
    console.warn('MONGODB_URI is not set in .env - running with browser storage only.');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('Connected to MongoDB:', mongoose.connection.name);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    console.error('The dashboard will still work using browser storage.');
  }
}

start();
