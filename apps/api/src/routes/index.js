const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const adminRoutes = require('./admin.routes');
const demoRoutes = require('./demo.routes');
const scopedRouter = require('./scoped.routes');
const { requireAuth } = require('../middlewares/auth');
const { requireOwnWorker } = require('../middlewares/workerContext');
const validate = require('../middlewares/validate');
const { profile } = require('./validators');
const worker = require('../controllers/worker.controller');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Onboarding (works before a worker profile exists).
router.get('/onboarding/profile', requireAuth, worker.getMyProfileOrNull);
router.put('/onboarding/profile', requireAuth, validate(profile), worker.upsertProfile);
router.get('/onboarding/platforms', requireAuth, worker.platforms);

router.use('/me', requireAuth, scopedRouter(requireOwnWorker));
router.use('/admin', adminRoutes);
router.use('/demo', demoRoutes);

module.exports = router;
