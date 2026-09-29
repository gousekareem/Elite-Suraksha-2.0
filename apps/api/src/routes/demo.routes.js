const express = require('express');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { requireAuth } = require('../middlewares/auth');
const { DEMO } = require('../demo/dataset');
const demo = require('../controllers/demo.controller');

const router = express.Router();

router.use((req, res, next) => (env.demoModeEnabled ? next() : next(new AppError('Demo mode is disabled', 404))));
router.use(requireAuth);
// Only the synthetic demo worker or an admin may drive the demo.
router.use((req, res, next) => (req.user.role === 'ADMIN' || req.user.phone === DEMO.phone ? next() : next(new AppError('Demo controls are limited to the demo accounts', 403))));

router.get('/state', demo.state);
router.post('/reset', demo.reset);
router.post('/steps/:step', demo.step);

module.exports = router;
