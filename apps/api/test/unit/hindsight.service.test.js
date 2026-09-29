const test = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/env');
const { HindsightService, UNAVAILABLE_NOTICE } = require('../../src/services/memory/hindsight.service');

// In-memory fakes: a Hindsight client that stores per-bank documents, and a
// prisma stub for the MemoryEvent audit table.
const fakeClient = () => {
  const banks = new Map();
  let seq = 0;
  return {
    banks,
    calls: [],
    async createBank(bank) { if (!banks.has(bank)) banks.set(bank, new Map()); },
    async retain(bank, content, o) {
      this.calls.push(['retain', bank, o.documentId]);
      if (!banks.has(bank)) throw Object.assign(new Error('bank not found'), { statusCode: 404 });
      banks.get(bank).set(o.documentId, { id: `f${(seq += 1)}`, text: content, document_id: o.documentId, tags: o.tags, metadata: o.metadata, type: 'world' });
      return { success: true, items_count: 1 };
    },
    async recall(bank, query, o) {
      this.calls.push(['recall', bank, query]);
      if (!banks.has(bank)) throw Object.assign(new Error(`Bank '${bank}' not found`), { statusCode: 404 });
      let rows = [...banks.get(bank).values()];
      if (o.tags) rows = rows.filter((r) => r.tags.some((t) => o.tags.includes(t)));
      const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      return { results: rows.filter((r) => words.some((w) => r.text.toLowerCase().includes(w))) };
    },
    async getVersion() { return { api_version: 'fake' }; },
    async deleteBank(bank) { banks.delete(bank); }
  };
};
const fakePrisma = () => {
  const rows = [];
  return {
    rows,
    memoryEvent: {
      async create({ data }) { rows.push({ ...data, createdAt: new Date() }); return data; },
      async findFirst({ where }) { return [...rows].reverse().find((r) => r.workerId === where.workerId && r.operation === where.operation && r.documentId === where.documentId && r.status === where.status) || null; }
    }
  };
};
const quiet = { info() {}, warn() {}, error() {} };
const cfg = { enabled: true, url: 'http://fake', bankPrefix: 'test-worker-', recallBudget: 'low', recallTimeoutMs: 1000, retainTimeoutMs: 1000, logOperations: false, retainExtractionMode: 'verbatim' };

test('each worker gets an isolated bank and ids are validated', () => {
  const hs = new HindsightService({ client: fakeClient(), config: cfg, prisma: fakePrisma(), log: quiet });
  assert.equal(hs.bankIdFor('workerA1'), 'test-worker-workerA1');
  assert.notEqual(hs.bankIdFor('workerA1'), hs.bankIdFor('workerB1'));
  assert.throws(() => hs.bankIdFor('../other'), /server-resolved/);
  assert.throws(() => hs.bankIdFor(undefined), /server-resolved/);
});

test('retain → recall round trip, category filtering and worker isolation', async () => {
  const client = fakeClient();
  const prisma = fakePrisma();
  const hs = new HindsightService({ client, config: cfg, prisma, log: quiet });
  await hs.retainMemory({ workerId: 'workerA1', category: 'earnings_pattern', content: 'Friday evening earnings are normally 1000', documentId: 'p1', localDate: '2026-06-18', reason: 't' });
  await hs.retainInvestigationOutcome({ workerId: 'workerA1', investigation: { id: 'inv1', caseNumber: 'ES-1', periodStart: '2026-06-19', title: 'Friday decline' }, outcome: { resolvedLocalDate: '2026-06-24', result: 'Incentive eligibility changed', rootCauseCategory: 'INCENTIVE_ELIGIBILITY_CHANGE', actionTaken: 'asked support', learning: 'check incentive eligibility first' } });
  const a = await hs.recallMemory({ workerId: 'workerA1', query: 'friday incentive eligibility earnings', reason: 't' });
  assert.equal(a.status, 'OK');
  assert.equal(a.memories.length, 2);
  const cases = await hs.recallSimilarCases({ workerId: 'workerA1', situation: 'friday incentive eligibility earnings' });
  assert.deepEqual(cases.memories.map((m) => m.category), ['investigation_outcome']);
  // Worker B never sees worker A's memories.
  const b = await hs.recallMemory({ workerId: 'workerB1', query: 'friday incentive eligibility earnings', reason: 't' });
  assert.equal(b.status, 'EMPTY');
  assert.equal(b.memories.length, 0);
  assert.ok(client.calls.filter((c) => c[0] === 'recall' && c[2].includes('friday')).every((c) => c[1].startsWith('test-worker-')));
  assert.ok(prisma.rows.some((r) => r.operation === 'RETAIN' && r.category === 'investigation_outcome' && r.status === 'OK'));
});

test('identical re-retain is skipped (no duplicate memories on refresh)', async () => {
  const client = fakeClient();
  const hs = new HindsightService({ client, config: cfg, prisma: fakePrisma(), log: quiet });
  const input = { workerId: 'workerA1', category: 'worker_pattern', content: 'Works Fridays', documentId: 'sched', localDate: '2026-06-18', reason: 't' };
  assert.equal((await hs.retainMemory(input)).status, 'OK');
  assert.equal((await hs.retainMemory(input)).status, 'DUPLICATE_SKIPPED');
  assert.equal((await hs.retainMemory({ ...input, content: 'Works Fridays and Saturdays' })).status, 'OK', 'changed content replaces the document');
  assert.equal(client.calls.filter((c) => c[0] === 'retain').length, 2);
  assert.equal(client.banks.get('test-worker-workerA1').size, 1, 'same document id → one document');
});

test('unknown categories are rejected (retention policy)', async () => {
  const hs = new HindsightService({ client: fakeClient(), config: cfg, prisma: fakePrisma(), log: quiet });
  await assert.rejects(() => hs.retainMemory({ workerId: 'w12345', category: 'chat_message', content: 'hi', documentId: 'x', reason: 't' }), /Unknown memory category/);
});

test('Hindsight unavailable → recall degrades with an explicit notice, never throws', async () => {
  const hs = new HindsightService({ config: { ...cfg, url: 'http://127.0.0.1:9', recallTimeoutMs: 1500, retainTimeoutMs: 1500 }, prisma: fakePrisma(), log: quiet });
  const r = await hs.recallMemory({ workerId: 'workerA1', query: 'anything', reason: 't' });
  assert.equal(r.status, 'UNAVAILABLE');
  assert.equal(r.notice, UNAVAILABLE_NOTICE);
  const ctx = await hs.getWorkerMemoryContext({ workerId: 'workerA1', question: 'why', situation: 'drop' });
  assert.equal(ctx.status, 'UNAVAILABLE');
  const w = await hs.retainMemory({ workerId: 'workerA1', category: 'worker_pattern', content: 'x', documentId: 'd', reason: 't' });
  assert.ok(['UNAVAILABLE', 'FAILED'].includes(w.status));
  const s = await hs.status({ fresh: true });
  assert.equal(s.connected, false);
});

test('disabled Hindsight is reported as disabled, not faked', async () => {
  const hs = new HindsightService({ config: { ...cfg, enabled: false }, prisma: fakePrisma(), log: quiet });
  const r = await hs.recallMemory({ workerId: 'workerA1', query: 'x', reason: 't' });
  assert.equal(r.status, 'DISABLED');
  assert.equal(r.memories.length, 0);
});
