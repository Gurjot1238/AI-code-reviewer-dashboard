document.addEventListener('DOMContentLoaded', function() {

  const prForm = document.getElementById('prForm');
  const codeInput = document.getElementById('codeInput');
  const submitBtn = document.getElementById('submitBtn');
  const commentContainer = document.getElementById('commentContainer');
  const aiCommentText = document.getElementById('aiCommentText');
  const logsContainer = document.getElementById('logsContainer');
  const clearLogsBtn = document.getElementById('clearLogsBtn');

  const steps = document.querySelectorAll('.pipeline .step');

  loadLogsFromStorage();

  if (prForm) {
    prForm.addEventListener('submit', function(event) {
      event.preventDefault();

      const codeSnippet = codeInput.value.trim();

      if (codeSnippet === '') {
        alert('Please paste some code before submitting!');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerText = 'Processing Webhook...';

      runPipelineSimulation(codeSnippet);
    });
  }

  function runPipelineSimulation(codeSnippet) {
    steps.forEach(step => step.classList.remove('active'));

    steps[0].classList.add('active');

    setTimeout(() => {
      steps[1].classList.add('active');
    }, 600);

    setTimeout(() => {
      steps[2].classList.add('active');
    }, 1200);

    setTimeout(() => {
      steps[3].classList.add('active');
      const aiFeedback = analyzeCode(codeSnippet);

      setTimeout(() => {
        steps[4].classList.add('active');
        
        if (aiCommentText) aiCommentText.innerHTML = aiFeedback;
        if (commentContainer) commentContainer.style.display = 'block';

        saveReviewToStorage(codeSnippet, aiFeedback);

        submitBtn.disabled = false;
        submitBtn.innerText = 'Submit Pull Request';
      }, 600);

    }, 1800);
  }

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

  function saveReviewToStorage(code, feedback) {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const newLog = {
      time: timestamp,
      code: code.length > 35 ? code.substring(0, 35) + '...' : code,
      feedback: feedback
    };

    let logs = JSON.parse(localStorage.getItem('pr_review_logs')) || [];
    logs.unshift(newLog);

    localStorage.setItem('pr_review_logs', JSON.stringify(logs));
    renderLogs(logs);
  }

  function loadLogsFromStorage() {
    const savedLogs = localStorage.getItem('pr_review_logs');
    if (savedLogs) {
      const logs = JSON.parse(savedLogs);
      renderLogs(logs);
    }
  }

  function renderLogs(logs) {
    if (!logsContainer) return;

    if (logs.length === 0) {
      logsContainer.innerHTML = '<p style="color: var(--muted); font-size: 14px;">No review history stored in browser yet.</p>';
      return;
    }

    let html = '';
    logs.forEach(log => {
      html += `
        <div class="history-item">
          <small><strong>[${log.time}]</strong> Code snippet: <code>${escapeHTML(log.code)}</code></small>
          <div style="margin-top: 4px;">${log.feedback}</div>
        </div>
      `;
    });

    logsContainer.innerHTML = html;
  }

  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', function() {
      localStorage.removeItem('pr_review_logs');
      renderLogs([]);
    });
  }

  function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

});