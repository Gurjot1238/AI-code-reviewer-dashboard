// One problem found in the code (shared by Review and RepoScan)
const mongoose = require('mongoose');

module.exports = new mongoose.Schema(
  {
    line: { type: Number, default: null },
    severity: { type: String, enum: ['error', 'warning', 'suggestion'], required: true },
    category: { type: String, default: 'general' },   // syntax, security, performance, style, best-practice...
    message: { type: String, required: true },
    fix: { type: String, default: '' }                 // suggested fix
  },
  { _id: false }
);
