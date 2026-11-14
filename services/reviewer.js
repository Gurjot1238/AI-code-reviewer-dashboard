// Decides which engine reviews the code: Gemini AI first, rule engine as a fallback.

const gemini = require('./gemini');
const rules = require('./rules');

async function review(code, { language, path } = {}) {
  const started = Date.now();
  language = language || (path && rules.languageFromPath(path)) || rules.guessLanguage(code);

  if (gemini.isConfigured()) {
    try {
      const ai = await gemini.reviewCode(code, { language, path });
      const result = rules.finalize({ issues: ai.issues, language, engine: 'gemini', summary: ai.summary });
      return { ...result, durationMs: Date.now() - started };
    } catch (err) {
      console.warn('Gemini review failed, using rule engine:', err.message);
    }
  }

  const result = rules.analyze(code, language);
  return { ...result, durationMs: Date.now() - started };
}

function activeEngine() {
  return gemini.isConfigured() ? 'gemini' : 'rules';
}

module.exports = { review, activeEngine };
