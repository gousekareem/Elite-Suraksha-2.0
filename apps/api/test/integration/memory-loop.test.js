// End-to-end: auth → isolation → the full memory loop against the real API,
// PostgreSQL and (when reachable) a real Hindsight server.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { start, hindsightReachable } = require('../helpers/server');

let h;
let hasHindsight = false;
const tok = {};

test.before(async () => {
  hasHindsight = await hindsightReachable();
  h = await start();
});
test.after(async () => { await h.stop(); });

test('health and authentication', async () => {
  assert.equal((await h.call('GET', '/health')).status, 200);
  assert.equal((await h.call('GET', '/me/dashboard')).status, 401);
  assert.equal((await h.call('GET', '/me/dashboard', { token: 'garbage' })).status, 401);
  const otp = await h.call('POST', '/auth/send-otp', { body: { phone: '9876543210' } });
  assert.equal(otp.status, 201);
  assert.ok(otp.data.devOtp);
  const bad = await h.call('POST', '/auth/verify-otp', { body: { phone: '9876543210', otp: '000000' } });
  assert.equal(bad.status, 400);
  const ok = await h.call('POST', '/auth/verify-otp', { body: { phone: '9876543210', otp: otp.data.devOtp } });
  assert.equal(ok.status, 200);
  tok.newUser = ok.data.accessToken;
  // A new user has no worker profile yet.
  assert.equal((await h.call('GET', '/me/dashboard', { token: tok.newUser })).status, 409);
  const prof = await h.call('PUT', '/onboarding/profile', { token: tok.newUser, body: { fullName: 'Test Worker', city: 'Pune', zone: 'Zone Z', platformCode: 'GENERIC_RIDE' } });
  assert.equal(prof.status, 200);
  const invalid = await h.call('PUT', '/onboarding/profile', { token: tok.newUser, body: { fullName: '', city: 'Pune', zone: 'Z', platformCode: 'GENERIC_RIDE' } });
  assert.equal(invalid.status, 400);
});

test('demo accounts and role checks', async () => {
  for (const as of ['worker', 'admin', 'second-worker']) {
    const r = await h.call('POST', '/auth/demo-login', { body: { as } });
    assert.equal(r.status, 200, as);
    tok[as] = r.data.accessToken;
  }
  assert.equal((await h.call('GET', '/admin/overview', { token: tok.worker })).status, 403, 'workers cannot use admin routes');
  const reset = await h.call('POST', '/demo/reset', { token: tok.admin });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.initialised, true);
  assert.equal((await h.call('POST', '/demo/reset', { token: tok['second-worker'] })).status, 403, 'only the demo worker/admin can drive the demo');
  assert.equal((await h.call('POST', '/me/agent/ask', { token: tok.worker, body: { question: '' } })).status, 400, 'validation');
  assert.equal((await h.call('POST', '/me/agent/ask', { token: tok.worker, body: { question: 'x', mode: 'hack' } })).status, 400);
});

let firstInvestigationId;
let workerId;

