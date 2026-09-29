const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const authService = require('../services/auth.service');
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const { DEMO } = require('../demo/dataset');
const demo = require('../demo/demo.service');

const sendOtp = asyncHandler(async (req, res) => {
  const result = await authService.sendOtp(req.body.phone);
  return sendSuccess(res, result, 'OTP generated successfully', 201);
});

const verifyOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyOtp(req.body.phone, req.body.otp);
  return sendSuccess(res, result, 'OTP verified successfully');
});

const getMe = asyncHandler(async (req, res) => {
  const result = await authService.getCurrentUser(req.user.id);
  return sendSuccess(res, result, 'Authenticated user fetched successfully');
});

// One-click login for the synthetic demo accounts. Only available when
// DEMO_MODE_ENABLED=true (default off in production).
const demoLogin = asyncHandler(async (req, res) => {
  if (!env.demoModeEnabled) throw new AppError('Demo mode is disabled', 404);
  const phone = req.body.as === 'admin' ? DEMO.adminPhone : req.body.as === 'second-worker' ? DEMO.secondWorkerPhone : DEMO.phone;
  await demo.ensureDemoUsers();
  const user = await prisma.user.findUnique({ where: { phone }, include: { workerProfile: true } });
  return sendSuccess(res, authService.issueSession(user), 'Demo session issued');
});

module.exports = { sendOtp, verifyOtp, getMe, demoLogin };
