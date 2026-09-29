const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionMetrics, buildBaseline, decompose, periodComparison } = require('../../src/services/analytics/metrics');
const { findComparableSessions, summarizeComparables } = require('../../src/services/analytics/comparable');
const { evaluateSession } = require('../../src/services/analytics/anomaly');
const { round, median, pctChange, inr } = require('../../src/lib/num');

let n = 0;
const mk = (date, { orders = 24, base = 760, incentive = 250, tips = 20, ded = 15, dow = 5, start = 18, end = 23, zone = 'Zone A', acc = 88, active = 260, idle = 40 } = {}) => sessionMetrics({
  id: `s${(n += 1)}`, externalRef: `r${n}`, localDate: date, dayOfWeek: dow, startHour: start, endHour: end, zone, platformCode: 'GENERIC_DELIVERY',
  ordersCompleted: orders, ordersOffered: orders + 3, ordersAccepted: orders, ordersCancelled: 0, acceptanceRate: acc, rating: 4.8, distanceKm: 70,
  activeMinutes: active, idleMinutes: idle, zoneBreakdown: { [zone]: orders },
  earnings: { basePay: base, tips, incentiveAmount: incentive, incentiveProgram: 'Evening Peak Bonus', incentiveEligible: incentive > 0, deductionAmount: ded, grossEarnings: base + tips + incentive, netEarnings: base + tips + incentive - ded }
});

const history = ['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29'].map((d, i) => mk(d, { orders: 22 + i, base: 700 + i * 30 }));

test('number helpers are deterministic', () => {
  assert.equal(round(1.005, 2), 1.01);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(pctChange(75, 100), -25);
  assert.equal(pctChange(10, 0), null);
  assert.equal(inr(1234.4), '₹1,234');
  assert.equal(inr(-50), '−₹50');
});

test('session metrics compute per-hour and per-order values', () => {
  const m = mk('2026-06-05');
  assert.equal(m.net, 760 + 20 + 250 - 15);
  assert.equal(m.perOrder, round(1015 / 24, 2));
  assert.equal(m.perHour, round(1015 / 5, 2));
  assert.equal(m.segmentKey, 'FRI|18-23|Zone A');
});

test('baseline summarises a segment', () => {
  const b = buildBaseline(history, { segmentKey: 'FRI|18-23|Zone A' });
  assert.equal(b.sampleSize, 5);
  assert.equal(b.orders.min, 22);
  assert.equal(b.orders.max, 26);
  assert.equal(b.net.median, history[2].net);
  assert.equal(b.incentiveHitRate, 100);
});

test('decomposition attributes a missing incentive and sums to the total change', () => {
  const b = buildBaseline(history);
  const cur = mk('2026-06-05', { orders: 24, base: 760, incentive: 0 });
  const d = decompose(cur, b);
  const total = d.parts.reduce((a, p) => a + p.amount, 0);
  assert.ok(Math.abs(total - d.totalDelta) < 0.05, 'parts sum to total');
  assert.equal(d.primaryFactor, 'incentive');
});

test('comparable engine prefers same day, window, zone and similar volume', () => {
  const other = mk('2026-05-30', { dow: 6, orders: 24 });
  const lunch = mk('2026-05-31', { dow: 0, start: 12, end: 16, orders: 15 });
  const cur = mk('2026-06-05', { orders: 24, incentive: 0 });
  const c = findComparableSessions(cur, [...history, other, lunch], { limit: 3 });
  assert.equal(c.length, 3);
  assert.ok(c.every((x) => x.dayName === 'Friday'));
  assert.ok(c[0].reasons.some((r) => r.startsWith('same day')));
  const s = summarizeComparables(cur, c);
  assert.equal(s.avgIncentive, 250);
  assert.ok(s.netGap < 0);
});

test('anomaly engine: incentive drop with normal volume → investigation recommended', () => {
  const b = buildBaseline(history);
  const ev = evaluateSession(mk('2026-06-05', { orders: 24, base: 760, incentive: 0 }), b);
  assert.equal(ev.severity, 'INVESTIGATION_RECOMMENDED');
  assert.equal(ev.signals.find((s) => s.key === 'order_volume').status, 'normal');
  assert.equal(ev.signals.find((s) => s.key === 'incentive').status, 'dropped');
  assert.match(ev.explanation, /below the personal baseline/);
});

test('anomaly engine: drop explained by low volume is not escalated to investigation', () => {
  const b = buildBaseline(history);
  const ev = evaluateSession(mk('2026-06-05', { orders: 14, base: 440, incentive: 0 }), b);
  assert.equal(ev.severity, 'SIGNIFICANT_CHANGE');
  assert.equal(ev.explainedBy, 'order_volume');
});

test('anomaly engine: normal shift and insufficient history', () => {
  const b = buildBaseline(history);
  assert.equal(evaluateSession(mk('2026-06-05', { base: 740 }), b).severity, 'NORMAL');
  const ev = evaluateSession(mk('2026-06-05'), buildBaseline(history.slice(0, 2)));
  assert.equal(ev.sufficientHistory, false);
  assert.equal(ev.severity, 'NORMAL');
});

test('period comparison splits current vs previous windows', () => {
  const pc = periodComparison(history, '2026-05-29', 7);
  assert.equal(pc.current.sessions, 1);
  assert.equal(pc.previous.sessions, 1);
  assert.equal(pc.netChangePct, pctChange(history[4].net, history[3].net));
});
