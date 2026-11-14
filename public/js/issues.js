// Renders a review result (score, summary, counts, filterable issue list). Used by review, report and scan pages.

function renderResult(container, result, { onIssueClick, actions = '' } = {}) {
  const count = s => result.issues.filter(i => i.severity === s).length;
  container.innerHTML = `
    <div class="result-head">
      ${scoreRing(result.score)}
      <div>
        <p class="summary">${esc(result.summary)}</p>
        <div class="meta">${badge(result.status)} ${engineChip(result.engine)} <span>${esc(result.language || '')}</span>
          ${result.durationMs ? `<span>${(result.durationMs / 1000).toFixed(1)}s</span>` : ''}</div>
        ${actions ? `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">${actions}</div>` : ''}
      </div>
    </div>
    <div class="counts">
      <div><span class="badge error">Errors</span><b>${count('error')}</b></div>
      <div><span class="badge warning">Warnings</span><b>${count('warning')}</b></div>
      <div><span class="badge suggestion">Suggestions</span><b>${count('suggestion')}</b></div>
    </div>
    ${result.issues.length ? `
    <div class="filters">
      <button class="filter active" data-f="all">All ${result.issues.length}</button>
      ${['error', 'warning', 'suggestion'].filter(s => count(s)).map(s => `<button class="filter" data-f="${s}">${STATUS[s]}s ${count(s)}</button>`).join('')}
    </div>` : ''}
    <ul class="issues">
      ${result.issues.length ? result.issues.map((i, idx) => `
        <li class="issue" data-sev="${i.severity}" data-line="${i.line || ''}" data-idx="${idx}">
          <div class="where">${badge(i.severity)}<span class="label">${i.line ? 'Line ' + i.line : 'Whole file'}</span><span class="label">${esc(i.category)}</span></div>
          <div><div class="msg">${esc(i.message)}</div>${i.fix ? `<div class="fix">${esc(i.fix)}</div>` : ''}</div>
        </li>`).join('') : '<li class="empty"><strong>Looks good to merge</strong>No problems found in this code.</li>'}
    </ul>`;

  animateRings(container);

  container.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => {
    container.querySelectorAll('.filter').forEach(b => b.classList.toggle('active', b === btn));
    container.querySelectorAll('.issue').forEach(li => { li.hidden = btn.dataset.f !== 'all' && li.dataset.sev !== btn.dataset.f; });
  }));
  if (onIssueClick) {
    container.querySelectorAll('.issue').forEach(li => li.addEventListener('click', () => {
      container.querySelectorAll('.issue').forEach(x => x.classList.toggle('focus', x === li));
      onIssueClick(result.issues[li.dataset.idx], li);
    }));
  }
}

// Worst severity per line (for highlighting code)
function lineSeverity(issues) {
  const rank = { error: 3, warning: 2, suggestion: 1 };
  const map = {};
  issues.forEach(i => { if (i.line && (!map[i.line] || rank[i.severity] > rank[map[i.line]])) map[i.line] = i.severity; });
  return map;
}
