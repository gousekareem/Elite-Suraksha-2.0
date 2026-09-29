const express = require('express');
const { sendOtp, verifyOtp, getMe, demoLogin } = require('../controllers/auth.controller');
const rateLimit = require('../middlewares/rateLimit');

const authLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, keyPrefix: 'auth' });
const validate = require('../middlewares/validate');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

const sendOtpValidator = (req) => {
  const errors = [];

  if (!req.body || typeof req.body.phone !== 'string' || !req.body.phone.trim()) {
    errors.push({ field: 'phone', message: 'Phone is required' });
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

const verifyOtpValidator = (req) => {
  const errors = [];

  if (!req.body || typeof req.body.phone !== 'string' || !req.body.phone.trim()) {
    errors.push({ field: 'phone', message: 'Phone is required' });
  }

  if (!req.body || typeof req.body.otp !== 'string' || !req.body.otp.trim()) {
    errors.push({ field: 'otp', message: 'OTP is required' });
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

router.post('/send-otp', authLimit, validate(sendOtpValidator), sendOtp);
router.post('/verify-otp', authLimit, validate(verifyOtpValidator), verifyOtp);
router.post('/demo-login', authLimit, validate((req) => ({ valid: [undefined, 'worker', 'admin', 'second-worker'].includes(req.body?.as), errors: [{ field: 'as', message: 'as must be worker, admin or second-worker' }] })), demoLogin);
router.get('/me', requireAuth, getMe);

module.exports = router;