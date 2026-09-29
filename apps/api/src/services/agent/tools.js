// ToolRegistry — the only way the agent (deterministic planner or LLM) can read
// or change data. Each tool: validates input, is scoped to ctx.worker (resolved
// server-side from the authenticated user), returns structured JSON, and is traced.

const prisma = require('../../lib/prisma');
const dates = require('../../lib/dates');
const AppError = require('../../utils/AppError');
const logger = require('../../lib/logger');
const earnings = require('../earnings.service');
const { periodTotals } = require('../analytics/metrics');
const { getHindsightService } = require('../memory/hindsight.service');
const { CATEGORIES } = require('../memory/categories');
const investigations = require('../investigation.service');
const reports = require('../report.service');

// Tiny JSON-schema-ish validator (type / enum / required / pattern / min / max).
const validateInput = (schema, input) => {
  const errors = [];
  const value = input && typeof input === 'object' ? input : {};
  for (const req of schema.required || []) if (value[req] === undefined || value[req] === null || value[req] === '') errors.push(`${req} is required`);
  for (const [k, v] of Object.entries(value)) {
    const spec = schema.properties?.[k];
    if (!spec) { errors.push(`unexpected field ${k}`); continue; }
    if (v === undefined || v === null) continue;
    if (spec.type === 'string' && typeof v !== 'string') errors.push(`${k} must be a string`);
    if (spec.type === 'integer' && !Number.isInteger(v)) errors.push(`${k} must be an integer`);
    if (spec.type === 'array' && !Array.isArray(v)) errors.push(`${k} must be an array`);
    if (spec.enum && !spec.enum.includes(v)) errors.push(`${k} must be one of ${spec.enum.join(', ')}`);
    if (spec.pattern && typeof v === 'string' && !new RegExp(spec.pattern).test(v)) errors.push(`${k} has an invalid format`);
    if (spec.minimum !== undefined && v < spec.minimum) errors.push(`${k} must be ≥ ${spec.minimum}`);
    if (spec.maximum !== undefined && v > spec.maximum) errors.push(`${k} must be ≤ ${spec.maximum}`);
    if (spec.maxLength && typeof v === 'string' && v.length > spec.maxLength) errors.push(`${k} is too long`);
    if (spec.type === 'array' && spec.items?.enum && Array.isArray(v) && v.some((x) => !spec.items.enum.includes(x))) errors.push(`${k} contains invalid values`);
  }
  return errors;
};

const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Local date YYYY-MM-DD' };
const ID = { type: 'string', pattern: '^[a-zA-Z0-9_-]{6,64}$' };

