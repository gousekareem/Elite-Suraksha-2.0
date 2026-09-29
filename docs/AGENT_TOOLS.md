# Agent tools

Implemented in [`apps/api/src/services/agent/tools.js`](../apps/api/src/services/agent/tools.js). The agent never gets database access. It gets these tools only.

Every call goes through `ToolRegistry.execute(ctx, name, input)`, which:

1. **validates** `input` against the tool's JSON schema (types, enums, patterns, ranges, lengths). Unknown fields, including any `workerId`, are rejected.
2. runs the handler with `ctx.worker`, which the server resolved from the authenticated user or an admin-only route. Tools cannot address another worker.
3. returns structured JSON.
4. records `{tool, input, ok, ms, error?}` in `toolsUsed`. Failures are recorded too.
5. logs internal errors server-side only; the client sees a sanitised message.

| Tool | Input | Returns | LLM access |
|---|---|---|---|
| `get_worker_profile` | – | name, platform, zone, preferences, as-of date, history coverage | read-only ✓ |
| `get_recent_earnings` | `days` 1–120 | per-session metrics + totals | ✓ |
| `get_earnings_baseline` | `dayOfWeek?`, `timeWindow?` | segment baselines (8 weeks, anomalies excluded) | ✓ |
| `get_comparable_sessions` | `sessionId?` \| `date?` | current metrics, baseline, comparables, anomaly evaluation + decomposition, nearby events | ✓ |
| `get_incentive_history` | `days` | programme, eligibility, amount, note per session | ✓ |
| `get_deduction_history` | `days` | itemised deductions | ✓ |
| `get_platform_events` | `from?`, `to?` | platform notices | ✓ |
| `get_previous_investigations` | – | cases with outcomes and learnings | ✓ |
| `recall_hindsight_memory` | `query`, `categories?` | Hindsight recall (worker bank only) | ✓ |
| `retain_hindsight_memory` | `category ∈ {worker_preference, user_feedback}`, `content` | retain result | ✗ (deterministic/UI only) |
| `create_investigation` | `sessionId?`, `date?`, `question?` | case id and number | ✗ (explicit request / UI) |
| `get_investigation_evidence` | `investigationId` (ownership-checked) | evidence + findings | ✗ |
| `generate_evidence_summary` | `sessionId?`, `date?` | executed by the orchestrator's reasoning engine | ✗ |
| `generate_grievance_report` | `investigationId` | report id and version | ✗ |
| `record_investigation_outcome` | `investigationId` | **always refuses**; outcomes require worker confirmation in the workspace | ✗ |

## Deterministic planner vs LLM

- **Default (`LLM_PROVIDER=none`)**: the orchestrator detects the intent and calls tools in a fixed, explainable order. `reasoning.js` composes the answer. Every number is computed by code.
- **With `LLM_PROVIDER=anthropic|openai`**: after the deterministic pass, an LLM runs its own tool-calling loop (read-only tools, max `LLM_MAX_TOOL_ROUNDS`) under the system prompt in `prompts.js`. Its final JSON is:
  1. validated against the answer schema
  2. **grounding-checked**: every ₹ amount and % must appear in the tool outputs, within ±1
  3. merged with the deterministic evidence, comparables, timeline and investigation offer.

  If any check fails, the deterministic answer is used, and the trace says why ("LLM interpretation rejected: ungrounded figures …").

## Answer schema

```json
{
  "summary": "…",
  "facts": [{ "text": "…", "evidence": ["session:…", "baseline:FRI|18-23|Zone A"] }],
  "inferences": [{ "text": "…", "confidence": "HIGH|MEDIUM|LOW", "basis": "…" }],
  "unknowns": [{ "text": "…" }],
  "historicalContext": [{ "memoryId": "…", "text": "…", "category": "investigation_outcome", "whyRecalled": "…", "linkedCase": { "caseNumber": "ES-2026-0001" } }],
  "recommendedActions": [{ "text": "…", "priority": 1, "fromMemory": true }],
  "recommendedQuestions": ["…"],
  "evidence": [{ "id": "…", "type": "HINDSIGHT_MEMORY", "label": "…", "detail": "…" }],
  "comparableSessions": [], "metrics": {}, "timeline": [], "offer": { "type": "CREATE_INVESTIGATION" },
  "memory": { "status": "OK|EMPTY|UNAVAILABLE|DISABLED|NOT_USED", "notice": null, "recalledCount": 6 },
  "usedPreviousOutcome": true
}
```

The response also carries `trace`, the Agent Memory Trace steps with status, detail, recalled memories and Hindsight queries. It carries `toolsUsed` and `engine` as well.
