const express = require('express');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { requireAdminWorkerParam } = require('../middlewares/workerContext');
const admin = require('../controllers/admin.controller');
const scopedRouter = require('./scoped.routes');

const router = express.Router();

router.use(requireAuth, requireAdmin);
router.get('/overview', admin.overview);
router.get('/workers', admin.workers);
router.get('/anomalies', admin.anomalies);
router.get('/investigations', admin.investigations);
router.get('/memory-activity', admin.memoryActivity);
router.get('/audit', admin.auditTrail);

// Investigator view of a specific worker (same handlers as /me, admin-scoped).
router.use('/workers/:workerId', scopedRouter(requireAdminWorkerParam));

module.exports = router;
