# Hindsight integration

Hindsight (by Vectorize) is EliteSuraksha's persistent agent memory. It is used through the official Node client `@vectorize-io/hindsight-client@0.10.1`, and only from [`apps/api/src/services/memory/hindsight.service.js`](../apps/api/src/services/memory/hindsight.service.js).

## Service contract

| Method | Hindsight API | Used by |
|---|---|---|
| `bankIdFor(workerId)` | – | derives `elitesuraksha-worker-<workerProfileId>`; rejects anything that is not a server-resolved id |
| `ensureBank(workerId)` | `createBank` | first write for a worker; sets `retainMission`, extraction mode, observations |
| `retainMemory({workerId, category, content, documentId, localDate, reason, metadata})` / `retainWorkerMemory` | `retain` | ingestion, pattern learning, investigations |
| `retainInvestigationOutcome({workerId, investigation, outcome})` | `retain` | resolving a case |
| `recallMemory({workerId, query, categories?, asOf})` / `recallWorkerMemory` | `recall` | agent tool `recall_hindsight_memory` |
| `recallSimilarCases` / `recallSimilarExperience({workerId, situation})` | `recall` with `tags` + `tagsMatch: any_strict` | previous anomalies, findings, outcomes, feedback, platform context |
| `getWorkerMemoryContext` / `buildMemoryContext({workerId, question, situation, focus})` | 2 × `recall` | agent + investigation creation |
| `listWorkerMemories(workerId)` | `listMemories` | Memory Inspector |
| `deleteWorkerBank(workerId)` | `deleteBank` | demo reset, test cleanup |
| `status()` | `getVersion` | live status badge (cached 15 s) |

## What a retain looks like

```js
await client.retain(bankId, content, {
  documentId,                          // e.g. outcome:<investigationId>, pattern:earnings:FRI|18-23|Zone A
  timestamp: new Date(`${localDate}T12:00:00+05:30`),   // story date, so temporal recall works
  context: CATEGORIES[category],
  tags: [`cat:${category}`],           // enables "previous cases only" recall
  metadata: { app: 'elitesuraksha', category, localDate, investigationId, rootCause, primaryFactor, ... },
  updateMode: 'replace',               // same document id → updated, not duplicated
});
```

Memory categories: `worker_pattern`, `worker_preference`, `earnings_pattern`, `historical_anomaly`, `investigation_finding`, `investigation_outcome`, `platform_context`, `user_feedback`. Chat turns are never retained.

## Recall and ranking

For an earnings question the orchestrator runs two recalls:

1. **Question recall**, untagged, budget `HINDSIGHT_RECALL_BUDGET`, all fact types.
2. **Similar-case recall**, tags `cat:historical_anomaly | cat:investigation_finding | cat:investigation_outcome | cat:user_feedback | cat:platform_context`, `tagsMatch: 'any_strict'`, with a query built from the deterministic situation ("Earnings decline of 22.8% on a Friday evening shift, with normal order volume, Evening Peak Bonus not paid…").

Results are grouped by Hindsight document. Raw facts are preferred over identical consolidated observations. Memories dated after the worker's as-of date are dropped. Learned earnings patterns for a *different* shift segment are filtered out. The rest are ranked by category priority (outcome > finding > anomaly > context/pattern) and by whether they came from the similar-case recall.

The reasoning engine uses **structured metadata** from memories (`rootCause`, `primaryFactor`, `investigationId`) rather than parsing free text. So it keeps working when Hindsight's LLM rephrases facts (`concise` mode).

## Deduplication

- Same `documentId` + `updateMode: 'replace'`: Hindsight replaces the document.
- Same `documentId` + identical content hash as the last successful retain: skipped locally (`DUPLICATE_SKIPPED`), so refreshes and repeated demo steps do not create duplicates.
- Writes to one bank are serialised in-process. Concurrent retains into one bank caused Postgres deadlocks inside Hindsight during development, and a single retry is attempted on 5xx.

## Failure handling

| Situation | Behaviour |
|---|---|
| Hindsight down / timeout / 5xx on recall | status `UNAVAILABLE`, empty memories, notice *"Historical agent memory is temporarily unavailable. The current analysis is based on structured records only."*; trace step shows red; an UNKNOWN is added |
| Bank not created yet (404) | `EMPTY` |
| Retain fails | outcome still saved in PostgreSQL with `memoryRetainedAt = null`; workspace shows **Retry** (`POST /me/investigations/:id/retain-outcome`) |
| `HINDSIGHT_ENABLED=false` | status `DISABLED`, never faked |

Every operation writes a `memory_events` row (operation, status, category, document, query, reason, result ids and text preview, latency, story date). Every operation also logs a line like:

```text
[HINDSIGHT] RETAIN worker=cmum59ssj… category=investigation_outcome doc=outcome:cmum59xbw… items=1 45ms
[HINDSIGHT] RECALL worker=cmum59ssj… query="Why did my earnings drop again?" results=9 60ms
```

A captured log from a full demo run is in [content/hindsight-log-sample.txt](content/hindsight-log-sample.txt).

## Extraction mode

`HINDSIGHT_RETAIN_EXTRACTION_MODE` (bank setting `retain_extraction_mode`):

- **`verbatim` (default)**: EliteSuraksha writes each memory as a precise, code-computed statement, and Hindsight stores it as one fact. Amounts and dates are never paraphrased. Hindsight still does entity extraction, embeddings, BM25, temporal indexing, reranking and observation consolidation.
- **`concise`**: Hindsight's LLM extracts and rephrases facts. The app works unchanged (grouping by document id + metadata-driven reasoning), but numbers may be phrased differently.

Banks keep the mode they were created with. Reset the demo after changing it.

## Running Hindsight

```bash
docker run --rm -it -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_API_KEY=$OPENAI_API_KEY \
  -v hindsight-data:/home/hindsight/.pg0 ghcr.io/vectorize-io/hindsight:latest
npm run hindsight:check
```

Or use `pip install hindsight-api && hindsight-api`, or Hindsight Cloud (`HINDSIGHT_URL` + `HINDSIGHT_API_KEY`). Hindsight's own UI (http://localhost:9999) shows the per-worker banks.

### How this repository was verified

Development and tests ran against a real `hindsight-api` 0.10.1 server started with `pip install hindsight-api`. The build sandbox had no access to OpenAI or HuggingFace, so the server used `HINDSIGHT_API_LLM_PROVIDER=mock` (Hindsight's built-in test provider) and a local TEI-compatible embedding/rerank stub (hashed bag-of-words). Retain, recall, tags, metadata, document replacement, bank deletion, listing and observation consolidation were all exercised for real. Retrieval *quality* with production embeddings was not measured.
