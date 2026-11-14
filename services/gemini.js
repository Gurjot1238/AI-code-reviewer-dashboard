// Google Gemini client: sends code to the AI and gets structured review issues back as JSON.

const API = 'https://generativelanguage.googleapis.com/v1beta';
let resolvedModel = null;

function isConfigured() {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && !key.startsWith('<') && key.length > 20);
}

// Pick a model: GEMINI_MODEL from .env, otherwise the best "flash" model this key can use.
async function getModel() {
  if (resolvedModel) return resolvedModel;
  if (process.env.GEMINI_MODEL) return (resolvedModel = process.env.GEMINI_MODEL);

  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY } });
  if (!res.ok) throw new Error(`Could not list Gemini models (${res.status})`);
  const { models = [] } = await res.json();
  const usable = models
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''))
    .filter(n => n.startsWith('gemini') && n.includes('flash') && !/(tts|image|live|audio|embedding|thinking|exp)/.test(n));
  // Prefer stable (non-preview), non-lite, newest version
  const rank = n => (n.includes('preview') ? 0 : 2) + (n.includes('lite') ? 0 : 1);
  const version = n => parseFloat((n.match(/gemini-(\d+(\.\d+)?)/) || [])[1] || 0);
  usable.sort((a, b) => rank(b) - rank(a) || version(b) - version(a));
  if (!usable.length) throw new Error('No Gemini flash model available for this API key');
  resolvedModel = usable[0];
  console.log('Using Gemini model:', resolvedModel);
  return resolvedModel;
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    language: { type: 'STRING' },
    summary: { type: 'STRING' },
    issues: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          line: { type: 'INTEGER', nullable: true },
          severity: { type: 'STRING', enum: ['error', 'warning', 'suggestion'] },
          category: { type: 'STRING' },
          message: { type: 'STRING' },
          fix: { type: 'STRING' }
        },
        required: ['severity', 'category', 'message', 'fix']
      }
    }
  },
  required: ['language', 'summary', 'issues']
};

function buildPrompt(code, { language, path } = {}) {
  const numbered = code.split('\n').map((l, i) => `${i + 1}| ${l}`).join('\n');
  return `You are a senior software engineer reviewing a pull request.
Review the code below${path ? ` from file "${path}"` : ''}${language ? ` (language: ${language})` : ''}.

Report real problems only:
- "error": bugs, syntax errors, crashes, security holes
- "warning": bad practice, likely bugs, performance problems
- "suggestion": readability, naming, small improvements

For each issue give the line number (from the left margin, or null for the whole file), a category
(syntax, bug, security, performance, best-practice, style, error-handling, maintainability),
a short clear message, and a concrete fix (corrected code or a one-line instruction).
Give at most 12 issues, most important first. "summary" is 1-2 plain sentences about overall quality.
If the code is good, return an empty issues list.

CODE:
${numbered}`;
}

async function reviewCode(code, opts = {}) {
  const model = await getModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(code, opts) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: SCHEMA }
      })
    });
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Gemini error ${res.status}: ${body.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    const parsed = JSON.parse(text);
    const maxLine = code.split('\n').length;
    parsed.issues = (parsed.issues || []).map(i => ({
      line: Number.isInteger(i.line) && i.line >= 1 && i.line <= maxLine ? i.line : null,
      severity: ['error', 'warning', 'suggestion'].includes(i.severity) ? i.severity : 'suggestion',
      category: (i.category || 'general').toLowerCase(),
      message: String(i.message || '').slice(0, 500),
      fix: String(i.fix || '').slice(0, 1000)
    }));
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isConfigured, reviewCode, getModel };