const TOOLS = [
  {
    name: 'get_worker_profile',
    description: 'Profile of the authenticated worker: name, platform, city, zone, preferences, demo clock (as-of date) and history coverage.',
    input: { type: 'object', properties: {} },
    handler: async (ctx) => {
      const w = ctx.worker;
      const first = await prisma.workSession.findFirst({ where: { workerId: w.id }, orderBy: { localDate: 'asc' }, select: { localDate: true } });
      const count = await prisma.workSession.count({ where: { workerId: w.id, localDate: { lte: ctx.asOf } } });
      return { name: w.fullName, platform: w.platformName, city: w.city, zone: w.zone, preferences: w.preferences || {}, asOf: ctx.asOf, historyFrom: first?.localDate || null, sessionsRecorded: count, synthetic: w.isSynthetic };
    }
  },
  {
    name: 'get_recent_earnings',
    description: 'Per-session earnings for the last N days up to the as-of date, plus totals.',
    input: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 120 } } },
    handler: async (ctx, { days = 14 }) => {
      const from = dates.addDays(ctx.asOf, -(days - 1));
      const m = await earnings.loadMetrics(ctx.worker.id, { from, to: ctx.asOf });
      return { from, to: ctx.asOf, totals: periodTotals(m), sessions: m.map(slim) };
    }
  },
  {
    name: 'get_earnings_baseline',
    description: 'Personal baseline (typical earnings) for a weekday/time-of-day segment, from the last 8 weeks, excluding flagged anomalies.',
    input: { type: 'object', properties: { dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 }, timeWindow: { type: 'string', enum: ['morning', 'lunch', 'afternoon', 'evening'] } } },
    handler: async (ctx, { dayOfWeek = null, timeWindow = null }) => ({ asOf: ctx.asOf, segments: await earnings.segmentProfile(ctx.worker, { dayOfWeek, timeWindow }) })
  },
  {
    name: 'get_comparable_sessions',
    description: 'Deterministic analysis of one session: baseline, comparable historical sessions, anomaly evaluation, nearby platform events.',
    input: { type: 'object', properties: { sessionId: ID, date: DATE } },
    handler: async (ctx, { sessionId = null, date = null }) => {
      const a = await earnings.analyzeSession(ctx.worker.id, { sessionId, date: sessionId ? null : (date || ctx.asOf) });
      return { current: a.current, baseline: a.baseline, comparables: a.comparables, comparableSummary: a.comparableSummary, evaluation: a.evaluation, platformEvents: a.platformEvents.map(ev) };
    }
  },
  {
    name: 'get_incentive_history',
    description: 'Incentive programme outcomes per session over the last N days.',
    input: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 120 } } },
    handler: async (ctx, { days = 60 }) => {
      const m = await earnings.loadMetrics(ctx.worker.id, { from: dates.addDays(ctx.asOf, -(days - 1)), to: ctx.asOf });
      return m.filter((x) => x.incentiveProgram).map((x) => ({ date: x.date, program: x.incentiveProgram, eligible: x.incentiveEligible, amount: x.incentive, note: x.incentiveNote, orders: x.orders, acceptanceRate: x.acceptanceRate }));
    }
  },
  {
    name: 'get_deduction_history',
    description: 'Deductions per session over the last N days with itemised breakdown.',
    input: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 120 } } },
    handler: async (ctx, { days = 60 }) => {
      const m = await earnings.loadMetrics(ctx.worker.id, { from: dates.addDays(ctx.asOf, -(days - 1)), to: ctx.asOf });
      return m.map((x) => ({ date: x.date, total: x.deductions, items: x.deductionBreakdown }));
    }
  },
  {
    name: 'get_platform_events',
    description: 'Platform notices/events for the worker between two dates.',
    input: { type: 'object', properties: { from: DATE, to: DATE } },
    handler: async (ctx, { from = null, to = null }) => (await earnings.getPlatformEvents(ctx.worker.id, { from: from || dates.addDays(ctx.asOf, -30), to: to || ctx.asOf })).map(ev)
  },
  {
    name: 'get_previous_investigations',
    description: 'Previous investigations for this worker with outcomes (structured records).',
    input: { type: 'object', properties: {} },
    handler: async (ctx) => investigations.previousCasesFor(ctx.worker.id)
  },
  {
    name: 'recall_hindsight_memory',
    description: 'Recall the worker\'s persistent memories from Hindsight (patterns, previous anomalies, investigation outcomes, preferences). Optionally restrict to categories.',
    input: { type: 'object', required: ['query'], properties: { query: { type: 'string', maxLength: 500 }, categories: { type: 'array', items: { enum: Object.keys(CATEGORIES) } } } },
    handler: async (ctx, { query, categories = null }) => {
      if (ctx.memoryDisabled) return { status: 'DISABLED', memories: [], notice: 'Memory disabled for this run.' };
      return getHindsightService().recallMemory({ workerId: ctx.worker.id, query, categories, asOf: ctx.asOf, reason: 'Agent tool call: recall_hindsight_memory', interactionId: ctx.interactionId });
    }
  },
  {
    name: 'retain_hindsight_memory',
    description: 'Retain a worker preference or worker feedback stated explicitly by the worker. Other categories are retained automatically by the system.',
    input: { type: 'object', required: ['category', 'content'], properties: { category: { type: 'string', enum: ['worker_preference', 'user_feedback'] }, content: { type: 'string', maxLength: 600 } } },
    handler: async (ctx, { category, content }) => getHindsightService().retainMemory({
      workerId: ctx.worker.id,
      category,
      content,
      documentId: `${category}:${Buffer.from(content.toLowerCase()).toString('base64').slice(0, 40)}`,
      localDate: ctx.asOf,
      reason: 'Worker stated this explicitly in conversation with the agent.'
    })
  },
  {
    name: 'create_investigation',
    description: 'Open an investigation for a session (collects evidence, recalls memory, records findings).',
    input: { type: 'object', properties: { sessionId: ID, date: DATE, question: { type: 'string', maxLength: 500 } } },
    handler: async (ctx, { sessionId = null, date = null, question = null }) => {
      const { investigation, created } = await investigations.createInvestigation(ctx.worker, { sessionId, date, question, actorUserId: ctx.userId });
      return { id: investigation.id, caseNumber: investigation.caseNumber, created, status: investigation.status, title: investigation.title };
    }
  },
  {
    name: 'get_investigation_evidence',
    description: 'Evidence, findings and status for one of the worker\'s investigations.',
    input: { type: 'object', required: ['investigationId'], properties: { investigationId: ID } },
    handler: async (ctx, { investigationId }) => {
      const inv = await investigations.getInvestigation(ctx.worker, investigationId);
      return { caseNumber: inv.caseNumber, status: inv.status, summary: inv.summary, evidence: inv.evidence.map((e) => ({ id: e.id, type: e.type, title: e.title, detail: e.content?.detail })), findings: inv.findings.map((f) => ({ kind: f.kind, statement: f.statement })) };
    }
  },
  {
    name: 'generate_evidence_summary',
    description: 'Deterministic facts / inferences / unknowns for one session, combining structured data and recalled memory.',
    input: { type: 'object', properties: { sessionId: ID, date: DATE } },
    handler: async () => ({ note: 'Executed by the orchestrator (see reasoning.js); exposed for LLM planning.' })
  },
  {
    name: 'generate_grievance_report',
    description: 'Generate an evidence-first report for one of the worker\'s investigations.',
    input: { type: 'object', required: ['investigationId'], properties: { investigationId: ID } },
    handler: async (ctx, { investigationId }) => {
      const r = await reports.generateReport(ctx.worker, investigationId, { actorUserId: ctx.userId });
      return { reportId: r.id, version: r.version };
    }
  },
  {
    name: 'record_investigation_outcome',
    description: 'Record how an investigation was resolved. Requires explicit worker confirmation through the Investigation Workspace; not callable autonomously.',
    requiresConfirmation: true,
    input: { type: 'object', required: ['investigationId'], properties: { investigationId: ID } },
    handler: async () => {
      throw new AppError('record_investigation_outcome must be confirmed by the worker in the Investigation Workspace', 403);
    }
  }
];

