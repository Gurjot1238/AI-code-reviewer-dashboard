document.addEventListener('DOMContentLoaded', function() {

  // ---------- Elements ----------
  const prForm = document.getElementById('prForm');
  const codeInput = document.getElementById('codeInput');
  const submitBtn = document.getElementById('submitBtn');
  const commentContainer = document.getElementById('commentContainer');
  const aiCommentText = document.getElementById('aiCommentText');
  const commentBadge = document.getElementById('commentBadge');
  const commentTime = document.getElementById('commentTime');
  const logsContainer = document.getElementById('logsContainer');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const storageLabel = document.getElementById('storageLabel');
  const historySource = document.getElementById('historySource');
  const dbCard = document.getElementById('dbCard');
  const dbStatusTitle = document.getElementById('dbStatusTitle');
  const dbStatusText = document.getElementById('dbStatusText');
  const dbStorage = document.getElementById('dbStorage');
  const gutter = document.getElementById('gutter');
  const lineHighlight = document.getElementById('lineHighlight');
  const editorInfo = document.getElementById('editorInfo');
  const runState = document.getElementById('runState');
  const toasts = document.getElementById('toasts');

  const steps = document.querySelectorAll('.pipeline .step');

  // If the page is served by server.js, use the same address. If opened as a file, use localhost:3000.
  const API_BASE = window.location.protocol.startsWith('http') ? '' : 'http://localhost:3000';
  const LINE_HEIGHT = 22;
  let useDatabase = false;
  let errorLine = null;

  const STATUS_LABELS = { error: 'Error', warning: 'Warning', suggestion: 'Suggestion', pass: 'Passed' };

  init();

  async function init() {
    updateEditor();
    useDatabase = await checkDatabase();
    updateStorageStatus();
    if (!useDatabase) toast('Database offline. Using browser storage.', 'warning');
    loadLogs();
  }

  // ---------- Toasts (replace alert boxes) ----------
  function toast(message, type) {
    if (!toasts) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'success');
    el.innerHTML = '<i></i><span></span>';
    el.querySelector('span').textContent = message;
    toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  // ---------- Database status ----------
  async function checkDatabase() {
    try {
      const res = await fetch(API_BASE + '/api/health');
      const data = await res.json();
      return data.database === 'connected';
    } catch (err) {
      return false;
    }
  }

  function updateStorageStatus() {
    if (storageLabel) {
      storageLabel.textContent = useDatabase ? 'MongoDB Atlas' : 'Offline mode';
      storageLabel.className = 'status-pill ' + (useDatabase ? 'online' : 'offline');
    }
    if (dbCard) dbCard.className = 'hero-db ' + (useDatabase ? 'online' : 'offline');
    if (dbStatusTitle) dbStatusTitle.textContent = useDatabase ? 'MongoDB connected' : 'Database offline';
    if (dbStorage) dbStorage.textContent = useDatabase ? 'MongoDB Atlas' : 'Browser (localStorage)';
    if (dbStatusText) dbStatusText.textContent = useDatabase ? 'Reviews archived in the cloud' : 'Reviews kept in this browser';
        if (historySource) historySource.textContent = useDatabase ? 'Stored in MongoDB' : 'Stored in browser';
  }

  // ---------- Code editor: line numbers + error highlight ----------
  function updateEditor() {
    const lines = codeInput.value.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
      html += '<div' + (i === errorLine ? ' class="err"' : '') + '>' + i + '</div>';
    }
    gutter.innerHTML = html;
    editorInfo.textContent = lines + (lines === 1 ? ' line' : ' lines') + ' · ' + codeInput.value.length + ' chars';
    syncScroll();
    const ghost = document.getElementById('heroGhost');
    if (ghost) ghost.textContent = codeInput.value.slice(0, 600);
  }

  function syncScroll() {
    gutter.scrollTop = codeInput.scrollTop;
    if (errorLine) {
      lineHighlight.style.display = 'block';
      lineHighlight.style.top = (14 + (errorLine - 1) * LINE_HEIGHT - codeInput.scrollTop) + 'px';
    } else {
      lineHighlight.style.display = 'none';
    }
  }

  function setErrorLine(line) {
    errorLine = line;
    updateEditor();
  }

  codeInput.addEventListener('input', function() {
    if (errorLine) errorLine = null;
    updateEditor();
  });
  codeInput.addEventListener('scroll', syncScroll);
  codeInput.addEventListener('keydown', function(e) {
    // Tab inserts spaces instead of leaving the editor
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = this.selectionStart, end = this.selectionEnd;
      this.value = this.value.slice(0, s) + '  ' + this.value.slice(end);
      this.selectionStart = this.selectionEnd = s + 2;
      updateEditor();
    }
    // Ctrl/Cmd + Enter submits
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      prForm.requestSubmit();
    }
  });

  // ---------- Submit ----------
  prForm.addEventListener('submit', function(event) {
    event.preventDefault();

    const codeSnippet = codeInput.value.trim();

    if (codeSnippet === '') {
      toast('Paste some code before submitting.', 'error');
      codeInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing webhook…';
    setErrorLine(null);

    runPipelineSimulation(codeSnippet);
  });

  // ---------- Animated pipeline ----------
  function runPipelineSimulation(codeSnippet) {
    steps.forEach(step => step.classList.remove('running', 'done'));
    runState.textContent = 'Running';
    runState.classList.add('running');

    const delay = 600;
    steps.forEach((step, i) => {
      setTimeout(() => {
        if (i > 0) {
          steps[i - 1].classList.remove('running');
          steps[i - 1].classList.add('done');
        }
        step.classList.add('running');
      }, i * delay);
    });

    setTimeout(() => {
      const aiFeedback = analyzeCode(codeSnippet);
      const status = getStatus(aiFeedback);

      const last = steps[steps.length - 1];
      last.classList.remove('running');
      last.classList.add('done');
      runState.textContent = 'Completed';
      runState.classList.remove('running');

      showComment(aiFeedback, status);

      // Highlight the line with the missing semicolon, if any
      const match = aiFeedback.match(/at line (\d+)/);
      if (match) setErrorLine(parseInt(match[1], 10));

      saveReview(codeSnippet, aiFeedback);

      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit pull request';
    }, steps.length * delay);
  }

  function showComment(feedback, status) {
    aiCommentText.innerHTML = stripEmoji(feedback);
    commentBadge.className = 'badge badge-' + status;
    commentBadge.textContent = STATUS_LABELS[status];
    commentTime.textContent = 'commented just now';
    commentContainer.classList.remove('flash');
    void commentContainer.offsetWidth;
    commentContainer.classList.add('flash');
  }

  // ---------- Review engine (unchanged rules) ----------
  function analyzeCode(code) {
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      return '❌ <strong>Hard Syntax Error:</strong> Mismatched curly braces <code>{ }</code>. You have ' + openBraces + ' opening and ' + closeBraces + ' closing braces.';
    }

    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      return '❌ <strong>Hard Syntax Error:</strong> Mismatched parentheses <code>( )</code>. Check your method parameters or control statements.';
    }

    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('//') && !line.startsWith('/*') &&
          !line.endsWith('{') && !line.endsWith('}') && !line.endsWith(';') &&
          !line.startsWith('public class') && !line.startsWith('class') && !line.startsWith('@')) {
        return '❌ <strong>Hard Syntax Error:</strong> Missing semicolon <code>;</code> at line ' + (i + 1) + ': <code>' + escapeHTML(line) + '</code>';
      }
    }

    if (code.includes('var ')) {
      return '⚠️ <strong>Warning:</strong> Avoid using <code>var</code>. Consider modern block-scoped keywords like <code>let</code> or <code>const</code>.';
    }

    if (code.includes('console.log(') || code.includes('System.out.println(')) {
      return '⚠️ <strong>Notice:</strong> Found print/debug statements. Clean up logging code before merging to production.';
    }

    if (code.includes('function') && !code.includes('return')) {
      return '💡 <strong>Suggestion:</strong> Your function does not explicitly specify a <code>return</code> statement. Ensure output is returned if needed.';
    }

    if (!code.includes('if') && !code.includes('try')) {
      return '💡 <strong>Suggestion:</strong> Consider adding parameter validation checks (e.g., checking for null, undefined, or invalid inputs).';
    }

    return '✅ <strong>Looks Good To Merge (LGTM):</strong> Code structure is clean and follows standard rules.';
  }

  function getStatus(feedback) {
    if (feedback.startsWith('❌')) return 'error';
    if (feedback.startsWith('⚠️')) return 'warning';
    if (feedback.startsWith('💡')) return 'suggestion';
    return 'pass';
  }

  // ---------- Save / load ----------
  async function saveReview(code, feedback) {
    const status = getStatus(feedback);
    if (useDatabase) {
      try {
        const res = await fetch(API_BASE + '/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, feedback: feedback, status: status })
        });
        if (!res.ok) throw new Error('Save failed');
        toast('Saved to MongoDB archive');
        loadLogs();
        return;
      } catch (err) {
        console.warn('MongoDB save failed, falling back to browser storage:', err);
        useDatabase = false;
        updateStorageStatus();
        toast('Database unreachable. Saved in browser instead.', 'warning');
      }
    } else {
      toast('Review saved in browser', 'info');
    }
    saveReviewToStorage(code, feedback, status);
  }

  async function loadLogs() {
    if (useDatabase) {
      try {
        const res = await fetch(API_BASE + '/api/reviews');
        if (!res.ok) throw new Error('Load failed');
        const reviews = await res.json();
        const logs = reviews.map(r => ({
          time: new Date(r.createdAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
          code: r.code,
          feedback: r.feedback,
          status: r.status || getStatus(r.feedback)
        }));
        renderLogs(logs);
        loadStats(logs);
        return;
      } catch (err) {
        console.warn('MongoDB load failed, falling back to browser storage:', err);
        useDatabase = false;
        updateStorageStatus();
      }
    }
    loadLogsFromStorage();
  }

  async function loadStats(logs) {
    if (useDatabase) {
      try {
        const res = await fetch(API_BASE + '/api/stats');
        if (res.ok) return renderStats(await res.json());
      } catch (err) { /* fall through to local count */ }
    }
    const stats = { total: logs.length, error: 0, warning: 0, suggestion: 0, pass: 0 };
    logs.forEach(l => { stats[l.status || getStatus(l.feedback)]++; });
    renderStats(stats);
  }

  function renderStats(stats) {
    const total = stats.total || 0;
    const navCount = document.getElementById('navCount');
    if (navCount) navCount.textContent = total;
    animateNumber('statTotal', total);
    ['error', 'warning', 'suggestion', 'pass'].forEach(key => {
      const id = 'stat' + key.charAt(0).toUpperCase() + key.slice(1);
      animateNumber(id, stats[key] || 0);
      const bar = document.getElementById('bar' + key.charAt(0).toUpperCase() + key.slice(1));
      if (bar) bar.style.width = total ? ((stats[key] || 0) / total * 100) + '%' : '0%';
    });
  }

  function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseInt(el.textContent, 10) || 0;
    if (start === target) { el.textContent = target; return; }
    const t0 = performance.now();
    (function tick(now) {
      const p = Math.min((now - t0) / 500, 1);
      el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
    // make sure the final number is shown even if animations are paused
    setTimeout(() => { el.textContent = target; }, 650);
  }

  // ---------- Browser storage (backup when database is offline) ----------
  function saveReviewToStorage(code, feedback, status) {
    const timestamp = new Date().toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const newLog = { time: timestamp, code: code, feedback: feedback, status: status };

    let logs = [];
    try { logs = JSON.parse(localStorage.getItem('pr_review_logs')) || []; } catch (e) {}
    logs.unshift(newLog);
    try { localStorage.setItem('pr_review_logs', JSON.stringify(logs.slice(0, 50))); } catch (e) {}

    renderLogs(logs);
    loadStats(logs);
  }

  function loadLogsFromStorage() {
    let logs = [];
    try { logs = JSON.parse(localStorage.getItem('pr_review_logs')) || []; } catch (e) {}
    renderLogs(logs);
    loadStats(logs);
  }

  // ---------- History list ----------
  function renderLogs(logs) {
    if (!logsContainer) return;

    if (logs.length === 0) {
      logsContainer.innerHTML = '<div class="empty"><strong>Nothing archived yet</strong><a href="#review">Review a snippet</a> and its verdict is kept here.</div>';
      return;
    }

    let html = '';
    logs.forEach((log, i) => {
      const status = log.status || getStatus(log.feedback);
      const firstLine = log.code.split('\n').find(l => l.trim()) || log.code;
      html += `
        <div class="history-item">
          <span class="badge badge-${status}">${STATUS_LABELS[status]}</span>
          <span class="history-code">${escapeHTML(firstLine)}</span>
          <span class="history-feedback">${stripEmoji(log.feedback)}</span>
          <span class="history-time">${escapeHTML(log.time)}</span>
        </div>
      `;
    });

    logsContainer.innerHTML = html;
  }

  // Clear history: click once to arm, click again to confirm (no ugly popup)
  let clearArmed = false;
  clearLogsBtn.addEventListener('click', async function() {
    if (!clearArmed) {
      clearArmed = true;
      clearLogsBtn.textContent = 'Click again to confirm';
      clearLogsBtn.classList.add('confirm');
      setTimeout(() => {
        clearArmed = false;
        clearLogsBtn.textContent = 'Clear archive';
        clearLogsBtn.classList.remove('confirm');
      }, 3000);
      return;
    }
    clearArmed = false;
    clearLogsBtn.textContent = 'Clear archive';
    clearLogsBtn.classList.remove('confirm');

    if (useDatabase) {
      try {
        await fetch(API_BASE + '/api/reviews', { method: 'DELETE' });
      } catch (err) {
        console.warn('MongoDB delete failed:', err);
      }
    }
    try { localStorage.removeItem('pr_review_logs'); } catch (e) {}
    renderLogs([]);
    renderStats({ total: 0, error: 0, warning: 0, suggestion: 0, pass: 0 });
    toast('Archive cleared', 'info');
  });

  // ---------- Star band: a drifting field of points (one ambient moment) ----------
  const bandControl = { start() {}, stop() {} };
  const band = document.getElementById('band');
  if (band && band.getContext) {
    const ctx = band.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dots = [], stars = [];

    function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = band.clientWidth; H = band.clientHeight;
      band.width = W * dpr; band.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = []; stars = [];
      const n = Math.round(W * 6);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * W;
        const spread = 26 + 18 * Math.sin(x / W * Math.PI * 3 + 1);
        dots.push({ x, o: gauss() * spread, r: Math.random() < .9 ? .7 : 1.3, a: .2 + Math.random() * .65, s: .08 + Math.random() * .12 });
      }
      for (let i = 0; i < 70; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, r: .8 + Math.random() * 2.2, a: .3 + Math.random() * .6, s: .03 + Math.random() * .05 });
      }
    }
    function center(x, t) { return H * .5 + Math.sin(x / W * Math.PI * 2 + t * .0002) * H * .14 + Math.sin(x / 90) * 4; }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#e8e1d3';
      dots.forEach(d => {
        const x = (d.x + t * d.s * .02) % W;
        ctx.globalAlpha = d.a;
        ctx.fillRect(x, center(x, t) + d.o, d.r, d.r);
      });
      stars.forEach(st => {
        const x = (st.x + t * st.s * .02) % W;
        ctx.globalAlpha = st.a;
        ctx.beginPath(); ctx.arc(x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    // Only animate while the Home page is showing
    let running = false, raf = 0;
    function loop(t) { draw(t); if (running) raf = requestAnimationFrame(loop); }
    bandControl.start = function() {
      build();
      if (reduce) { draw(0); return; }
      if (!running) { running = true; raf = requestAnimationFrame(loop); }
    };
    bandControl.stop = function() { running = false; cancelAnimationFrame(raf); };
    window.addEventListener('resize', () => { if (running || reduce) { build(); draw(performance.now()); } });
  }

  // ---------- Pages (Home / Review / Archive) ----------
  const ROUTES = ['home', 'review', 'archive'];
  function showView(name) {
    if (!ROUTES.includes(name)) name = 'home';
    document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== name; });
    document.querySelectorAll('.nav-links [data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === name));
    if (name === 'home') bandControl.start(); else bandControl.stop();
    if (name === 'review') setTimeout(() => codeInput.focus({ preventScroll: true }), 50);
    document.title = { home: 'ReviewBot — Automated Code Review', review: 'Review · ReviewBot', archive: 'Archive · ReviewBot' }[name];
  }
  window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
  showView(location.hash.slice(1));

  // ---------- Helpers ----------
  function escapeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stripEmoji(html) {
    return html.replace(/^(❌|⚠️|💡|✅)\s*/, '');
  }

});
