// Deterministic earnings analytics (pure functions, no I/O).
// Every number the agent reports comes from here — never from the LLM.

const dates = require('../../lib/dates');
const { toNum, round, sum, mean, median, quantile, pctChange } = require('../../lib/num');

const segmentKeyOf = (s) => `${dates.DAY_CODES[s.dayOfWeek]}|${s.startHour}-${s.endHour}|${s.zone}`;

const segmentLabel = (key) => {
  const [day, window, zone] = String(key).split('|');
  const idx = dates.DAY_CODES.indexOf(day);
  const [a, b] = (window || '').split('-').map(Number);
  const dayName = idx >= 0 ? dates.DAY_NAMES[idx] : day;
  return `${dayName} ${dates.hourLabel(a)}–${dates.hourLabel(b)} · ${zone}`;
};

const timeWindowName = (startHour) => {
  if (startHour >= 17) return 'evening';
  if (startHour >= 11 && startHour < 16) return 'lunch';
  if (startHour < 11) return 'morning';
  return 'afternoon';
};

/** Flatten a WorkSession (+ earnings) row into the metrics every other module uses. */
const sessionMetrics = (session) => {
  const e = session.earnings || {};
  const orders = session.ordersCompleted;
  const activeHours = round(session.activeMinutes / 60, 2);
  const idleHours = round(session.idleMinutes / 60, 2);
  const shiftHours = round((session.activeMinutes + session.idleMinutes) / 60, 2);
  const net = toNum(e.netEarnings);
  const base = toNum(e.basePay);
  return {
    sessionId: session.id,
    ref: session.externalRef,
    date: session.localDate,
    dayOfWeek: session.dayOfWeek,
    dayName: dates.DAY_NAMES[session.dayOfWeek],
    startHour: session.startHour,
    endHour: session.endHour,
    window: `${dates.hourLabel(session.startHour)}–${dates.hourLabel(session.endHour)}`,
    timeWindow: timeWindowName(session.startHour),
    zone: session.zone,
    platformCode: session.platformCode,
    segmentKey: segmentKeyOf(session),
    orders,
    ordersOffered: session.ordersOffered,
    ordersAccepted: session.ordersAccepted,
    cancellations: session.ordersCancelled,
    acceptanceRate: toNum(session.acceptanceRate),
    rating: session.rating === null || session.rating === undefined ? null : toNum(session.rating),
    distanceKm: toNum(session.distanceKm),
    activeHours,
    idleHours,
    shiftHours,
    zoneBreakdown: session.zoneBreakdown || {},
    basePay: base,
    tips: toNum(e.tips),
    incentive: toNum(e.incentiveAmount),
    incentiveProgram: e.incentiveProgram || null,
    incentiveEligible: e.incentiveEligible === undefined ? null : e.incentiveEligible,
    incentiveNote: e.incentiveNote || null,
    deductions: toNum(e.deductionAmount),
    deductionBreakdown: e.deductionBreakdown || [],
    gross: toNum(e.grossEarnings),
    net,
    perOrder: orders ? round(net / orders, 2) : 0,
    basePerOrder: orders ? round(base / orders, 2) : 0,
    perHour: shiftHours ? round(net / shiftHours, 2) : 0,
    incentiveShare: net ? round((toNum(e.incentiveAmount) / net) * 100, 1) : 0
  };
};

const stat = (values) => ({
  median: round(median(values), 2),
  mean: round(mean(values), 2),
  min: round(values.length ? Math.min(...values) : 0, 2),
  max: round(values.length ? Math.max(...values) : 0, 2),
  p25: round(quantile(values, 0.25), 2),
  p75: round(quantile(values, 0.75), 2)
});

/** Personal baseline over a set of comparable historical sessions. */
const buildBaseline = (metrics, { segmentKey = null, label = null } = {}) => {
  const pick = (k) => metrics.map((m) => m[k]);
  const withProgram = metrics.filter((m) => m.incentiveProgram);
  return {
    segmentKey,
    label: label || (segmentKey ? segmentLabel(segmentKey) : 'All sessions'),
    sampleSize: metrics.length,
    windowStart: metrics.length ? metrics[0].date : null,
    windowEnd: metrics.length ? metrics[metrics.length - 1].date : null,
    sessionIds: metrics.map((m) => m.sessionId),
    net: stat(pick('net')),
    gross: stat(pick('gross')),
    basePay: stat(pick('basePay')),
    tips: stat(pick('tips')),
    incentive: stat(pick('incentive')),
    deductions: stat(pick('deductions')),
    orders: stat(pick('orders')),
    perOrder: stat(pick('perOrder')),
    basePerOrder: stat(pick('basePerOrder')),
    perHour: stat(pick('perHour')),
    activeHours: stat(pick('activeHours')),
    idleHours: stat(pick('idleHours')),
    acceptanceRate: stat(pick('acceptanceRate')),
    cancellations: stat(pick('cancellations')),
    incentiveHitRate: withProgram.length
      ? round((withProgram.filter((m) => m.incentive > 0).length / withProgram.length) * 100, 1)
      : null,
    incentivePrograms: [...new Set(withProgram.map((m) => m.incentiveProgram))]
  };
};

