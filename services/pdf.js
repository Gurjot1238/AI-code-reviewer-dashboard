// Builds downloadable PDF reports with pdfkit.

const PDFDocument = require('pdfkit');

const COLORS = { error: '#b4483a', warning: '#a87b1d', suggestion: '#3f6688', pass: '#4f7344', ink: '#1d1c1a', muted: '#6b665d', rule: '#d9d2c4' };

function header(doc, title, subtitle) {
  doc.rect(0, 0, doc.page.width, 92).fill('#1d1c1a');
  doc.fill('#e8e1d3').font('Times-Italic').fontSize(26).text(title.toUpperCase(), 50, 28);
  doc.font('Courier').fontSize(8).fill('#9b958a').text(subtitle.toUpperCase(), 50, 62);
  doc.moveDown(3).fill(COLORS.ink);
  doc.y = 116;
}

function scoreBlock(doc, score, status, engine, extra) {
  const y = doc.y;
  doc.font('Times-Roman').fontSize(40).fill(COLORS.ink).text(String(score), 50, y, { continued: false });
  doc.font('Courier').fontSize(8).fill(COLORS.muted).text('QUALITY SCORE / 100', 50, y + 44);
  doc.font('Courier-Bold').fontSize(9).fill(COLORS[status] || COLORS.ink).text(status.toUpperCase(), 220, y + 8);
  doc.font('Courier').fontSize(8).fill(COLORS.muted).text(`ENGINE: ${engine === 'gemini' ? 'GEMINI AI' : 'RULE ENGINE'}`, 220, y + 24);
  if (extra) doc.text(extra.toUpperCase(), 220, y + 38);
  doc.y = y + 70;
  rule(doc);
}

function rule(doc) {
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.5).strokeColor(COLORS.rule).stroke();
  doc.moveDown(0.8);
}

function issuesList(doc, issues) {
  if (!issues.length) {
    doc.font('Helvetica').fontSize(10).fill(COLORS.muted).text('No issues found. Looks good to merge.', 50);
    return;
  }
  issues.forEach((i, idx) => {
    if (doc.y > doc.page.height - 120) doc.addPage();
    const top = doc.y;
    doc.font('Courier-Bold').fontSize(8).fill(COLORS[i.severity]).text(i.severity.toUpperCase(), 50, top, { width: 80 });
    doc.font('Courier').fontSize(8).fill(COLORS.muted).text(i.line ? `LINE ${i.line}` : 'FILE', 50, top + 11, { width: 80 });
    doc.text((i.category || '').toUpperCase(), 50, top + 22, { width: 80 });
    doc.font('Helvetica-Bold').fontSize(10).fill(COLORS.ink).text(i.message, 140, top, { width: doc.page.width - 190 });
    if (i.fix) {
      doc.moveDown(0.3).font('Courier').fontSize(8.5).fill('#3d3a34').text(`Fix: ${i.fix}`, 140, doc.y, { width: doc.page.width - 190 });
    }
    doc.y = Math.max(doc.y, top + 34) + 8;
    if (idx < issues.length - 1) rule(doc);
  });
}

function codeBlock(doc, code) {
  doc.addPage();
  doc.font('Times-Italic').fontSize(18).fill(COLORS.ink).text('SUBMITTED CODE', 50, 50);
  doc.moveDown(0.6);
  code.split('\n').slice(0, 400).forEach((line, i) => {
    if (doc.y > doc.page.height - 60) doc.addPage();
    doc.font('Courier').fontSize(8).fill(COLORS.muted).text(String(i + 1).padStart(4, ' '), 50, doc.y, { continued: true })
      .fill(COLORS.ink).text('  ' + line.replace(/\t/g, '  '), { lineBreak: true });
  });
}

function reviewPdf(review, user, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `ReviewBot report - ${review.title}` } });
  doc.pipe(res);
  header(doc, 'Code review report', `${review.title} · ${review.language} · ${new Date(review.createdAt).toLocaleString('en-IN')} · ${user.name}`);
  scoreBlock(doc, review.score, review.status, review.engine, `${review.issues.length} issue(s)`);
  doc.font('Times-Italic').fontSize(13).fill(COLORS.ink).text(review.summary, 50, doc.y, { width: doc.page.width - 100 });
  doc.moveDown(1); rule(doc);
  issuesList(doc, review.issues);
  codeBlock(doc, review.code);
  doc.end();
}

function scanPdf(scan, user, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `ReviewBot scan - ${scan.owner}/${scan.repo}` } });
  doc.pipe(res);
  header(doc, `${scan.owner}/${scan.repo}`, `Repository scan · branch ${scan.branch} · ${scan.files.length} files · ${new Date(scan.createdAt).toLocaleString('en-IN')} · ${user.name}`);
  const worst = scan.totals.error ? 'error' : scan.totals.warning ? 'warning' : scan.totals.suggestion ? 'suggestion' : 'pass';
  scoreBlock(doc, scan.score, worst, scan.files.some(f => f.engine === 'gemini') ? 'gemini' : 'rules',
    `${scan.totals.error} errors · ${scan.totals.warning} warnings · ${scan.totals.suggestion} suggestions`);

  // File table
  doc.font('Courier').fontSize(8).fill(COLORS.muted);
  doc.text('FILE', 50, doc.y, { continued: false });
  const startY = doc.y;
  scan.files.forEach(f => {
    if (doc.y > doc.page.height - 70) doc.addPage();
    const y = doc.y + 4;
    doc.font('Courier').fontSize(8.5).fill(COLORS.ink).text(f.path, 50, y, { width: 330, lineBreak: false, ellipsis: true });
    doc.fill(COLORS[f.status]).text(f.status.toUpperCase(), 390, y, { width: 80 });
    doc.fill(COLORS.ink).text(`${f.score}/100`, 480, y, { width: 60, align: 'right' });
    doc.y = y + 14;
  });
  if (startY) doc.moveDown(1);

  // Details per file
  scan.files.filter(f => f.issues.length).forEach(f => {
    doc.addPage();
    doc.font('Times-Italic').fontSize(16).fill(COLORS.ink).text(f.path, 50, 50);
    doc.font('Courier').fontSize(8).fill(COLORS.muted).text(`${f.language} · score ${f.score}/100 · ${f.summary}`.toUpperCase(), { width: doc.page.width - 100 });
    doc.moveDown(0.8); rule(doc);
    issuesList(doc, f.issues);
  });
  doc.end();
}

module.exports = { reviewPdf, scanPdf };
