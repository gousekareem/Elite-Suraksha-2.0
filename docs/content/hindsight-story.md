# Hindsight story (technical detail + real snippets)

## One service, one client
```js
// apps/api/src/services/memory/hindsight.service.js
this.client = new HindsightClient({ baseUrl: config.url, apiKey: config.apiKey, userAgent: 'elitesuraksha/2.0', maxAttempts: 2 });

bankIdFor(workerId) {
  if (!workerId || typeof workerId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(workerId)) {
    throw new Error('bankIdFor requires a server-resolved worker id');
  }
  return `${this.config.bankPrefix}${workerId}`;
}
```

## Retaining an investigation outcome
```js
// resolveInvestigation() → retainOutcome() → HindsightService.retainInvestigationOutcome()
return this.retainMemory({
  workerId,
  category: 'investigation_outcome',
  content: lines.join('\n'),            // situation, outcome, root cause, action, learning
  documentId: `outcome:${investigation.id}`,
  localDate: outcome.resolvedLocalDate,
  reason: `Investigation ${investigation.caseNumber} was resolved; its outcome and learning are retained so future investigations can use them.`,
  metadata: { investigationId: investigation.id, caseNumber: investigation.caseNumber, rootCause: outcome.rootCauseCategory }
});
```

## Recalling previous cases
```js
recallSimilarCases({ workerId, situation, ...rest }) {
  return this.recallMemory({
    workerId,
    query: situation,     // "Earnings decline of 22.8% on a Friday evening shift, with normal order volume, Evening Peak Bonus not paid, incentive eligibility…"
    categories: [...CASE_CATEGORIES, 'platform_context'],
    strict: true,         // tags_match: 'any_strict' — only tagged case memories
    ...rest
  });
}
```

## Using what was recalled
```js
// apps/api/src/services/agent/reasoning.js
const incentiveRootCause = m.metadata?.rootCause ? /INCENTIVE/.test(m.metadata.rootCause) : incentiveTerms.test(m.text);
if (!previousOutcomeUsed && m.category === 'investigation_outcome' && incentiveRootCause) previousOutcomeUsed = { memory: m, linked };
…
actions.push({ text: `Check ${current.incentiveProgram} eligibility first — that is what resolved your previous case ${linked.caseNumber}.`, priority: 1, fromMemory: true });
```

## Evidence of real operations
- API log lines from a full run: [hindsight-log-sample.txt](hindsight-log-sample.txt) (`[HINDSIGHT] RETAIN … category=investigation_outcome …`, `[HINDSIGHT] RECALL … results=9`).
- `npm run hindsight:check` performs a live retain → recall → delete round trip.
- Every operation is persisted in `memory_events`; the Memory Inspector lists live bank contents via `listMemories` next to "retained because / recalled because".
- Screenshots: `docs/screenshots/07-wow-recall.png`, `12-memory-inspector.png`, `16-admin-console.png` (memory activity).

## What we did not do
No benchmark of recall quality was run; the development Hindsight server used the mock LLM provider and a local embedding stub. Do not quote latency figures from the sample log as performance claims — they reflect that local setup.
