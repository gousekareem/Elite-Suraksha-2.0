<div align="center">

# EliteSuraksha 2.0

### **Persistent-Memory AI Investigation Agent for Gig Workers**

**Turn “Why did my earnings drop?” into a worker-specific, evidence-backed investigation.**

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520.10-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=111827)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Hindsight](https://img.shields.io/badge/Hindsight-0.10.1-7C3AED?style=for-the-badge)](https://github.com/vectorize-io/hindsight)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Expo](https://img.shields.io/badge/Expo-Mobile-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)

<br/>

> **Your work history should not disappear every time you start a new conversation.**
>
> EliteSuraksha 2.0 remembers a worker's history so today's problem can be investigated using yesterday's experience.

<br/>

**Structured facts** → **Analytics** → **Persistent memory** → **Investigation** → **Evidence** → **Outcome** → **Learning**

</div>

---

## What Makes EliteSuraksha Different?

EliteSuraksha is built around one idea:

> **An AI investigator should not only know what happened now — it should remember what happened before.**

Persistent memory is provided by **[Hindsight](https://github.com/vectorize-io/hindsight)**. PostgreSQL stores the structured facts; Hindsight stores what the agent has learned and experienced.

<div align="center">

| 🧠 **Structured Intelligence** | 🔎 **Investigation** | 🧬 **Persistent Memory** | 🛡️ **Worker Safety** |
|:---:|:---:|:---:|:---:|
| Deterministic analytics | Evidence-first cases | Per-worker memory banks | Strict worker isolation |
| Personal baselines | FACT / INFERENCE / UNKNOWN | Recall previous cases | Validated tools |
| Component breakdowns | Timeline + findings | Retained outcomes | Audit trail |

</div>

![Agent recalls a previous investigation outcome](docs/screenshots/07-wow-recall.png)

> **The WOW moment:** a new anomaly can recall a similar historical case, including what was discovered and how the previous investigation was resolved.

---

## Contents

<details>
<summary><strong>Explore the README</strong></summary>

- [✨ What Makes EliteSuraksha Different?](#-what-makes-elitesuraksha-different)
- [🎯 What It Does](#what-it-does)
- [💡 Why This Problem Matters](#why-this-problem-matters)
- [🔄 Product Workflow](#product-workflow)
- [🏗️ Architecture](#architecture)
- [🧠 Why Hindsight](#why-hindsight)
- [♻️ Memory Lifecycle](#memory-lifecycle)
- [⚖️ PostgreSQL vs Hindsight](#postgresql-vs-hindsight)
- [🧰 Agent Tools](#agent-tools)
- [📊 Earnings Intelligence](#earnings-intelligence)
- [🚨 Anomaly Detection](#anomaly-detection)
- [🔬 Investigation Engine](#investigation-engine)
- [🧾 Evidence Timeline](#evidence-timeline)
- [🧭 Memory Journey](#memory-journey)
- [🆚 Before / After Memory](#beforeafter-memory)
- [🎬 Demo](#demo)
- [⚡ 3-Minute Demo](#3-minute-demo)
- [🚀 Installation](#installation)
- [🔐 Environment Variables](#environment-variables)
- [🗄️ Database Setup](#database-setup)
- [🧠 Hindsight Setup](#hindsight-setup)
- [▶️ Running Locally](#running-locally)
- [🧪 Tests](#tests)
- [📁 Project Structure](#project-structure)
- [🔒 Security](#security)
- [⚠️ Limitations](#limitations)
- [🗺️ Future Roadmap](#future-roadmap)

</details>

---

## What It Does

---

## What it does

A worker asks: *"Why did my earnings drop this Friday?"*

| Without memory | With persistent history | With Hindsight memory |
|---|---|---|
| "You earned ₹807 from 25 orders. I can only see this one shift, so I cannot say whether that is normal for you." | "23% below your Friday-evening baseline (₹807 vs ₹1,046). Order volume was normal. The main difference is the Evening Peak Bonus (₹0 instead of ₹250)." | Everything in the middle column, plus: "**I found a similar situation in your history 56 days ago.** The previous investigation (ES-2026-0001) was resolved after the incentive eligibility condition was clarified, so I recommend checking the current eligibility record first." It then adds: *"However, your acceptance rate this time was 92.59%, compared with 85.71% last time, so a different eligibility condition may be involved."* |

These are real outputs from the synthetic demo scenario. They come from the three-column **Without vs With Memory** page, which runs the same agent on the same records three times.

The agent:

- reads the worker's structured records through **validated, worker-scoped tools**
- computes baselines, comparable shifts, deviations and a **component breakdown in code**. The LLM never does arithmetic.
- **recalls** relevant patterns, past anomalies, investigation findings and **investigation outcomes** from Hindsight
- answers with separated **FACTS**, **INFERENCES** (with confidence) and **UNKNOWNS**, and shows an **Agent Memory Trace**
- opens **investigations** that preserve the evidence, the recalled memory and the findings, and generates an **evidence-first report**
- **retains the outcome** when a case is resolved, so the next similar case starts from what was learned

## Why This Problem Matters

Platform-based gig workers are paid through combinations of per-order pay, incentives with eligibility conditions, tips and deductions. When earnings fall, the worker usually cannot tell:

- whether the fall is unusual *for them*
- which component changed
- whether it happened before
- what resolved it last time

Generic chat assistants forget everything between conversations. EliteSuraksha keeps the worker's own history. That history lives in structured records and in agent memory, and it turns a vague complaint into a specific, evidence-backed question the worker can raise.

EliteSuraksha supports accountability. It **never** concludes that a platform broke a law or a policy (see [Legal and policy safety](docs/SECURITY.md#legal--policy-safety)).

## Product Workflow

```mermaid
flowchart LR
    A[👤 Worker Data] --> B[⚡ Current Event]
    B --> C[📊 Structured Analytics]
    C --> D[🧠 Hindsight Recall]
    D --> E[🕰️ Historical Context]
    E --> F[🔎 Comparable Experiences]
    F --> G[🤖 AI Investigation]
    G --> H[🧾 Evidence-Based Explanation]
    H --> I[📋 Investigation / Grievance]
    I --> J[✅ Outcome]
    J --> K[🧠 Hindsight Retain]
    K --> D
```

##  Architecture

```text
                 ┌──────────────────────┐
                 │ Worker / Investigator│
                 └──────────┬───────────┘
                            ▼
                 ┌──────────────────────┐      Expo mobile companion (same API)
                 │ React web app (Vite) │
                 └──────────┬───────────┘
                            ▼
                 ┌──────────────────────┐
                 │ Express API · JWT ·  │  worker scope derived server-side
                 │ validation · limits  │
                 └──────────┬───────────┘
                            ▼
                 ┌──────────────────────┐
                 │  Agent Orchestrator  │  intent → ToolRegistry → reasoning
                 │  (+ optional LLM)    │  → validated answer + memory trace
                 └──────┬───────┬──────┘
              ┌─────────┘       └──────────┐
              ▼                            ▼
      ┌───────────────┐           ╔═══════════════════╗
      │ PostgreSQL    │           ║    HINDSIGHT      ║
      │ (Prisma)      │           ║ one bank / worker ║
      │ structured    │           ║ retain · recall · ║
      │ facts + audit │           ║ consolidation     ║
      └───────────────┘           ╚════════╤══════════╝
                                           ▼
                                  Historical context
                                           ▼
                                  Better investigation
                                           ▼
                                        Outcome
                                           ▼
                                  Hindsight RETAIN
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The web app also renders the diagram on **How it works** (`/architecture`).

##  Why Hindsight

The agent needs **experience**, not just rows:

- that this worker's Friday evenings normally earn ₹935–₹1,055
- that a similar drop happened in June
- that the June case turned out to be an incentive-eligibility change
- that the lesson was "check eligibility before blaming demand"

Hindsight provides this through the following:

- **Per-worker memory banks.** Isolation is enforced by bank, and bank ids are derived server-side.
- **`retain`** with document ids, so updates replace a document instead of duplicating it. Each retain also carries tags, metadata and a timestamp.
- **`recall`**, which fuses semantic, keyword (BM25), graph and temporal retrieval with reranking. Tag filters let the agent ask specifically for *previous cases*.
- **Observation consolidation**, which appears in the Memory Inspector as "consolidated" items.

All Hindsight access goes through one module, [`HindsightService`](apps/api/src/services/memory/hindsight.service.js). Details: [docs/HINDSIGHT.md](docs/HINDSIGHT.md).

## ♻️ Memory Lifecycle

```text
1 EVENT → 2 RETAIN → 3 TIME PASSES → 4 NEW EVENT → 5 RECALL → 6 HISTORICAL CONTEXT
→ 7 BETTER DECISION → 8 INVESTIGATION → 9 OUTCOME → 10 RETAIN OUTCOME → 11 FUTURE RECALL
```

In the running application:

| Step | Where it happens | Hindsight call |
|---|---|---|
| Patterns learned from history | `learnPatterns()` in `ingestion.service.js` | `retain` `worker_pattern`, `earnings_pattern`, `worker_preference` |
| Platform notice recorded | `ingestPlatformEvents()` | `retain` `platform_context` |
| Significant anomaly detected | `detectAnomalies()` | `retain` `historical_anomaly` |
| Question asked | `AgentOrchestrator` → `getWorkerMemoryContext()` | two `recall`s: question + similar cases (tag-filtered) |
| Investigation opened | `createInvestigation()` | `recall` (stored as evidence) + `retain` `investigation_finding` |
| Case resolved | `resolveInvestigation()` → `retainInvestigationOutcome()` | `retain` `investigation_outcome` (+ `user_feedback`) |
| Similar problem weeks later | same agent flow | the outcome is recalled and changes what to check first |

See [docs/MEMORY_LIFECYCLE.md](docs/MEMORY_LIFECYCLE.md).

## ⚖️ PostgreSQL vs Hindsight

| PostgreSQL (source of truth for facts) | Hindsight (agent memory) |
|---|---|
| workers, work sessions, trips, earnings, incentives, deductions | learned work and earnings patterns |
| platform events | platform notices worth remembering |
| anomalies (all states), baselines | significant anomalies only |
| investigations, evidence, findings, reports | what each investigation established |
| outcomes (structured) | outcome + learning, recalled in future cases |
| audit log, including **every memory operation** (`memory_events`) | worker preferences and feedback |

The database is **not** copied into Hindsight. Memories are short, precise statements written by code, for example:

> "On Fri 19 Jun 2026 (Friday 18:00–23:00 · Zone A shift) net earnings were ₹759, 24% below the worker's personal baseline of ₹1,004 (7 comparable sessions)…"

##  Agent Tools

`get_worker_profile`, `get_recent_earnings`, `get_earnings_baseline`, `get_comparable_sessions`, `get_incentive_history`, `get_deduction_history`, `get_platform_events`, `get_previous_investigations`, `recall_hindsight_memory`, `retain_hindsight_memory` (limited to preferences and feedback), `create_investigation`, `get_investigation_evidence`, `generate_evidence_summary`, `generate_grievance_report`, `record_investigation_outcome` (requires worker confirmation; never called autonomously).

Every tool:

- validates its input and rejects unexpected fields, such as a `workerId`
- is scoped to the authenticated worker
- returns structured JSON
- is recorded in the answer's `toolsUsed`

The LLM, when configured, gets **read-only** tools only. See [docs/AGENT_TOOLS.md](docs/AGENT_TOOLS.md).

##  Earnings Intelligence

All figures are computed deterministically in [`services/analytics`](apps/api/src/services/analytics):

- net and gross earnings, earnings per hour and per order, incentive and deduction contribution
- orders, active and idle hours
- weekly and monthly change
- **personal baseline**: the median and range for the same weekday, time window and zone over 8 weeks, excluding sessions already flagged as significant anomalies
- **comparable-session baseline**
- deviation
- a **component breakdown** (volume effect, pay-per-order effect, incentive, tips, deductions) that sums exactly to the change

> **Design principle:** the LLM never performs the core earnings arithmetic. Analytics are computed deterministically in code, then explained by the agent.

##  Anomaly Detection

The explainable engine ([`anomaly.js`](apps/api/src/services/analytics/anomaly.js)) checks these signals:

- earnings deviation
- base pay per order
- incentive drop
- deduction spike
- idle-time increase
- order volume
- acceptance rate
- cancellations
- rating

It outputs one of four states: `NORMAL`, `WATCH`, `SIGNIFICANT_CHANGE` or `INVESTIGATION_RECOMMENDED`. A large drop that lower order volume explains is **not** escalated to an investigation. These are internal product states, not legal conclusions.

##  Investigation Engine

An investigation preserves:

- the analysis
- the evidence items (earnings record, baseline, comparable shifts, platform events, **recalled Hindsight memories**, previous cases, and worker statements or attachments)
- FACT, INFERENCE and UNKNOWN findings with evidence references
- recommended questions, the audit trail and the memory operations

The worker can:

- add their own evidence
- move the case through statuses
- generate versioned reports (13 sections, Markdown download or print to PDF)
- resolve the case with an outcome, which is retained in Hindsight

See [docs/INVESTIGATION_ENGINE.md](docs/INVESTIGATION_ENGINE.md).

##  Evidence Timeline

A chronological, expandable timeline sits in agent answers (when the worker's recalled preference asks for one) and in every investigation workspace. It shows comparable shifts, platform events, the session under review, recalled memories and worker evidence.

##  Memory Journey

`/memory` shows how understanding developed, by day number since the first shift:

- profile established
- normal pattern learned
- platform notice remembered
- first anomaly detected
- investigation opened
- outcome retained
- similar anomaly detected
- previous experience recalled
- the new investigation using the historical outcome

Every milestone is backed by a real record.

## 🆚 Before / After Memory

`/compare` runs one question three ways:

- **current session only**
- **structured history without Hindsight**
- **history plus Hindsight**

Only the third column calls Hindsight. It is the only one that recalls the previous outcome.

##  Demo

The **Judge Demo** (`/demo`) runs the whole story on a deterministic synthetic worker: **Rahul Kumar**, Hyderabad Zone A, *Generic Delivery Platform (synthetic)*, with 72 sessions from 27 Apr to 14 Aug 2026. Every button triggers the real workflows, including ingestion, the anomaly engine, Hindsight retains and recalls, investigations and outcomes. A second synthetic worker (Asha Reddy) has her own bank, for isolation checks. All data is labelled synthetic.

`POST /api/v1/demo/reset` (the **Reset demo** button) restores the known state. It deletes only the synthetic workers' records and Hindsight banks.

###  3-Minute Demo

1. Open http://localhost:5173 and click **Enter Judge Demo as Rahul →**.
2. **Reset demo**.
3. **Load history & learn patterns**. Say "the agent has been observing this worker's history" and show **Earnings** or **Memory Journey**.
4. Ask: **"What do I normally earn on Friday evenings?"** The answer shows a worker-specific baseline, and the Memory Trace shows the Hindsight recall.
5. **Introduce first anomaly** (Fri 19 Jun).
6. Ask: **"Why did my earnings drop?"** Show the baseline, comparable shifts, the anomaly, the FACT, INFERENCE and UNKNOWN sections, and the Agent Memory Trace.
7. Click **Create investigation →** in the answer. Show the evidence, timeline, findings, unknowns and **Generate report**.
8. Back on the Judge Demo, click **Resolve with platform clarification**. The outcome is retained in Hindsight.
9. **Jump to Fri 14 Aug 2026**.
10. Ask: **"Why did my earnings drop again?"** This is the WOW moment: *"I found a similar situation in your previous history…"*, the recalled outcome, and "check eligibility first (from memory)".
11. Open **Without vs With Memory** and run the comparison.
12. **Open investigation for 14 Aug** and generate the report. The previous outcome appears as evidence.

The **Fast-forward to step 9** button runs steps 2–9 in one go. See [docs/DEMO.md](docs/DEMO.md) and the video plan in [docs/content/demo-flow.md](docs/content/demo-flow.md).

---

##  Core Capabilities at a Glance

<div align="center">

| Capability | What EliteSuraksha does |
|:---|:---|
| 💰 **Earnings Intelligence** | Personal baselines, comparable sessions and exact component breakdowns |
| 🚨 **Anomaly Detection** | Detects meaningful changes using explainable signals |
| 🧠 **Persistent Memory** | Recalls patterns, anomalies, findings and outcomes |
| 🔎 **Investigations** | Preserves evidence, findings, unknowns and audit history |
| 🧾 **Evidence Reports** | Generates versioned, evidence-first investigation reports |
| 🔐 **Isolation & Security** | Worker-scoped data, validated tools and protected memory banks |
| 📱 **Web + Mobile** | React dashboard plus Expo companion using the same API |
| 🎭 **Deterministic Demo** | Reproducible synthetic Judge Demo for evaluation |

</div>

---

## 🚀 Installation

Requirements:

- Node.js ≥ 20.10 (developed on 22)
- npm 10
- PostgreSQL 14+
- a Hindsight server (Docker is easiest)

```bash
git clone <your-fork-url> elite-suraksha && cd elite-suraksha
npm install
cp .env.example .env        # then edit values
```

##  Environment Variables

All variables are documented in [`.env.example`](.env.example), grouped as APPLICATION, DATABASE, AUTH, HINDSIGHT, LLM, WEB and MOBILE. The minimum set:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/elite_suraksha
JWT_ACCESS_SECRET=<random string>
JWT_REFRESH_SECRET=<random string>
HINDSIGHT_URL=http://localhost:8888
# optional: LLM_PROVIDER=anthropic|openai, LLM_API_KEY, LLM_MODEL
```

The API loads the repo-root `.env`, with an optional `apps/api/.env` override. Never commit `.env`; it is git-ignored.

##  Database Setup

```bash
# e.g. docker run -d --name es-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
createdb -h localhost -U postgres elite_suraksha

npm run db:generate          # Prisma client (engineType "client" + pg adapter, no native query engine)
npm run db:migrate           # prisma migrate deploy
# If Prisma's schema-engine binary cannot be downloaded (air-gapped machines):
npm run db:migrate:offline   # applies the same SQL and records it in _prisma_migrations
```

##  Hindsight Setup

```bash
export OPENAI_API_KEY=sk-...      # or configure another provider, see Hindsight docs
docker run --rm -it -p 8888:8888 -p 9999:9999 \
  -e HINDSIGHT_API_LLM_API_KEY=$OPENAI_API_KEY \
  -v hindsight-data:/home/hindsight/.pg0 \
  ghcr.io/vectorize-io/hindsight:latest

npm run hindsight:check          # real retain → recall → delete round trip, prints [HINDSIGHT] lines
```

The Hindsight UI at http://localhost:9999 shows the `elitesuraksha-worker-<id>` banks. To use Hindsight Cloud, set `HINDSIGHT_URL` and `HINDSIGHT_API_KEY`. More detail, including the extraction mode, is in [docs/HINDSIGHT.md](docs/HINDSIGHT.md).

If Hindsight is not running, the app still works on structured records. The status badge turns red and answers say: *"Historical agent memory is temporarily unavailable. The current analysis is based on structured records only."*

## ▶️ Running Locally

```bash
npm run demo:seed     # optional: reset + Phase-1 history (or use the Judge Demo buttons)
npm run dev:api       # http://localhost:4000  (logs [HINDSIGHT] RETAIN / RECALL lines)
npm run dev:web       # http://localhost:5173  (proxies /api to the API)
```

Open http://localhost:5173 and choose **Enter Judge Demo as Rahul**, or **Open Investigator Console (admin)**. Other options:

- `npm run demo:scenario` prepares everything up to the second anomaly from the command line.
- Mobile companion: `npm run dev:mobile` (Expo). Set `EXPO_PUBLIC_API_BASE_URL`.

## 🧪 Tests

```bash
createdb -h localhost -U postgres elite_suraksha_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/elite_suraksha_test npm test
npm run lint      # syntax check of all API sources and tests
npm run build     # production web build
```

- `test/unit`: analytics, comparable sessions, anomaly engine, dataset determinism, platform adapter, intent detection, output validation, grounding check, tool input validation, and HindsightService. The HindsightService tests cover retain/recall, category filtering, **worker isolation**, duplicate retain, the retention policy, and unavailable or disabled memory.
- `test/integration`: boots the API against a clean test database and runs the **full memory loop**: event → retain → new event → recall → investigate → resolve → retain outcome → recall outcome. It also covers OTP auth, role checks, cross-worker isolation, memory-unavailable degradation, and the LLM tool-calling path against a fake OpenAI-compatible server. When no Hindsight server is reachable, the memory assertions switch to the "unavailable" path.
- `e2e/judge-demo.e2e.js` (optional, Playwright) clicks through the entire Judge Demo in a browser and regenerates `docs/screenshots`.

Latest local run: **31/31 tests passed**, lint 70/70 files, web build OK, and the UI end-to-end walkthrough passed. See [Limitations](#limitations) for the environment used.

## 📁 Project Structure

```text
apps/
  api/                       Express + Prisma API
    prisma/                  schema.prisma, migrations (insurance → earnings-intelligence)
    src/
      services/analytics/    metrics, comparable sessions, anomaly engine (pure functions)
      services/memory/       HindsightService, categories, memory journey/inspector
      services/agent/        orchestrator, tools (ToolRegistry), reasoning, intent, schema, llm, prompts
      services/              earnings, ingestion, investigation, report, admin, audit, auth, worker
      platform/              PlatformAdapter + generic delivery/ride/freelance adapters
      demo/                  deterministic synthetic dataset + Judge Demo steps
      routes/ controllers/ middlewares/ config/ lib/ utils/
    scripts/                 migrate-offline, demo-seed, hindsight-check, prisma wrapper, lint
    test/                    unit + integration
  web/                       React 18 + Vite (dashboard, ask, memory, investigations, demo, admin)
  mobile/                    Expo companion (dashboard + ask the agent)
packages/shared/             shared constants
docs/                        architecture, Hindsight, lifecycle, tools, investigations, demo, security, content kit
e2e/                         optional Playwright walkthrough
```

## 🔒 Security

- JWT auth with rate-limited OTP (5 attempts, `crypto.randomInt`), and role checks (`WORKER` or `ADMIN`).
- **Worker isolation:** the worker is always derived from the token (`/me/*`), or from an admin-only route parameter (`/admin/workers/:id/*`). The Hindsight bank id is derived from that worker. Client-supplied worker ids are rejected.
- Input validation on every route and tool.
- Sanitised errors (no stack traces), a secret-scrubbing logger, and Helmet.
- Restricted CORS.
- Rate limits on auth and agent routes.
- Evidence files are served only through an ownership-checked route.
- Demo login and reset exist only when `DEMO_MODE_ENABLED=true`, and they touch only synthetic workers.

See [docs/SECURITY.md](docs/SECURITY.md).

## ⚠️ Limitations

These are honest limits, not future marketing:

- **Verification environment.** Everything was built and tested against a **real Hindsight 0.10.1 server**, through the official Node client. That server ran in an offline sandbox, so it used Hindsight's built-in `mock` LLM provider and a local hashed-embedding test server instead of OpenAI or HuggingFace models. Recall quality (ranking) with real embeddings, and `concise` LLM extraction mode, have **not** been measured here. The app's relevance filtering does not depend on either.
- **LLM layer.** No real LLM was called during development. Answers default to the **deterministic reasoning engine**. The optional LLM tool-calling path is covered by tests against a fake OpenAI-compatible server. Its output is schema-validated and grounding-checked, and it falls back to the deterministic answer.
- **Migrations.** Prisma's schema-engine binary was unavailable in the build sandbox, so the new migration SQL was written by hand following Prisma's conventions. It was applied with the offline runner. Run `npm run db:status` after `db:migrate` on a normal machine. If `prisma migrate dev` ever reports drift, regenerate with `prisma migrate diff`.
- **Data.** All data is synthetic. The platform adapters share one generic statement format, and there is no real platform integration.
- **Mobile.** The companion app was updated to the new API and syntax-checked, but it was not run on a device.
- **Operations.** The rate limiter is in-memory (single instance only). Report export is Markdown plus browser print-to-PDF. Screenshots were rendered with fallback fonts because Google Fonts was blocked in the capture environment.
- **Legal.** Reports summarise observed data. They do not establish legal liability and cite no laws.

## 🗺️ Future Roadmap

- Real platform statement importers (CSV/PDF parsers per platform adapter)
- Hindsight mental models per worker, for example a continuously refreshed "earnings profile"
- An attachments pipeline into Hindsight `retainFiles` for worker-provided screenshots
- Multi-worker (anonymised, consented) pattern detection for investigators
- A verified-source registry for legal and policy references attached to reports
- A shared-store rate limiter and a background job queue for ingestion

---

*This repository was transformed from the original EliteSuraksha parametric-insurance prototype. The audit of what was reused, repurposed or removed is in [docs/TRANSFORMATION.md](docs/TRANSFORMATION.md).*

---

<div align="center">

### EliteSuraksha 2.0

**Remember the past. Investigate the present. Learn for the future.**

<br/>

`Structured Facts` • `Deterministic Analytics` • `Persistent Memory` • `Evidence-First Investigation`

<br/>

<sub>Built for worker-centered accountability with synthetic demo data and explicit safety boundaries.</sub>

</div>
