// Comparable Session Engine (pure, deterministic).
// Ranks historical sessions by how similar their working conditions were to the
// session under investigation, so earnings can be compared like-for-like.

const { round, pctChange } = require('../../lib/num');

const WEIGHTS = { sameDay: 3, sameWindow: 3, sameZone: 2, ordersClose: 2, hoursClose: 1 };

const scoreCandidate = (current, c) => {
  const reasons = [];
  let score = 0;
  if (c.platformCode !== current.platformCode) return null;
  if (c.dayOfWeek === current.dayOfWeek) { score += WEIGHTS.sameDay; reasons.push(`same day (${c.dayName})`); }
  if (c.startHour === current.startHour && c.endHour === current.endHour) {
    score += WEIGHTS.sameWindow; reasons.push(`same window (${c.window})`);
  } else if (c.timeWindow === current.timeWindow) {
    score += WEIGHTS.sameWindow / 2; reasons.push(`similar ${c.timeWindow} window`);
  }
  if (c.zone === current.zone) { score += WEIGHTS.sameZone; reasons.push(`same zone (${c.zone})`); }
  const orderGap = Math.abs(c.orders - current.orders);
  if (orderGap <= 3) {
    score += WEIGHTS.ordersClose * (1 - orderGap / 4);
    reasons.push(`similar volume (${c.orders} vs ${current.orders} orders)`);
  }
  const hourGap = Math.abs(c.activeHours - current.activeHours);
  if (hourGap <= 0.75) { score += WEIGHTS.hoursClose * (1 - hourGap / 1); reasons.push('similar active hours'); }
  return { score: round(score, 2), reasons };
};

/**
 * @param current  session metrics under investigation
 * @param history  earlier session metrics (already filtered to the worker)
 * @param options  { limit, minScore, excludeSessionIds }
 */
const findComparableSessions = (current, history, { limit = 4, minScore = 7, excludeSessionIds = [] } = {}) => {
  const exclude = new Set(excludeSessionIds);
  const ranked = history
    .filter((h) => h.sessionId !== current.sessionId && h.date < current.date && !exclude.has(h.sessionId))
    .map((h) => ({ h, s: scoreCandidate(current, h) }))
    .filter((x) => x.s && x.s.score >= minScore)
    .sort((a, b) => b.s.score - a.s.score || (a.h.date < b.h.date ? 1 : -1))
    .slice(0, limit);

  return ranked.map(({ h, s }) => ({
    sessionId: h.sessionId,
    date: h.date,
    dayName: h.dayName,
    window: h.window,
    zone: h.zone,
    orders: h.orders,
    activeHours: h.activeHours,
    acceptanceRate: h.acceptanceRate,
    net: h.net,
    basePay: h.basePay,
    incentive: h.incentive,
    incentiveProgram: h.incentiveProgram,
    incentiveEligible: h.incentiveEligible,
    deductions: h.deductions,
    perOrder: h.perOrder,
    similarity: s.score,
    reasons: s.reasons,
    netDiffVsCurrent: round(current.net - h.net, 2),
    netDiffPct: pctChange(current.net, h.net)
  }));
};

const summarizeComparables = (current, comparables) => {
  if (!comparables.length) return null;
  const avg = (k) => round(comparables.reduce((a, c) => a + c[k], 0) / comparables.length, 2);
  const avgNet = avg('net');
  return {
    count: comparables.length,
    avgNet,
    avgOrders: avg('orders'),
    avgIncentive: avg('incentive'),
    avgDeductions: avg('deductions'),
    avgBasePay: avg('basePay'),
    currentNet: current.net,
    netGap: round(current.net - avgNet, 2),
    netGapPct: pctChange(current.net, avgNet),
    incentiveGap: round(current.incentive - avg('incentive'), 2),
    ordersGap: round(current.orders - avg('orders'), 2)
  };
};

module.exports = { findComparableSessions, summarizeComparables, scoreCandidate, WEIGHTS };
