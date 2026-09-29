const express = require('express');
const { getHealth, getSystemStatus } = require('../controllers/health.controller');
const { requireAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/', getHealth);
router.get('/system', requireAuth, getSystemStatus);

module.exports = router;
