// HindsightService — the ONLY module that talks to Hindsight.
//
//   Application → HindsightService → @vectorize-io/hindsight-client → Hindsight API
//
// Responsibilities
//  • one Hindsight memory bank per worker (bank id derived server-side from the
//    authenticated worker profile id — never from client input)
//  • retain meaningful memories with category tags, metadata and a stable
//    document id (re-retaining the same document replaces it in Hindsight)
//  • skip identical re-retains (content hash) so UI refreshes never duplicate memory
//  • recall with timeouts; failures degrade to "memory unavailable", never crash
//  • write an audit row (MemoryEvent) for every operation, and log
//    [HINDSIGHT] RETAIN / RECALL lines for demo observability (no secrets)

const crypto = require('crypto');
const { HindsightClient } = require('@vectorize-io/hindsight-client');
const env = require('../../config/env');
const defaultPrisma = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { CATEGORIES, CASE_CATEGORIES, isCategory, tagFor, categoryFromTags } = require('./categories');

const UNAVAILABLE_NOTICE = 'Historical agent memory is temporarily unavailable. The current analysis is based on structured records only.';

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

const isUnavailableError = (err) => {
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  const code = err.statusCode;
  if (code && (code >= 500 || code === 429)) return true;
  const msg = `${err.message || ''} ${err.cause?.code || ''}`;
  return /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|socket hang up|timeout/i.test(msg);
};

const isBankMissing = (err) => err && (err.statusCode === 404 || /not found/i.test(err.message || ''));

class HindsightService {
  constructor({ client, config = env.hindsight, prisma = defaultPrisma, log = logger } = {}) {
    this.config = config;
    this.prisma = prisma;
    this.log = log;
    this.client = client || (config.enabled
      ? new HindsightClient({ baseUrl: config.url, apiKey: config.apiKey, userAgent: 'elitesuraksha/2.0', maxAttempts: 2 })
      : null);
    this.knownBanks = new Set();
    this.statusCache = null;
    this.bankQueues = new Map();
  }

  // Writes to one bank are serialised: concurrent retains into the same bank can
  // contend on Hindsight's entity/temporal link tables.
  enqueue(bankId, fn) {
    const prev = this.bankQueues.get(bankId) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.bankQueues.set(bankId, next.catch(() => {}));
    return next;
  }

  // ── identity ──────────────────────────────────────────────────────────────
  bankIdFor(workerId) {
    if (!workerId || typeof workerId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(workerId)) {
      throw new Error('bankIdFor requires a server-resolved worker id');
    }
    return `${this.config.bankPrefix}${workerId}`;
  }

  isEnabled() {
    return Boolean(this.config.enabled && this.client);
  }

  // ── status ────────────────────────────────────────────────────────────────
  async status({ fresh = false } = {}) {
    if (!this.isEnabled()) {
      return { configured: false, connected: false, label: 'Hindsight disabled', detail: 'HINDSIGHT_ENABLED is false.' };
    }
    if (!fresh && this.statusCache && Date.now() - this.statusCache.at < 15000) return this.statusCache.value;
    let value;
    try {
      const v = await this.client.getVersion({ signal: AbortSignal.timeout(4000) });
      value = { configured: true, connected: true, label: 'Hindsight Memory · Connected', version: v.api_version, endpoint: this.safeEndpoint() };
    } catch (err) {
      value = { configured: true, connected: false, label: 'Hindsight Memory · Unavailable', detail: UNAVAILABLE_NOTICE, endpoint: this.safeEndpoint() };
    }
    this.statusCache = { at: Date.now(), value };
    return value;
  }

  safeEndpoint() {
    try {
      const u = new URL(this.config.url);
      return `${u.protocol}//${u.host}`;
    } catch {
      return 'configured';
    }
  }

  // ── bank management ───────────────────────────────────────────────────────
  async ensureBank(workerId) {
    const bankId = this.bankIdFor(workerId);
    if (this.knownBanks.has(bankId)) return bankId;
    await this.client.createBank(bankId, {
      reflectMission: 'Persistent memory for a gig-worker earnings investigation agent. Help the worker understand earnings changes using their own history.',
      retainMission: 'Extract durable facts about this gig worker: work patterns, normal earnings under comparable conditions, significant earnings changes, investigation findings, investigation outcomes and lessons learned, platform notices, and the worker\'s stated preferences. Keep amounts (₹), percentages, dates, shift windows, zones and incentive programme names exact. Do not invent causes.',
      retainExtractionMode: this.config.retainExtractionMode,
      enableObservations: true,
      signal: AbortSignal.timeout(15000)
    });
    this.knownBanks.add(bankId);
    return bankId;
  }

