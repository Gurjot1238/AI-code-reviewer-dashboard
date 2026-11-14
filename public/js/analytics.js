(function () {
  const C = { cream: '#e8e1d3', ash: '#9b958a', dust: '#625d55', rule: '#36332e', err: '#d27a6c', warn: '#d6b46f', sugg: '#9fb4c6', pass: '#a9bd98' };
  let timelineChart, statusChart;

  if (window.Chart) {
    Chart.defaults.color = C.ash;
    Chart.defaults.font.family = "'IBM Plex Mono', monospace";
    Chart.defaults.font.size = 10;
    Chart.defaults.borderColor = C.rule;
  }

  const range = document.getElementById('rangeSelect');
  range.addEventListener('change', load);

  function bars(el, rows, max, color) {
    el.innerHTML = rows.length ? rows.map(r => `
      <div class="bar-row"><span>${esc(r.label)}</span><div class="bar-track"><div class="bar-fill" style="background:${color || C.cream}" data-w="${max ? r.value / max * 100 : 0}"></div></div><span class="n">${r.value}${r.suffix || ''}</span></div>`).join('')
      : '<div class="empty">No data yet</div>';
    requestAnimationFrame(() => el.querySelectorAll('.bar-fill').forEach(b => { b.style.width = b.dataset.w + '%'; }));
  }

  async function load() {
    let a;
    try { a = await api('/analytics?days=' + range.value); }
    catch (err) { toast(err.message, 'error'); return; }

    countUp(document.getElementById('aReviews'), a.overview.reviews);
    countUp(document.getElementById('aScore'), a.overview.avgScore);
    countUp(document.getElementById('aIssues'), a.overview.issues);
    countUp(document.getElementById('aAi'), a.overview.aiReviews);
    countUp(document.getElementById('aRepo'), a.overview.avgRepoScore);

    if (window.Chart) {
      const labels = a.timeline.map(d => new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
      timelineChart && timelineChart.destroy();
      timelineChart = new Chart(document.getElementById('timelineChart'), {
        data: {
          labels,
          datasets: [
            { type: 'bar', label: 'Reviews', data: a.timeline.map(d => d.reviews), backgroundColor: 'rgba(232,225,211,.18)', borderColor: C.cream, borderWidth: { top: 1 }, yAxisID: 'y', order: 2 },
            { type: 'line', label: 'Avg score', data: a.timeline.map(d => d.avgScore), borderColor: C.pass, backgroundColor: C.pass, pointRadius: 2, tension: .3, spanGaps: true, yAxisID: 'y1', order: 1 }
          ]
        },
        options: {
          maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { boxWidth: 8, boxHeight: 8 } } },
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
            y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'REVIEWS' } },
            y1: { position: 'right', min: 0, max: 100, grid: { display: false }, title: { display: true, text: 'SCORE' } }
          }
        }
      });

      const st = a.byStatus;
      statusChart && statusChart.destroy();
      statusChart = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: { labels: ['Errors', 'Warnings', 'Suggestions', 'Passed'], datasets: [{ data: [st.error, st.warning, st.suggestion, st.pass], backgroundColor: [C.err, C.warn, C.sugg, C.pass], borderColor: '#1d1c1a', borderWidth: 3 }] },
        options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right', labels: { boxWidth: 8, boxHeight: 8, padding: 14 } } } }
      });
    }

    const catMax = Math.max(0, ...a.byCategory.map(c => c.count));
    bars(document.getElementById('categoryBars'), a.byCategory.map(c => ({ label: c.category, value: c.count })), catMax);
    bars(document.getElementById('languageBars'), a.byLanguage.map(l => ({ label: `${l.language} · ${l.avgScore}`, value: l.count })), Math.max(0, ...a.byLanguage.map(l => l.count)), C.ash);

    document.getElementById('topIssues').innerHTML = a.topIssues.length ? a.topIssues.map(t => `
      <div class="top-issue"><div>${badge(t.severity)}<div style="margin-top:6px;font-size:13px">${esc(t.message)}</div></div><span class="count">${t.count}×</span></div>`).join('')
      : '<div class="empty"><strong>Nothing yet</strong>Review some code to see patterns.</div>';
  }

  load();
})();
