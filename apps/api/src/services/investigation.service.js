// Investigation lifecycle: create (with evidence + findings + memory context),
// read, update status, resolve with outcome (→ Hindsight retain), audit trail.

const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const dates = require('../lib/dates');
const { toNum } = require('../lib/num');
const { analyzeSession, resolveAsOf } = require('./earnings.service');
const { reasonAboutSession, buildEvidence } = require('./agent/reasoning');
const { getHindsightService } = require('./memory/hindsight.service');
const { audit } = require('./audit.service');

const STATUS_FLOW = {
  OPEN: ['IN_PROGRESS', 'AWAITING_CLARIFICATION', 'CLOSED'],
  IN_PROGRESS: ['AWAITING_CLARIFICATION', 'CLOSED'],
  AWAITING_CLARIFICATION: ['IN_PROGRESS', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: []
};

const situationText = (analysis) => {
  const { current, evaluation } = analysis;
  const bits = [
    `Earnings ${evaluation.deviationPct < 0 ? 'decline' : 'change'} of ${Math.abs(evaluation.deviationPct)}% on a ${current.dayName} ${current.timeWindow} shift`,
    evaluation.signals.find((s) => s.key === 'order_volume')?.status === 'normal' ? 'with normal order volume' : 'with changed order volume'
  ];
  if (evaluation.signals.find((s) => s.key === 'incentive')?.status === 'dropped') bits.push(`${current.incentiveProgram || 'incentive'} not paid, incentive eligibility`);
  return `${bits.join(', ')}. Previous similar earnings drop, investigation finding and outcome.`;
};

/** Resolved/previous investigations for the worker, from PostgreSQL (structured truth). */
const previousCasesFor = async (workerId, { before = null, excludeId = null } = {}) => {
  const rows = await prisma.investigation.findMany({
    where: { workerId, ...(excludeId ? { id: { not: excludeId } } : {}), ...(before ? { periodStart: { lt: before } } : {}) },
    include: { outcome: true, anomaly: { include: { session: true } } },
    orderBy: { createdAt: 'desc' }
  });
  return rows.map((r) => ({
    id: r.id,
    caseNumber: r.caseNumber,
    status: r.status,
    title: r.title,
    periodStart: r.periodStart,
    summary: r.summary,
    result: r.outcome?.result || null,
    rootCause: r.outcome?.rootCauseCategory || null,
    learning: r.outcome?.learning || null,
    actionTaken: r.outcome?.actionTaken || null,
    resolvedLocalDate: r.outcome ? r.outcome.resolvedAt.toISOString().slice(0, 10) : null,
    memoryRetainedAt: r.outcome?.memoryRetainedAt || null,
    sessionAcceptanceRate: r.anomaly?.session ? toNum(r.anomaly.session.acceptanceRate) : null
  }));
};

const nextCaseNumber = async () => {
  const year = new Date().getUTCFullYear();
  const last = await prisma.investigation.findFirst({ where: { caseNumber: { startsWith: `ES-${year}-` } }, orderBy: { caseNumber: 'desc' }, select: { caseNumber: true } });
  const n = last ? Number(last.caseNumber.split('-')[2]) + 1 : 1;
  return `ES-${year}-${String(n).padStart(4, '0')}`;
};

const ownInvestigation = async (workerId, id, include = {}) => {
  const inv = await prisma.investigation.findFirst({ where: { id, workerId }, include });
  if (!inv) throw new AppError('Investigation not found', 404);
  return inv;
};

/**
 * Create an investigation for one session (usually an anomaly).
 * Pulls structured evidence, recalls Hindsight memory, records findings, retains the finding.
 */
const createInvestigation = async (worker, { sessionId = null, anomalyId = null, date = null, question = null, actorUserId = null }) => {
  let anomaly = null;
  if (anomalyId) {
    anomaly = await prisma.anomaly.findFirst({ where: { id: anomalyId, workerId: worker.id } });
    if (!anomaly) throw new AppError('Anomaly not found', 404);
    sessionId = anomaly.sessionId;
  }
  const analysis = await analyzeSession(worker.id, { sessionId, date });
  anomaly = anomaly || analysis.anomaly;

  if (anomaly) {
    const existing = await prisma.investigation.findFirst({ where: { workerId: worker.id, anomalyId: anomaly.id } });
    if (existing) return { investigation: await getInvestigation(worker, existing.id), created: false };
  }

  const q = question || `Why were my earnings lower on ${dates.pretty(analysis.current.date)}?`;
  const previousCases = await previousCasesFor(worker.id, { before: analysis.current.date });
  const hs = getHindsightService();
  const memory = await hs.getWorkerMemoryContext({
    workerId: worker.id,
    question: q,
    situation: situationText(analysis),
    asOf: resolveAsOf(worker),
    focus: { segmentKey: analysis.current.segmentKey }
  });
  const reasoning = reasonAboutSession({ analysis, memory, previousCases, worker });
  const catalogue = buildEvidence({ analysis, memory, previousCases: previousCases.filter((c) => c.status === 'RESOLVED') });

  const caseNumber = await nextCaseNumber();
  const title = `${analysis.current.dayName} ${analysis.current.window} earnings ${reasoning.deviationPct < 0 ? 'decline' : 'change'} (${dates.short(analysis.current.date)})`;

  const investigation = await prisma.investigation.create({
    data: {
      caseNumber,
      workerId: worker.id,
      anomalyId: anomaly?.id || null,
      status: 'IN_PROGRESS',
      title,
      question: q,
      periodStart: analysis.current.date,
      periodEnd: analysis.current.date,
      summary: reasoning.summary,
      analysis: {
        current: analysis.current,
        baseline: analysis.baseline,
        comparables: analysis.comparables,
        comparableSummary: analysis.comparableSummary,
        evaluation: analysis.evaluation,
        recommendedQuestions: reasoning.recommendedQuestions,
        recommendedActions: reasoning.recommendedActions,
        timeline: reasoning.timeline,
        usedPreviousOutcome: reasoning.usedPreviousOutcome
      },
      memoryContext: { status: memory.status, notice: memory.notice || null, recalls: memory.recalls || [], memories: reasoning.historicalContext },
      createdByUserId: actorUserId
    }
  });

  // Evidence items (idempotent per investigation/type/ref).
  const idByKey = {};
  for (const item of catalogue) {
    const row = await prisma.evidenceItem.create({
      data: {
        investigationId: investigation.id,
        type: item.type,
        source: item.source,
        localDate: item.localDate || null,
        occurredAt: item.localDate ? dates.istToUtc(item.localDate, 12) : null,
        title: item.label,
        content: { detail: item.detail, key: item.id },
        relevance: relevanceFor(item.type),
        refId: item.refId
      }
    });
    idByKey[item.id] = row.id;
  }
  const mapKeys = (keys = []) => keys.map((k) => idByKey[k]).filter(Boolean);

  const findings = [
    ...reasoning.facts.map((f) => ({ kind: 'FACT', statement: f.text, evidenceIds: mapKeys(f.evidence), confidence: 'HIGH' })),
    ...reasoning.inferences.map((f) => ({ kind: 'INFERENCE', statement: f.text, evidenceIds: mapKeys(f.evidence), confidence: f.confidence })),
    ...reasoning.unknowns.map((f) => ({ kind: 'UNKNOWN', statement: f.text, evidenceIds: [], confidence: null }))
  ];
  await prisma.investigationFinding.createMany({
    data: findings.map((f, i) => ({ ...f, investigationId: investigation.id, position: i }))
  });

  await audit({
    actorUserId,
    workerId: worker.id,
    action: 'INVESTIGATION_CREATED',
    entityType: 'Investigation',
    entityId: investigation.id,
    details: {
      caseNumber,
      why: q,
      evidenceCount: catalogue.length,
      memoryStatus: memory.status,
      memoryRecalled: reasoning.historicalContext.map((h) => ({ id: h.memoryId, category: h.category })),
      usedPreviousOutcome: reasoning.usedPreviousOutcome
    }
  });

  // Retain what this investigation established (facts/inferences/unknowns), as memory.
  await hs.retainMemory({
    workerId: worker.id,
    category: 'investigation_finding',
    content: [
      `Investigation ${caseNumber} was opened on ${dates.pretty(resolveAsOf(worker))} for the ${title}.`,
      `Summary: ${reasoning.summary}`,
      reasoning.inferences.length ? `Inferences: ${reasoning.inferences.map((i) => i.text).join(' ')}` : null,
      reasoning.unknowns.length ? `Open questions: ${reasoning.unknowns.map((u) => u.text).join(' ')}` : null
    ].filter(Boolean).join('\n'),
    documentId: `finding:${investigation.id}`,
    localDate: resolveAsOf(worker),
    reason: `Investigation ${caseNumber} recorded findings; they are retained so later questions can refer back to them.`,
    metadata: { investigationId: investigation.id, caseNumber, primaryFactor: reasoning.primaryFactor || 'none' },
    investigationId: investigation.id
  });

  return { investigation: await getInvestigation(worker, investigation.id), created: true };
};

const relevanceFor = (type) => ({
  EARNINGS_RECORD: 'The session under investigation',
  BASELINE: 'What normally happens for this shift',
  COMPARABLE_SESSIONS: 'A like-for-like earlier shift',
  PLATFORM_EVENT: 'Platform notice close to the session',
  HINDSIGHT_MEMORY: 'Recalled from the worker\'s persistent memory',
  PREVIOUS_INVESTIGATION: 'Earlier case for this worker',
  WORKER_STATEMENT: 'Worker-provided statement',
  ATTACHMENT: 'Worker-provided file'
}[type] || 'Supporting evidence');

const getInvestigation = async (worker, id) => {
  const inv = await ownInvestigation(worker.id, id, {
    evidence: { orderBy: [{ localDate: 'asc' }, { createdAt: 'asc' }] },
    findings: { orderBy: { position: 'asc' } },
    reports: { orderBy: { version: 'desc' } },
    outcome: true,
    anomaly: true
  });
  const previousCases = (await previousCasesFor(worker.id, { excludeId: inv.id, before: inv.periodStart })).filter((c) => c.status === 'RESOLVED');
  const auditTrail = await prisma.auditLog.findMany({ where: { entityType: 'Investigation', entityId: inv.id }, orderBy: { createdAt: 'asc' } });
  const memoryEvents = await prisma.memoryEvent.findMany({ where: { workerId: worker.id, investigationId: inv.id }, orderBy: { createdAt: 'asc' } });
  return { ...inv, previousCases, auditTrail, memoryEvents, allowedTransitions: STATUS_FLOW[inv.status] || [] };
};

const listInvestigations = async (worker) => prisma.investigation.findMany({
  where: { workerId: worker.id },
  include: { outcome: true, anomaly: true, _count: { select: { evidence: true, findings: true, reports: true } } },
  orderBy: { createdAt: 'desc' }
});

const updateStatus = async (worker, id, status, actorUserId) => {
  const inv = await ownInvestigation(worker.id, id);
  if (!(STATUS_FLOW[inv.status] || []).includes(status)) {
    throw new AppError(`Cannot move investigation from ${inv.status} to ${status}`, 400);
  }
  const updated = await prisma.investigation.update({ where: { id }, data: { status } });
  await audit({ actorUserId, workerId: worker.id, action: 'INVESTIGATION_STATUS_CHANGED', entityType: 'Investigation', entityId: id, details: { from: inv.status, to: status } });
  return updated;
};

const addStatement = async (worker, id, { text, fileUrl = null, title = null }, actorUserId) => {
  await ownInvestigation(worker.id, id);
  const row = await prisma.evidenceItem.create({
    data: {
      investigationId: id,
      type: fileUrl ? 'ATTACHMENT' : 'WORKER_STATEMENT',
      source: 'Worker',
      localDate: resolveAsOf(worker),
      occurredAt: new Date(),
      title: title || (fileUrl ? 'Worker attachment' : 'Worker statement'),
      content: { detail: text || '' },
      relevance: fileUrl ? 'Worker-provided file' : 'Worker-provided statement',
      refId: `worker-${Date.now()}`,
      fileUrl
    }
  });
  await audit({ actorUserId, workerId: worker.id, action: 'EVIDENCE_ADDED', entityType: 'Investigation', entityId: id, details: { evidenceId: row.id, type: row.type } });
  return row;
};

/**
 * Resolve an investigation with an outcome, then retain the outcome (and any
 * worker feedback) in Hindsight so future investigations can use it.
 */
const resolveInvestigation = async (worker, id, payload, actorUserId) => {
  const inv = await ownInvestigation(worker.id, id, { outcome: true, anomaly: true });
  if (inv.outcome) throw new AppError('Investigation already has an outcome', 409);
  const resolvedLocalDate = payload.resolvedDate || resolveAsOf(worker);
  if (!dates.isDateString(resolvedLocalDate)) throw new AppError('resolvedDate must be YYYY-MM-DD', 400);

  const outcome = await prisma.investigationOutcome.create({
    data: {
      investigationId: id,
      result: payload.result,
      rootCauseCategory: payload.rootCauseCategory,
      actionTaken: payload.actionTaken,
      resolutionSource: payload.resolutionSource || 'Worker-reported',
      workerFeedback: payload.workerFeedback || null,
      learning: payload.learning || null,
      resolvedAt: dates.istToUtc(resolvedLocalDate, 12)
    }
  });
  await prisma.investigation.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  await audit({ actorUserId, workerId: worker.id, action: 'INVESTIGATION_RESOLVED', entityType: 'Investigation', entityId: id, details: { rootCause: payload.rootCauseCategory, resolvedLocalDate } });

  const memory = await retainOutcome(worker, id, { resolvedLocalDate });
  return { outcome: { ...outcome, memoryStatus: memory.status }, memory };
};

const retainOutcome = async (worker, id, { resolvedLocalDate = null } = {}) => {
  const inv = await ownInvestigation(worker.id, id, { outcome: true, anomaly: true });
  if (!inv.outcome) throw new AppError('Investigation has no outcome yet', 400);
  const hs = getHindsightService();
  const local = resolvedLocalDate || inv.outcome.resolvedAt.toISOString().slice(0, 10);
  const memory = await hs.retainInvestigationOutcome({
    workerId: worker.id,
    investigation: inv,
    anomaly: inv.anomaly,
    outcome: { ...inv.outcome, resolvedLocalDate: local }
  });
  if (inv.outcome.workerFeedback) {
    await hs.retainMemory({
      workerId: worker.id,
      category: 'user_feedback',
      content: `Worker feedback on investigation ${inv.caseNumber}: "${inv.outcome.workerFeedback}"`,
      documentId: `feedback:${inv.id}`,
      localDate: local,
      reason: 'Worker feedback helps the agent adapt how it explains future investigations.',
      metadata: { investigationId: inv.id, caseNumber: inv.caseNumber },
      investigationId: inv.id
    });
  }
  if (memory.status === 'OK' || memory.status === 'DUPLICATE_SKIPPED') {
    await prisma.investigationOutcome.update({ where: { investigationId: id }, data: { memoryRetainedAt: new Date(), memoryDocumentId: memory.documentId } });
    await audit({ actorUserId: null, workerId: worker.id, action: 'OUTCOME_RETAINED_IN_MEMORY', entityType: 'Investigation', entityId: id, details: { documentId: memory.documentId, status: memory.status } });
  }
  return memory;
};

module.exports = {
  createInvestigation,
  getInvestigation,
  listInvestigations,
  updateStatus,
  addStatement,
  resolveInvestigation,
  retainOutcome,
  previousCasesFor,
  situationText,
  ownInvestigation,
  STATUS_FLOW
};
