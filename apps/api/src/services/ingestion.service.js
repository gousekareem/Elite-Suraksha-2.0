// Ingestion: platform statements → structured records → anomaly detection →
// meaningful memories. Idempotent (statement refs are unique per worker).

const prisma = require('../lib/prisma');
const dates = require('../lib/dates');
const logger = require('../lib/logger');
const { inr, pct } = require('../lib/num');
const { getAdapter } = require('../platform');
const { loadMetrics, loadExcludedSessionIds, baselineFor, EXCLUDE_SEVERITIES } = require('./earnings.service');
const { evaluateSession, SEVERITY_RANK } = require('./analytics/anomaly');
const { buildBaseline, segmentLabel } = require('./analytics/metrics');
const { getHindsightService } = require('./memory/hindsight.service');

const ingestStatements = async (worker, statements, { detect = true, retain = true } = {}) => {
  const adapter = getAdapter(worker.platformCode);
  const normalized = statements.map((s) => adapter.normalizeStatement(s));
  const created = [];
  for (const n of normalized) {
    const exists = await prisma.workSession.findUnique({
      where: { workerId_externalRef: { workerId: worker.id, externalRef: n.session.externalRef } },
      select: { id: true }
    });
    if (exists) continue;
    const session = await prisma.workSession.create({ data: { ...n.session, workerId: worker.id } });
    await prisma.tripRecord.createMany({ data: n.trips.map((t) => ({ ...t, workerId: worker.id, sessionId: session.id })) });
    await prisma.earningsRecord.create({ data: { ...n.earnings, workerId: worker.id, sessionId: session.id } });
    created.push(session);
  }
  let anomalies = [];
  if (detect && created.length) anomalies = await detectAnomalies(worker, created.map((s) => s.id), { retain });
  return { received: statements.length, created: created.length, skipped: statements.length - created.length, anomalies };
};

/** Evaluate sessions chronologically, persisting non-normal anomalies. */
const detectAnomalies = async (worker, sessionIds, { retain = true } = {}) => {
  const ids = new Set(sessionIds);
  const history = await loadMetrics(worker.id);
  const excluded = await loadExcludedSessionIds(worker.id);
  const results = [];
  for (const current of history.filter((m) => ids.has(m.sessionId))) {
    const baseline = baselineFor(current, history, excluded);
    const ev = evaluateSession(current, baseline);
    if (ev.severity === 'NORMAL') continue;
    const anomaly = await prisma.anomaly.upsert({
      where: { sessionId: current.sessionId },
      create: {
        workerId: worker.id,
        sessionId: current.sessionId,
        localDate: current.date,
        segmentKey: current.segmentKey,
        metric: ev.metric,
        baselineValue: ev.baselineValue,
        observedValue: ev.observedValue,
        deviationPct: ev.deviationPct,
        severity: ev.severity,
        signals: { signals: ev.signals, decomposition: ev.decomposition, explainedBy: ev.explainedBy || null, baselineSampleSize: baseline.sampleSize },
        explanation: ev.explanation
      },
      update: {}
    });
    await prisma.workerBaseline.upsert({
      where: { workerId_segmentKey_windowEnd: { workerId: worker.id, segmentKey: current.segmentKey, windowEnd: baseline.windowEnd || current.date } },
      create: {
        workerId: worker.id,
        segmentKey: current.segmentKey,
        windowStart: baseline.windowStart || current.date,
        windowEnd: baseline.windowEnd || current.date,
        sampleSize: baseline.sampleSize,
        metrics: baseline
      },
      update: {}
    });
    if (EXCLUDE_SEVERITIES.includes(ev.severity)) excluded.push(current.sessionId);
    results.push(anomaly);
    if (retain && SEVERITY_RANK[ev.severity] >= SEVERITY_RANK.SIGNIFICANT_CHANGE) {
      await retainAnomalyMemory(worker, anomaly, current, baseline, ev);
    }
  }
  return results;
};

const retainAnomalyMemory = async (worker, anomaly, current, baseline, ev) => {
  const state = ev.severity.replace(/_/g, ' ').toLowerCase();
  const lines = [
    `On ${dates.pretty(current.date)} (${segmentLabel(current.segmentKey)} shift) net earnings were ${inr(current.net)}, ${pct(ev.deviationPct)} ${ev.deviationPct < 0 ? 'below' : 'above'} the worker's personal baseline of ${inr(baseline.net.median)} (${baseline.sampleSize} comparable sessions).`,
    `Completed orders: ${current.orders} (normal range ${baseline.orders.min}–${baseline.orders.max}). Acceptance rate: ${current.acceptanceRate}%.`,
    current.incentiveProgram
      ? `${current.incentiveProgram}: ${inr(current.incentive)} (usually ${inr(baseline.incentive.median)})${current.incentiveNote ? `; platform note "${current.incentiveNote}"` : ''}.`
      : null,
    ev.explainedBy === 'order_volume' ? 'The decline was consistent with lower order volume.' : null,
    `Anomaly engine state: ${state}.`
  ].filter(Boolean);
  const res = await getHindsightService().retainMemory({
    workerId: worker.id,
    category: 'historical_anomaly',
    content: lines.join(' '),
    documentId: `anomaly:${anomaly.id}`,
    localDate: current.date,
    reason: `Anomaly engine flagged ${dates.pretty(current.date)} as ${state}; significant changes are remembered so similar future situations can be compared.`,
    metadata: { anomalyId: anomaly.id, severity: ev.severity, primaryFactor: ev.decomposition?.primaryFactor || 'none', explainedBy: ev.explainedBy || 'none', sessionId: current.sessionId }
  });
  if (res.status === 'OK' || res.status === 'DUPLICATE_SKIPPED') {
    await prisma.anomaly.update({ where: { id: anomaly.id }, data: { memoryRetained: true } });
  }
  return res;
};

