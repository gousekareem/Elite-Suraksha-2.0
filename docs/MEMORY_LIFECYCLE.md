# Memory lifecycle

```text
1 EVENT → 2 RETAIN → 3 TIME PASSES → 4 NEW EVENT → 5 RECALL → 6 HISTORICAL CONTEXT
→ 7 BETTER DECISION → 8 INVESTIGATION → 9 OUTCOME → 10 RETAIN OUTCOME → 11 FUTURE RECALL
```

The walkthrough below follows the synthetic demo worker, Rahul Kumar. All dates are story dates.

| # | Story date | What happens | Code | Memory |
|---|---|---|---|---|
| 1 | 27 Apr – 18 Jun | 35 sessions ingested through the Generic Delivery adapter | `ingestStatements` | – |
| 2 | 15 Jun | Platform notice "Evening Peak Bonus eligibility terms updated" | `ingestPlatformEvents` | RETAIN `platform_context` |
| 2 | 18 Jun | Patterns learned: schedule, 5 segment baselines, explanation preference | `learnPatterns` | RETAIN `worker_pattern`, `earnings_pattern` ×5, `worker_preference` |
| 4 | 19 Jun | Friday shift: 24 orders (normal), bonus ₹0, net ₹759 vs baseline ₹1,004 (−24.4%) → `INVESTIGATION_RECOMMENDED` | `detectAnomalies` | RETAIN `historical_anomaly` (metadata `primaryFactor=incentive`) |
| 5–7 | 19 Jun | Worker asks why; agent recalls patterns + notice, explains incentive gap, lists unknowns | `AgentOrchestrator` | RECALL ×2 |
| 8 | 19 Jun | Investigation ES-2026-0001 opened with evidence + recalled memories | `createInvestigation` | RECALL ×2, RETAIN `investigation_finding` |
| 9 | 24 Jun | Synthetic platform clarification: threshold 80% → 90%; worker had 85.7% | `resolveInvestigation` | – |
| 10 | 24 Jun | Outcome + learning ("check incentive eligibility before blaming demand") | `retainInvestigationOutcome` | RETAIN `investigation_outcome` (+ `user_feedback`) |
| 3 | 25 Jun – 13 Aug | Normal work; 17 Jul outage dip is flagged as `SIGNIFICANT_CHANGE`, explained by volume; 10 Aug zone-map notice | ingestion | RETAIN `historical_anomaly`, `platform_context`; patterns re-learned (documents replaced) |
| 4 | 14 Aug | Friday shift: 25 orders, 92.6% acceptance, 9 orders in Zone B, bonus ₹0 → `INVESTIGATION_RECOMMENDED` | `detectAnomalies` | RETAIN `historical_anomaly` |
| 11 | 14 Aug | "Why did my earnings drop again?" → the outcome from June is recalled | `getWorkerMemoryContext` | RECALL ×2 |
| 7 | 14 Aug | **Better decision:** "check eligibility first (from memory)", plus a structured comparison: acceptance is now above the threshold clarified in June, so a *different* condition may be involved; the zone revision is flagged | `reasonAboutSession` | – |
| 8 | 14 Aug | ES-2026-0002 cites the recalled outcome and the previous case as evidence | `createInvestigation` | RECALL, RETAIN `investigation_finding` |

## How memory changes behaviour (not just the text)

- **Action ordering.** A recalled `investigation_outcome` with an incentive root cause puts "Check … eligibility first — that is what resolved your previous case" at the top of the recommended actions (`fromMemory: true`).
- **Repeated-pattern detection.** A recalled `historical_anomaly` with `primaryFactor=incentive` before the current date produces the inference "This has happened before … N days earlier". Volume-explained anomalies such as the 17 Jul outage are excluded.
- **Refinement.** The recalled memory links, via `metadata.investigationId`, to the structured previous case. The agent then compares acceptance rates deterministically and flags that the previous cause may not apply.
- **Presentation.** A recalled `worker_preference` asking for a chronological timeline makes the answer include the evidence timeline.
- **Investigation evidence.** Recalled memories and previous cases become `HINDSIGHT_MEMORY` and `PREVIOUS_INVESTIGATION` evidence items in the new case and its report.

The **Without vs With Memory** page shows the difference with the same question: only the Hindsight column has these behaviours.
