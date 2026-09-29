// Memory views for the UI: Memory Journey (how understanding developed over time),
// Memory Inspector (what Hindsight holds + why each item was retained/recalled).

const prisma = require('../../lib/prisma');
const dates = require('../../lib/dates');
const { inr } = require('../../lib/num');
const { getHindsightService } = require('./hindsight.service');
const { CATEGORIES } = require('./categories');

const journey = async (worker) => {
  const [firstSession, sessionsCount, retains, anomalies, invs, interactions] = await Promise.all([
    prisma.workSession.findFirst({ where: { workerId: worker.id }, orderBy: { localDate: 'asc' } }),
    prisma.workSession.count({ where: { workerId: worker.id } }),
    prisma.memoryEvent.findMany({ where: { workerId: worker.id, operation: 'RETAIN', status: { in: ['OK', 'DUPLICATE_SKIPPED'] } }, orderBy: { createdAt: 'asc' } }),
    prisma.anomaly.findMany({ where: { workerId: worker.id, severity: { in: ['SIGNIFICANT_CHANGE', 'INVESTIGATION_RECOMMENDED'] } }, orderBy: { localDate: 'asc' } }),
    prisma.investigation.findMany({ where: { workerId: worker.id }, include: { outcome: true }, orderBy: { createdAt: 'asc' } }),
    prisma.agentInteraction.findMany({ where: { workerId: worker.id, mode: 'full' }, orderBy: { createdAt: 'asc' } })
  ]);
  if (!firstSession) return { startDate: null, milestones: [], sessionsCount: 0 };
  const start = firstSession.localDate;
  const day = (d) => dates.diffDays(d, start) + 1;
  const m = [];
  const push = (date, kind, title, detail, extra = {}) => m.push({ date, day: day(date), kind, title, detail, ...extra });

  push(start, 'profile', 'Worker profile established', `${worker.fullName} · ${worker.platformName} · ${worker.city} ${worker.zone}. First recorded session.`);

  const patternDates = {};
  for (const r of retains.filter((x) => ['worker_pattern', 'earnings_pattern', 'worker_preference'].includes(x.category))) {
    const d = r.localDate || start;
    (patternDates[d] = patternDates[d] || []).push(r);
  }
  Object.entries(patternDates).forEach(([d, list], i) => {
    push(d, 'learned', i === 0 ? 'Normal earnings pattern learned' : 'Patterns updated with newer history',
      `${list.length} memories retained in Hindsight (${[...new Set(list.map((x) => x.category.replace(/_/g, ' ')))].join(', ')}).`,
      { memoryEventIds: list.map((x) => x.id), retained: true });
  });

  for (const r of retains.filter((x) => x.category === 'platform_context')) {
    push(r.localDate || start, 'platform', 'Platform notice remembered', r.contentPreview, { retained: true });
  }

  anomalies.forEach((a, i) => {
    push(a.localDate, 'anomaly', i === 0 ? 'First significant anomaly detected' : 'Significant earnings change detected',
      `${inr(Number(a.observedValue))} vs baseline ${inr(Number(a.baselineValue))} (${Number(a.deviationPct)}%). ${a.severity.replace(/_/g, ' ').toLowerCase()}.`,
      { retained: a.memoryRetained, anomalyId: a.id, severity: a.severity });
  });

  for (const inv of invs) {
    const findingRetain = retains.find((r) => r.documentId === `finding:${inv.id}`);
    const opened = findingRetain?.localDate || inv.periodStart;
    const usedOutcome = Boolean(inv.analysis?.usedPreviousOutcome);
    if (usedOutcome) {
      push(opened, 'recall', 'Previous experience recalled', `Hindsight recalled a previous investigation outcome while building ${inv.caseNumber}.`, { investigationId: inv.id });
    }
    push(opened, 'investigation', usedOutcome ? `${inv.caseNumber} uses historical outcome` : `${inv.caseNumber} investigation opened`, inv.title, { investigationId: inv.id, retained: Boolean(findingRetain) });
    if (inv.outcome) {
      const resolved = inv.outcome.resolvedAt.toISOString().slice(0, 10);
      push(resolved, 'outcome', `${inv.caseNumber} outcome ${inv.outcome.memoryRetainedAt ? 'retained' : 'recorded'}`, inv.outcome.learning || inv.outcome.result, { investigationId: inv.id, retained: Boolean(inv.outcome.memoryRetainedAt) });
    }
  }

  const seenDates = new Set();
  for (const it of interactions) {
    const r = it.response || {};
    if (!r.usedPreviousOutcome || !r.asOf || seenDates.has(r.asOf)) continue;
    seenDates.add(r.asOf);
    if (!m.some((x) => x.kind === 'recall' && x.date === r.asOf)) {
      push(r.asOf, 'recall', 'Previous experience recalled', `Asked: "${it.question}" — the agent recalled a previous investigation outcome from Hindsight.`, { interactionId: it.id });
    }
  }

  const order = { profile: 0, learned: 1, platform: 2, anomaly: 3, recall: 4, investigation: 5, outcome: 6 };
  m.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : order[a.kind] - order[b.kind]));
  return { startDate: start, asOf: worker.asOfDate, sessionsCount, milestones: m };
};

