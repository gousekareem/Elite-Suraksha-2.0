const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const workerService = require('../services/worker.service');
const earnings = require('../services/earnings.service');
const ingestion = require('../services/ingestion.service');
const memory = require('../services/memory/memory.service');
const prisma = require('../lib/prisma');
const { listAdapters } = require('../platform');
const AppError = require('../utils/AppError');

const getProfile = asyncHandler(async (req, res) => sendSuccess(res, req.worker, 'Profile fetched'));

const getMyProfileOrNull = asyncHandler(async (req, res) => sendSuccess(res, await workerService.getProfileForUser(req.user.id), 'Profile fetched'));

const upsertProfile = asyncHandler(async (req, res) => sendSuccess(res, await workerService.upsertProfile(req.user, req.body), 'Profile saved'));

const platforms = asyncHandler(async (req, res) => sendSuccess(res, listAdapters(), 'Platforms fetched'));

const dashboard = asyncHandler(async (req, res) => {
  const [summary, memoryStats, openInvestigations, attention] = await Promise.all([
    earnings.dashboard(req.worker),
    memory.stats(req.worker),
    prisma.investigation.groupBy({ by: ['status'], where: { workerId: req.worker.id }, _count: { _all: true } }),
    prisma.anomaly.findMany({ where: { workerId: req.worker.id }, orderBy: { localDate: 'desc' }, take: 6, include: { investigations: { select: { id: true, caseNumber: true, status: true } } } })
  ]);
  sendSuccess(res, {
    worker: req.worker,
    summary,
    memory: memoryStats,
    investigations: Object.fromEntries(openInvestigations.map((g) => [g.status, g._count._all])),
    attention: attention.map((a) => ({ id: a.id, date: a.localDate, severity: a.severity, deviationPct: Number(a.deviationPct), explanation: a.explanation, signals: a.signals?.signals || [], investigations: a.investigations }))
  }, 'Dashboard fetched');
});

const series = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 120, 7), 180);
  sendSuccess(res, await earnings.earningsSeries(req.worker, { days }), 'Earnings series fetched');
});

const sessionAnalysis = asyncHandler(async (req, res) => {
  const a = await earnings.analyzeSession(req.worker.id, { sessionId: req.params.sessionId });
  sendSuccess(res, a, 'Session analysis fetched');
});

const anomalies = asyncHandler(async (req, res) => {
  const rows = await prisma.anomaly.findMany({ where: { workerId: req.worker.id }, orderBy: { localDate: 'desc' }, include: { investigations: { select: { id: true, caseNumber: true, status: true } } } });
  sendSuccess(res, rows, 'Anomalies fetched');
});

const importStatements = asyncHandler(async (req, res) => {
  if (req.worker.isSynthetic) throw new AppError('Use the Judge Demo controls to add data for the synthetic worker', 409);
  const result = await ingestion.ingestStatements(req.worker, req.body.statements || []);
  if (Array.isArray(req.body.platformEvents) && req.body.platformEvents.length) {
    result.platformEvents = await ingestion.ingestPlatformEvents(req.worker, req.body.platformEvents);
  }
  sendSuccess(res, result, 'Statements imported', 201);
});

module.exports = { getProfile, getMyProfileOrNull, upsertProfile, platforms, dashboard, series, sessionAnalysis, anomalies, importStatements };
