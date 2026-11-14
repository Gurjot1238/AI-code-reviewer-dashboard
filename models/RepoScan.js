const mongoose = require('mongoose');
const issueSchema = require('./issue');

const fileResultSchema = new mongoose.Schema(
  {
    path: String,
    language: String,
    lines: Number,
    score: Number,
    status: { type: String, enum: ['error', 'warning', 'suggestion', 'pass'] },
    summary: String,
    engine: String,
    issues: [issueSchema]
  },
  { _id: false }
);

const repoScanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    repoUrl: String,
    owner: String,
    repo: String,
    branch: String,
    state: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    progress: { done: { type: Number, default: 0 }, total: { type: Number, default: 0 } },
    error: String,
    files: [fileResultSchema],
    skipped: { type: Number, default: 0 },        // files ignored (not code / too big / over limit)
    score: { type: Number, default: 0 },          // average file score
    totals: {
      error: { type: Number, default: 0 },
      warning: { type: Number, default: 0 },
      suggestion: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RepoScan', repoScanSchema);
