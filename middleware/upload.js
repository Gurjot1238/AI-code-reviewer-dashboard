// MULTER: handles code file uploads (multipart/form-data) for reviews.
// Files are kept in memory (not saved to disk) - we only need the text to review it,
// and the code itself is stored in MongoDB with the review.
const path = require('path');
const multer = require('multer');

const MAX_BYTES = 200 * 1024;   // 200 KB per file
const ALLOWED = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.java', '.c', '.h', '.cpp', '.cc', '.hpp', '.go', '.php', '.rb', '.cs', '.kt', '.swift', '.rs'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED.includes(ext)) {
      const err = new Error(`Only code files can be uploaded (${ALLOWED.join(', ')}).`);
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

// Wraps multer so its errors come back as friendly JSON instead of a crash page
function singleCodeFile(field = 'file') {
  const handler = upload.single(field);
  return (req, res, next) => handler(req, res, err => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too big (max 200 KB).'
        : err.code === 'LIMIT_UNEXPECTED_FILE' ? 'Upload one file in the "file" field.'
        : 'Upload failed: ' + err.message;
      return res.status(400).json({ error: msg });
    }
    res.status(err.status || 400).json({ error: err.message });
  });
}

module.exports = { singleCodeFile, ALLOWED, MAX_BYTES };