const ingestPlatformEvents = async (worker, events, { retain = true } = {}) => {
  let created = 0;
  for (const e of events) {
    const exists = await prisma.platformEvent.findFirst({ where: { workerId: worker.id, externalRef: e.ref } });
    if (exists) continue;
    const row = await prisma.platformEvent.create({
      data: {
        workerId: worker.id,
        platformCode: worker.platformCode,
        zone: worker.zone,
        occurredAt: dates.istToUtc(e.date, e.hour || 9),
        localDate: e.date,
        type: e.type,
        title: e.title,
        description: e.description,
        source: e.source || 'Synthetic platform notice',
        externalRef: e.ref,
        isSynthetic: true
      }
    });
    created += 1;
    if (retain && ['INCENTIVE_TERMS_CHANGE', 'ZONE_CHANGE', 'PAY_RATE_CHANGE', 'DEDUCTION_POLICY_CHANGE'].includes(e.type)) {
      await getHindsightService().retainMemory({
        workerId: worker.id,
        category: 'platform_context',
        content: `On ${dates.pretty(e.date)} the platform recorded an event for this worker: "${e.title}". ${e.description}`,
        documentId: `platform-event:${row.id}`,
        localDate: e.date,
        reason: 'Platform notices about incentives, pay, deductions or zones can explain later earnings changes.',
        metadata: { platformEventId: row.id, type: e.type }
      });
    }
  }
  return { created };
};

/**
 * Learn durable patterns from structured history and retain them in Hindsight.
 * Re-running replaces the same documents (pattern:*), so memory is updated, not duplicated.
 */
const learnPatterns = async (worker, { asOf }) => {
  const from = dates.addDays(asOf, -56);
  const metrics = await loadMetrics(worker.id, { from, to: asOf });
  const excluded = new Set(await loadExcludedSessionIds(worker.id));
  const clean = metrics.filter((m) => !excluded.has(m.sessionId));
  if (clean.length < 4) return { retained: [], reason: 'not enough history' };

  const weeks = Math.max(1, Math.round(dates.diffDays(asOf, from) / 7));
  const segments = {};
  for (const m of metrics) (segments[m.segmentKey] = segments[m.segmentKey] || []).push(m);
  const regular = Object.entries(segments)
    .map(([key, list]) => ({ key, count: list.length }))
    .filter((s) => s.count >= 3)
    .sort((a, b) => b.count - a.count);

  const hs = getHindsightService();
  const jobs = [];
  const zones = {};
  for (const m of metrics) zones[m.zone] = (zones[m.zone] || 0) + 1;
  const mainZone = Object.entries(zones).sort((a, b) => b[1] - a[1])[0]?.[0];

  jobs.push(hs.retainMemory({
    workerId: worker.id,
    category: 'worker_pattern',
    content: `As of ${dates.pretty(asOf)}, ${worker.fullName} regularly works these shifts on ${worker.platformName}: ${regular.map((s) => `${segmentLabel(s.key)} (${s.count} times in the last ${weeks} weeks)`).join('; ')}. Main zone: ${mainZone}. Based on ${metrics.length} recorded sessions from ${dates.pretty(metrics[0].date)} to ${dates.pretty(metrics[metrics.length - 1].date)}.`,
    documentId: 'pattern:schedule',
    localDate: asOf,
    reason: 'Learned from structured session history: when and where the worker usually works.'
  }));

  for (const s of regular) {
    const list = segments[s.key].filter((m) => !excluded.has(m.sessionId));
    if (list.length < 3) continue;
    const b = buildBaseline(list, { segmentKey: s.key });
    const program = b.incentivePrograms[0];
    const hits = list.filter((m) => m.incentive > 0).length;
    jobs.push(hs.retainMemory({
      workerId: worker.id,
      category: 'earnings_pattern',
      content: `As of ${dates.pretty(asOf)}, normal net earnings for ${segmentLabel(s.key)} shifts are ${inr(b.net.min)}–${inr(b.net.max)} (median ${inr(b.net.median)}) across ${b.sampleSize} sessions without flagged anomalies, with ${b.orders.min}–${b.orders.max} completed orders and base pay of about ${inr(b.basePerOrder.median, { decimals: 2 })} per order.${program ? ` ${program} was received on ${hits} of ${list.length} of these sessions (typical amount ${inr(b.incentive.median)}).` : ' No incentive programme applies to this shift.'}`,
      documentId: `pattern:earnings:${s.key}`,
      localDate: asOf,
      reason: `Learned personal baseline for ${segmentLabel(s.key)} from ${b.sampleSize} sessions.`,
      metadata: { segmentKey: s.key, sampleSize: b.sampleSize }
    }));
  }

  const prefs = worker.preferences || {};
  if (prefs.explanationStyle) {
    jobs.push(hs.retainMemory({
      workerId: worker.id,
      category: 'worker_preference',
      content: `${worker.fullName} prefers investigation explanations to include a ${prefs.explanationStyle}.`,
      documentId: 'preference:explanations',
      localDate: asOf,
      reason: 'Worker preference recorded in the profile.'
    }));
  }

  const results = await Promise.all(jobs);
  logger.info('LEARN', `patterns learned worker=${worker.id} asOf=${asOf} memories=${results.length}`);
  return { retained: results, segments: regular.length, sessions: metrics.length };
};

module.exports = { ingestStatements, detectAnomalies, ingestPlatformEvents, learnPatterns, retainAnomalyMemory };
