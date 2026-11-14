// Whole-repository scans: start a scan, poll its progress, list, view, delete, PDF.
const express = require('express');
const mongoose = require('mongoose');
const RepoScan = require('../models/RepoScan');
const User = require('../models/User');
const github = require('../services/github');
const reviewer = require('../services/reviewer');
const { scanPdf } = require('../services/pdf');

const router = express.Router();
const { canSeeAll } = require('../middleware/authorize');
const validId = id => mongoose.Types.ObjectId.isValid(id);
const readScope = req => canSeeAll(req.user) ? {} : { user: req.userId };
const deleteScope = req => req.user.role === 'admin' ? {} : { user: req.userId };
const CONCURRENCY = 2;   // review 2 files at a time (keeps within Gemini free limits)

// POST /api/scans  { repoUrl }  -> starts the scan in the background and returns immediately
router.post('/', async (req, res) => {
  const parsed = github.parseRepoUrl(req.body && req.body.repoUrl);
  if (!parsed) return res.status(400).json({ error: 'Enter a GitHub repo link like https://github.com/owner/repo' });

  const running = await RepoScan.countDocuments({ user: req.userId, state: 'running', createdAt: { $gt: new Date(Date.now() - 10 * 60000) } });
  if (running) return res.status(429).json({ error: 'A scan is already running. Wait for it to finish.' });

  let listing;
  try {
    listing = await github.listCodeFiles(parsed);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (!listing.files.length) return res.status(400).json({ error: 'No supported code files found in this repository.' });

  const scan = await RepoScan.create({
    user: req.userId,
    repoUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
    owner: parsed.owner, repo: parsed.repo, branch: listing.branch,
    progress: { done: 0, total: listing.files.length },
    skipped: listing.skipped
  });

  res.status(202).json(scan);
  runScan(scan._id, { ...parsed, branch: listing.branch }, listing.files).catch(err => console.error('Scan failed:', err));
});

async function runScan(scanId, repo, files) {
  const results = [];
  let next = 0;

  async function worker() {
    while (next < files.length) {
      const file = files[next++];
      try {
        const code = await github.fetchFile(repo, file.path);
        const r = await reviewer.review(code, { language: file.language, path: file.path });
        results.push({ path: file.path, language: r.language, lines: code.split('\n').length, score: r.score, status: r.status, summary: r.summary, engine: r.engine, issues: r.issues });
      } catch (err) {
        results.push({ path: file.path, language: file.language, lines: 0, score: 0, status: 'warning', summary: 'Could not review this file: ' + err.message, engine: 'rules', issues: [] });
      }
      await RepoScan.updateOne({ _id: scanId }, { $set: { 'progress.done': results.length } });
    }
  }

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    results.sort((a, b) => a.path.localeCompare(b.path));
    const totals = { error: 0, warning: 0, suggestion: 0 };
    results.forEach(f => f.issues.forEach(i => { totals[i.severity]++; }));
    const score = Math.round(results.reduce((s, f) => s + f.score, 0) / results.length);
    await RepoScan.updateOne({ _id: scanId }, { $set: { files: results, totals, score, state: 'done' } });
  } catch (err) {
    await RepoScan.updateOne({ _id: scanId }, { $set: { state: 'failed', error: err.message } });
  }
}

router.get('/', async (req, res) => {
  const items = await RepoScan.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50)
    .select('owner repo branch state score totals progress createdAt').lean();
  res.json({ items });
});

router.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Scan not found.' });
  const scan = await RepoScan.findOne({ _id: req.params.id, ...readScope(req) }).lean();
  if (!scan) return res.status(404).json({ error: 'Scan not found.' });
  res.json(scan);
});

router.get('/:id/pdf', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Scan not found.' });
  const scan = await RepoScan.findOne({ _id: req.params.id, ...readScope(req), state: 'done' }).lean();
  if (!scan) return res.status(404).json({ error: 'Scan not found or not finished yet.' });
  const user = await User.findById(scan.user);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="reviewbot-scan-${scan.owner}-${scan.repo}.pdf"`);
  scanPdf(scan, user, res);
});

router.delete('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ error: 'Scan not found.' });
  const r = await RepoScan.deleteOne({ _id: req.params.id, ...deleteScope(req) });
  res.json({ deleted: r.deletedCount });
});

module.exports = router;
