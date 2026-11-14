(function () {
  const params = new URLSearchParams(location.search);
  const startPanel = document.getElementById('startPanel');
  const recentPanel = document.getElementById('recentPanel');
  const view = document.getElementById('scanView');
  const form = document.getElementById('scanForm');
  const input = document.getElementById('repoInput');
  const btn = document.getElementById('scanBtn');
  let pollTimer = null;

  document.querySelectorAll('[data-repo]').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.repo; input.focus(); }));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Fetching repo';
    try {
      const scan = await api('/scans', { method: 'POST', body: { repoUrl: input.value } });
      history.pushState(null, '', '/scan.html?id=' + scan._id);
      openScan(scan._id);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Scan repository';
    }
  });

  async function loadList() {
    try {
      const { items } = await api('/scans');
      document.getElementById('scanList').innerHTML = items.length ? items.map(s => `
        <tr class="link" data-id="${s._id}">
          <td class="code">${esc(s.owner)}/${esc(s.repo)}</td>
          <td><span class="label">${esc(s.branch)}</span></td>
          <td>${s.state === 'done' ? `<span class="label">${s.progress.total} files</span>` : `<span class="badge warning">${s.state}</span>`}</td>
          <td class="num score-cell">${s.state === 'done' ? s.score : '—'}</td>
          <td class="time">${timeAgo(s.createdAt)}</td>
        </tr>`).join('')
        : '<tr><td><div class="empty"><strong>No scans yet</strong>Paste a public GitHub link above.</div></td></tr>';
      document.querySelectorAll('#scanList tr.link').forEach(tr => tr.addEventListener('click', () => {
        history.pushState(null, '', '/scan.html?id=' + tr.dataset.id);
        openScan(tr.dataset.id);
      }));
    } catch (err) { toast(err.message, 'error'); }
  }

  async function openScan(id) {
    clearTimeout(pollTimer);
    startPanel.hidden = true; recentPanel.hidden = true; view.hidden = false;
    let scan;
    try { scan = await api('/scans/' + id); }
    catch (err) { toast(err.message, 'error'); return showStart(); }

    document.getElementById('pageTitle').textContent = `${scan.owner}/${scan.repo}`;
    if (scan.state === 'running') {
      const pct = scan.progress.total ? Math.round(scan.progress.done / scan.progress.total * 100) : 0;
      view.innerHTML = `
        <section class="panel">
          <div class="panel-head"><h2>Scanning</h2><span class="label">${scan.progress.done} / ${scan.progress.total} files</span></div>
          <div class="progress"><span style="width:${pct}%"></span></div>
          <div class="panel-body muted">Pulling files from <b>${esc(scan.owner)}/${esc(scan.repo)}</b> (${esc(scan.branch)}) and reviewing them two at a time. You can leave this page. The scan keeps running and is saved to your history.</div>
        </section>`;
      pollTimer = setTimeout(() => openScan(id), 2000);
      return;
    }
    if (scan.state === 'failed') {
      view.innerHTML = `<section class="panel"><div class="empty"><strong>Scan failed</strong>${esc(scan.error || 'Unknown error')}<br><br><a href="/scan.html">Try another repo</a></div></section>`;
      return;
    }
    renderScan(scan);
  }

  function renderScan(scan) {
    const worst = scan.totals.error ? 'error' : scan.totals.warning ? 'warning' : scan.totals.suggestion ? 'suggestion' : 'pass';
    document.getElementById('topActions').innerHTML = `
      <a class="btn btn-line" href="${esc(scan.repoUrl)}" target="_blank" rel="noopener">Open on GitHub</a>
      <button class="btn btn-line" id="pdfBtn">Download PDF</button>
      <a class="btn btn-cream" href="/scan.html">New scan</a>`;
    document.getElementById('pdfBtn').addEventListener('click', () => downloadPdf(`/scans/${scan._id}/pdf`, `reviewbot-scan-${scan.owner}-${scan.repo}.pdf`));

    view.innerHTML = `
      <div class="panel" style="margin-bottom:20px">
        <div class="result-head">
          ${scoreRing(scan.score)}
          <div>
            <p class="summary">${scan.files.length} files reviewed in ${esc(scan.owner)}/${esc(scan.repo)}.</p>
            <div class="meta">${badge(worst)} <span>Branch ${esc(scan.branch)}</span> <span>${scan.skipped} files skipped</span> <span>${timeAgo(scan.createdAt)}</span>
              ${scan.files.some(f => f.engine === 'gemini') ? engineChip('gemini') : engineChip('rules')}</div>
          </div>
        </div>
        <div class="counts">
          <div><span class="badge error">Errors</span><b>${scan.totals.error}</b></div>
          <div><span class="badge warning">Warnings</span><b>${scan.totals.warning}</b></div>
          <div><span class="badge suggestion">Suggestions</span><b>${scan.totals.suggestion}</b></div>
        </div>
      </div>
      <div class="scan-layout">
        <div class="files" id="fileList">
          ${scan.files.slice().sort((a, b) => a.score - b.score).map((f, i) => `
            <div class="file" data-i="${scan.files.indexOf(f)}" tabindex="0">
              <span class="path"><span>${esc(f.path)}</span></span><span class="s ${f.status}">${f.score}</span>
            </div>`).join('')}
        </div>
        <div class="file-detail" id="fileDetail"></div>
      </div>`;
    animateRings(view);

    const items = [...view.querySelectorAll('.file')];
    const select = el => {
      items.forEach(x => x.classList.toggle('active', x === el));
      const f = scan.files[el.dataset.i];
      const detail = document.getElementById('fileDetail');
      renderResult(detail, f);
      detail.querySelector('.summary').insertAdjacentHTML('beforebegin', `<div class="label" style="margin-bottom:6px">${esc(f.path)} · ${f.lines} lines</div>`);
    };
    items.forEach(el => {
      el.addEventListener('click', () => select(el));
      el.addEventListener('keydown', e => { if (e.key === 'Enter') select(el); });
    });
    if (items[0]) select(items[0]);   // worst file first
  }

  function showStart() {
    clearTimeout(pollTimer);
    startPanel.hidden = false; recentPanel.hidden = false; view.hidden = true;
    document.getElementById('pageTitle').textContent = 'Repo scan';
    document.getElementById('topActions').innerHTML = '';
    loadList();
  }

  window.addEventListener('popstate', () => {
    const id = new URLSearchParams(location.search).get('id');
    id ? openScan(id) : showStart();
  });

  params.get('id') ? openScan(params.get('id')) : showStart();
})();
