const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const admin = require('../services/admin.service');

const wrap = (fn, msg) => asyncHandler(async (req, res) => sendSuccess(res, await fn(), msg));

module.exports = {
  overview: wrap(admin.overview, 'Overview fetched'),
  workers: wrap(admin.workers, 'Workers fetched'),
  anomalies: wrap(admin.anomalies, 'Anomalies fetched'),
  investigations: wrap(admin.investigations, 'Investigations fetched'),
  memoryActivity: wrap(admin.memoryActivity, 'Memory activity fetched'),
  auditTrail: wrap(admin.auditTrail, 'Audit trail fetched')
};
