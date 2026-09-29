// AgentOrchestrator
//
//   AgentController → AgentOrchestrator → ToolRegistry → domain services
//                                        └→ HindsightService (recall)
//
// 1. identify worker (server-side) and relevant period
// 2. retrieve structured facts through tools (earnings, baseline, comparables, events, cases)
// 3. recall Hindsight memory (worker context + similar previous cases)
// 4. deterministic reasoning → facts / inferences / unknowns (reasoning.js)
// 5. optional LLM interpretation (tool-calling, validated + grounding-checked)
// 6. structured, validated answer + visible memory trace, persisted as AgentInteraction

const prisma = require('../../lib/prisma');
const dates = require('../../lib/dates');
const logger = require('../../lib/logger');
const env = require('../../config/env');
const { inr, pct, round } = require('../../lib/num');
const earnings = require('../earnings.service');
const { segmentLabel } = require('../analytics/metrics');
const { getHindsightService } = require('../memory/hindsight.service');
const { CASE_CATEGORIES } = require('../memory/categories');
const { situationText } = require('../investigation.service');
const { ToolRegistry } = require('./tools');
const { detectIntent, extractTarget } = require('./intent');
const { reasonAboutSession, buildEvidence } = require('./reasoning');
const { validateAgentAnswer, ungroundedFigures } = require('./schema');
const llm = require('./llm');
const { SYSTEM_PROMPT, userMessage } = require('./prompts');

const MODES = ['full', 'history_only', 'current_only'];
const LLM_READONLY_TOOLS = ['get_worker_profile', 'get_recent_earnings', 'get_earnings_baseline', 'get_comparable_sessions', 'get_incentive_history', 'get_deduction_history', 'get_platform_events', 'get_previous_investigations', 'recall_hindsight_memory'];

class Trace {
  constructor() { this.steps = []; this.t0 = Date.now(); }
  add(step) {
    const s = { status: 'done', kind: 'data', ...step, at: Date.now() - this.t0 };
    this.steps.push(s);
    return s;
  }
}

const FOLLOW_UPS = {
  EARNINGS_DROP: ['Have I experienced this before?', 'Which factor contributed most to the decrease?', 'What evidence supports this?', 'Create an investigation.'],
  FACTOR: ['What evidence supports this?', 'Show me comparable Friday shifts.', 'Create an investigation.'],
  EVIDENCE: ['Create an investigation.', 'What happened last time?'],
  HISTORY: ['Why did my earnings drop?', 'What do I normally earn on Friday evenings?'],
  NORMAL_EARNINGS: ['Why did my earnings drop?', 'Show me comparable Friday shifts.'],
  COMPARABLE: ['Which factor contributed most to the decrease?', 'Have I experienced this before?'],
  CREATE_INVESTIGATION: ['What evidence supports this?', 'What happened last time?'],
  INCENTIVES: ['Why did my earnings drop?'],
  DEDUCTIONS: ['Why did my earnings drop?'],
  GENERAL: ['What do I normally earn on Friday evenings?', 'Why did my earnings drop?', 'Have I experienced this before?']
};

class AgentOrchestrator {
  constructor({ registry = new ToolRegistry(), hindsight = null, llmConfig = env.llm } = {}) {
    this.registry = registry;
    this.hindsightOverride = hindsight;
    this.llmConfig = llmConfig;
  }

  get hindsight() { return this.hindsightOverride || getHindsightService(); }

