# Project story (source material for the article / post)

> Facts only. Everything here is true of the repository as built; numbers come from the synthetic demo data or measured test runs. No users, deployments or accuracy figures exist and none should be claimed.

## The problem, in one example
Rahul, a (synthetic) delivery worker in Hyderabad, usually earns ₹935–₹1,055 on Friday evenings. One Friday he earns ₹759 for the same 24 orders. He can see the number drop; he cannot see *why*, whether it happened before, or what fixed it last time. A chat assistant that forgets everything between conversations can list generic reasons ("fewer orders, lower incentives, deductions…") but cannot compare against *his* normal.

## What we built
EliteSuraksha 2.0 turns an existing gig-worker platform codebase (Express + Prisma + PostgreSQL + React) into an earnings-investigation agent with persistent memory:
- deterministic analytics compute a personal baseline per shift segment, comparable shifts, and a component breakdown of the change;
- an explainable anomaly engine flags changes (and does *not* escalate drops explained by low order volume);
- an agent calls validated, worker-scoped tools and answers with separated facts, inferences and unknowns;
- **Hindsight** stores what the agent learns: patterns, significant anomalies, investigation findings, and — critically — investigation **outcomes**;
- when a similar problem appears weeks later, the agent recalls the earlier outcome and changes what it recommends checking first.

## The moment that shows memory working
On 14 Aug the same bonus goes missing again. With Hindsight the answer adds:
> "I found a similar situation in your history 56 days ago. The previous investigation (ES-2026-0001) was resolved after the incentive eligibility condition was clarified, so I recommend checking the current eligibility record first."

and, combining the recalled case with structured data:
> "However, the condition from last time may not be the same one: your acceptance rate this time was 92.59%, compared with 85.71% in ES-2026-0001. A different eligibility condition may be involved."

Without Hindsight (same code, recall disabled) neither sentence appears.

## Design decisions worth writing about
1. **Facts in PostgreSQL, experience in Hindsight.** We do not mirror tables into memory. Memories are short statements written by code with exact numbers and dates.
2. **The LLM never does arithmetic.** Baselines, deviations and the breakdown are computed; the optional LLM layer only interprets, and any ₹/% figure it states must appear in tool output or the answer is discarded.
3. **Structured metadata on memories.** Each retain carries `category`, `localDate`, `investigationId`, `rootCause`, `primaryFactor`. Reasoning uses metadata, so it survives Hindsight rephrasing facts.
4. **Two recalls per question.** One for the question, one tag-filtered recall for previous cases using a deterministic description of the current situation.
5. **Memory isolation by construction.** One bank per worker; the bank id is derived from the authenticated worker, never from input.
6. **Honest failure.** If Hindsight is down the agent says so and continues on structured data.

## Honest limitations
See the README "Limitations" section: verification used a real Hindsight server with its mock LLM provider and a local embedding stub (offline sandbox); no real LLM calls were made; data is synthetic; mobile not device-tested.
