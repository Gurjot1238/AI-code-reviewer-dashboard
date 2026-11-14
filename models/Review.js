const mongoose = require('mongoose');
const issueSchema = require('./issue');

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'Untitled snippet' },
    language: { type: String, default: 'javascript' },
    code: { type: String, required: true },
    source: { type: String, enum: ['paste', 'upload'], default: 'paste' },   // pasted or uploaded with Multer
    fileName: { type: String, default: '' },
    issues: [issueSchema],
    summary: { type: String, default: '' },
    score: { type: Number, min: 0, max: 100, default: 100 },   // code quality score
    status: { type: String, enum: ['error', 'warning', 'suggestion', 'pass'], default: 'pass' },
    engine: { type: String, enum: ['gemini', 'rules'], default: 'rules' },
    durationMs: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
