// Judge Demo controller logic. Every step runs the REAL application workflows:
// ingestion → anomaly engine → Hindsight retain, agent → Hindsight recall,
// investigation creation, outcome resolution → Hindsight retain.
// Only synthetic demo workers are touched; other data is never modified.

const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const logger = require('../lib/logger');
const dates = require('../lib/dates');
const ds = require('./dataset');
const { ingestStatements, ingestPlatformEvents, learnPatterns } = require('../services/ingestion.service');
const investigations = require('../services/investigation.service');
const reports = require('../services/report.service');
const { getHindsightService } = require('../services/memory/hindsight.service');

let busy = false;
const withLock = async (fn) => {
  if (busy) throw new AppError('A demo step is already running. Please wait for it to finish.', 409);
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
};

const upsertUser = async (phone, role) => prisma.user.upsert({
  where: { phone },
  create: { phone, role, status: 'ACTIVE' },
  update: { role, status: 'ACTIVE' }
});

const ensureDemoUsers = async () => {
  await upsertUser(ds.DEMO.adminPhone, 'ADMIN');
  const rahul = await upsertUser(ds.DEMO.phone, 'WORKER');
  const asha = await upsertUser(ds.DEMO.secondWorkerPhone, 'WORKER');
  return { rahul, asha };
};

const getDemoWorker = async () => {
  const user = await prisma.user.findUnique({ where: { phone: ds.DEMO.phone }, include: { workerProfile: true } });
  if (!user?.workerProfile) throw new AppError('Demo worker not initialised. Run "Reset demo" first.', 409);
  return user.workerProfile;
};

const setAsOf = (workerId, asOf) => prisma.workerProfile.update({ where: { id: workerId }, data: { asOfDate: asOf } });

/** Wipe and recreate the synthetic demo workers (structured data + Hindsight banks). */
const reset = () => withLock(async () => {
  const { rahul, asha } = await ensureDemoUsers();
  const hs = getHindsightService();
  for (const user of [rahul, asha]) {
    const profile = await prisma.workerProfile.findUnique({ where: { userId: user.id } });
    if (profile) {
      if (!profile.isSynthetic) throw new AppError('Refusing to reset a non-synthetic worker profile', 409);
      await hs.deleteWorkerBank(profile.id, { reason: 'Demo reset' });
      await prisma.auditLog.deleteMany({ where: { workerId: profile.id } });
      await prisma.workerProfile.delete({ where: { id: profile.id } });
    }
  }
  const worker = await prisma.workerProfile.create({
    data: { userId: rahul.id, ...ds.DEMO.worker, isSynthetic: true, asOfDate: ds.DEMO.historyStart }
  });
  const second = await prisma.workerProfile.create({
    data: { userId: asha.id, ...ds.DEMO.secondWorker, isSynthetic: true, asOfDate: '2026-08-14' }
  });
  // Second synthetic worker gets her own history and her own memory bank (isolation demo).
  await ingestStatements(second, ds.secondWorkerStatements(), { retain: true });
  await learnPatterns(second, { asOf: '2026-08-14' });
  logger.info('DEMO', `reset complete worker=${worker.id}`);
  return state();
});

/** Phase 1: ~7.5 weeks of normal history; the agent learns patterns into Hindsight. */
const loadHistory = () => withLock(async () => {
  const worker = await getDemoWorker();
  const statements = ds.statementsBetween(ds.DEMO.historyStart, ds.DEMO.phase1End);
  const ing = await ingestStatements(worker, statements);
  await ingestPlatformEvents(worker, ds.platformEventsBetween(ds.DEMO.historyStart, ds.DEMO.phase1End));
  const w = await setAsOf(worker.id, ds.DEMO.phase1End);
  const learned = await learnPatterns(w, { asOf: ds.DEMO.phase1End });
  return { step: 'history', ingested: ing, learned: summarizeRetains(learned.retained), state: await state() };
});

/** Phase 2: the first anomaly (Fri 19 Jun). */
const firstAnomaly = () => withLock(async () => {
  const worker = await getDemoWorker();
  const ing = await ingestStatements(worker, ds.statementsBetween(ds.DEMO.firstAnomalyDate, ds.DEMO.firstAnomalyDate));
  await setAsOf(worker.id, ds.DEMO.firstAnomalyDate);
  return { step: 'first-anomaly', ingested: ing, state: await state() };
});

/** Phase 3: open the investigation for the first anomaly (same as the UI button / agent offer). */
const openFirstInvestigation = (actorUserId) => withLock(async () => {
  const worker = await getDemoWorker();
  const anomaly = await prisma.anomaly.findFirst({ where: { workerId: worker.id, localDate: ds.DEMO.firstAnomalyDate } });
  if (!anomaly) throw new AppError('Introduce the first anomaly before opening an investigation', 409);
  const { investigation } = await investigations.createInvestigation(worker, { anomalyId: anomaly.id, question: 'Why did my earnings drop on Friday 19 June?', actorUserId });
  return { step: 'first-investigation', investigationId: investigation.id, caseNumber: investigation.caseNumber, state: await state() };
});

