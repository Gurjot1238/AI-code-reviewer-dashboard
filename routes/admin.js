// Admin panel API. Every route here is protected by role (authorization):
//   reviewer + admin : team stats, everyone's reviews and scans (read only)
//   admin only       : list users, change roles, delete users
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Review = require('../models/Review');
const RepoScan = require('../models/RepoScan');
const authorize = require('../middleware/authorize');

const router = express.Router();
const { ROLES } = User;
const validId = id => mongoose.Types.ObjectId.isValid(id);
const escapeRegex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- Reviewer + admin ----------

// GET /api/admin/stats
router.get('/stats', authorize('reviewer', 'admin'), async (req, res) => {
  const [users, reviews, scans, avg, roles] = await Promise.all([
    User.countDocuments(),
    Review.countDocuments(),
    RepoScan.countDocuments(),
    Review.aggregate([{ $group: { _id: null, score: { $avg: '$score' } } }]),
    User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }])
  ]);
  const byRole = { user: 0, reviewer: 0, admin: 0 };
  roles.forEach(r => { byRole[r._id || 'user'] += r.n; });
  res.json({ users, reviews, scans, avgScore: avg[0] ? Math.round(avg[0].score) : 0, byRole });
});

// GET /api/admin/reviews?q=&status=&page=   everyone's reviews, with the owner's name
router.get('/reviews', authorize('reviewer', 'admin'), async (req, res) => {
  const { q, status } = req.query;
  const limit = Math.min(Number(req.query.limit) || 15, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter = {};
  if (['error', 'warning', 'suggestion', 'pass'].includes(status)) filter.status = status;
  if (q) filter.title = new RegExp(escapeRegex(q), 'i');

  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .select('title language score status engine source createdAt user').populate('user', 'name email').lean(),
    Review.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
});

// GET /api/admin/scans   everyone's recent repo scans
router.get('/scans', authorize('reviewer', 'admin'), async (req, res) => {
  const items = await RepoScan.find().sort({ createdAt: -1 }).limit(50)
    .select('owner repo branch state score totals progress createdAt user').populate('user', 'name email').lean();
  res.json({ items });
});

// ---------- Admin only ----------

// GET /api/admin/users?q=
router.get('/users', authorize('admin'), async (req, res) => {
  const filter = {};
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const ids = users.map(u => u._id);
  const [rc, sc] = await Promise.all([
    Review.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', n: { $sum: 1 } } }]),
    RepoScan.aggregate([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', n: { $sum: 1 } } }])
  ]);
  const count = (arr, id) => (arr.find(x => String(x._id) === String(id)) || { n: 0 }).n;
  res.json({
    items: users.map(u => ({
      id: u._id, name: u.name, email: u.email, role: u.role || 'user', createdAt: u.createdAt,
      reviews: count(rc, u._id), scans: count(sc, u._id), isYou: String(u._id) === req.userId
    }))
  });
});

// PATCH /api/admin/users/:id/role  { role }
router.patch('/users/:id/role', authorize('admin'), async (req, res) => {
  const { role } = req.body || {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${ROLES.join(', ')}.` });
  if (!validId(req.params.id)) return res.status(404).json({ error: 'User not found.' });
  if (req.params.id === req.userId) return res.status(400).json({ error: 'You cannot change your own role.' });

  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: user.toPublic() });
});

// DELETE /api/admin/users/:id   removes the account and all of its reviews and scans
router.delete('/users/:id', authorize('admin'), async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'User not found.' });
  if (req.params.id === req.userId) return res.status(400).json({ error: 'You cannot delete your own account here.' });

  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const [r, s] = await Promise.all([Review.deleteMany({ user: user._id }), RepoScan.deleteMany({ user: user._id })]);
  res.json({ deleted: true, reviews: r.deletedCount, scans: s.deletedCount });
});

module.exports = router;
