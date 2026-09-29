// Earnings intelligence: loads structured records from PostgreSQL and runs the
// deterministic analytics (baseline, comparable sessions, anomaly evaluation).

const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const dates = require('../lib/dates');
const { round, pctChange } = require('../lib/num');
const { sessionMetrics, buildBaseline, periodComparison, periodTotals, segmentLabel } = require('./analytics/metrics');
const { findComparableSessions, summarizeComparables } = require('./analytics/comparable');
const { evaluateSession } = require('./analytics/anomaly');

const BASELINE_LOOKBACK_DAYS = 56;
const COMPARABLE_LOOKBACK_DAYS = 100;
const EXCLUDE_SEVERITIES = ['SIGNIFICANT_CHANGE', 'INVESTIGATION_RECOMMENDED'];

const resolveAsOf = (worker) => worker.asOfDate || dates.todayIST();

const loadMetrics = async (workerId, { from = null, to = null } = {}) => {
  const where = { workerId };
  if (from || to) where.localDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const sessions = await prisma.workSession.findMany({
    where,
    include: { earnings: true },
    orderBy: [{ localDate: 'asc' }, { startHour: 'asc' }]
  });
  return sessions.filter((s) => s.earnings).map(sessionMetrics);
};

const loadExcludedSessionIds = async (workerId, beforeDate = null) => {
  const rows = await prisma.anomaly.findMany({
    where: { workerId, severity: { in: EXCLUDE_SEVERITIES }, ...(beforeDate ? { localDate: { lt: beforeDate } } : {}) },
    select: { sessionId: true }
  });
  return rows.map((r) => r.sessionId);
};

/**
 * Personal baseline for a session: same weekday + window + zone over the previous
 * 8 weeks, excluding sessions already flagged as significant anomalies.
 * Falls back to same weekday + time-of-day window across zones if too few samples.
 */
const baselineFor = (current, history, excludedIds = []) => {
  const excluded = new Set(excludedIds);
  const from = dates.addDays(current.date, -BASELINE_LOOKBACK_DAYS);
  const prior = history.filter((h) => h.date < current.date && h.date >= from && !excluded.has(h.sessionId));
  let sample = prior.filter((h) => h.segmentKey === current.segmentKey);
  let label = segmentLabel(current.segmentKey);
  if (sample.length < 3) {
    sample = prior.filter((h) => h.dayOfWeek === current.dayOfWeek && h.timeWindow === current.timeWindow);
    label = `${current.dayName} ${current.timeWindow} shifts (all zones)`;
  }
  return buildBaseline(sample, { segmentKey: current.segmentKey, label });
};

const findSession = async (workerId, { sessionId = null, date = null }) => {
  const where = { workerId, ...(sessionId ? { id: sessionId } : {}), ...(date ? { localDate: date } : {}) };
  const s = await prisma.workSession.findFirst({ where, include: { earnings: true }, orderBy: { startHour: 'desc' } });
  if (!s || !s.earnings) throw new AppError('Work session not found for this worker', 404);
  return sessionMetrics(s);
};

/** Full deterministic analysis of one session. */
const analyzeSession = async (workerId, { sessionId = null, date = null } = {}) => {
  const current = await findSession(workerId, { sessionId, date });
  const history = await loadMetrics(workerId, { from: dates.addDays(current.date, -COMPARABLE_LOOKBACK_DAYS), to: current.date });
  const excluded = await loadExcludedSessionIds(workerId, current.date);
  const baseline = baselineFor(current, history, excluded);
  const comparables = findComparableSessions(current, history, { limit: 4, excludeSessionIds: excluded });
  const evaluation = evaluateSession(current, baseline);
  const anomaly = await prisma.anomaly.findUnique({ where: { sessionId: current.sessionId } });
  const platformEvents = await getPlatformEvents(workerId, { from: dates.addDays(current.date, -10), to: current.date });
  return {
    current,
    baseline,
    comparables,
    comparableSummary: summarizeComparables(current, comparables),
    evaluation,
    anomaly,
    platformEvents,
    excludedSessionIds: excluded
  };
};

const getPlatformEvents = async (workerId, { from, to }) => {
  const worker = await prisma.workerProfile.findUnique({ where: { id: workerId }, select: { platformCode: true } });
  if (!worker) return [];
  return prisma.platformEvent.findMany({
    where: {
      localDate: { gte: from, lte: to },
      OR: [{ workerId }, { workerId: null, platformCode: worker.platformCode }]
    },
    orderBy: { occurredAt: 'asc' }
  });
};

/** Most recent session on or before asOf (the "current" session for the worker). */
const latestSession = async (workerId, asOf) => prisma.workSession.findFirst({
  where: { workerId, localDate: { lte: asOf } },
  orderBy: [{ localDate: 'desc' }, { startHour: 'desc' }],
  select: { id: true, localDate: true }
});