/** Phase 4: the synthetic platform clarification arrives → resolve → outcome retained. */
const resolveFirstInvestigation = (actorUserId) => withLock(async () => {
  let worker = await getDemoWorker();
  const inv = await prisma.investigation.findFirst({ where: { workerId: worker.id, periodStart: ds.DEMO.firstAnomalyDate }, include: { outcome: true } });
  if (!inv) throw new AppError('Open the first investigation before resolving it', 409);
  // Days pass until the clarification arrives.
  await ingestStatements(worker, ds.statementsBetween(dates.addDays(ds.DEMO.firstAnomalyDate, 1), ds.DEMO.clarificationDate));
  worker = await setAsOf(worker.id, ds.DEMO.clarificationDate);
  let result;
  if (!inv.outcome) {
    await reports.generateReport(worker, inv.id, { actorUserId });
    result = await investigations.resolveInvestigation(worker, inv.id, { ...ds.FIRST_CASE_OUTCOME, resolvedDate: ds.DEMO.clarificationDate }, actorUserId);
  } else {
    result = { memory: await investigations.retainOutcome(worker, inv.id) };
  }
  return { step: 'first-outcome', investigationId: inv.id, memory: result.memory, state: await state() };
});

/** Phase 5: time jump to 14 Aug — weeks of normal work, then a similar problem. */
const timeJump = () => withLock(async () => {
  let worker = await getDemoWorker();
  const from = dates.addDays(ds.DEMO.clarificationDate, 1);
  const ing = await ingestStatements(worker, ds.statementsBetween(from, ds.DEMO.secondAnomalyDate));
  await ingestPlatformEvents(worker, ds.platformEventsBetween(from, ds.DEMO.secondAnomalyDate));
  worker = await setAsOf(worker.id, ds.DEMO.secondAnomalyDate);
  const learned = await learnPatterns(worker, { asOf: ds.DEMO.secondAnomalyDate });
  return { step: 'time-jump', ingested: ing, learned: summarizeRetains(learned.retained), state: await state() };
});

/** Run every step (used by `npm run demo:scenario`). Stops before the second investigation. */
const runFullScenario = async (actorUserId = null) => {
  await reset();
  await loadHistory();
  await firstAnomaly();
  await openFirstInvestigation(actorUserId);
  await resolveFirstInvestigation(actorUserId);
  await timeJump();
  return state();
};

const summarizeRetains = (list = []) => list.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});

const state = async () => {
  const user = await prisma.user.findUnique({ where: { phone: ds.DEMO.phone }, include: { workerProfile: true } });
  const w = user?.workerProfile;
  const hs = getHindsightService();
  const hindsight = await hs.status();
  if (!w) return { initialised: false, hindsight, steps: {} };
  const [sessions, anomalies, invs, retains, recalls, lastSession] = await Promise.all([
    prisma.workSession.count({ where: { workerId: w.id } }),
    prisma.anomaly.findMany({ where: { workerId: w.id }, orderBy: { localDate: 'asc' } }),
    prisma.investigation.findMany({ where: { workerId: w.id }, include: { outcome: true }, orderBy: { createdAt: 'asc' } }),
    prisma.memoryEvent.count({ where: { workerId: w.id, operation: 'RETAIN', status: 'OK' } }),
    prisma.memoryEvent.count({ where: { workerId: w.id, operation: 'RECALL', status: { in: ['OK', 'EMPTY'] } } }),
    prisma.workSession.findFirst({ where: { workerId: w.id }, orderBy: { localDate: 'desc' }, select: { localDate: true } })
  ]);
  const first = invs.find((i) => i.periodStart === ds.DEMO.firstAnomalyDate);
  const second = invs.find((i) => i.periodStart === ds.DEMO.secondAnomalyDate);
  return {
    initialised: true,
    workerId: w.id,
    workerName: w.fullName,
    asOf: w.asOfDate,
    lastSessionDate: lastSession?.localDate || null,
    sessions,
    anomalies: anomalies.map((a) => ({ id: a.id, date: a.localDate, severity: a.severity, deviationPct: Number(a.deviationPct), memoryRetained: a.memoryRetained })),
    investigations: invs.map((i) => ({ id: i.id, caseNumber: i.caseNumber, date: i.periodStart, status: i.status, outcomeRetained: Boolean(i.outcome?.memoryRetainedAt) })),
    memory: { retained: retains, recalls },
    hindsight,
    steps: {
      history: sessions > 0,
      firstAnomaly: anomalies.some((a) => a.localDate === ds.DEMO.firstAnomalyDate),
      firstInvestigation: Boolean(first),
      firstResolved: Boolean(first?.outcome),
      firstOutcomeRetained: Boolean(first?.outcome?.memoryRetainedAt),
      timeJump: (w.asOfDate || '') >= ds.DEMO.secondAnomalyDate,
      secondInvestigation: Boolean(second)
    },
    story: {
      historyStart: ds.DEMO.historyStart,
      phase1End: ds.DEMO.phase1End,
      firstAnomalyDate: ds.DEMO.firstAnomalyDate,
      clarificationDate: ds.DEMO.clarificationDate,
      secondAnomalyDate: ds.DEMO.secondAnomalyDate
    }
  };
};

const isBusy = () => busy;

module.exports = { isBusy, reset, loadHistory, firstAnomaly, openFirstInvestigation, resolveFirstInvestigation, timeJump, runFullScenario, state, ensureDemoUsers, getDemoWorker };
