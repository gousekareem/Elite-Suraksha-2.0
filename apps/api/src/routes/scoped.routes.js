// Worker-scoped API. Mounted twice:
//   /api/v1/me                      (worker: own data)
//   /api/v1/admin/workers/:workerId (admin/investigator: any worker)
// The scope middleware sets req.worker server-side; handlers never trust client ids.

const express = require('express');
const validate = require('../middlewares/validate');
const rateLimit = require('../middlewares/rateLimit');
const upload = require('../config/upload');
const worker = require('../controllers/worker.controller');
const agent = require('../controllers/agent.controller');
const memory = require('../controllers/memory.controller');
const inv = require('../controllers/investigation.controller');
const v = require('./validators');

const scopedRouter = (scope) => {
  const router = express.Router({ mergeParams: true });
  router.use(scope);

  router.get('/profile', worker.getProfile);
  router.get('/dashboard', worker.dashboard);
  router.get('/earnings/series', worker.series);
  router.get('/earnings/sessions/:sessionId/analysis', validate(v.idParam('sessionId')), worker.sessionAnalysis);
  router.post('/earnings/import', validate(v.importStatements), worker.importStatements);
  router.get('/anomalies', worker.anomalies);

  const agentLimit = rateLimit({ windowMs: 60000, max: 30, keyPrefix: 'agent' });
  router.post('/agent/ask', agentLimit, validate(v.ask), agent.ask);
  router.post('/agent/compare', agentLimit, validate(v.ask), agent.compare);
  router.get('/agent/interactions', agent.history);

  router.get('/memory/status', memory.status);
  router.get('/memory/journey', memory.journey);
  router.get('/memory/inspector', memory.inspector);
  router.post('/memory/learn', rateLimit({ max: 5, keyPrefix: 'learn' }), memory.learn);
  router.post('/memory/preferences', validate(v.preference), memory.savePreference);

  router.get('/investigations', inv.list);
  router.post('/investigations', validate(v.createInvestigation), inv.create);
  router.get('/investigations/:id', validate(v.idParam('id')), inv.get);
  router.patch('/investigations/:id/status', validate(v.idParam('id')), validate(v.status), inv.updateStatus);
  router.post('/investigations/:id/evidence', validate(v.idParam('id')), upload.single('file'), validate(v.evidence), inv.addEvidence);
  router.get('/investigations/:id/evidence/:evidenceId/file', validate(v.idParam('id')), validate(v.idParam('evidenceId')), inv.evidenceFile);
  router.post('/investigations/:id/resolve', validate(v.idParam('id')), validate(v.resolve), inv.resolve);
  router.post('/investigations/:id/retain-outcome', validate(v.idParam('id')), inv.retainOutcome);
  router.post('/investigations/:id/reports', validate(v.idParam('id')), validate(v.report), inv.createReport);
  router.get('/investigations/:id/reports/:reportId', validate(v.idParam('id')), validate(v.idParam('reportId')), inv.getReport);
  router.get('/investigations/:id/reports/:reportId/markdown', validate(v.idParam('id')), validate(v.idParam('reportId')), inv.reportMarkdown);

  return router;
};

module.exports = scopedRouter;