  async ask({ worker, userId = null, question, mode = 'full' }) {
    if (!MODES.includes(mode)) mode = 'full';
    const asOf = earnings.resolveAsOf(worker);
    const ctx = { worker, userId, asOf, toolCalls: [], memoryDisabled: mode !== 'full', mode };
    const trace = new Trace();
    const intent = detectIntent(question);
    const target = extractTarget(question, asOf);
    trace.add({ id: 'worker', label: 'Worker identified', detail: `${worker.fullName} · ${worker.platformName} · as of ${dates.pretty(asOf)}` });

    let answer;
    try {
      switch (intent) {
        case 'NORMAL_EARNINGS': answer = await this.normalEarnings(ctx, trace, question, target); break;
        case 'HISTORY': answer = await this.history(ctx, trace, question); break;
        case 'COMPARABLE': answer = await this.comparable(ctx, trace, target); break;
        case 'CREATE_INVESTIGATION': answer = await this.createInvestigation(ctx, trace, question, target); break;
        case 'INCENTIVES': answer = await this.incentives(ctx, trace); break;
        case 'DEDUCTIONS': answer = await this.deductions(ctx, trace); break;
        case 'GENERAL': answer = await this.general(ctx, trace, question); break;
        default: answer = await this.analyzeDrop(ctx, trace, question, target, intent);
      }
    } catch (err) {
      if (!err.statusCode) throw err;
      answer = emptyAnswer(err.message);
      trace.add({ id: 'error', label: 'Could not complete the request', status: 'failed', detail: err.message });
    }

    let engine = llm.describe(this.llmConfig);
    if (engine.engine === 'llm' && mode === 'full' && answer.llmEligible) {
      const refined = await this.llmInterpret(ctx, trace, question, intent, target, answer);
      if (refined) answer = refined;
      else engine = { ...engine, engine: 'deterministic', fallbackFrom: engine.model };
    }
    delete answer.llmEligible;

    answer.intent = intent;
    answer.mode = mode;
    answer.asOf = asOf;
    answer.suggestedFollowUps = answer.suggestedFollowUps || FOLLOW_UPS[intent] || FOLLOW_UPS.GENERAL;
    const errors = validateAgentAnswer(answer);
    if (errors.length) {
      logger.error('AGENT', 'answer failed validation', { errors });
      answer = emptyAnswer('The agent could not produce a valid answer. Please try rephrasing the question.');
    }
    trace.add({ id: 'answer', label: 'Answer generated', kind: 'reasoning', detail: engine.engine === 'llm' ? `Interpreted by ${engine.provider} · ${engine.model}` : 'Deterministic reasoning engine (facts computed by code)' });

    const interaction = await prisma.agentInteraction.create({
      data: {
        workerId: worker.id,
        userId,
        question,
        mode,
        intent,
        response: answer,
        toolsUsed: ctx.toolCalls,
        memoryRecalled: answer.historicalContext || [],
        memoryStatus: answer.memory?.status || 'NOT_USED',
        reasoningEngine: engine.engine === 'llm' ? `${engine.provider}:${engine.model}` : 'deterministic'
      }
    });
    return { interactionId: interaction.id, question, asOf, answer, trace: trace.steps, toolsUsed: ctx.toolCalls, engine };
  }

  // ── target session ─────────────────────────────────────────────────────────
  async resolveTarget(ctx, target) {
    const { worker, asOf } = ctx;
    if (target.date) {
      const s = await prisma.workSession.findFirst({ where: { workerId: worker.id, localDate: target.date }, orderBy: { startHour: 'desc' } });
      if (!s) return { error: `No work session is recorded on ${dates.pretty(target.date)}.` };
      return { sessionId: s.id, date: s.localDate, reason: 'date mentioned in the question' };
    }
    if (target.dayOfWeek !== null && target.dayOfWeek !== undefined) {
      const s = await prisma.workSession.findFirst({ where: { workerId: worker.id, dayOfWeek: target.dayOfWeek, localDate: { lte: asOf } }, orderBy: { localDate: 'desc' } });
      if (s) return { sessionId: s.id, date: s.localDate, reason: `most recent ${dates.DAY_NAMES[target.dayOfWeek]}` };
    }
    const recentAnomaly = await prisma.anomaly.findFirst({
      where: { workerId: worker.id, localDate: { lte: asOf, gte: dates.addDays(asOf, -7) }, severity: { in: ['SIGNIFICANT_CHANGE', 'INVESTIGATION_RECOMMENDED'] } },
      orderBy: { localDate: 'desc' }
    });
    if (recentAnomaly) return { sessionId: recentAnomaly.sessionId, date: recentAnomaly.localDate, reason: 'most recent flagged earnings change' };
    const latest = await earnings.latestSession(worker.id, asOf);
    if (!latest) return { error: 'No work sessions are recorded yet.' };
    return { sessionId: latest.id, date: latest.localDate, reason: 'most recent session' };
  }