test('phase 1: history ingested, anomaly detected, agent answers from history + memory', async () => {
  const hist = await h.call('POST', '/demo/steps/load-history', { token: tok.worker });
  assert.equal(hist.status, 200);
  assert.ok(hist.data.ingested.created >= 30);
  workerId = hist.data.state.workerId;
  if (hasHindsight) assert.ok(hist.data.state.memory.retained >= 5, 'patterns retained in Hindsight');

  const normal = await h.call('POST', '/me/agent/ask', { token: tok.worker, body: { question: 'What do I normally earn on Friday evenings?' } });
  assert.equal(normal.status, 200);
  assert.equal(normal.data.answer.intent, 'NORMAL_EARNINGS');
  assert.match(normal.data.answer.summary, /Friday 18:00–23:00/);

  const anomaly = await h.call('POST', '/demo/steps/first-anomaly', { token: tok.worker });
  assert.deepEqual(anomaly.data.ingested.anomalies.map((a) => a.severity), ['INVESTIGATION_RECOMMENDED']);

  const why = await h.call('POST', '/me/agent/ask', { token: tok.worker, body: { question: 'Why did my earnings drop?' } });
  const a = why.data.answer;
  assert.equal(a.intent, 'EARNINGS_DROP');
  assert.equal(a.date, '2026-06-19');
  assert.equal(a.primaryFactor, 'incentive');
  assert.ok(a.facts.length >= 5 && a.inferences.length >= 1 && a.unknowns.length >= 1, 'fact / inference / unknown separation');
  assert.equal(a.offer.type, 'CREATE_INVESTIGATION');
  assert.equal(a.usedPreviousOutcome, false, 'no previous outcome exists yet');
  const memStep = why.data.trace.find((s) => s.id === 'memory');
  assert.equal(memStep.status, hasHindsight ? 'done' : 'unavailable');
  assert.ok(why.data.toolsUsed.some((t) => t.tool === 'get_comparable_sessions'));

  // Investigation from the agent's offer.
  const inv = await h.call('POST', '/me/investigations', { token: tok.worker, body: { sessionId: a.offer.sessionId, anomalyId: a.offer.anomalyId } });
  assert.equal(inv.status, 201);
  firstInvestigationId = inv.data.investigation.id;
  const again = await h.call('POST', '/me/investigations', { token: tok.worker, body: { anomalyId: a.offer.anomalyId } });
  assert.equal(again.status, 200, 'idempotent per anomaly');
  assert.equal(again.data.investigation.id, firstInvestigationId);
  const full = inv.data.investigation;
  assert.ok(full.evidence.length >= 5);
  assert.ok(full.findings.some((f) => f.kind === 'UNKNOWN'));
  assert.ok(full.findings.filter((f) => f.kind === 'FACT').every((f) => f.evidenceIds.length > 0), 'facts cite evidence');

  const ev = await h.call('POST', `/me/investigations/${firstInvestigationId}/evidence`, { token: tok.worker, body: { text: 'I did not receive a notice explaining the change.' } });
  assert.equal(ev.status, 201);
  const rep = await h.call('POST', `/me/investigations/${firstInvestigationId}/reports`, { token: tok.worker, body: {} });
  assert.equal(rep.status, 201);
  assert.equal(rep.data.content.sections.length, 13);
  assert.match(rep.data.markdown, /does not independently establish legal liability/);
  const md = await h.call('GET', `/me/investigations/${firstInvestigationId}/reports/${rep.data.id}/markdown`, { token: tok.worker });
  assert.match(md.body.raw, /# Earnings Investigation Report/);
});

test('worker isolation: another worker cannot read this worker\'s data or memory', async () => {
  assert.equal((await h.call('GET', `/me/investigations/${firstInvestigationId}`, { token: tok['second-worker'] })).status, 404);
  assert.equal((await h.call('GET', `/me/investigations/${firstInvestigationId}`, { token: tok.newUser })).status, 404);
  // Client-supplied worker ids are ignored/rejected.
  const spoof = await h.call('POST', '/me/agent/ask', { token: tok['second-worker'], body: { question: 'Why did my earnings drop?', workerId } });
  assert.equal(spoof.status, 200);
  const text = JSON.stringify(spoof.data.answer);
  assert.ok(!/Rahul|ES-2026|Evening Peak Bonus/.test(text), 'no leakage of worker A data into worker B answer');
  if (hasHindsight) {
    const insp = await h.call('GET', '/me/memory/inspector', { token: tok['second-worker'] });
    assert.ok(insp.data.bankId.endsWith(insp.data.bankId.split('-').pop()));
    assert.ok(!insp.data.items.some((m) => /Rahul|Evening Peak Bonus/.test(m.text)), 'worker B bank holds none of worker A\'s memories');
  }
  // Admin can see the worker explicitly, through the admin-scoped route.
  const adminView = await h.call('GET', `/admin/workers/${workerId}/investigations/${firstInvestigationId}`, { token: tok.admin });
  assert.equal(adminView.status, 200);
});

test('outcome is retained, and after the time jump the agent recalls it', async () => {
  const res = await h.call('POST', '/demo/steps/resolve-first-investigation', { token: tok.worker });
  assert.equal(res.status, 200);
  if (hasHindsight) {
    assert.equal(res.data.memory.status, 'OK');
    assert.equal(res.data.state.steps.firstOutcomeRetained, true);
  }
  const dup = await h.call('POST', `/me/investigations/${firstInvestigationId}/resolve`, { token: tok.worker, body: { result: 'x', rootCauseCategory: 'OTHER', actionTaken: 'y' } });
  assert.equal(dup.status, 409);

  const jump = await h.call('POST', '/demo/steps/time-jump', { token: tok.worker });
  assert.ok(jump.data.ingested.anomalies.some((x) => x.localDate === '2026-08-14' && x.severity === 'INVESTIGATION_RECOMMENDED'));

  const wow = await h.call('POST', '/me/agent/ask', { token: tok.worker, body: { question: 'Why did my earnings drop again?' } });
  const a = wow.data.answer;
  assert.equal(a.date, '2026-08-14');
  if (!hasHindsight) {
    assert.equal(a.memory.status, 'UNAVAILABLE');
    assert.ok(a.unknowns.some((u) => /memory was unavailable/.test(u.text)));
    return;
  }
  assert.equal(a.usedPreviousOutcome, true, 'previous outcome recalled from Hindsight');
  assert.ok(a.historicalContext.some((m) => m.category === 'investigation_outcome'));
  assert.match(a.summary, /similar situation in your history/);
  assert.equal(a.recommendedActions[0].fromMemory, true, 'memory changed what to check first');
  assert.ok(a.inferences.some((i) => /different eligibility condition/.test(i.text)), 'memory + structured comparison refine the analysis');

  // Same question without Hindsight: no recalled outcome.
  const cmp = await h.call('POST', '/me/agent/compare', { token: tok.worker, body: { question: 'Why did my earnings drop again?' } });
  assert.equal(cmp.data.historyOnly.answer.usedPreviousOutcome, false);
  assert.equal(cmp.data.currentOnly.answer.facts.length, 1);
  assert.equal(cmp.data.full.answer.usedPreviousOutcome, true);

  // The second investigation carries the recalled outcome as evidence.
  const inv2 = await h.call('POST', '/me/investigations', { token: tok.worker, body: { date: '2026-08-14' } });
  assert.equal(inv2.status, 201);
  assert.equal(inv2.data.investigation.analysis.usedPreviousOutcome, true);
  assert.ok(inv2.data.investigation.evidence.some((e) => e.type === 'PREVIOUS_INVESTIGATION'));
  assert.ok(inv2.data.investigation.evidence.some((e) => e.type === 'HINDSIGHT_MEMORY'));

  const journey = await h.call('GET', '/me/memory/journey', { token: tok.worker });
  const kinds = journey.data.milestones.map((m) => m.kind);
  for (const k of ['profile', 'learned', 'anomaly', 'investigation', 'outcome', 'recall']) assert.ok(kinds.includes(k), `journey has ${k}`);
});

test('agent keeps working when Hindsight is unavailable', async () => {
  const { AgentOrchestrator } = require('../../src/services/agent/orchestrator');
  const { HindsightService } = require('../../src/services/memory/hindsight.service');
  const prisma = require('../../src/lib/prisma');
  const down = new HindsightService({ config: { enabled: true, url: 'http://127.0.0.1:9', bankPrefix: 'x-', recallBudget: 'low', recallTimeoutMs: 1000, retainTimeoutMs: 1000, logOperations: false } });
  const worker = await prisma.workerProfile.findUnique({ where: { id: workerId } });
  const r = await new AgentOrchestrator({ hindsight: down }).ask({ worker, question: 'Why did my earnings drop again?' });
  assert.equal(r.answer.memory.status, 'UNAVAILABLE');
  assert.match(r.answer.memory.notice, /temporarily unavailable/);
  assert.ok(r.answer.facts.length >= 5, 'structured analysis still works');
  assert.equal(r.trace.find((s) => s.id === 'memory').status, 'unavailable');
});

test('LLM path: tool calls go through the registry; ungrounded figures are rejected', async () => {
  const { AgentOrchestrator } = require('../../src/services/agent/orchestrator');
  const prisma = require('../../src/lib/prisma');
  const worker = await prisma.workerProfile.findUnique({ where: { id: workerId } });
  let finalText = '';
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const msgs = JSON.parse(body).messages;
      seen.push(msgs.length);
      const hasTool = msgs.some((m) => m.role === 'tool');
      const message = hasTool
        ? { role: 'assistant', content: finalText }
        : { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_comparable_sessions', arguments: JSON.stringify({ date: '2026-08-14' }) } }, { id: 'c2', type: 'function', function: { name: 'get_platform_events', arguments: '{"workerId":"someone-else"}' } }] };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message }] }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  try {
  const llmConfig = { provider: 'openai', apiKey: 'test', model: 'fake-model', baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 5000, maxToolRounds: 4 };
  const o = new AgentOrchestrator({ llmConfig });

  finalText = JSON.stringify({ summary: 'Earnings were ₹807, 22.8% below your ₹1,046 baseline.', facts: [{ text: 'Net ₹807 from 25 orders.' }], inferences: [{ text: 'Incentive missing.', confidence: 'HIGH' }], unknowns: [{ text: 'Why eligibility failed.' }], recommendedActions: [{ text: 'Ask support.' }] });
  const good = await o.ask({ worker, question: 'Why did my earnings drop again?' });
  assert.equal(good.engine.engine, 'llm');
  assert.match(good.answer.summary, /₹807/);
  assert.ok(good.toolsUsed.some((t) => t.tool === 'get_platform_events' && t.ok === false), 'malformed tool input rejected by registry');
  assert.ok(good.trace.some((s) => s.label === 'LLM interpretation validated'));

  finalText = JSON.stringify({ summary: 'Earnings were ₹612 lower than ₹9,999.', facts: [{ text: 'x' }], inferences: [], unknowns: [], recommendedActions: [] });
  const bad = await o.ask({ worker, question: 'Why did my earnings drop again?' });
  assert.equal(bad.engine.engine, 'deterministic', 'fell back to deterministic answer');
  assert.ok(bad.trace.some((s) => s.label === 'LLM interpretation rejected'));
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
