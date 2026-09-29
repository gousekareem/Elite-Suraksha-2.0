const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const demo = require('../demo/demo.service');
const AppError = require('../utils/AppError');

const STEPS = {
  'load-history': () => demo.loadHistory(),
  'first-anomaly': () => demo.firstAnomaly(),
  'open-first-investigation': (req) => demo.openFirstInvestigation(req.user.id),
  'resolve-first-investigation': (req) => demo.resolveFirstInvestigation(req.user.id),
  'time-jump': () => demo.timeJump()
};

const state = asyncHandler(async (req, res) => sendSuccess(res, { ...(await demo.state()), busy: demo.isBusy() }, 'Demo state'));
const reset = asyncHandler(async (req, res) => sendSuccess(res, await demo.reset(), 'Demo reset'));
const step = asyncHandler(async (req, res) => {
  const fn = STEPS[req.params.step];
  if (!fn) throw new AppError('Unknown demo step', 404);
  sendSuccess(res, await fn(req), 'Demo step complete');
});

module.exports = { state, reset, step };
