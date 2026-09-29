const test = require('node:test');
const assert = require('node:assert/strict');
const ds = require('../../src/demo/dataset');
const { getAdapter, listAdapters } = require('../../src/platform');
const { sessionMetrics, buildBaseline } = require('../../src/services/analytics/metrics');
const { evaluateSession } = require('../../src/services/analytics/anomaly');
const dates = require('../../src/lib/dates');

test('synthetic dataset is deterministic and covers 60–120 days', () => {
  const a = ds.statementsBetween(ds.DEMO.historyStart, ds.DEMO.secondAnomalyDate);
  const b = ds.statementsBetween(ds.DEMO.historyStart, ds.DEMO.secondAnomalyDate);
  assert.deepEqual(a, b);
  const span = dates.diffDays(ds.DEMO.secondAnomalyDate, ds.DEMO.historyStart) + 1;
  assert.ok(span >= 60 && span <= 120, `span ${span}`);
  assert.ok(a.length >= 60);
  // Sub-ranges produce identical rows (seeded per date).
  assert.deepEqual(ds.statementsBetween('2026-06-19', '2026-06-19')[0], a.find((s) => s.date === '2026-06-19'));
});

test('the designed story anomalies are the only investigation-worthy sessions', () => {
  const adapter = getAdapter('GENERIC_DELIVERY');
  const rows = ds.statementsBetween(ds.DEMO.historyStart, ds.DEMO.secondAnomalyDate).map((s, i) => {
    const n = adapter.normalizeStatement(s);
    return sessionMetrics({ ...n.session, id: `s${i}`, earnings: n.earnings });
  });
  const excluded = new Set();
  const flagged = [];
  for (const cur of rows) {
    const prior = rows.filter((h) => h.date < cur.date && h.date >= dates.addDays(cur.date, -56) && !excluded.has(h.sessionId) && h.segmentKey === cur.segmentKey);
    const ev = evaluateSession(cur, buildBaseline(prior));
    if (['SIGNIFICANT_CHANGE', 'INVESTIGATION_RECOMMENDED'].includes(ev.severity)) { excluded.add(cur.sessionId); flagged.push([cur.date, ev.severity]); }
  }
  assert.deepEqual(flagged, [['2026-06-19', 'INVESTIGATION_RECOMMENDED'], ['2026-07-17', 'SIGNIFICANT_CHANGE'], ['2026-08-14', 'INVESTIGATION_RECOMMENDED']]);
});

test('platform adapter validates and normalises statements', () => {
  assert.equal(listAdapters().length, 3);
  const a = getAdapter('GENERIC_DELIVERY');
  assert.throws(() => a.normalizeStatement({ ref: '', date: 'x', trips: [] }), /Invalid platform statement/);
  assert.throws(() => getAdapter('SOME_REAL_COMPANY'), /Unsupported platform/);
  const n = a.normalizeStatement({ ref: 'r1', date: '2026-06-19', start: '18:00', end: '23:00', zone: 'Zone A', offered: 5, accepted: 4, trips: [
    { time: '18:10', km: 3, pay: 30 }, { time: '18:40', km: 2, pay: 27, zone: 'Zone B' }, { time: '19:00', km: 0, pay: 0, status: 'CANCELLED' }
  ], incentive: { program: 'P', eligible: false, amount: 0 }, deductions: [{ label: 'fee', amount: 15 }] });
  assert.equal(n.session.ordersCompleted, 2);
  assert.equal(n.session.ordersCancelled, 1);
  assert.equal(n.session.acceptanceRate, 80);
  assert.deepEqual(n.session.zoneBreakdown, { 'Zone A': 1, 'Zone B': 1 });
  assert.equal(n.earnings.netEarnings, 57 - 15);
  assert.equal(n.session.dayOfWeek, 5);
});
