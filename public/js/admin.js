// Admin panel. The server checks roles on every request; this file only shows what the role allows.
(function () {
  const params = new URLSearchParams(location.search);
  const state = { page: 1, q: '', status: '' };
  const tabs = [...document.querySelectorAll('#tabs .tab')];

  function guard() {
    if (!Auth.is('reviewer', 'admin')) { location.replace('/dashboard.html'); return false; }
    // Reviewers can't manage users, so hide that tab
    document.querySelector('[data-tab="users"]').hidden = !Auth.is('admin');
    document.getElementById('myRole').innerHTML = roleChip(Auth.role);
    return true;
  }

  function showTab(name) {
    if (name === 'users' && !Auth.is('admin')) name = 'reviews';
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    ['users', 'reviews', 'scans'].forEach(t => { document.getElementById(t + 'Tab').hidden = t !== name; });
    history.replaceState(null, '', '?tab=' + name);
    ({ users: loadUsers, reviews: loadReviews, scans: loadScans })[name]();
  }
  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  async function loadStats() {
    try {
      const s = await api('/admin/stats');
      countUp(document.getElementById('aUsers'), s.users);
      countUp(document.getElementById('aReviews'), s.reviews);
      countUp(document.getElementById('aScans'), s.scans);
      countUp(document.getElementById('aScore'), s.avgScore);
      document.getElementById('aAdmins').textContent = s.byRole.admin;
      document.getElementById('aReviewers').textContent = s.byRole.reviewer;
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------- Users (admin only) ----------
  let userTimer;
  document.getElementById('userSearch').addEventListener('input', e => {
    clearTimeout(userTimer);
    userTimer = setTimeout(() => loadUsers(e.target.value), 300);
  });

  async function loadUsers(q = document.getElementById('userSearch').value) {
    const rows = document.getElementById('userRows');
    try {
      const { items } = await api('/admin/users?' + new URLSearchParams({ q }));
      document.getElementById('userTotal').textContent = `${items.length} user${items.length === 1 ? '' : 's'}`;
      rows.innerHTML = items.length ? items.map(u => `
        <tr>
          <td>${esc(u.name)}${u.isYou ? '<span class="you">you</span>' : ''}</td>
          <td class="code">${esc(u.email)}</td>
          <td>${u.isYou ? roleChip(u.role) : `
            <select class="select role-select" data-role="${u.id}" aria-label="Role for ${esc(u.name)}">
              ${['user', 'reviewer', 'admin'].map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
            </select>`}</td>
          <td class="num">${u.reviews}</td>
          <td class="num">${u.scans}</td>
          <td class="time">${timeAgo(u.createdAt)}</td>
          <td class="num">${u.isYou ? '' : `<button class="btn btn-line btn-sm btn-danger" data-del="${u.id}" data-name="${esc(u.name)}">Remove</button>`}</td>
        </tr>`).join('')
        : '<tr><td colspan="7"><div class="empty"><strong>No users found</strong>Try a different search.</div></td></tr>';

      rows.querySelectorAll('[data-role]').forEach(sel => {
        const was = sel.value;
        sel.addEventListener('change', async () => {
          try {
            await api(`/admin/users/${sel.dataset.role}/role`, { method: 'PATCH', body: { role: sel.value } });
            toast(`Role changed to ${ROLE_LABEL[sel.value]}`);
            loadStats();
          } catch (err) { sel.value = was; toast(err.message, 'error'); }
        });
      });
      rows.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        // two-step delete: first click arms, second click removes the user and their data
        if (b.dataset.armed !== '1') {
          b.dataset.armed = '1'; b.textContent = 'Confirm';
          setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Remove'; }, 3000);
          return;
        }
        try {
          const r = await api('/admin/users/' + b.dataset.del, { method: 'DELETE' });
          toast(`${b.dataset.name} removed (${r.reviews} reviews, ${r.scans} scans)`, 'info');
          loadUsers(); loadStats();
        } catch (err) { toast(err.message, 'error'); }
      }));
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------- Everyone's reviews (reviewer + admin) ----------
  let reviewTimer;
  document.getElementById('reviewSearch').addEventListener('input', e => {
    clearTimeout(reviewTimer);
    reviewTimer = setTimeout(() => { state.q = e.target.value; state.page = 1; loadReviews(); }, 300);
  });
  document.getElementById('reviewStatus').addEventListener('change', e => { state.status = e.target.value; state.page = 1; loadReviews(); });
  document.getElementById('prevBtn').addEventListener('click', () => { if (state.page > 1) { state.page--; loadReviews(); } });
  document.getElementById('nextBtn').addEventListener('click', () => { state.page++; loadReviews(); });

  async function loadReviews() {
    const rows = document.getElementById('reviewRows');
    try {
      const data = await api('/admin/reviews?' + new URLSearchParams({ page: state.page, q: state.q, status: state.status }));
      state.page = Math.min(state.page, data.pages);
      document.getElementById('reviewTotal').textContent = `${data.total} review${data.total === 1 ? '' : 's'}`;
      document.getElementById('pageLabel').textContent = `Page ${data.page} of ${data.pages}`;
      document.getElementById('prevBtn').disabled = data.page <= 1;
      document.getElementById('nextBtn').disabled = data.page >= data.pages;
      rows.innerHTML = data.items.length ? data.items.map(r => `
        <tr class="link" data-id="${r._id}">
          <td>${badge(r.status)}</td>
          <td class="code">${esc(r.title)}</td>
          <td>${r.user ? esc(r.user.name) : '<span class="faint">deleted</span>'}</td>
          <td><span class="label">${r.source === 'upload' ? 'Upload' : 'Paste'}</span></td>
          <td class="num score-cell">${r.score}</td>
          <td class="time">${timeAgo(r.createdAt)}</td>
        </tr>`).join('')
        : '<tr><td colspan="6"><div class="empty"><strong>No reviews</strong>Nothing matches yet.</div></td></tr>';
      rows.querySelectorAll('tr.link').forEach(tr => tr.addEventListener('click', () => { location.href = '/report.html?id=' + tr.dataset.id; }));
    } catch (err) { toast(err.message, 'error'); }
  }

  // ---------- Everyone's scans (reviewer + admin) ----------
  async function loadScans() {
    const rows = document.getElementById('scanRows');
    try {
      const { items } = await api('/admin/scans');
      rows.innerHTML = items.length ? items.map(s => `
        <tr class="link" data-id="${s._id}">
          <td class="code">${esc(s.owner)}/${esc(s.repo)}</td>
          <td>${s.user ? esc(s.user.name) : '<span class="faint">deleted</span>'}</td>
          <td class="num score-cell">${s.state === 'done' ? s.score : '—'}</td>
          <td class="num">${s.totals ? s.totals.error : 0}</td>
          <td>${s.state === 'done' ? `<span class="label">${s.progress.total} files</span>` : `<span class="badge ${s.state === 'failed' ? 'error' : 'warning'}">${s.state}</span>`}</td>
          <td class="time">${timeAgo(s.createdAt)}</td>
        </tr>`).join('')
        : '<tr><td colspan="6"><div class="empty"><strong>No scans yet</strong></div></td></tr>';
      rows.querySelectorAll('tr.link').forEach(tr => tr.addEventListener('click', () => { location.href = '/scan.html?id=' + tr.dataset.id; }));
    } catch (err) { toast(err.message, 'error'); }
  }

  function start() {
    if (!guard()) return;
    loadStats();
    showTab(params.get('tab') || (Auth.is('admin') ? 'users' : 'reviews'));
  }
  // Wait for the fresh role from the server (in case an admin just changed it), then start
  let started = false;
  document.addEventListener('user', () => { if (!started) { started = true; start(); } });
  setTimeout(() => { if (!started) { started = true; start(); } }, 1500);
})();
