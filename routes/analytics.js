// Analytics built with MongoDB aggregation pipelines.
const express = require('express');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const RepoScan = require('../models/RepoScan');

const router = express.Router();

// GET /api/analytics?days=30
router.get('/', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 365);
  const userId = new mongoose.Types.ObjectId(req.userId);
  const since = new Date(Date.now() - days * 86400000);

  const [overview, byStatus, perDay, byCategory, byLanguage, topMessages, scans] = await Promise.all([
    Review.aggregate([
      { $match: { user: userId } },
      { $group: { _id: null, total: { $sum: 1 }, avgScore: { $avg: '$score' }, issues: { $sum: { $size: '$issues' } },
                  aiReviews: { $sum: { $cond: [{ $eq: ['$engine', 'gemini'] }, 1, 0] } } } }
    ]),
    Review.aggregate([
      { $match: { user: userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    Review.aggregate([
      { $match: { user: userId, createdAt: { $gte: since } } },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          reviews: { $sum: 1 }, avgScore: { $avg: '$score' },
          errors: { $sum: { $size: { $filter: { input: '$issues', cond: { $eq: ['$$this.severity', 'error'] } } } } },
          warnings: { $sum: { $size: { $filter: { input: '$issues', cond: { $eq: ['$$this.severity', 'warning'] } } } } }
      } },
      { $sort: { _id: 1 } }
    ]),
    Review.aggregate([
      { $match: { user: userId } },
      { $unwind: '$issues' },
      { $group: { _id: '$issues.category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 8 }
    ]),
    Review.aggregate([
      { $match: { user: userId } },
      { $group: { _id: '$language', count: { $sum: 1 }, avgScore: { $avg: '$score' } } },
      { $sort: { count: -1 } }
    ]),
    Review.aggregate([
      { $match: { user: userId } },
      { $unwind: '$issues' },
      { $group: { _id: { message: '$issues.message', severity: '$issues.severity' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 6 }
    ]),
    RepoScan.aggregate([
      { $match: { user: userId, state: 'done' } },
      { $group: { _id: null, total: { $sum: 1 }, files: { $sum: { $size: '$files' } }, avgScore: { $avg: '$score' } } }
    ])
  ]);

  // Fill in missing days so the chart has a continuous line
  const map = Object.fromEntries(perDay.map(d => [d._id, d]));
  const timeline = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const row = map[d] || {};
    timeline.push({ date: d, reviews: row.reviews || 0, errors: row.errors || 0, warnings: row.warnings || 0, avgScore: row.avgScore ? Math.round(row.avgScore) : null });
  }

  const o = overview[0] || { total: 0, avgScore: 0, issues: 0, aiReviews: 0 };
  const s = scans[0] || { total: 0, files: 0, avgScore: 0 };
  res.json({
    overview: { reviews: o.total, avgScore: Math.round(o.avgScore || 0), issues: o.issues, aiReviews: o.aiReviews,
                scans: s.total, filesScanned: s.files, avgRepoScore: Math.round(s.avgScore || 0) },
    byStatus: Object.fromEntries(['error', 'warning', 'suggestion', 'pass'].map(k => [k, (byStatus.find(b => b._id === k) || {}).count || 0])),
    timeline,
    byCategory: byCategory.map(c => ({ category: c._id || 'general', count: c.count })),
    byLanguage: byLanguage.map(l => ({ language: l._id, count: l.count, avgScore: Math.round(l.avgScore) })),
    topIssues: topMessages.map(t => ({ message: t._id.message, severity: t._id.severity, count: t.count }))
  });
});

module.exports = router;