  async deleteWorkerBank(workerId, { reason = 'Demo reset' } = {}) {
    const bankId = this.bankIdFor(workerId);
    this.knownBanks.delete(bankId);
    if (!this.isEnabled()) return { status: 'DISABLED' };
    const started = Date.now();
    let status = 'OK';
    let error = null;
    try {
      await this.client.deleteBank(bankId, { signal: AbortSignal.timeout(30000) });
    } catch (err) {
      if (!isBankMissing(err) && !/404|not found/i.test(err.message || '')) {
        status = isUnavailableError(err) ? 'UNAVAILABLE' : 'FAILED';
        error = err.message;
      }
    }
    this.logOp('DELETE_BANK', workerId, `reason="${reason}" status=${status}`);
    await this.audit({ workerId, bankId, operation: 'DELETE_BANK', status, reason, error, latencyMs: Date.now() - started });
    return { status, error };
  }

  // ── retain ────────────────────────────────────────────────────────────────
  /**
   * Retain one meaningful memory for a worker.
   * @param {object} p
   * @param {string} p.workerId        server-resolved worker profile id
   * @param {string} p.category        one of CATEGORIES
   * @param {string} p.content         natural-language memory (facts only)
   * @param {string} p.documentId      stable id; re-retaining replaces the Hindsight document
   * @param {string} p.localDate       the date the memory is about (YYYY-MM-DD)
   * @param {string} p.reason          why the application is retaining this (audit / inspector)
   * @param {object} [p.metadata]      extra string metadata
   */
  async retainMemory({ workerId, category, content, documentId, localDate, reason, metadata = {}, investigationId = null, context = null }) {
    if (!isCategory(category)) throw new Error(`Unknown memory category: ${category}`);
    if (!content || !documentId) throw new Error('retainMemory requires content and documentId');
    const bankId = this.bankIdFor(workerId);
    const contentHash = hash(`${category}|${content}`);
    const base = { workerId, bankId, operation: 'RETAIN', category, documentId, contentHash, contentPreview: content.slice(0, 600), reason, investigationId, localDate };

    if (!this.isEnabled()) {
      await this.audit({ ...base, status: 'DISABLED' });
      return { status: 'DISABLED', documentId };
    }

    const previous = await this.prisma.memoryEvent.findFirst({
      where: { workerId, operation: 'RETAIN', documentId, status: 'OK' },
      orderBy: { createdAt: 'desc' }
    });
    if (previous && previous.contentHash === contentHash) {
      this.logOp('RETAIN', workerId, `category=${category} doc=${documentId} (duplicate skipped)`);
      await this.audit({ ...base, status: 'DUPLICATE_SKIPPED' });
      return { status: 'DUPLICATE_SKIPPED', documentId };
    }

    const started = Date.now();
    const attempt = () => this.client.retain(bankId, content, {
      documentId,
      timestamp: localDate ? new Date(`${localDate}T12:00:00+05:30`) : new Date(),
      context: context || CATEGORIES[category],
      tags: [tagFor(category)],
      metadata: { app: 'elitesuraksha', category, localDate: localDate || '', ...stringify(metadata) },
      updateMode: 'replace',
      signal: AbortSignal.timeout(this.config.retainTimeoutMs)
    });
    try {
      const res = await this.enqueue(bankId, async () => {
        await this.ensureBank(workerId);
        try {
          return await attempt();
        } catch (err) {
          // One retry for transient server errors; safe because the document id makes retain idempotent.
          if (err.statusCode && err.statusCode >= 500) return attempt();
          throw err;
        }
      });
      const latencyMs = Date.now() - started;
      this.logOp('RETAIN', workerId, `category=${category} doc=${documentId} items=${res.items_count} ${latencyMs}ms`);
      await this.audit({ ...base, status: 'OK', latencyMs, resultCount: res.items_count });
      return { status: 'OK', documentId, latencyMs };
    } catch (err) {
      const status = isUnavailableError(err) && !(err.statusCode >= 500) ? 'UNAVAILABLE' : 'FAILED';
      this.log.warn('HINDSIGHT', `RETAIN failed worker=${workerId} category=${category}: ${err.message}`);
      await this.audit({ ...base, status, error: String(err.message || err).slice(0, 500), latencyMs: Date.now() - started });
      return { status, documentId, error: status === 'UNAVAILABLE' ? UNAVAILABLE_NOTICE : 'Memory could not be saved. It can be retried.' };
    }
  }

