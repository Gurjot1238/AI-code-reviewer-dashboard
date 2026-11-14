(function () {
  const params = new URLSearchParams(location.search);
  const state = { page: 1, q: '', status: '' };
  const tabs = document.querySelectorAll('.tab');

  function showTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.getElementById('reviewsTab').hidden = name !== 'reviews';
    document.getElementById('scansTab').hidden = name !== 'scans';
    name === 'reviews' ? loadReviews() : loadScans();
  }
  tabs.forEach(t => t.addEventListener('click', () => {
    history.replaceState(null, '', t.dataset.tab === 'scans' ? '?tab=scans' : location.pathname);
    showTab(t.dataset.tab);
  }));

  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value; state.page = 1; loadReviews(); }, 300);
  });
  document.getElementById('statusFilter').addEventListener('change', e => { state.status = e.target.value; state.page = 1; loadReviews(); });
  document.getElementById('prevBtn').addEventListener('click', () => { if (state.page > 1) { state.page--; loadReviews(); } });
  document.getElementById('nextBtn').addEventListener('click', () => { state.page++; loadReviews(); });

  async function loadReviews() {
    const rows = document.getElementById('reviewRows');
    try {
      const qs = new URLSearchParams({ page: state.page, limit: 12, q: state.q, status: state.status });
      const data = await api('/reviews?' + qs);
      state.page = Math.min(state.page, data.pages);
      document.getElementById('totalLabel').textContent = `${data.total} review${data.total === 1 ? '' : 's'}`;
      document.getElementById('pageLabel').textContent = `Page ${data.page} of ${data.pages}`;
      document.getElementById('prevBtn').disabled = data.page <= 1;
      document.getElementById('nextBtn').disabled = data.page >= data.pages;

      rows.innerHTML = data.items.length ? data.items.map(r => `
        <tr class="link" data-id="${r._id}">
          <td>${badge(r.status)}</td>
          <td class="code">${esc(r.title)}</td>
          <td><span class="label">${esc(r.language)}</span></td>
          <td class="num score-cell">${r.score}</td>
          <td>${engineChip(r.engine)}</td>
          <td class="time">${timeAgo(r.createdAt)}</td>
          <td class="num" style="white-space:nowrap">
            <button class="btn btn-line btn-sm" data-pdf="${r._id}" title="Download PDF">PDF</button>
            <button class="btn btn-line btn-sm btn-danger" data-del="${r._id}" title="Delete">Delete</button>
          </td>
        </tr>`).join('')
        : `<tr><td colspan="7"><div class="empty"><strong>${state.q || state.status ? 'No matches' : 'No reviews yet'}</strong>${state.q || state.status ? 'Try a different search or filter.' : '<a href="/review.html">Review your first snippet</a>'}</div></td></tr>`;

      rows.querySelectorAll('tr.link').forEach(tr => tr.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        location.href = '/report.html?id=' + tr.dataset.id;
      }));
      rows.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', () => downloadPdf(`/reviews/${b.dataset.pdf}/pdf`, `reviewbot-report-${b.dataset.pdf}.pdf`)));
      rows.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        // two-step delete: first click arms, second click deletes
        if (b.dataset.armed !== '1') {
          b.dataset.armed = '1'; b.textContent = 'Confirm';
          setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Delete'; }, 3000);
          return;
        }
        try { await api('/reviews/' + b.dataset.del, { method: 'DELETE' }); toast('Review deleted', 'info'); loadReviews(); }
        catch (err) { toast(err.message, 'error'); }
      }));
    } catch (err) { toast(err.message, 'error'); }
  }

  async function loadScans() {
    const rows = document.getElementById('scanRows');
    try {
      const { items } = await api('/scans');
      rows.innerHTML = items.length ? items.map(s => `
        <tr class="link" data-id="${s._id}">
          <td class="code">${esc(s.owner)}/${esc(s.repo)}</td>
          <td><span class="label">${esc(s.branch)}</span></td>
          <td class="num score-cell">${s.state === 'done' ? s.score : '—'}</td>
          <td class="num">${s.totals ? s.totals.error : 0}</td>
          <td class="num">${s.totals ? s.totals.warning : 0}</td>
          <td>${s.state === 'done' ? `<span class="label">${s.progress.total} files</span>` : `<span class="badge ${s.state === 'failed' ? 'error' : 'warning'}">${s.state}</span>`}</td>
          <td class="time">${timeAgo(s.createdAt)}</td>
        </tr>`).join('')
        : '<tr><td colspan="7"><div class="empty"><strong>No scans yet</strong><a href="/scan.html">Scan a GitHub repo</a></div></td></tr>';
      rows.querySelectorAll('tr.link').forEach(tr => tr.addEventListener('click', () => { location.href = '/scan.html?id=' + tr.dataset.id; }));
    } catch (err) { toast(err.message, 'error'); }
  }

  showTab(params.get('tab') === 'scans' ? 'scans' : 'reviews');
})();