  // ── memory ─────────────────────────────────────────────────────────────────
  async recallContext(ctx, trace, question, situation, focus = null) {
    if (ctx.memoryDisabled) {
      trace.add({ id: 'memory', kind: 'memory', label: 'Hindsight recall', status: 'skipped', detail: ctx.mode === 'current_only' ? 'Not used: this run only sees the current session.' : 'Disabled for this comparison run (structured history only).' });
      return { status: 'DISABLED', memories: [] };
    }
    const started = Date.now();
    const memory = await this.hindsight.getWorkerMemoryContext({ workerId: ctx.worker.id, question, situation, asOf: ctx.asOf, focus });
    for (const r of memory.recalls || []) ctx.toolCalls.push({ tool: 'recall_hindsight_memory', input: { query: r.query }, ok: r.status !== 'UNAVAILABLE' && r.status !== 'FAILED', ms: r.latencyMs });
    const status = memory.status === 'OK' ? 'done' : memory.status === 'EMPTY' ? 'empty' : memory.status === 'DISABLED' ? 'skipped' : 'unavailable';
    trace.add({
      id: 'memory',
      kind: 'memory',
      label: 'Hindsight recall',
      status,
      detail: memory.status === 'OK' ? `${memory.memories.length} relevant ${memory.memories.length === 1 ? 'memory' : 'memories'} found` : memory.status === 'EMPTY' ? 'No relevant memories yet' : (memory.notice || 'Memory unavailable'),
      memories: memory.memories.map((m) => ({ id: m.id, text: m.text, category: m.category, localDate: m.localDate, whyRecalled: m.whyRecalled })),
      queries: (memory.recalls || []).map((r) => r.query),
      ms: Date.now() - started
    });
    return memory;
  }