  // Named contract methods (see docs/HINDSIGHT.md).
  retainWorkerMemory(input) {
    return this.retainMemory(input);
  }

  retainInvestigationOutcome({ workerId, investigation, outcome, anomaly }) {
    const lines = [
      `Investigation ${investigation.caseNumber} (${investigation.periodStart}) was resolved on ${outcome.resolvedLocalDate}.`,
      `Situation: ${investigation.summary || investigation.title}`,
      anomaly ? `Observed: ${anomaly.explanation}` : null,
      `Outcome: ${outcome.result}`,
      `Root cause category: ${outcome.rootCauseCategory.replace(/_/g, ' ').toLowerCase()}.`,
      `Action taken: ${outcome.actionTaken}`,
      outcome.learning ? `Learning for future investigations: ${outcome.learning}` : null
    ].filter(Boolean);
    return this.retainMemory({
      workerId,
      category: 'investigation_outcome',
      content: lines.join('\n'),
      documentId: `outcome:${investigation.id}`,
      localDate: outcome.resolvedLocalDate,
      reason: `Investigation ${investigation.caseNumber} was resolved; its outcome and learning are retained so future investigations can use them.`,
      metadata: { investigationId: investigation.id, caseNumber: investigation.caseNumber, rootCause: outcome.rootCauseCategory },
      investigationId: investigation.id
    });
  }