const slim = (m) => ({ sessionId: m.sessionId, date: m.date, day: m.dayName, window: m.window, zone: m.zone, orders: m.orders, net: m.net, basePay: m.basePay, incentive: m.incentive, incentiveProgram: m.incentiveProgram, deductions: m.deductions, tips: m.tips, perHour: m.perHour, acceptanceRate: m.acceptanceRate });
const ev = (e) => ({ id: e.id, date: e.localDate, type: e.type, title: e.title, description: e.description, source: e.source });

class ToolRegistry {
  constructor(tools = TOOLS) {
    this.tools = new Map(tools.map((t) => [t.name, t]));
  }

  list({ autonomousOnly = false } = {}) {
    return [...this.tools.values()].filter((t) => !(autonomousOnly && t.requiresConfirmation));
  }

  /** Execute a tool with validation + tracing. Throws AppError on invalid input. */
  async execute(ctx, name, input = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      ctx.toolCalls?.push({ tool: String(name).slice(0, 60), input: {}, ok: false, ms: 0, error: 'unknown tool' });
      throw new AppError(`Unknown tool: ${name}`, 400);
    }
    const errors = validateInput(tool.input, input);
    if (errors.length) {
      ctx.toolCalls?.push({ tool: name, input: sanitize(input), ok: false, ms: 0, error: `invalid input: ${errors.join('; ')}` });
      throw new AppError(`Invalid input for ${name}`, 400, errors);
    }
    const started = Date.now();
    try {
      const output = await tool.handler(ctx, input || {});
      ctx.toolCalls?.push({ tool: name, input: sanitize(input), ok: true, ms: Date.now() - started });
      return output;
    } catch (err) {
      ctx.toolCalls?.push({ tool: name, input: sanitize(input), ok: false, ms: Date.now() - started, error: err.statusCode ? err.message : 'internal error' });
      if (!err.statusCode) logger.error('AGENT', `tool ${name} failed: ${err.message}`);
      throw err;
    }
  }
}

const sanitize = (input) => JSON.parse(JSON.stringify(input || {}, (k, v) => (typeof v === 'string' && v.length > 200 ? `${v.slice(0, 200)}…` : v)));

module.exports = { ToolRegistry, TOOLS, validateInput };
