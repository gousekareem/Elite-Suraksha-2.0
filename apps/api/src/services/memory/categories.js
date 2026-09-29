// Memory retention policy: only these categories become durable Hindsight memory.
// Trivial chat turns are never retained.

const CATEGORIES = {
  worker_pattern: 'Where and when the worker usually works',
  worker_preference: 'How the worker wants explanations delivered',
  earnings_pattern: 'What the worker normally earns under comparable conditions',
  historical_anomaly: 'A significant earnings change the anomaly engine detected',
  investigation_finding: 'What an investigation established (facts, inferences, unknowns)',
  investigation_outcome: 'How an investigation was resolved and what was learned',
  platform_context: 'Platform notices and events relevant to the worker',
  user_feedback: 'Feedback the worker gave about an investigation or explanation'
};

// Categories that describe previous situations and how they turned out.
const CASE_CATEGORIES = ['historical_anomaly', 'investigation_finding', 'investigation_outcome', 'user_feedback'];

const isCategory = (c) => Object.prototype.hasOwnProperty.call(CATEGORIES, c);

const tagFor = (category) => `cat:${category}`;

const categoryFromTags = (tags = []) => {
  const t = (tags || []).find((x) => typeof x === 'string' && x.startsWith('cat:'));
  return t ? t.slice(4) : null;
};

module.exports = { CATEGORIES, CASE_CATEGORIES, isCategory, tagFor, categoryFromTags };
