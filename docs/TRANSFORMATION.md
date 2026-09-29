# Transformation audit: EliteSuraksha (insurance) → EliteSuraksha 2.0

## What existed

| Area | Found | Decision |
|---|---|---|
| Monorepo | npm workspaces: `apps/api`, `apps/web`, `apps/mobile`, `packages/shared` | kept |
| API | Express 4, layered routes → controllers → services → Prisma; `AppError`, `asyncHandler`, `validate`, `sendSuccess` | **kept and reused** throughout |
| Auth | phone OTP (hashed) + JWT, `requireAuth`, `requireAdmin` | **kept**; hardened (attempt limit, `crypto.randomInt`, demo login behind a flag) |
| DB | Prisma 6 + PostgreSQL; users, otp_requests, worker_profiles, worker_documents, policies, trigger_events, claims, payouts, risk_snapshots, location_logs | users/otp kept; insurance tables dropped by a new migration; new earnings-intelligence schema |
| Domain services | policy (weekly premium), risk (city risk scores), trigger → auto-claim, payout, fraud thresholds | **removed** (insurance-only); concepts repurposed (below) |
| Upload | Multer config for KYC documents | **repurposed** for investigation evidence (served only via an ownership-checked route) |
| Web | React/Vite; routed pages (login, onboarding, dashboard, admin) + unrouted Phase-1 mock screens (simulated weather, fake payouts); CSS tokens | auth context & protected routes reused; UI rebuilt; mock screens removed |
| Mobile | Expo app calling policy/claim/payout endpoints; imported `expo-secure-store` but declared `react-native-secure-store` | updated to the new API (dashboard + ask the agent); dependency fixed |
| AI | none present (no LLM client, prompts or tool calling) | new agent layer |
| Tests | none | unit + integration + optional UI e2e added |
| Bugs found | `App.jsx` imported `./pages/Onboardingpage` (case mismatch, breaks Linux builds); `/triggers/events` unauthenticated; stack traces returned in errors; duplicate `apps/api/src/package.json` | fixed / removed |

## Concept mapping

| Old | New |
|---|---|
| claim | investigation |
| claim status | investigation status |
| payout | investigation outcome / resolution |
| trigger event (weather, curfew) | platform event (incentive terms, zone map, outage…) |
| risk snapshot | worker baseline |
| fraud score & thresholds | anomaly signals & states |
| policy / exclusions | worker preferences / platform context |
| weather monitor | earnings intelligence dashboard |
| insurance admin panel | investigation console |

## New
Hindsight integration, agent orchestrator + tool registry, deterministic analytics, comparable-session engine, anomaly engine, investigation workspace, evidence timeline, report generator, Memory Journey, Memory Inspector, Without-vs-With comparison, Judge Demo with reset, platform adapters, deterministic synthetic dataset, audit trail, docs.