const dashboard = async (worker) => {
  const asOf = resolveAsOf(worker);
  const metrics = await loadMetrics(worker.id, { to: asOf });
  const latest = metrics[metrics.length - 1] || null;
  let latestAnalysis = null;
  if (latest) latestAnalysis = await analyzeSession(worker.id, { sessionId: latest.sessionId });
  const todayMetrics = metrics.filter((m) => m.date === asOf);
  const excluded = new Set(await loadExcludedSessionIds(worker.id));
  const clean = metrics.filter((m) => !excluded.has(m.sessionId));
  const last30 = metrics.filter((m) => m.date > dates.addDays(asOf, -30));
  return {
    asOf,
    hasData: metrics.length > 0,
    historyFrom: metrics[0]?.date || null,
    sessionCount: metrics.length,
    today: todayMetrics.length ? periodTotals(todayMetrics) : null,
    latestSession: latest,
    week: periodComparison(metrics, asOf, 7),
    month: periodComparison(metrics, asOf, 30),
    overallPerHour: periodTotals(clean).perHour,
    latestAnalysis: latestAnalysis && {
      baseline: latestAnalysis.baseline,
      evaluation: stripDecomposition(latestAnalysis.evaluation),
      comparableSummary: latestAnalysis.comparableSummary
    },
    breakdown30: {
      basePay: round(last30.reduce((a, m) => a + m.basePay, 0), 2),
      incentive: round(last30.reduce((a, m) => a + m.incentive, 0), 2),
      tips: round(last30.reduce((a, m) => a + m.tips, 0), 2),
      deductions: round(last30.reduce((a, m) => a + m.deductions, 0), 2)
    }
  };
};

const stripDecomposition = (e) => ({ ...e, decomposition: e.decomposition ? { ...e.decomposition } : null });

/** Series for charts: each session with its own segment baseline median. */
const earningsSeries = async (worker, { days = 120 } = {}) => {
  const asOf = resolveAsOf(worker);
  const from = dates.addDays(asOf, -(days - 1));
  const all = await loadMetrics(worker.id, { from: dates.addDays(from, -BASELINE_LOOKBACK_DAYS), to: asOf });
  const anomalies = await prisma.anomaly.findMany({ where: { workerId: worker.id } });
  const bySession = new Map(anomalies.map((a) => [a.sessionId, a]));
  const excluded = anomalies.filter((a) => EXCLUDE_SEVERITIES.includes(a.severity)).map((a) => a.sessionId);
  return {
    asOf,
    from,
    points: all.filter((m) => m.date >= from).map((m) => {
      const b = baselineFor(m, all, excluded.filter((id) => id !== m.sessionId));
      const a = bySession.get(m.sessionId);
      return {
        sessionId: m.sessionId,
        date: m.date,
        dayName: m.dayName,
        window: m.window,
        segmentKey: m.segmentKey,
        net: m.net,
        basePay: m.basePay,
        incentive: m.incentive,
        tips: m.tips,
        deductions: m.deductions,
        orders: m.orders,
        perHour: m.perHour,
        perOrder: m.perOrder,
        acceptanceRate: m.acceptanceRate,
        incentiveProgram: m.incentiveProgram,
        incentiveNote: m.incentiveNote,
        baselineMedian: b.sampleSize >= 3 ? b.net.median : null,
        deviationPct: b.sampleSize >= 3 ? pctChange(m.net, b.net.median) : null,
        anomaly: a ? { id: a.id, severity: a.severity, deviationPct: Number(a.deviationPct) } : null
      };
    })
  };
};

/** Typical earnings for a segment (used by "What do I normally earn on Friday evenings?"). */
const segmentProfile = async (worker, { dayOfWeek = null, timeWindow = null } = {}) => {
  const asOf = resolveAsOf(worker);
  const metrics = await loadMetrics(worker.id, { from: dates.addDays(asOf, -BASELINE_LOOKBACK_DAYS), to: asOf });
  const excluded = new Set(await loadExcludedSessionIds(worker.id));
  const sample = metrics.filter((m) => !excluded.has(m.sessionId)
    && (dayOfWeek === null || m.dayOfWeek === dayOfWeek)
    && (timeWindow === null || m.timeWindow === timeWindow));
  const segments = {};
  for (const m of sample) (segments[m.segmentKey] = segments[m.segmentKey] || []).push(m);
  return Object.entries(segments)
    .map(([key, list]) => ({ ...buildBaseline(list, { segmentKey: key }), recent: list.slice(-4).map((m) => ({ sessionId: m.sessionId, date: m.date, net: m.net, orders: m.orders, incentive: m.incentive })) }))
    .sort((a, b) => b.sampleSize - a.sampleSize);
};

module.exports = {
  resolveAsOf,
  findSession,
  loadMetrics,
  loadExcludedSessionIds,
  baselineFor,
  analyzeSession,
  getPlatformEvents,
  latestSession,
  dashboard,
  earningsSeries,
  segmentProfile,
  EXCLUDE_SEVERITIES
};
