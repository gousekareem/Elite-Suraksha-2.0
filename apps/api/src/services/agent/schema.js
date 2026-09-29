// Structured agent output contract + validator (applied to every answer,
// deterministic or LLM-produced, before it reaches the UI).

const CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'];

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const arr = (v) => (Array.isArray(v) ? v : []);

const validateAgentAnswer = (a) => {
  const errors = [];
  if (!a || typeof a !== 'object') return ['answer must be an object'];
  if (!isStr(a.summary)) errors.push('summary must be a non-empty string');
  for (const k of ['facts', 'inferences', 'unknowns', 'historicalContext', 'recommendedActions', 'evidence']) {
    if (!Array.isArray(a[k])) errors.push(`${k} must be an array`);
  }
  arr(a.facts).forEach((f, i) => { if (!isStr(f?.text)) errors.push(`facts[${i}].text missing`); });
  arr(a.inferences).forEach((f, i) => {
    if (!isStr(f?.text)) errors.push(`inferences[${i}].text missing`);
    if (f?.confidence && !CONFIDENCE.includes(f.confidence)) errors.push(`inferences[${i}].confidence invalid`);
  });
  arr(a.unknowns).forEach((f, i) => { if (!isStr(f?.text)) errors.push(`unknowns[${i}].text missing`); });
  arr(a.recommendedActions).forEach((f, i) => { if (!isStr(f?.text)) errors.push(`recommendedActions[${i}].text missing`); });
  return errors;
};

// JSON schema handed to the LLM for its final answer.
const LLM_ANSWER_SCHEMA = {
  type: 'object',
  required: ['summary', 'facts', 'inferences', 'unknowns', 'recommendedActions'],
  properties: {
    summary: { type: 'string' },
    facts: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } } } },
    inferences: { type: 'array', items: { type: 'object', required: ['text', 'confidence'], properties: { text: { type: 'string' }, confidence: { enum: CONFIDENCE }, basis: { type: 'string' } } } },
    unknowns: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } },
    historicalContext: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, memoryId: { type: 'string' }, whyRelevant: { type: 'string' } } } },
    recommendedActions: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } }
  }
};

/**
 * Grounding check: every ₹ amount and % figure the LLM states must appear in the
 * tool outputs it was given (tolerance ±1). Returns the list of ungrounded figures.
 */
const ungroundedFigures = (answer, toolOutputsText) => {
  const text = [answer.summary, ...(answer.facts || []).map((f) => f.text), ...(answer.inferences || []).map((f) => f.text)].join(' ');
  const figures = [...text.matchAll(/₹\s?([\d,]+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?%/g)].map((m) => Number((m[1] || m[2]).replace(/,/g, '')));
  const known = new Set();
  for (const m of toolOutputsText.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const n = Math.abs(Number(m[0]));
    known.add(Math.round(n));
  }
  return figures.filter((f) => ![-1, 0, 1].some((d) => known.has(Math.round(f) + d)));
};

module.exports = { validateAgentAnswer, LLM_ANSWER_SCHEMA, ungroundedFigures };