  // ── intents ────────────────────────────────────────────────────────────────
  async analyzeDrop(ctx, trace, question, target, intent) {
    const t = await this.resolveTarget(ctx, target);
    if (t.error) { trace.add({ id: 'period', label: 'Relevant period', status: 'failed', detail: t.error }); return emptyAnswer(t.error); }
    trace.add({ id: 'period', label: 'Relevant period identified', detail: `${dates.pretty(t.date)} (${t.reason})` });

    if (ctx.mode === 'current_only') {
      const current = await earnings.findSession(ctx.worker.id, { sessionId: t.sessionId });
      ctx.toolCalls.push({ tool: 'get_recent_earnings', input: { days: 1 }, ok: true });
      trace.add({ id: 'current', label: 'Current earnings loaded', detail: `${inr(current.net)} · ${current.orders} orders` });
      const r = reasonAboutSession({ analysis: { current, platformEvents: [], comparables: [] }, memory: null, useHistory: false, useMemory: false, worker: ctx.worker });
      trace.add({ id: 'history', label: 'Personal history', status: 'skipped', detail: 'Not used: this run only sees the current session.' });
      await this.recallContext(ctx, trace, question, null);
      return { ...r, evidence: buildEvidence({ analysis: { current, baseline: emptyBaseline(), comparables: [], platformEvents: [] }, memory: null, previousCases: [] }).slice(0, 1), comparableSessions: [], memory: { status: 'NOT_USED' }, llmEligible: false };
    }

    const recent = await this.registry.execute(ctx, 'get_recent_earnings', { days: 7 });
    trace.add({ id: 'current', label: 'Current earnings loaded', detail: `${recent.sessions.length} sessions in the last 7 days · ${inr(recent.totals.net)} net` });
    const a = await this.registry.execute(ctx, 'get_comparable_sessions', { sessionId: t.sessionId });
    const analysis = { ...a, platformEvents: [] };
    trace.add({ id: 'baseline', label: 'Personal baseline calculated', detail: a.baseline.sampleSize >= 3 ? `${a.baseline.label}: median ${inr(a.baseline.net.median)} from ${a.baseline.sampleSize} sessions` : `Only ${a.baseline.sampleSize} comparable sessions — baseline not reliable yet`, status: a.baseline.sampleSize >= 3 ? 'done' : 'empty' });
    trace.add({ id: 'comparables', label: 'Comparable shifts found', detail: `${a.comparables.length} comparable ${a.comparables.length === 1 ? 'shift' : 'shifts'}`, status: a.comparables.length ? 'done' : 'empty' });
    const events = await this.registry.execute(ctx, 'get_platform_events', { from: dates.addDays(a.current.date, -10), to: a.current.date });
    analysis.platformEvents = events.map((e) => ({ id: e.id, localDate: e.date, type: e.type, title: e.title, description: e.description, source: e.source }));
    trace.add({ id: 'events', label: 'Platform & incentive records checked', detail: events.length ? `${events.length} platform ${events.length === 1 ? 'event' : 'events'} in the 10 days before the shift` : 'No platform events near this shift', status: events.length ? 'done' : 'empty' });
    const cases = await this.registry.execute(ctx, 'get_previous_investigations', {});
    const previousCases = cases.filter((c) => c.periodStart < a.current.date);
    trace.add({ id: 'cases', label: 'Previous investigations loaded', detail: `${previousCases.length} earlier ${previousCases.length === 1 ? 'case' : 'cases'} in PostgreSQL` , status: previousCases.length ? 'done' : 'empty' });

    const evaluationForSituation = { ...analysis, evaluation: a.evaluation };
    const memory = await this.recallContext(ctx, trace, question, situationText(evaluationForSituation), { segmentKey: a.current.segmentKey });
    const r = reasonAboutSession({ analysis, memory, previousCases, worker: ctx.worker, useMemory: !ctx.memoryDisabled });
    if (r.historicalContext.length) trace.add({ id: 'context', kind: 'memory', label: 'Historical context added', detail: r.usedPreviousOutcome ? 'A previous investigation outcome changed what to check first' : `${r.historicalContext.length} memories considered` });
    trace.add({ id: 'reason', kind: 'reasoning', label: 'Evidence analysed', detail: `${r.facts.length} facts · ${r.inferences.length} inferences · ${r.unknowns.length} unknowns` });

    const offer = await this.investigationOffer(ctx, a, r);
    const focus = intent === 'FACTOR' && a.evaluation.decomposition
      ? `Largest factor: ${(a.evaluation.decomposition.parts.find((p) => p.key === a.evaluation.decomposition.primaryFactor)?.label || 'no single dominant factor').toLowerCase()}.`
      : null;
    return {
      ...r,
      summary: focus ? `${focus} ${r.summary}` : r.summary,
      evidence: buildEvidence({ analysis, memory, previousCases: previousCases.filter((c) => c.status === 'RESOLVED') }),
      comparableSessions: a.comparables,
      metrics: { current: a.current, baseline: pickBaseline(a.baseline), evaluation: { severity: a.evaluation.severity, deviationPct: a.evaluation.deviationPct, decomposition: a.evaluation.decomposition } },
      offer,
      memory: { status: memory.status, notice: memory.notice || null, recalledCount: memory.memories.length },
      llmEligible: true
    };
  }

  async investigationOffer(ctx, a, r) {
    const anomaly = await prisma.anomaly.findUnique({ where: { sessionId: a.current.sessionId } });
    const existing = await prisma.investigation.findFirst({ where: { workerId: ctx.worker.id, OR: [{ anomalyId: anomaly?.id || '__none__' }, { periodStart: a.current.date }] } });
    if (existing) return { type: 'OPEN_INVESTIGATION', investigationId: existing.id, caseNumber: existing.caseNumber, label: `Open ${existing.caseNumber}` };
    if (['SIGNIFICANT_CHANGE', 'INVESTIGATION_RECOMMENDED'].includes(r.severity) && r.primaryFactor !== 'order_volume') {
      return { type: 'CREATE_INVESTIGATION', sessionId: a.current.sessionId, anomalyId: anomaly?.id || null, label: 'Create investigation' };
    }
    return null;
  }

