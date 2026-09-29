const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { detectIntent, extractTarget } = require('../../src/services/agent/intent');
const { validateAgentAnswer, ungroundedFigures } = require('../../src/services/agent/schema');
const { validateInput, TOOLS } = require('../../src/services/agent/tools');
const { extractJson } = require('../../src/services/agent/llm');

test('intent detection covers the suggested questions', () => {
  const cases = {
    'Why did my earnings fall this week?': 'EARNINGS_DROP',
    'Have I experienced this before?': 'HISTORY',
    'What happened last time?': 'HISTORY',
    'Show me comparable Friday shifts.': 'COMPARABLE',
    'What changed compared with my normal pattern?': 'FACTOR',
    'Which factor contributed most to the decrease?': 'FACTOR',
    'What evidence supports this?': 'EVIDENCE',
    'Create an investigation.': 'CREATE_INVESTIGATION',
    'What did we learn from my previous case?': 'HISTORY',
    'What do I normally earn on Friday evenings?': 'NORMAL_EARNINGS',
    'Why did my earnings drop again?': 'EARNINGS_DROP'
  };
  for (const [q, intent] of Object.entries(cases)) assert.equal(detectIntent(q), intent, q);
});

test('target extraction reads dates and weekdays relative to the demo clock', () => {
  assert.deepEqual(extractTarget('Why did I earn less on 19 Jun?', '2026-08-14'), { date: '2026-06-19' });
  assert.deepEqual(extractTarget('what about today', '2026-08-14'), { date: '2026-08-14' });
  assert.equal(extractTarget('Friday evenings', '2026-08-14').dayOfWeek, 5);
  assert.equal(extractTarget('Friday evenings', '2026-08-14').timeWindow, 'evening');
});

test('structured answer validation rejects malformed output', () => {
  assert.deepEqual(validateAgentAnswer({ summary: 'ok', facts: [], inferences: [], unknowns: [], historicalContext: [], recommendedActions: [], evidence: [] }), []);
  assert.ok(validateAgentAnswer({ summary: '', facts: 'x' }).length >= 2);
  assert.ok(validateAgentAnswer({ summary: 's', facts: [{}], inferences: [{ text: 't', confidence: 'CERTAIN' }], unknowns: [], historicalContext: [], recommendedActions: [], evidence: [] }).length === 2);
});

test('grounding check flags figures that are not in tool output', () => {
  const tools = JSON.stringify({ net: 807, baseline: 1046, deviationPct: -22.8 });
  assert.deepEqual(ungroundedFigures({ summary: 'You earned ₹807, 22.8% below ₹1,046.', facts: [], inferences: [] }, tools), []);
  assert.deepEqual(ungroundedFigures({ summary: 'You earned ₹950.', facts: [], inferences: [] }, tools), [950]);
});

test('tool registry validates inputs', () => {
  const recall = TOOLS.find((t) => t.name === 'recall_hindsight_memory');
  assert.deepEqual(validateInput(recall.input, { query: 'x' }), []);
  assert.ok(validateInput(recall.input, {}).length);
  assert.ok(validateInput(recall.input, { query: 'x', categories: ['secrets'] }).length);
  assert.ok(validateInput(recall.input, { query: 'x', workerId: 'someone-else' }).some((e) => /unexpected field/.test(e)), 'client-supplied worker ids are rejected');
  const retain = TOOLS.find((t) => t.name === 'retain_hindsight_memory');
  assert.ok(validateInput(retain.input, { category: 'investigation_outcome', content: 'x' }).length, 'LLM cannot retain outcomes');
  assert.equal(TOOLS.find((t) => t.name === 'record_investigation_outcome').requiresConfirmation, true);
});

test('LLM JSON extraction tolerates fences and prose', () => {
  assert.deepEqual(extractJson('Here:\n```json\n{"summary":"a"}\n```'), { summary: 'a' });
  assert.equal(extractJson('no json'), null);
});