  // ── recall ────────────────────────────────────────────────────────────────
  /**
   * Recall memories for a worker. Never throws for availability problems.
   * @returns {Promise<{status, memories, query, latencyMs, notice?}>}
   */
  async recallMemory({ workerId, query, categories = null, limit = 8, reason, asOf = null, interactionId = null, investigationId = null, strict = false }) {
    const bankId = this.bankIdFor(workerId);
    const base = { workerId, bankId, operation: 'RECALL', query, reason, interactionId, investigationId, localDate: asOf, category: categories ? categories.join(',') : null };
    if (!this.isEnabled()) {
      await this.audit({ ...base, status: 'DISABLED', resultCount: 0 });
      return { status: 'DISABLED', memories: [], query, notice: 'Hindsight memory is disabled in this environment.' };
    }
    const started = Date.now();
    try {
      const res = await this.client.recall(bankId, query, {
        budget: this.config.recallBudget,
        maxTokens: 2048,
        types: ['world', 'experience', 'observation'],
        preferObservations: false,
        ...(categories ? { tags: categories.map(tagFor), tagsMatch: strict ? 'any_strict' : 'any' } : {}),
        signal: AbortSignal.timeout(this.config.recallTimeoutMs)
      });
      const latencyMs = Date.now() - started;
      let memories = (res.results || []).map((r, i) => normalizeRecall(r, i));
      if (asOf) memories = memories.filter((m) => !m.localDate || m.localDate <= asOf);
      memories = dedupe(groupByDocument(memories)).slice(0, limit);
      const status = memories.length ? 'OK' : 'EMPTY';
      this.logOp('RECALL', workerId, `query="${truncate(query, 80)}"${categories ? ` categories=${categories.join(',')}` : ''} results=${memories.length} ${latencyMs}ms`);
      await this.audit({ ...base, status, resultCount: memories.length, latencyMs, results: memories.map((m) => ({ id: m.id, text: truncate(m.text, 240), category: m.category, type: m.type })) });
      return { status, memories, query, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      if (isBankMissing(err) && !isUnavailableError(err)) {
        this.logOp('RECALL', workerId, `query="${truncate(query, 80)}" results=0 (no memory bank yet)`);
        await this.audit({ ...base, status: 'EMPTY', resultCount: 0, latencyMs });
        return { status: 'EMPTY', memories: [], query, latencyMs };
      }
      const status = isUnavailableError(err) ? 'UNAVAILABLE' : 'FAILED';
      this.log.warn('HINDSIGHT', `RECALL failed worker=${workerId}: ${err.message}`);
      await this.audit({ ...base, status, error: String(err.message || err).slice(0, 500), latencyMs, resultCount: 0 });
      return { status, memories: [], query, latencyMs, notice: UNAVAILABLE_NOTICE };
    }
  }

  recallWorkerMemory(input) {
    return this.recallMemory(input);
  }

  /** Previous situations, findings and outcomes similar to the current one. */
  recallSimilarCases({ workerId, situation, ...rest }) {
    return this.recallMemory({
      workerId,
      query: situation,
      categories: [...CASE_CATEGORIES, 'platform_context'],
      strict: true,
      reason: rest.reason || 'Looking for previous similar earnings situations and how they were resolved',
      ...rest
    });
  }

  recallSimilarExperience(input) {
    return this.recallSimilarCases(input);
  }

  /**
   * Build the memory context handed to the agent: general worker context +
   * similar previous cases, merged, de-duplicated and ranked.
   */
  async getWorkerMemoryContext({ workerId, question, situation = null, asOf = null, interactionId = null, investigationId = null, limit = 6, focus = null }) {
    const general = await this.recallMemory({
      workerId,
      query: question,
      asOf,
      interactionId,
      investigationId,
      limit: 12,
      reason: 'Recalling the worker\'s patterns, preferences and history relevant to the question'
    });
    if (general.status === 'UNAVAILABLE' || general.status === 'DISABLED' || general.status === 'FAILED') {
      return { status: general.status, memories: [], recalls: [general], notice: general.notice || UNAVAILABLE_NOTICE };
    }
    const recalls = [general];
    let cases = { memories: [] };
    if (situation) {
      cases = await this.recallSimilarCases({ workerId, situation, asOf, interactionId, investigationId, limit: 6 });
      recalls.push(cases);
    }
    const tagged = [
      ...cases.memories.map((m) => ({ ...m, recalledBy: 'similar_case', whyRecalled: `Matched the current situation ("${truncate(situation, 90)}") among previous cases` })),
      ...general.memories.map((m) => ({ ...m, recalledBy: 'question', whyRecalled: `Relevant to the question ("${truncate(question, 90)}")` }))
    ];
    const ranked = dedupe(tagged)
      // Deterministic relevance filter: a learned earnings pattern for a different
      // shift segment is not relevant to the session being investigated.
      .filter((m) => !(focus?.segmentKey && m.category === 'earnings_pattern' && m.metadata?.segmentKey && m.metadata.segmentKey !== focus.segmentKey))
      .map((m) => ({ ...m, priority: rankPriority(m, Boolean(situation)) + (focus?.segmentKey && m.metadata?.segmentKey === focus.segmentKey ? 2 : 0) }))
      .sort((a, b) => b.priority - a.priority || a.rank - b.rank)
      .slice(0, limit);
    return {
      status: ranked.length ? 'OK' : 'EMPTY',
      memories: ranked,
      recalls: recalls.map((r) => ({ query: r.query, status: r.status, count: r.memories.length, latencyMs: r.latencyMs }))
    };
  }

  buildMemoryContext(input) {
    return this.getWorkerMemoryContext(input);
  }

  /** Raw listing of what Hindsight holds for the worker (Memory Inspector). */
  async listWorkerMemories(workerId, { limit = 100, offset = 0, q } = {}) {
    if (!this.isEnabled()) return { status: 'DISABLED', items: [], total: 0 };
    const bankId = this.bankIdFor(workerId);
    try {
      const res = await this.client.listMemories(bankId, { limit, offset, q, signal: AbortSignal.timeout(this.config.recallTimeoutMs) });
      return {
        status: 'OK',
        total: res.total,
        items: (res.items || []).map((m) => ({
          id: m.id,
          text: stripMentioned(m.text),
          type: m.fact_type,
          category: m.metadata?.category || categoryFromTags(m.tags),
          documentId: m.document_id,
          localDate: m.metadata?.localDate || (m.mentioned_at ? m.mentioned_at.slice(0, 10) : null),
          mentionedAt: m.mentioned_at,
          tags: m.tags || [],
          sourceMemoryIds: m.source_memory_ids || [],
          updatedAt: m.updated_at
        }))
      };
    } catch (err) {
      if (isBankMissing(err) && !isUnavailableError(err)) return { status: 'EMPTY', items: [], total: 0 };
      return { status: isUnavailableError(err) ? 'UNAVAILABLE' : 'FAILED', items: [], total: 0, notice: UNAVAILABLE_NOTICE };
    }
  }

  // ── internals ─────────────────────────────────────────────────────────────
  logOp(op, workerId, detail) {
    if (this.config.logOperations) this.log.info('HINDSIGHT', `${op} worker=${workerId} ${detail}`);
  }

  async audit(row) {
    try {
      await this.prisma.memoryEvent.create({
        data: {
          workerId: row.workerId,
          bankId: row.bankId,
          operation: row.operation,
          status: row.status,
          category: row.category || null,
          documentId: row.documentId || null,
          query: row.query || null,
          contentHash: row.contentHash || null,
          contentPreview: row.contentPreview || null,
          localDate: row.localDate || null,
          reason: row.reason || 'unspecified',
          resultCount: row.resultCount ?? null,
          results: row.results || undefined,
          investigationId: row.investigationId || null,
          interactionId: row.interactionId || null,
          error: row.error || null,
          latencyMs: row.latencyMs ?? null
        }
      });
    } catch (err) {
      this.log.warn('HINDSIGHT', `audit write failed: ${err.message}`);
    }
  }
}

const stringify = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
const truncate = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
const stripMentioned = (t) => String(t || '').replace(/\s*\(mentioned_at=[^)]*\)\s*$/, '');