  async normalEarnings(ctx, trace, question, target) {
    const dow = target.dayOfWeek ?? null;
    const input = {};
    if (dow !== null) input.dayOfWeek = dow;
    if (target.timeWindow) input.timeWindow = target.timeWindow;
    const res = await this.registry.execute(ctx, 'get_earnings_baseline', input);
    const segs = res.segments.filter((s) => s.sampleSize >= 2);
    trace.add({ id: 'baseline', label: 'Personal baseline calculated', detail: segs.length ? segs.map((s) => `${s.label}: ${s.sampleSize} sessions`).join(' · ') : 'No matching sessions', status: segs.length ? 'done' : 'empty' });
    const main = segs[0];
    const memory = ctx.mode === 'current_only' ? { status: 'NOT_USED', memories: [] } : await this.recallContext(ctx, trace, question, null, main && dow !== null ? { segmentKey: main.segmentKey } : null);
    if (!segs.length) return { ...emptyAnswer('I do not have enough recorded shifts matching that description yet.'), memory: { status: memory.status } };
    const facts = segs.slice(0, 3).map((s) => ({
      text: `${s.label}: ${inr(s.net.min)}–${inr(s.net.max)} net (median ${inr(s.net.median)}) across ${s.sampleSize} sessions in the last 8 weeks, with ${s.orders.min}–${s.orders.max} orders.${s.incentivePrograms.length ? ` ${s.incentivePrograms[0]} was paid on ${pct(s.incentiveHitRate)} of these sessions (typically ${inr(s.incentive.median)}).` : ''}`,
      evidence: [`baseline:${s.segmentKey}`]
    }));
    const hc = memory.memories.map((m) => ({ memoryId: m.id, text: m.text, category: m.category, localDate: m.localDate, whyRecalled: m.whyRecalled }));
    const learned = memory.memories.find((m) => m.category === 'earnings_pattern');
    return {
      summary: `You normally earn ${inr(main.net.min)}–${inr(main.net.max)} (median ${inr(main.net.median)}) on ${main.label} shifts, based on ${main.sampleSize} recent sessions without flagged anomalies.`,
      facts,
      inferences: learned ? [{ text: 'This matches the earnings pattern I learned and retained in memory for you.', confidence: 'HIGH', basis: 'Hindsight memory (earnings_pattern) agrees with the structured baseline' }] : [],
      unknowns: [],
      historicalContext: hc,
      recommendedActions: [],
      evidence: segs.slice(0, 3).map((s) => ({ id: `baseline:${s.segmentKey}`, type: 'BASELINE', label: `Personal baseline · ${s.label}`, detail: `Recent: ${s.recent.map((r) => `${dates.short(r.date)} ${inr(r.net)}`).join(', ')}`, source: 'Computed by analytics engine' })),
      baselines: segs.slice(0, 3).map(pickBaseline),
      memory: { status: memory.status, notice: memory.notice || null, recalledCount: memory.memories.length },
      llmEligible: true
    };
  }

