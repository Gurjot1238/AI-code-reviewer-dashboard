// Rule-based static analysis.
// Used when Gemini is not configured or not reachable, so the app always gives a review.

const EXT_LANG = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', java: 'java', py: 'python',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  go: 'go', rb: 'ruby', php: 'php', kt: 'kotlin', swift: 'swift', rs: 'rust',
  html: 'html', css: 'css', scss: 'css'
};

// Languages that end statements with ";"
const SEMICOLON_LANGS = ['javascript', 'typescript', 'java', 'c', 'cpp', 'csharp', 'php'];

function languageFromPath(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return EXT_LANG[ext] || null;
}

function guessLanguage(code) {
  if (/^\s*(def |import \w+$|from \w+ import|print\()/m.test(code)) return 'python';
  if (/public\s+(static\s+)?(class|void)|System\.out\.println/.test(code)) return 'java';
  if (/#include\s*</.test(code)) return 'cpp';
  if (/:\s*(string|number|boolean)\b|interface\s+\w+\s*\{/.test(code)) return 'typescript';
  return 'javascript';
}

function analyze(code, language) {
  language = language || guessLanguage(code);
  const issues = [];
  const lines = code.split('\n');
  const add = (line, severity, category, message, fix) => issues.push({ line, severity, category, message, fix: fix || '' });

  // 1. Bracket balance (ignores brackets inside strings and comments, roughly)
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
  const pairs = [['{', '}', 'curly braces'], ['(', ')', 'parentheses'], ['[', ']', 'square brackets']];
  pairs.forEach(([open, close, name]) => {
    const o = stripped.split(open).length - 1;
    const c = stripped.split(close).length - 1;
    if (o !== c) {
      add(null, 'error', 'syntax', `Mismatched ${name}: ${o} opening "${open}" and ${c} closing "${close}".`,
        `Add the missing "${o > c ? close : open}" so every block is closed.`);
    }
  });

  // 2. Line-by-line checks
  let inBlockComment = false;
  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line) return;
    if (inBlockComment) { if (line.includes('*/')) inBlockComment = false; return; }
    if (line.startsWith('/*')) { if (!line.includes('*/')) inBlockComment = true; return; }
    if (line.startsWith('//') || line.startsWith('#') || line.startsWith('*')) return;

    if (SEMICOLON_LANGS.includes(language)) {
      const endsOk = /[;{}:,(\[]$/.test(line) || /^(\}|\)|\]|@|<|else\b|case\b|default\b)/.test(line)
        || /^(public|private|protected)?\s*(abstract\s+)?(class|interface|enum)\b/.test(line)
        || /^(if|for|while|switch|try|catch|finally|do)\b/.test(line)
        || /=>$/.test(line) || /^[.?&|+\-]/.test(line) || /[&|+\-*/=?]$/.test(line);
      if (!endsOk) {
        add(n, 'error', 'syntax', `Missing semicolon at the end of line ${n}.`, `${line};`);
      }
    }

    if (/\bvar\s+\w/.test(line) && ['javascript', 'typescript'].includes(language)) {
      add(n, 'warning', 'best-practice', 'Avoid "var". It is function-scoped and can cause bugs.', line.replace(/\bvar\b/, 'let'));
    }
    if (/console\.log\(|System\.out\.println\(|^print\(/.test(line)) {
      add(n, 'warning', 'style', 'Debug print statement left in the code.', 'Remove it or use a proper logger before merging.');
    }
    if (/[^=!]==[^=]/.test(line) && ['javascript', 'typescript'].includes(language)) {
      add(n, 'warning', 'best-practice', 'Loose equality "==" can give surprising results.', line.replace(/([^=!])==([^=])/, '$1===$2'));
    }
    if (/\beval\s*\(/.test(line)) {
      add(n, 'error', 'security', '"eval" runs any string as code and is a security risk.', 'Parse the data instead (for example JSON.parse) or restructure the logic.');
    }
    if (/\.innerHTML\s*=/.test(line)) {
      add(n, 'warning', 'security', 'Setting innerHTML with dynamic data can allow XSS attacks.', 'Use textContent, or sanitize the HTML first.');
    }
    if (/(password|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{4,}["']/i.test(line)) {
      add(n, 'error', 'security', 'Looks like a hard-coded secret or password.', 'Move it to an environment variable (.env).');
    }
    if (/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/.test(line)) {
      add(n, 'warning', 'error-handling', 'Empty catch block hides errors.', 'Log the error or handle it.');
    }
    if (raw.length > 120) {
      add(n, 'suggestion', 'style', `Line is ${raw.length} characters long.`, 'Split it to keep lines under 100 characters.');
    }
    if (/\b(TODO|FIXME)\b/.test(raw)) {
      add(n, 'suggestion', 'maintainability', 'Unfinished TODO/FIXME left in the code.', 'Finish it or track it as an issue.');
    }
  });

  // 3. Whole-file suggestions
  if (/function\s+\w+\s*\([^)]*\)\s*\{/.test(code) && !/\breturn\b/.test(code)) {
    add(null, 'suggestion', 'best-practice', 'Function has no return statement.', 'Return a value if callers need the result.');
  }
  if (lines.length > 3 && !/\b(if|try|throw)\b/.test(code)) {
    add(null, 'suggestion', 'robustness', 'No input validation or error handling found.', 'Check for null/undefined or invalid inputs before using them.');
  }

  return finalize({ issues, language, engine: 'rules' });
}

// Shared by both engines: score + overall status + a summary line
function finalize({ issues, language, engine, summary }) {
  const weights = { error: 18, warning: 7, suggestion: 2 };
  const penalty = issues.reduce((sum, i) => sum + (weights[i.severity] || 0), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status = issues.some(i => i.severity === 'error') ? 'error'
    : issues.some(i => i.severity === 'warning') ? 'warning'
    : issues.some(i => i.severity === 'suggestion') ? 'suggestion' : 'pass';

  if (!summary) {
    const c = s => issues.filter(i => i.severity === s).length;
    summary = issues.length === 0
      ? 'Looks good to merge. No problems found.'
      : `Found ${c('error')} error(s), ${c('warning')} warning(s) and ${c('suggestion')} suggestion(s).`;
  }
  issues.sort((a, b) => (a.line || 0) - (b.line || 0));
  return { issues, language, engine, summary, score, status };
}

module.exports = { analyze, finalize, languageFromPath, guessLanguage };
