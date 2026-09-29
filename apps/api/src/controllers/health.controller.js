const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { getHindsightService } = require('../services/memory/hindsight.service');
const llm = require('../services/agent/llm');
const env = require('../config/env');

const getHealth = asyncHandler(async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  return sendSuccess(res, { serverTime: new Date().toISOString(), environment: env.nodeEnv }, 'EliteSuraksha 2.0 API and database are running');
});

// Real, live status for the UI badge: Hindsight reachability + reasoning engine.
const getSystemStatus = asyncHandler(async (req, res) => sendSuccess(res, {
  hindsight: await getHindsightService().status({ fresh: req.query.fresh === '1' }),
  reasoning: llm.describe(),
  demoMode: env.demoModeEnabled
}, 'System status'));

module.exports = { getHealth, getSystemStatus };