const normalizeRecall = (r, i) => ({
  id: r.id,
  text: stripMentioned(r.text),
  type: r.type || null,
  category: r.metadata?.category || categoryFromTags(r.tags) || (r.type === 'observation' ? 'observation' : null),
  documentId: r.document_id || null,
  localDate: r.metadata?.localDate || (r.mentioned_at ? r.mentioned_at.slice(0, 10) : null),
  occurredStart: r.occurred_start || null,
  mentionedAt: r.mentioned_at || null,
  tags: r.tags || [],
  metadata: r.metadata || {},
  score: r.scores?.final ?? null,
  rank: i
});

// Hindsight extracts several facts from one retained document; regroup them so the
// agent reasons over whole memories while keeping the individual fact ids.
const groupByDocument = (facts) => {
  const groups = new Map();
  for (const f of facts) {
    const gid = f.documentId || f.id;
    const g = groups.get(gid);
    if (!g) {
      groups.set(gid, { ...f, id: gid, factIds: [f.id], texts: [f.text] });
    } else {
      g.factIds.push(f.id);
      if (!g.texts.includes(f.text)) g.texts.push(f.text);
      g.rank = Math.min(g.rank, f.rank);
      g.score = Math.max(g.score ?? 0, f.score ?? 0) || g.score;
    }
  }
  return [...groups.values()].map(({ texts, ...g }) => ({ ...g, text: texts.join(' ') })).sort((a, b) => a.rank - b.rank);
};

// De-duplicate by id and by normalised text. When Hindsight returns both a raw fact and
// a consolidated observation with the same text, keep the raw fact (it carries the
// document id + metadata) and note that an observation exists.
const dedupe = (memories) => {
  const byText = new Map();
  const ids = new Set();
  const out = [];
  for (const m of memories) {
    if (ids.has(m.id)) continue;
    const textKey = m.text.toLowerCase().replace(/\W+/g, ' ').trim();
    const idx = byText.get(textKey);
    if (idx !== undefined) {
      const existing = out[idx];
      if (!existing.documentId && m.documentId) out[idx] = { ...m, rank: Math.min(m.rank, existing.rank), consolidated: true, recalledBy: existing.recalledBy || m.recalledBy, whyRecalled: existing.whyRecalled || m.whyRecalled };
      else existing.consolidated = existing.consolidated || m.type === 'observation';
      ids.add(m.id);
      continue;
    }
    ids.add(m.id);
    byText.set(textKey, out.length);
    out.push(m);
  }
  // Drop consolidated observations that merely restate part of a kept memory.
  const norm = (t) => t.toLowerCase().replace(/\W+/g, ' ').trim();
  return out.filter((m) => !(m.type === 'observation' && !m.documentId
    && out.some((o) => o !== m && o.documentId && norm(o.text).includes(norm(m.text)))));
};

const PRIORITY = { investigation_outcome: 6, investigation_finding: 5, historical_anomaly: 4, platform_context: 3, earnings_pattern: 3, worker_pattern: 2, worker_preference: 2, user_feedback: 2, observation: 2 };
const rankPriority = (m, isSituation) => (isSituation && m.recalledBy === 'similar_case' ? 2 : 0) + (PRIORITY[m.category] || 1);

// Singleton used by the app. Tests construct their own instances.
let singleton = null;
const getHindsightService = () => {
  if (!singleton) singleton = new HindsightService();
  return singleton;
};
const setHindsightService = (svc) => {
  singleton = svc;
};

module.exports = { HindsightService, getHindsightService, setHindsightService, UNAVAILABLE_NOTICE, isUnavailableError };