  async history(ctx, trace, question) {
    const cases = await this.registry.execute(ctx, 'get_previous_investigations', {});
    trace.add({ id: 'cases', label: 'Previous investigations loaded', detail: `${cases.length} ${cases.length === 1 ? 'case' : 'cases'} in PostgreSQL`, status: cases.length ? 'done' : 'empty' });
    let memory = { status: 'DISABLED', memories: [] };
    if (!ctx.memoryDisabled) {
      const started = Date.now();
      memory = await this.hindsight.recallSimilarCases({ workerId: ctx.worker.id, situation: `${question} previous earnings drop, investigation outcome and learning`, asOf: ctx.asOf, limit: 6 });
      ctx.toolCalls.push({ tool: 'recall_hindsight_memory', input: { query: memory.query, categories: CASE_CATEGORIES }, ok: !['UNAVAILABLE', 'FAILED'].includes(memory.status), ms: memory.latencyMs });
      trace.add({ id: 'memory', kind: 'memory', label: 'Hindsight recall', status: memory.status === 'OK' ? 'done' : memory.status === 'EMPTY' ? 'empty' : 'unavailable', detail: memory.status === 'OK' ? `${memory.memories.length} previous experiences recalled` : memory.notice || 'No previous experiences in memory yet', memories: memory.memories.map((m) => ({ id: m.id, text: m.text, category: m.category, localDate: m.localDate, whyRecalled: 'Matched previous cases and outcomes' })), queries: [memory.query], ms: Date.now() - started });
    } else {
      trace.add({ id: 'memory', kind: 'memory', label: 'Hindsight recall', status: 'skipped', detail: 'Disabled for this run' });
    }
    const resolved = cases.filter((c) => c.status === 'RESOLVED');
    const facts = cases.map((c) => ({ text: `${c.caseNumber} · ${dates.pretty(c.periodStart)} · ${c.title} — status ${c.status.replace(/_/g, ' ').toLowerCase()}.${c.result ? ` Outcome: ${c.result}` : ''}`, evidence: [`investigation:${c.id}`] }));
    const hc = memory.memories.map((m) => ({ memoryId: m.id, text: m.text, category: m.category, localDate: m.localDate, whyRecalled: 'Matched previous cases and outcomes' }));
    const anomalies = memory.memories.filter((m) => m.category === 'historical_anomaly');
    let summary;
    if (resolved.length) {
      const c = resolved[0];
      summary = `Yes. Your most recent resolved case, ${c.caseNumber} (${dates.pretty(c.periodStart)}), found: ${c.result}${c.learning ? ` What we learned: ${c.learning}` : ''}`;
    } else if (cases.length) {
      summary = `You have ${cases.length} open ${cases.length === 1 ? 'investigation' : 'investigations'} but none has been resolved yet.`;
    } else if (anomalies.length) {
      summary = `I remember ${anomalies.length} significant earnings ${anomalies.length === 1 ? 'change' : 'changes'} in your history, but no investigation has been opened yet.`;
    } else {
      summary = 'I do not have any previous similar experiences recorded for you yet.';
    }
    return {
      summary,
      facts,
      inferences: resolved.some((c) => c.learning) ? [{ text: `Learning to apply next time: ${resolved.find((c) => c.learning).learning}`, confidence: 'HIGH', basis: 'Recorded outcome of a previous investigation' }] : [],
      unknowns: [],
      historicalContext: hc,
      recommendedActions: [],
      evidence: cases.map((c) => ({ id: `investigation:${c.id}`, type: 'PREVIOUS_INVESTIGATION', label: `${c.caseNumber} · ${dates.pretty(c.periodStart)}`, detail: c.result || c.summary || c.title, source: 'PostgreSQL' })),
      previousCases: cases,
      memory: { status: memory.status, notice: memory.notice || null, recalledCount: memory.memories.length },
      llmEligible: true
    };
  }

  async comparable(ctx, trace, target) {
    const t = await this.resolveTarget(ctx, target);
    if (t.error) return emptyAnswer(t.error);
    const a = await this.registry.execute(ctx, 'get_comparable_sessions', { sessionId: t.sessionId });
    trace.add({ id: 'comparables', label: 'Comparable shifts found', detail: `${a.comparables.length} shifts comparable to ${dates.pretty(a.current.date)}`, status: a.comparables.length ? 'done' : 'empty' });
    const s = a.comparableSummary;
    return {
      summary: s ? `For ${dates.pretty(a.current.date)} (${a.current.dayName} ${a.current.window}, ${inr(a.current.net)}), I found ${s.count} comparable shifts averaging ${inr(s.avgNet)} with ${round(s.avgOrders, 1)} orders.` : 'I could not find comparable shifts for that session yet.',
      facts: a.comparables.map((c) => ({ text: `${dates.pretty(c.date)} ${c.window}: ${c.orders} orders, ${inr(c.net)} net, incentive ${inr(c.incentive)} (${c.reasons.join(', ')}).`, evidence: [`comparable:${c.sessionId}`] })),
      inferences: [],
      unknowns: [],
      historicalContext: [],
      recommendedActions: [],
      evidence: [],
      comparableSessions: a.comparables,
      metrics: { current: a.current, baseline: pickBaseline(a.baseline) },
      memory: { status: 'NOT_USED' },
      llmEligible: false
    };
  }

