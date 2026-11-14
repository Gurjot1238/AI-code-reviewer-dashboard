// Builds the sidebar on every app page. Each page sets <body data-page="...">.

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M18 11.5c0 4-6 3-10 5"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/></svg>',
  analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="20" x2="4" y2="12"/><line x1="10" y1="20" x2="10" y2="5"/><line x1="16" y1="20" x2="16" y2="9"/><line x1="22" y1="20" x2="2" y2="20"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><polyline points="8.5 12 11 14.5 15.5 10"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  logo: '<svg viewBox="0 0 20 20"><path d="M10 1v18M1 10h18M3.6 3.6l12.8 12.8M16.4 3.6L3.6 16.4" stroke="currentColor" stroke-width="2"/></svg>'
};

const NAV = [
  { group: 'Workspace', items: [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard.html' },
    { id: 'review', label: 'Review code', href: '/review.html' },
    { id: 'scan', label: 'Repo scan', href: '/scan.html' }
  ] },
  { group: 'Insights', items: [
    { id: 'history', label: 'History', href: '/history.html' },
    { id: 'analytics', label: 'Analytics', href: '/analytics.html' }
  ] },
  // Only shown to reviewers and admins (authorization)
  { group: 'Team', roles: ['reviewer', 'admin'], items: [
    { id: 'admin', label: 'Admin panel', href: '/admin.html' }
  ] }
];

function renderSidebar() {
  const page = document.body.dataset.page;
  const user = Auth.user || { name: 'You', email: '' };
  const side = document.querySelector('.sidebar');
  if (!side) return;

  side.innerHTML = `
    <a class="logo" href="/dashboard.html">${ICONS.logo} ReviewBot</a>
    ${NAV.filter(g => !g.roles || Auth.is(...g.roles)).map(g => `
      <nav class="nav-group" aria-label="${g.group}">
        <div class="label">${g.group}</div>
        ${g.items.map(i => `<a class="nav-item ${i.id === page ? 'active' : ''}" href="${i.href}" title="${i.label}">${ICONS[i.id]}<span>${i.label}</span></a>`).join('')}
      </nav>`).join('')}
    <div class="side-foot">
      <div class="side-status">
        <div><span class="dot" id="dbDot"></span><span id="dbText">Database</span></div>
        <div><span class="dot" id="aiDot"></span><span id="aiText">Engine</span></div>
      </div>
      <div class="side-user">
        <div class="avatar">${esc((user.name || '?').charAt(0))}</div>
        <div class="who"><div class="name">${esc(user.name)} ${user.role && user.role !== 'user' ? roleChip(user.role) : ''}</div><div class="email">${esc(user.email)}</div></div>
        <button class="logout" id="logoutBtn" title="Log out" aria-label="Log out">${ICONS.logout}</button>
      </div>
    </div>`;

  document.getElementById('logoutBtn').addEventListener('click', () => Auth.logout());
  loadStatus();
}

async function loadStatus() {
  try {
    const h = await fetch('/api/health').then(r => r.json());
    const db = h.database === 'connected';
    document.getElementById('dbDot').className = 'dot ' + (db ? 'ok' : 'warn');
    document.getElementById('dbText').textContent = db ? 'MongoDB connected' : 'Database offline';
    const ai = h.engine === 'gemini';
    document.getElementById('aiDot').className = 'dot ' + (ai ? 'ok' : 'warn');
    document.getElementById('aiText').textContent = ai ? 'Gemini AI active' : 'Rule engine';
    window.__engine = h.engine;
    document.dispatchEvent(new CustomEvent('status', { detail: h }));
  } catch (e) {
    document.getElementById('dbText').textContent = 'Server offline';
  }
}

if (Auth.require()) {
  renderSidebar();
  // Re-draw the sidebar if an admin changed this user's role since they logged in
  const before = Auth.role;
  Auth.refresh().then(u => {
    if (u.role !== before) renderSidebar();
    document.dispatchEvent(new CustomEvent('user', { detail: u }));
  }).catch(() => {});
}
