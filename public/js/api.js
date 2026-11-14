// Shared helpers used by every page: API calls with the login token, auth, toasts, formatting.

const Auth = {
  get token() { try { return localStorage.getItem('rb_token'); } catch (e) { return null; } },
  get user() { try { return JSON.parse(localStorage.getItem('rb_user')); } catch (e) { return null; } },
  save(token, user) {
    try { localStorage.setItem('rb_token', token); localStorage.setItem('rb_user', JSON.stringify(user)); } catch (e) {}
  },
  clear() { try { localStorage.removeItem('rb_token'); localStorage.removeItem('rb_user'); } catch (e) {} },
  // Send visitors without a token to the login page
  require() {
    if (!this.token) {
      location.replace('/login.html?next=' + encodeURIComponent(location.pathname + location.search));
      return false;
    }
    return true;
  },
  logout() { this.clear(); location.href = '/login.html'; },
  // Role checks (the server enforces these too - this only hides buttons)
  get role() { return (this.user && this.user.role) || 'user'; },
  is(...roles) { return roles.includes(this.role); },
  // Pull the latest name/role from the server (a role may have been changed by an admin)
  async refresh() {
    const { user } = await api('/auth/me');
    try { localStorage.setItem('rb_user', JSON.stringify(user)); } catch (e) {}
    return user;
  }
};

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;   // file uploads (Multer)
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  if (Auth.token) headers.Authorization = 'Bearer ' + Auth.token;

  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  } catch (err) {
    throw new Error('Cannot reach the server. Is it running?');
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    Auth.clear();
    location.replace('/login.html?expired=1');
    throw new Error('Session expired');
  }
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// Download a PDF from a protected route
async function downloadPdf(path, filename) {
  try {
    const res = await api(path, { raw: true });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not create the PDF.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('PDF report downloaded');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function toast(message, type = 'success') {
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<i></i><span></span>';
  el.querySelector('span').textContent = message;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 3400);
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STATUS = { error: 'Error', warning: 'Warning', suggestion: 'Suggestion', pass: 'Passed' };
const badge = s => `<span class="badge ${s}">${STATUS[s] || s}</span>`;
const ROLE_LABEL = { user: 'User', reviewer: 'Reviewer', admin: 'Admin' };
const roleChip = r => `<span class="role-chip ${r || 'user'}">${ROLE_LABEL[r] || 'User'}</span>`;
const engineChip = e => e === 'gemini' ? '<span class="chip ai">Gemini AI</span>' : '<span class="chip">Rules</span>';

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
  if (s < 604800) return Math.floor(s / 86400) + ' days ago';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function scoreRing(score, size = 112) {
  const r = 46, c = 2 * Math.PI * r;
  return `<div class="score" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="${r}" fill="none" stroke-width="3"/>
    <circle class="bar" cx="50" cy="50" r="${r}" fill="none" stroke-width="3" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - score / 100)}"/></svg>
    <div class="num"><div>${score}<small>/ 100</small></div></div></div>`;
}
// Animate rings after they are added to the page
function animateRings(root = document) {
  requestAnimationFrame(() => root.querySelectorAll('.score .bar').forEach(b => { b.style.strokeDashoffset = b.dataset.target; }));
}

function countUp(el, target) {
  if (!el) return;
  const start = performance.now();
  const tick = now => {
    const p = Math.min((now - start) / 600, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setTimeout(() => { el.textContent = target; }, 700);
}