  async createInvestigation(ctx, trace, question, target) {
    const t = await this.resolveTarget(ctx, target);
    if (t.error) return emptyAnswer(t.error);
    const res = await this.registry.execute(ctx, 'create_investigation', { sessionId: t.sessionId });
    trace.add({ id: 'investigation', kind: 'action', label: res.created ? 'Investigation created' : 'Existing investigation found', detail: `${res.caseNumber} · ${res.title}` });
    return {
      summary: res.created ? `I opened investigation ${res.caseNumber} for ${dates.pretty(t.date)}. It contains the evidence, comparable shifts, recalled memories and open questions.` : `Investigation ${res.caseNumber} already exists for ${dates.pretty(t.date)}.`,
      facts: [], inferences: [], unknowns: [], historicalContext: [], recommendedActions: [{ text: 'Open the Investigation Workspace to review evidence and generate a report.' }], evidence: [],
      offer: { type: 'OPEN_INVESTIGATION', investigationId: res.id, caseNumber: res.caseNumber, label: `Open ${res.caseNumber}` },
      memory: { status: 'NOT_USED' },
      llmEligible: false
    };
  }

  async incentives(ctx, trace) {
    const rows = await this.registry.execute(ctx, 'get_incentive_history', { days: 60 });
    trace.add({ id: 'incentives', label: 'Incentive history loaded', detail: `${rows.length} sessions with an incentive programme` });
    const missed = rows.filter((r) => !r.eligible);
    return {
      summary: `In the last 60 days you had ${rows.length} shifts with an incentive programme; the incentive was not paid on ${missed.length} of them.`,
      facts: missed.map((r) => ({ text: `${dates.pretty(r.date)}: ${r.program} not paid (${r.note || 'no reason given'}); ${r.orders} orders, acceptance ${r.acceptanceRate}%.`, evidence: [] })),
      inferences: [], unknowns: [], historicalContext: [], recommendedActions: [], evidence: [], memory: { status: 'NOT_USED' }, llmEligible: false
    };
  }

  async deductions(ctx, trace) {
    const rows = await this.registry.execute(ctx, 'get_deduction_history', { days: 60 });
    trace.add({ id: 'deductions', label: 'Deduction history loaded', detail: `${rows.length} sessions` });
    const total = rows.reduce((a, r) => a + r.total, 0);
    const unusual = rows.filter((r) => r.items.length > 1 || r.total > 15);
    return {
      summary: `Deductions over the last 60 days totalled ${inr(total)} across ${rows.length} sessions${unusual.length ? `; ${unusual.length} sessions had more than the standard fee` : ', all at the standard per-session fee'}.`,
      facts: unusual.map((r) => ({ text: `${dates.pretty(r.date)}: ${inr(r.total)} (${r.items.map((i) => `${i.label} ${inr(i.amount)}`).join(', ')})`, evidence: [] })),
      inferences: [], unknowns: [], historicalContext: [], recommendedActions: [], evidence: [], memory: { status: 'NOT_USED' }, llmEligible: false
    };
  }

  async general(ctx, trace, question) {
    const recent = await this.registry.execute(ctx, 'get_recent_earnings', { days: 7 });
    trace.add({ id: 'current', label: 'Current earnings loaded', detail: `${recent.sessions.length} sessions in the last 7 days` });
    const memory = ctx.mode === 'current_only' ? { status: 'NOT_USED', memories: [] } : await this.recallContext(ctx, trace, question, null);
    return {
      summary: `In the 7 days to ${dates.pretty(ctx.asOf)} you worked ${recent.sessions.length} sessions and earned ${inr(recent.totals.net)} net from ${recent.totals.orders} orders. Ask me why earnings changed, what is normal for a shift, or whether something happened before.`,
      facts: recent.sessions.map((s) => ({ text: `${dates.pretty(s.date)} ${s.window}: ${s.orders} orders, ${inr(s.net)} net.`, evidence: [`session:${s.sessionId}`] })),
      inferences: [],
      unknowns: [],
      historicalContext: memory.memories.map((m) => ({ memoryId: m.id, text: m.text, category: m.category, localDate: m.localDate, whyRecalled: m.whyRecalled })),
      recommendedActions: [],
      evidence: [],
      memory: { status: memory.status, notice: memory.notice || null, recalledCount: memory.memories.length },
      llmEligible: true
    };
  }