/**
 * Attribute the change in net earnings to components, relative to baseline means.
 * Base pay is further split into a volume effect and a per-order rate effect.
 * Contributions sum exactly to (current.net − baseline.net.mean).
 */
const decompose = (current, baseline) => {
  const volumeEffect = round((current.orders - baseline.orders.mean) * baseline.basePerOrder.mean, 2);
  const baseDelta = round(current.basePay - baseline.basePay.mean, 2);
  const rateEffect = round(baseDelta - volumeEffect, 2);
  const parts = [
    { key: 'order_volume', label: 'Order volume', amount: volumeEffect },
    { key: 'pay_per_order', label: 'Pay per order', amount: rateEffect },
    { key: 'incentive', label: 'Incentive', amount: round(current.incentive - baseline.incentive.mean, 2) },
    { key: 'tips', label: 'Tips', amount: round(current.tips - baseline.tips.mean, 2) },
    { key: 'deductions', label: 'Deductions', amount: round(-(current.deductions - baseline.deductions.mean), 2) }
  ];
  const totalDelta = round(current.net - baseline.net.mean, 2);
  const negatives = parts.filter((p) => p.amount < 0).sort((a, b) => a.amount - b.amount);
  const primary = negatives[0] || null;
  return {
    totalDelta,
    parts: parts.map((p) => ({
      ...p,
      shareOfChange: totalDelta ? round((p.amount / totalDelta) * 100, 1) : 0
    })),
    primaryFactor: primary && totalDelta < 0 && Math.abs(primary.amount) >= Math.abs(totalDelta) * 0.4 ? primary.key : null
  };
};

const periodTotals = (metrics) => ({
  sessions: metrics.length,
  net: round(sum(metrics.map((m) => m.net)), 2),
  gross: round(sum(metrics.map((m) => m.gross)), 2),
  basePay: round(sum(metrics.map((m) => m.basePay)), 2),
  incentive: round(sum(metrics.map((m) => m.incentive)), 2),
  tips: round(sum(metrics.map((m) => m.tips)), 2),
  deductions: round(sum(metrics.map((m) => m.deductions)), 2),
  orders: sum(metrics.map((m) => m.orders)),
  activeHours: round(sum(metrics.map((m) => m.activeHours)), 2),
  idleHours: round(sum(metrics.map((m) => m.idleHours)), 2),
  perHour: (() => {
    const h = sum(metrics.map((m) => m.shiftHours));
    return h ? round(sum(metrics.map((m) => m.net)) / h, 2) : 0;
  })(),
  perOrder: (() => {
    const o = sum(metrics.map((m) => m.orders));
    return o ? round(sum(metrics.map((m) => m.net)) / o, 2) : 0;
  })()
});

const inRange = (metrics, from, to) => metrics.filter((m) => m.date >= from && m.date <= to);

/** Rolling period comparison: last N days vs the N days before that. */
const periodComparison = (metrics, asOf, days) => {
  const curFrom = dates.addDays(asOf, -(days - 1));
  const prevTo = dates.addDays(curFrom, -1);
  const prevFrom = dates.addDays(prevTo, -(days - 1));
  const current = periodTotals(inRange(metrics, curFrom, asOf));
  const previous = periodTotals(inRange(metrics, prevFrom, prevTo));
  return {
    days,
    from: curFrom,
    to: asOf,
    previousFrom: prevFrom,
    previousTo: prevTo,
    current,
    previous,
    netChangePct: pctChange(current.net, previous.net),
    ordersChangePct: pctChange(current.orders, previous.orders),
    incentiveChange: round(current.incentive - previous.incentive, 2)
  };
};

module.exports = {
  segmentKeyOf,
  segmentLabel,
  sessionMetrics,
  buildBaseline,
  decompose,
  periodTotals,
  periodComparison,
  inRange
};
