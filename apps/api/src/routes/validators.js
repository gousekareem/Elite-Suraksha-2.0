// Request validators (used with middlewares/validate.js).
const dates = require('../lib/dates');

const ok = (errors) => ({ valid: errors.length === 0, errors });
const ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

const idParam = (name) => (req) => ok(ID_RE.test(req.params[name] || '') ? [] : [{ field: name, message: `${name} is invalid` }]);

const ask = (req) => {
  const b = req.body || {};
  const errors = [];
  if (!str(b.question, 500)) errors.push({ field: 'question', message: 'question is required (max 500 characters)' });
  if (b.mode !== undefined && !['full', 'history_only', 'current_only'].includes(b.mode)) errors.push({ field: 'mode', message: 'mode must be full, history_only or current_only' });
  return ok(errors);
};

const createInvestigation = (req) => {
  const b = req.body || {};
  const errors = [];
  if (!b.sessionId && !b.anomalyId && !b.date) errors.push({ field: 'sessionId', message: 'Provide sessionId, anomalyId or date' });
  for (const k of ['sessionId', 'anomalyId']) if (b[k] !== undefined && !ID_RE.test(b[k])) errors.push({ field: k, message: `${k} is invalid` });
  if (b.date !== undefined && !dates.isDateString(b.date)) errors.push({ field: 'date', message: 'date must be YYYY-MM-DD' });
  if (b.question !== undefined && !str(b.question, 500)) errors.push({ field: 'question', message: 'question must be a string (max 500)' });
  return ok(errors);
};

const status = (req) => ok(['OPEN', 'IN_PROGRESS', 'AWAITING_CLARIFICATION', 'CLOSED'].includes(req.body?.status) ? [] : [{ field: 'status', message: 'Invalid status' }]);

const evidence = (req) => {
  const b = req.body || {};
  const errors = [];
  if (!req.file && !str(b.text, 4000)) errors.push({ field: 'text', message: 'Provide a statement (max 4000 characters) or a file' });
  if (b.title !== undefined && !str(b.title, 200)) errors.push({ field: 'title', message: 'title must be ≤ 200 characters' });
  return ok(errors);
};

const ROOT_CAUSES = ['INCENTIVE_ELIGIBILITY_CHANGE', 'PAY_RATE_CHANGE', 'DEDUCTION_ERROR', 'LOW_DEMAND', 'PLATFORM_OUTAGE', 'DATA_ERROR', 'OTHER', 'UNRESOLVED'];
const resolve = (req) => {
  const b = req.body || {};
  const errors = [];
  if (!str(b.result, 2000)) errors.push({ field: 'result', message: 'result is required' });
  if (!ROOT_CAUSES.includes(b.rootCauseCategory)) errors.push({ field: 'rootCauseCategory', message: `rootCauseCategory must be one of ${ROOT_CAUSES.join(', ')}` });
  if (!str(b.actionTaken, 2000)) errors.push({ field: 'actionTaken', message: 'actionTaken is required' });
  for (const k of ['resolutionSource', 'workerFeedback', 'learning']) if (b[k] !== undefined && b[k] !== null && b[k] !== '' && !str(b[k], 2000)) errors.push({ field: k, message: `${k} must be text` });
  if (b.resolvedDate !== undefined && !dates.isDateString(b.resolvedDate)) errors.push({ field: 'resolvedDate', message: 'resolvedDate must be YYYY-MM-DD' });
  return ok(errors);
};

const report = (req) => {
  const b = req.body || {};
  return ok(b.requestedAction === undefined || str(b.requestedAction, 1000) ? [] : [{ field: 'requestedAction', message: 'requestedAction must be ≤ 1000 characters' }]);
};

const preference = (req) => ok(str(req.body?.preference, 300) ? [] : [{ field: 'preference', message: 'preference is required (max 300)' }]);

const importStatements = (req) => {
  const b = req.body || {};
  const errors = [];
  if (!Array.isArray(b.statements) || b.statements.length === 0 || b.statements.length > 500) errors.push({ field: 'statements', message: 'statements must be an array of 1–500 items' });
  if (b.platformEvents !== undefined && (!Array.isArray(b.platformEvents) || b.platformEvents.length > 100)) errors.push({ field: 'platformEvents', message: 'platformEvents must be an array (max 100)' });
  return ok(errors);
};

const profile = (req) => {
  const b = req.body || {};
  const errors = [];
  for (const k of ['fullName', 'city', 'zone']) if (!str(b[k], 120)) errors.push({ field: k, message: `${k} is required` });
  if (!str(b.platformCode, 40)) errors.push({ field: 'platformCode', message: 'platformCode is required' });
  if (b.preferences !== undefined && (typeof b.preferences !== 'object' || Array.isArray(b.preferences))) errors.push({ field: 'preferences', message: 'preferences must be an object' });
  return ok(errors);
};

module.exports = { idParam, ask, createInvestigation, status, evidence, resolve, report, preference, importStatements, profile, ROOT_CAUSES };