  // ── optional LLM interpretation ────────────────────────────────────────────
  async llmInterpret(ctx, trace, question, intent, target, deterministic) {
    const started = Date.now();
    const tools = this.registry.list({ autonomousOnly: true }).filter((t) => LLM_READONLY_TOOLS.includes(t.name));
    const outputs = [];
    try {
      const conv = llm.startConversation(this.llmConfig, { system: SYSTEM_PROMPT, user: userMessage({ question, worker: ctx.worker, asOf: ctx.asOf, intent, target }), tools });
      for (let round = 0; round < this.llmConfig.maxToolRounds; round += 1) {
        const res = await conv.next();
        if (res.toolCalls.length) {
          const results = [];
          for (const call of res.toolCalls) {
            try {
              if (call.input?.__malformed) throw Object.assign(new Error('Malformed tool arguments'), { statusCode: 400 });
              const out = await this.registry.execute(ctx, call.name, call.input);
              const json = JSON.stringify(out).slice(0, 12000);
              outputs.push(json);
              results.push({ id: call.id, content: json });
            } catch (err) {
              results.push({ id: call.id, content: JSON.stringify({ error: err.statusCode ? err.message : 'tool failed', details: err.details || null }), isError: true });
            }
          }
          conv.addToolResults(results);
          continue;
        }
        const parsed = llm.extractJson(res.text);
        const candidate = parsed && {
          ...deterministic,
          summary: parsed.summary,
          facts: Array.isArray(parsed.facts) ? parsed.facts : [],
          inferences: Array.isArray(parsed.inferences) ? parsed.inferences : [],
          unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns : [],
          historicalContext: Array.isArray(parsed.historicalContext) && parsed.historicalContext.length ? parsed.historicalContext : deterministic.historicalContext,
          recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : deterministic.recommendedActions
        };
        const errors = candidate ? validateAgentAnswer(candidate) : ['model did not return JSON'];
        const grounding = [...outputs, JSON.stringify(deterministic.metrics || {}), JSON.stringify(deterministic.evidence || [])].join(' ');
        const ungrounded = candidate ? ungroundedFigures(candidate, grounding) : [];
        if (errors.length || ungrounded.length) {
          trace.add({ id: 'llm', kind: 'reasoning', label: 'LLM interpretation rejected', status: 'failed', detail: errors.length ? `Invalid output: ${errors[0]}` : `Ungrounded figures: ${ungrounded.slice(0, 3).join(', ')} — using deterministic answer`, ms: Date.now() - started });
          return null;
        }
        trace.add({ id: 'llm', kind: 'reasoning', label: 'LLM interpretation validated', detail: `${outputs.length} tool results · all figures grounded`, ms: Date.now() - started });
        return candidate;
      }
      trace.add({ id: 'llm', kind: 'reasoning', label: 'LLM interpretation stopped', status: 'failed', detail: 'Too many tool rounds — using deterministic answer' });
      return null;
    } catch (err) {
      logger.warn('AGENT', `LLM interpretation failed: ${err.message}`);
      trace.add({ id: 'llm', kind: 'reasoning', label: 'LLM unavailable', status: 'failed', detail: err.name === 'TimeoutError' ? 'LLM timed out — using deterministic answer' : 'LLM request failed — using deterministic answer', ms: Date.now() - started });
      return null;
    }
  }
}

const emptyBaseline = () => ({ sampleSize: 0, label: 'n/a', net: { median: 0, min: 0, max: 0 }, orders: { min: 0, max: 0 } });

const pickBaseline = (b) => b && ({
  label: b.label,
  segmentKey: b.segmentKey,
  sampleSize: b.sampleSize,
  windowStart: b.windowStart,
  windowEnd: b.windowEnd,
  net: b.net,
  orders: b.orders,
  incentive: b.incentive,
  deductions: b.deductions,
  perHour: b.perHour,
  perOrder: b.perOrder,
  incentiveHitRate: b.incentiveHitRate,
  incentivePrograms: b.incentivePrograms,
  segmentLabel: b.segmentKey ? segmentLabel(b.segmentKey) : null
});

const emptyAnswer = (message) => ({
  summary: message,
  facts: [],
  inferences: [],
  unknowns: [],
  historicalContext: [],
  recommendedActions: [],
  evidence: [],
  memory: { status: 'NOT_USED' },
  llmEligible: false
});

let singleton = null;
const getOrchestrator = () => {
  if (!singleton) singleton = new AgentOrchestrator();
  return singleton;
};

module.exports = { AgentOrchestrator, getOrchestrator, MODES };
