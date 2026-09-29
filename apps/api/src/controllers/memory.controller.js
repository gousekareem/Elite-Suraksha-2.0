const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const memory = require('../services/memory/memory.service');
const { getHindsightService } = require('../services/memory/hindsight.service');
const { learnPatterns } = require('../services/ingestion.service');
const { resolveAsOf } = require('../services/earnings.service');

const status = asyncHandler(async (req, res) => sendSuccess(res, { ...(await getHindsightService().status({ fresh: req.query.fresh === '1' })), stats: await memory.stats(req.worker) }, 'Memory status'));
const journey = asyncHandler(async (req, res) => sendSuccess(res, await memory.journey(req.worker), 'Memory journey'));
const inspector = asyncHandler(async (req, res) => sendSuccess(res, await memory.inspector(req.worker, { q: typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : undefined }), 'Memory inspector'));
const learn = asyncHandler(async (req, res) => {
  const result = await learnPatterns(req.worker, { asOf: resolveAsOf(req.worker) });
  sendSuccess(res, { reason: result.reason || null, retained: (result.retained || []).map((r) => ({ status: r.status, documentId: r.documentId })) }, 'Patterns learned');
});
const savePreference = asyncHandler(async (req, res) => {
  const r = await getHindsightService().retainMemory({
    workerId: req.worker.id,
    category: 'worker_preference',
    content: `${req.worker.fullName} prefers: ${req.body.preference.trim()}`,
    documentId: `preference:custom:${Buffer.from(req.body.preference.trim().toLowerCase()).toString('base64').slice(0, 32)}`,
    localDate: resolveAsOf(req.worker),
    reason: 'Preference stated by the worker in the Memory page.'
  });
  sendSuccess(res, r, 'Preference processed');
});

module.exports = { status, journey, inspector, learn, savePreference };
