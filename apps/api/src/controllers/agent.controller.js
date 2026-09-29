const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const prisma = require('../lib/prisma');
const { getOrchestrator } = require('../services/agent/orchestrator');

const ask = asyncHandler(async (req, res) => {
  const result = await getOrchestrator().ask({ worker: req.worker, userId: req.user.id, question: req.body.question.trim(), mode: req.body.mode || 'full' });
  sendSuccess(res, result, 'Agent answered');
});

// Same question, three memory configurations: current session only → structured history → + Hindsight.
const compare = asyncHandler(async (req, res) => {
  const o = getOrchestrator();
  const question = req.body.question.trim();
  const currentOnly = await o.ask({ worker: req.worker, userId: req.user.id, question, mode: 'current_only' });
  const historyOnly = await o.ask({ worker: req.worker, userId: req.user.id, question, mode: 'history_only' });
  const full = await o.ask({ worker: req.worker, userId: req.user.id, question, mode: 'full' });
  sendSuccess(res, { question, currentOnly, historyOnly, full }, 'Comparison complete');
});

const history = asyncHandler(async (req, res) => {
  const rows = await prisma.agentInteraction.findMany({ where: { workerId: req.worker.id }, orderBy: { createdAt: 'desc' }, take: 20 });
  sendSuccess(res, rows, 'Interactions fetched');
});

module.exports = { ask, compare, history };
