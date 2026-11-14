// Snippet reviews: create, list, view, delete, PDF.
const express = require('express');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const reviewer = require('../services/reviewer');
const { reviewPdf } = require('../services/pdf');
const { canSeeAll } = require('../middleware/authorize');
const { singleCodeFile } = require('../middleware/upload');
const { languageFromPath } = require('../services/rules');

const router = express.Router();
const validId = id => mongoose.Types.ObjectId.isValid(id);
// Reviewers and admins can open anyone's review; users only their own
const readScope = req => canSeeAll(req.user) ? {} : { user: req.userId };
// Owners can delete their own review; admins can delete any
const deleteScope = req => req.user.role === 'admin' ? {} : { user: req.userId };

// POST /api/reviews  { code, title?, language? }
router.post('/', async (req, res) => {
  try {
    const { code, title, language } = req.body || {};
    if (!code || !code.trim()) return res.status(400).json({ error: 'Paste some code to review.' });
    if (code.length > 50000) return res.status(400).json({ error: 'Code is too long (max 50,000 characters).' });

    const result = await reviewer.review(code, { language: language && language !== 'auto' ? language : null });
    const review = await Review.create({
      user: req.userId,
      title: (title || '').trim() || firstLine(code),
      code,
      ...result
    });
    res.status(201).json(review);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'The review failed. Try again.' });
  }
});

// POST /api/reviews/upload  multipart/form-data: file (code file), title?, language?
// Multer reads the file into memory, then it is reviewed like pasted code.
router.post('/upload', singleCodeFile('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a code file to upload.' });
    const code = req.file.buffer.toString('utf8');
    if (!code.trim()) return res.status(400).json({ error: 'That file is empty.' });
    if (code.includes('\u0000')) return res.status(400).json({ error: 'That looks like a binary file, not code.' });

    const { title, language } = req.body || {};
    const lang = language && language !== 'auto' ? language : languageFromPath(req.file.originalname);
    const result = await reviewer.review(code, { language: lang, path: req.file.originalname });
    const review = await Review.create({
      user: req.userId,
      title: (title || '').trim() || req.file.originalname,
      code,
      source: 'upload',
      fileName: req.file.originalname,
      ...result
    });
    res.status(201).json(review);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'The review failed. Try again.' });
  }
});

// GET /api/reviews?status=&q=&page=&limit=
router.get('/', async (req, res) => {
  const { status, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter = { user: req.userId };
  if (['error', 'warning', 'suggestion', 'pass'].includes(status)) filter.status = status;
  if (q) filter.$or = [{ title: new RegExp(escapeRegex(q), 'i') }, { code: new RegExp(escapeRegex(q), 'i') }];

  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .select('title language score status engine createdAt issues.severity summary').lean(),
    Review.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
});

router.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Review not found.' });
  const review = await Review.findOne({ _id: req.params.id, ...readScope(req) }).populate('user', 'name email').lean();
  if (!review) return res.status(404).json({ error: 'Review not found.' });
  const ownerId = review.user && review.user._id ? String(review.user._id) : String(review.user);
  review.isOwner = ownerId === req.userId;
  review.canDelete = review.isOwner || req.user.role === 'admin';
  review.owner = review.user && review.user.name ? { name: review.user.name, email: review.user.email } : null;
  review.user = ownerId;
  res.json(review);
});

router.get('/:id/pdf', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Review not found.' });
  const review = await Review.findOne({ _id: req.params.id, ...readScope(req) }).lean();
  if (!review) return res.status(404).json({ error: 'Review not found.' });
  const user = await User.findById(review.user);   // the report shows the review's owner
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="reviewbot-report-${review._id}.pdf"`);
  reviewPdf(review, user, res);
});

router.delete('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Review not found.' });
  const r = await Review.deleteOne({ _id: req.params.id, ...deleteScope(req) });
  if (!r.deletedCount) return res.status(404).json({ error: 'Review not found, or you cannot delete it.' });
  res.json({ deleted: r.deletedCount });
});

function firstLine(code) {
  const line = code.split('\n').map(l => l.trim()).find(Boolean) || 'Untitled snippet';
  return line.length > 60 ? line.slice(0, 57) + '...' : line;
}
function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = router;
