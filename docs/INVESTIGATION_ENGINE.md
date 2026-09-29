# Investigation engine

## Earnings analytics

(`services/analytics/metrics.js`)

- Per session: net, gross, base pay, incentive, tips, deductions, orders, active and idle hours, acceptance rate, cancellations, per-hour and per-order values, incentive share, zone mix.
- **Segment**: weekday + time window + zone, e.g. `FRI|18-23|Zone A`.
- **Personal baseline**: sessions of the same segment in the previous 56 days, excluding sessions already flagged `SIGNIFICANT_CHANGE` or `INVESTIGATION_RECOMMENDED`. If fewer than 3 match, it falls back to the same weekday and time-of-day across zones. Reported as median, mean, min, max, p25 and p75.
- **Decomposition** of `net − baseline mean`:
  - volume effect: Δorders × baseline base pay per order
  - pay-per-order effect
  - incentive, tips and deductions deltas

  These sum exactly to the total. The primary factor is the largest negative component when it explains at least 40% of the change.
- **Period comparison**: last 7 and 30 days vs the preceding window.

## Comparable Session Engine

(`comparable.js`)

Scoring over earlier sessions on the same platform:

| Dimension | Points |
|---|---|
| Same weekday | +3 |
| Same window | +3 (similar time of day: +1.5) |
| Same zone | +2 |
| Order gap ≤ 3 | up to +2 |
| Active-hours gap ≤ 0.75 h | up to +1 |

The minimum score is 7. Flagged anomalies are excluded. The top 4 are returned with reasons and gaps.

## Anomaly engine

(`anomaly.js`)

| Deviation from baseline median | State |
|---|---|
| < 10% drop | `NORMAL` |
| 10–15% | `WATCH` |
| 15–20% | `SIGNIFICANT_CHANGE` |
| ≥ 20% and not explained by low volume or hours | `INVESTIGATION_RECOMMENDED` |
| ≥ 20% explained by volume or hours | `SIGNIFICANT_CHANGE` |

Signals are order volume, active hours, incentive, base pay per order, deductions, idle time, acceptance rate, cancellations and rating. Each signal has a status and a sentence of detail. At least 3 baseline sessions are needed. These are product states, never legal findings.

## Investigation

(`investigation.service.js`)

Creation (from the agent's offer, the dashboard, the Judge Demo, or `POST /me/investigations`):

1. Runs the deterministic analysis for the session.
2. Loads previous cases from PostgreSQL.
3. Recalls Hindsight memory (question recall + similar-case recall).
4. Runs the reasoning engine, which produces facts, inferences, unknowns, questions, actions and the timeline.
5. Persists the case (`ES-YYYY-NNNN`, idempotent per anomaly), the evidence items and the findings. Findings cite evidence item ids.
6. Writes an audit entry: who, what, when, why, evidence count, memories recalled.
7. Retains an `investigation_finding` memory.

Statuses: `OPEN → IN_PROGRESS ↔ AWAITING_CLARIFICATION → RESOLVED → CLOSED`, with transitions validated.

Worker evidence: a statement and/or file (PNG, JPEG, WebP or PDF, ≤ 5 MB), stored outside the web root and served only through an ownership-checked route.

**Outcome**: result, root-cause category, action taken, source, learning and worker feedback. Saved in PostgreSQL, then retained in Hindsight (`investigation_outcome` + `user_feedback`). If the retain fails, the workspace offers a retry.

## Report

(`report.service.js`)

The report is versioned and deterministic. Its 13 sections:

1. Issue Reported
2. Observed Change
3. Historical Baseline
4. Comparable Historical Sessions
5. Evidence (with E# citations)
6. Potential Contributing Factors
7. Historical Context (recalled memory)
8. Previous Investigation Outcomes
9. What Is Known
10. What Is Unknown
11. Questions Requiring Clarification
12. Requested Review / Action
13. Supporting Evidence

It ends with a disclaimer that the report summarises observed data, does not establish legal liability, and that requirements must be verified against authoritative sources. Export is Markdown download or the browser's print-to-PDF (print stylesheet included).
