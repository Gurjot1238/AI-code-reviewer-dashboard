(async function () {
  const user = Auth.user;
  if (user) document.getElementById('hello').textContent = 'Hi, ' + user.name.split(' ')[0];

  document.addEventListener('status', e => {
    document.getElementById('aiBanner').hidden = e.detail.engine === 'gemini';
  });

  try {
    const [a, reviews, scans] = await Promise.all([
      api('/analytics?days=30'),
      api('/reviews?limit=6'),
      api('/scans')
    ]);
    countUp(document.getElementById('sReviews'), a.overview.reviews);
    countUp(document.getElementById('sScore'), a.overview.avgScore);
    countUp(document.getElementById('sIssues'), a.overview.issues);
    countUp(document.getElementById('sScans'), a.overview.scans);
    countUp(document.getElementById('sFiles'), a.overview.filesScanned);

    document.getElementById('recentReviews').innerHTML = reviews.items.length
      ? reviews.items.map(r => `
        <tr class="link" data-href="/report.html?id=${r._id}">
          <td>${badge(r.status)}</td>
          <td class="code">${esc(r.title)}</td>
          <td class="num score-cell">${r.score}</td>
          <td class="time">${timeAgo(r.createdAt)}</td>
        </tr>`).join('')
      : '<tr><td><div class="empty"><strong>No reviews yet</strong><a href="/review.html">Review your first snippet</a></div></td></tr>';

    const s = scans.items.slice(0, 6);
    document.getElementById('recentScans').innerHTML = s.length
      ? s.map(x => `
        <tr class="link" data-href="/scan.html?id=${x._id}">
          <td class="code">${esc(x.owner)}/${esc(x.repo)}</td>
          <td>${x.state === 'done' ? `<span class="label">${x.progress.total} files</span>` : `<span class="badge warning">${x.state}</span>`}</td>
          <td class="num score-cell">${x.state === 'done' ? x.score : '—'}</td>
          <td class="time">${timeAgo(x.createdAt)}</td>
        </tr>`).join('')
      : '<tr><td><div class="empty"><strong>No scans yet</strong><a href="/scan.html">Scan a GitHub repo</a></div></td></tr>';

    document.querySelectorAll('tr.link').forEach(tr => tr.addEventListener('click', () => { location.href = tr.dataset.href; }));
  } catch (err) {
    toast(err.message, 'error');
  }
})();
