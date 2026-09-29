const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const investigations = require('../services/investigation.service');
const reports = require('../services/report.service');
const path = require('path');
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const { uploadDir } = require('../config/upload');

const list = asyncHandler(async (req, res) => sendSuccess(res, await investigations.listInvestigations(req.worker), 'Investigations fetched'));

const create = asyncHandler(async (req, res) => {
  const { investigation, created } = await investigations.createInvestigation(req.worker, { ...pick(req.body, ['sessionId', 'anomalyId', 'date', 'question']), actorUserId: req.user.id });
  sendSuccess(res, { investigation, created }, created ? 'Investigation created' : 'Investigation already exists', created ? 201 : 200);
});

const get = asyncHandler(async (req, res) => sendSuccess(res, await investigations.getInvestigation(req.worker, req.params.id), 'Investigation fetched'));
const updateStatus = asyncHandler(async (req, res) => sendSuccess(res, await investigations.updateStatus(req.worker, req.params.id, req.body.status, req.user.id), 'Status updated'));

const addEvidence = asyncHandler(async (req, res) => {
  const fileUrl = req.file ? `/uploads/evidence/${req.file.filename}` : null;
  const row = await investigations.addStatement(req.worker, req.params.id, { text: req.body.text, title: req.body.title, fileUrl }, req.user.id);
  sendSuccess(res, row, 'Evidence added', 201);
});

const resolve = asyncHandler(async (req, res) => sendSuccess(res, await investigations.resolveInvestigation(req.worker, req.params.id, req.body, req.user.id), 'Investigation resolved'));
const retainOutcome = asyncHandler(async (req, res) => sendSuccess(res, await investigations.retainOutcome(req.worker, req.params.id), 'Outcome retention attempted'));

const createReport = asyncHandler(async (req, res) => sendSuccess(res, await reports.generateReport(req.worker, req.params.id, { requestedAction: req.body?.requestedAction, actorUserId: req.user.id }), 'Report generated', 201));
const getReport = asyncHandler(async (req, res) => sendSuccess(res, await reports.getReport(req.worker, req.params.id, req.params.reportId), 'Report fetched'));
const reportMarkdown = asyncHandler(async (req, res) => {
  const r = await reports.getReport(req.worker, req.params.id, req.params.reportId);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="investigation-report-v${r.version}.md"`);
  res.send(r.markdown);
});

const evidenceFile = asyncHandler(async (req, res) => {
  await investigations.ownInvestigation(req.worker.id, req.params.id);
  const ev = await prisma.evidenceItem.findFirst({ where: { id: req.params.evidenceId, investigationId: req.params.id } });
  if (!ev || !ev.fileUrl) throw new AppError('Evidence file not found', 404);
  res.sendFile(path.join(uploadDir, path.basename(ev.fileUrl)));
});

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));

module.exports = { evidenceFile, list, create, get, updateStatus, addEvidence, resolve, retainOutcome, createReport, getReport, reportMarkdown };
