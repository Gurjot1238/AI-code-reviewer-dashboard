(function () {
  const form = document.getElementById('reviewForm');
  const code = document.getElementById('codeInput');
  const gutter = document.getElementById('gutter');
  const marks = document.getElementById('marks');
  const info = document.getElementById('editorInfo');
  const submitBtn = document.getElementById('submitBtn');
  const steps = [...document.querySelectorAll('#pipeline .step')];
  const runState = document.getElementById('runState');
  const resultPanel = document.getElementById('resultPanel');
  const LINE_H = 22, PAD = 16;
  let severities = {};      // line -> worst severity of the last review
  let focusLine = null;

  const SAMPLE = `const express = require('express');
const app = express();
var users = [];

app.get('/user', function (req, res) {
  const id = req.query.id
  const user = users.find(u => u.id == id);
  console.log("found user", user);
  res.send(eval('(' + JSON.stringify(user) + ')'));
});

const API_KEY = "sk-live-12345-secret";
app.listen(3000);`;

  // Restore code sent from a report ("Re-run") or a draft
  try {
    const handoff = sessionStorage.getItem('rb_rerun');
    if (handoff) { code.value = handoff; sessionStorage.removeItem('rb_rerun'); }
    else code.value = localStorage.getItem('rb_draft') || '';
  } catch (e) {}

  // Engine label in the top bar
  document.addEventListener('status', e => {
    const ai = e.detail.engine === 'gemini';
    document.getElementById('engineChip').textContent = ai ? 'Gemini AI' : 'Rule engine';
    document.getElementById('engineChip').classList.toggle('ai', ai);
    document.getElementById('aiStepTitle').textContent = ai ? 'Gemini AI analysis' : 'Rule-based analysis';
  });

  // ---------- Editor ----------
  function paintEditor() {
    const n = code.value.split('\n').length;
    let g = '', m = '';
    for (let i = 1; i <= n; i++) {
      const s = severities[i] || '';
      g += `<div class="${s}">${i}</div>`;
      if (s) m += `<div class="mark ${s}${focusLine === i ? ' focus' : ''}" style="top:${PAD + (i - 1) * LINE_H}px"></div>`;
    }
    gutter.innerHTML = g;
    marks.innerHTML = m;
    info.textContent = `${n} line${n === 1 ? '' : 's'} · ${code.value.length} chars`;
    syncScroll();
  }
  function syncScroll() {
    gutter.scrollTop = code.scrollTop;
    marks.style.transform = `translate(${-code.scrollLeft}px, ${-code.scrollTop}px)`;
  }
  code.addEventListener('input', () => {
    severities = {}; focusLine = null; paintEditor();
    try { localStorage.setItem('rb_draft', code.value); } catch (e) {}
  });
  code.addEventListener('scroll', syncScroll);
  code.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = code.selectionStart;
      code.setRangeText('  ', s, code.selectionEnd, 'end');
      paintEditor();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });
  document.getElementById('sampleBtn').addEventListener('click', () => {
    code.value = SAMPLE;
    document.getElementById('titleInput').value = 'User lookup route';
    code.dispatchEvent(new Event('input'));
    code.focus();
  });

  function goToLine(line) {
    if (!line) return;
    focusLine = line;
    paintEditor();
    code.scrollTop = Math.max(0, (line - 4) * LINE_H);
    const start = code.value.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
    code.focus({ preventScroll: true });
    code.setSelectionRange(start, start);
  }

  // ---------- Pipeline ----------
  const t0 = { v: 0 };
  function setStep(i, state) {
    const s = steps[i];
    s.classList.remove('running', 'done');
    if (state) s.classList.add(state);
    if (state === 'done') s.querySelector('.time').textContent = ((performance.now() - t0.v) / 1000).toFixed(1) + 's';
  }
  function resetSteps() { steps.forEach(s => { s.classList.remove('running', 'done'); s.querySelector('.time').textContent = ''; }); }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Run a review (pasted code or uploaded file) ----------
  async function runReview(send, { uploading = false } = {}) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Reviewing';
    runState.textContent = uploading ? 'Uploading' : 'Running';
    document.getElementById('recvStepTitle').textContent = uploading ? 'File uploaded' : 'Code received';
    resetSteps(); severities = {}; focusLine = null; paintEditor();
    t0.v = performance.now();

    setStep(0, 'running');
    try {
      const pending = send();          // start the request now; the steps animate while it runs
      await wait(250); setStep(0, 'done');
      setStep(1, 'running'); await wait(250); setStep(1, 'done');
      setStep(2, 'running');
      const review = await pending;
      setStep(2, 'done');
      setStep(3, 'running'); await wait(200); setStep(3, 'done');
      setStep(4, 'done');
      runState.textContent = 'Completed';

      if (uploading) {                 // show the uploaded file's code in the editor
        code.value = review.code;
        document.getElementById('titleInput').value = review.title;
        try { localStorage.setItem('rb_draft', code.value); } catch (e) {}
      }
      severities = lineSeverity(review.issues);
      paintEditor();
      renderResult(resultPanel, review, {
        onIssueClick: i => goToLine(i.line),
        actions: `<a class="btn btn-line btn-sm" href="/report.html?id=${review._id}">Open report</a>
                  <button class="btn btn-line btn-sm" id="pdfBtn">Download PDF</button>`
      });
      document.getElementById('pdfBtn').addEventListener('click', () => downloadPdf(`/reviews/${review._id}/pdf`, `reviewbot-report-${review._id}.pdf`));
      toast(uploading ? `${review.fileName} uploaded and reviewed` : review.engine === 'gemini' ? 'Reviewed by Gemini and saved' : 'Reviewed and saved to MongoDB');
    } catch (err) {
      resetSteps();
      runState.textContent = 'Failed';
      toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Review code';
    }
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!code.value.trim()) { toast('Paste some code or upload a file first.', 'error'); code.focus(); return; }
    runReview(() => api('/reviews', {
      method: 'POST',
      body: { code: code.value, title: document.getElementById('titleInput').value, language: document.getElementById('langSelect').value }
    }));
  });

  // ---------- File upload (sent to the server, handled by Multer) ----------
  const ALLOWED = document.getElementById('fileInput').accept.split(',');
  const MAX_BYTES = 200 * 1024;

  function uploadFile(file) {
    if (!file) return;
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED.includes(ext)) return toast('Only code files can be uploaded (.js, .py, .java, .cpp ...).', 'error');
    if (file.size > MAX_BYTES) return toast('File is too big (max 200 KB).', 'error');
    if (submitBtn.disabled) return toast('Wait for the current review to finish.', 'error');

    const data = new FormData();
    data.append('file', file);
    data.append('title', document.getElementById('titleInput').value);
    data.append('language', document.getElementById('langSelect').value);
    runReview(() => api('/reviews/upload', { method: 'POST', body: data }), { uploading: true });
  }

  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', () => { uploadFile(fileInput.files[0]); fileInput.value = ''; });

  const box = document.getElementById('editorBox');
  let dragDepth = 0;
  box.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); dragDepth++; box.classList.add('dragging'); } });
  box.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  box.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; box.classList.remove('dragging'); } });
  box.addEventListener('drop', e => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); dragDepth = 0; box.classList.remove('dragging');
    uploadFile(e.dataTransfer.files[0]);
  });

  paintEditor();
})();
