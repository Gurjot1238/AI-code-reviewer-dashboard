// Fetches the code files of a public GitHub repository.
// Optional GITHUB_TOKEN in .env raises GitHub's rate limit from 60 to 5000 requests/hour.

const { languageFromPath } = require('./rules');

const MAX_FILES = Number(process.env.SCAN_MAX_FILES) || 25;
const MAX_BYTES = 60 * 1024;
const IGNORE = /(^|\/)(node_modules|dist|build|out|vendor|\.git|\.next|coverage|__pycache__|venv|target)\//;
const IGNORE_FILE = /(\.min\.(js|css)$|package-lock\.json$|yarn\.lock$|\.d\.ts$)/;

function headers() {
  const h = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ReviewBot' };
  if (process.env.GITHUB_TOKEN && !process.env.GITHUB_TOKEN.startsWith('<')) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

// Accepts "https://github.com/owner/repo", ".../tree/branch", "owner/repo"
function parseRepoUrl(input) {
  const s = String(input || '').trim().replace(/\.git$/, '').replace(/\/$/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/tree\/([^/]+))?/i)
         || s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], branch: m[3] || null };
}

async function gh(url) {
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) throw new Error('Repository not found. Check the link, and make sure the repo is public.');
  if (res.status === 403 || res.status === 429) throw new Error('GitHub rate limit reached. Wait a bit, or add a GITHUB_TOKEN in .env.');
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  return res.json();
}

// Returns { branch, files: [{path, size, language}], skipped }
async function listCodeFiles({ owner, repo, branch }) {
  if (!branch) {
    const info = await gh(`https://api.github.com/repos/${owner}/${repo}`);
    branch = info.default_branch;
  }
  const tree = await gh(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const all = (tree.tree || []).filter(t => t.type === 'blob');
  const code = all.filter(t =>
    languageFromPath(t.path) && !IGNORE.test(t.path) && !IGNORE_FILE.test(t.path) && t.size > 0 && t.size <= MAX_BYTES);

  // Prefer source folders and bigger files (more to review), then cap the count
  code.sort((a, b) => (/(^|\/)(src|app|lib|server|routes|components)\//.test(b.path) - /(^|\/)(src|app|lib|server|routes|components)\//.test(a.path)) || b.size - a.size);
  const files = code.slice(0, MAX_FILES).map(t => ({ path: t.path, size: t.size, language: languageFromPath(t.path) }));
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { branch, files, skipped: all.length - files.length };
}

async function fetchFile({ owner, repo, branch }, path) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'ReviewBot' } });
  if (!res.ok) throw new Error(`Could not download ${path}`);
  return res.text();
}

module.exports = { parseRepoUrl, listCodeFiles, fetchFile, MAX_FILES };