const inspector = async (worker, { q } = {}) => {
  const hs = getHindsightService();
  const [listing, events, status] = await Promise.all([
    hs.listWorkerMemories(worker.id, { limit: 200, q }),
    prisma.memoryEvent.findMany({ where: { workerId: worker.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    hs.status()
  ]);
  const retainByDoc = new Map();
  for (const e of events.filter((x) => x.operation === 'RETAIN' && x.documentId)) if (!retainByDoc.has(e.documentId)) retainByDoc.set(e.documentId, e);
  const recalls = events.filter((e) => e.operation === 'RECALL');
  const recallCountByFact = {};
  for (const r of recalls) for (const item of r.results || []) recallCountByFact[item.id] = (recallCountByFact[item.id] || 0) + 1;

  const items = listing.items.map((m) => {
    const retain = m.documentId ? retainByDoc.get(m.documentId) : null;
    const recalledTimes = (recallCountByFact[m.id] || 0) + (m.documentId ? (recallCountByFact[m.documentId] || 0) : 0);
    return {
      ...m,
      retainedBecause: retain?.reason || (m.type === 'observation' ? 'Consolidated by Hindsight from related facts (observation)' : null),
      retainedAt: retain?.createdAt || null,
      investigationId: retain?.investigationId || null,
      recalledTimes
    };
  });
  return {
    bankId: hs.bankIdFor(worker.id),
    status: listing.status,
    notice: listing.notice || null,
    hindsight: status,
    total: listing.total,
    items,
    categories: CATEGORIES,
    events: events.slice(0, 100).map((e) => ({
      id: e.id,
      operation: e.operation,
      status: e.status,
      category: e.category,
      documentId: e.documentId,
      query: e.query,
      reason: e.reason,
      resultCount: e.resultCount,
      results: e.results,
      preview: e.contentPreview,
      localDate: e.localDate,
      latencyMs: e.latencyMs,
      investigationId: e.investigationId,
      createdAt: e.createdAt
    }))
  };
};

const stats = async (worker) => {
  const [retained, recalled, invs, patterns] = await Promise.all([
    prisma.memoryEvent.count({ where: { workerId: worker.id, operation: 'RETAIN', status: 'OK' } }),
    prisma.memoryEvent.count({ where: { workerId: worker.id, operation: 'RECALL', status: 'OK' } }),
    prisma.investigation.count({ where: { workerId: worker.id } }),
    prisma.memoryEvent.findMany({ where: { workerId: worker.id, operation: 'RETAIN', status: 'OK', category: { in: ['worker_pattern', 'earnings_pattern'] } }, distinct: ['documentId'], select: { documentId: true } })
  ]);
  return { retained, recalled, investigations: invs, learnedPatterns: patterns.length };
};

module.exports = { journey, inspector, stats };
