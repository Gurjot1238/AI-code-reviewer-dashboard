(async function () {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.replace('/history.html'); return; }

  let review;
  try { review = await api('/reviews/' + id); }
  catch (err) {
    document.querySelector('.content').innerHTML = `<div class="panel"><div class="empty"><strong>Report not found</strong>${esc(err.message)}<br><br><a href="/history.html">Back to history</a></div></div>`;
    return;
  }

  document.title = review.title + ' · ReviewBot';
  document.getElementById('pageTitle').textContent = review.title.length > 40 ? review.title.slice(0, 38) + '…' : review.title;
  document.getElementById('topActions').innerHTML = `
    <button class="btn btn-line" id="rerunBtn">Re-run review</button>
    ${review.canDelete === false ? '' : '<button class="btn btn-line btn-danger" id="delBtn">Delete</button>'}
    <button class="btn btn-cream" id="pdfBtn">Download PDF</button>`;

  const lines = review.code.split('\n');
  const sev = lineSeverity(review.issues);
  document.getElementById('codeMeta').textContent = `${review.language} · ${lines.length} lines${review.fileName ? ' · ' + review.fileName : ''} · ${new Date(review.createdAt).toLocaleString('en-IN')}${!review.isOwner && review.owner ? ' · by ' + review.owner.name : ''}`;
  const codeView = document.getElementById('codeView');
  codeView.innerHTML = lines.map((l, i) => `<div class="ln ${sev[i + 1] || ''}" id="L${i + 1}"><span class="n">${i + 1}</span><span class="t">${esc(l) || ' '}</span></div>`).join('');

  renderResult(document.getElementById('resultPanel'), review, {
    onIssueClick: i => {
      if (!i.line) return;
      const row = document.getElementById('L' + i.line);
      codeView.scrollTo({ top: row.offsetTop - codeView.clientHeight / 3, behavior: 'smooth' });
      row.animate([{ outline: '1px solid #e8e1d3' }, { outline: '1px solid transparent' }], { duration: 1400 });
    }
  });

  document.getElementById('pdfBtn').addEventListener('click', () => downloadPdf(`/reviews/${id}/pdf`, `reviewbot-report-${id}.pdf`));
  document.getElementById('rerunBtn').addEventListener('click', () => {
    try { sessionStorage.setItem('rb_rerun', review.code); } catch (e) {}
    location.href = '/review.html';
  });
  const del = document.getElementById('delBtn');
  if (del) del.addEventListener('click', async () => {
    if (del.dataset.armed !== '1') {
      del.dataset.armed = '1'; del.textContent = 'Click again to delete';
      setTimeout(() => { del.dataset.armed = ''; del.textContent = 'Delete'; }, 3000);
      return;
    }
    try { await api('/reviews/' + id, { method: 'DELETE' }); location.href = review.isOwner ? '/history.html' : '/admin.html?tab=reviews'; }
    catch (err) { toast(err.message, 'error'); }
  });
})();
