# Security

## Authentication & authorisation
- Phone + OTP login (existing flow, hardened): OTP from `crypto.randomInt`, stored as a SHA-256 hash, 5-minute expiry, at most 5 wrong attempts per OTP, and route rate limit (20 requests / 10 min per IP). `EXPOSE_DEV_OTP` shows the OTP only outside production by default.
- JWT access tokens (1 day). `JWT_*` secrets are required at startup; placeholder secrets are refused in production.
- Roles: `WORKER`, `ADMIN` (investigator). `/admin/*` requires `ADMIN`.

## Worker isolation (data and memory)
- `/api/v1/me/*`: the worker profile is resolved from the token's user (`requireOwnWorker`).
- `/api/v1/admin/workers/:workerId/*`: admin only; the id is validated and resolved server-side.
- Every query filters by `req.worker.id`; investigation, report, evidence and file routes check ownership (other workers get `404`).
- Hindsight bank ids are derived from the resolved worker id (`elitesuraksha-worker-<id>`). `bankIdFor` rejects anything that is not an id-shaped string. Tools reject unexpected input fields, so a `workerId` in a request or LLM tool call is refused.
- Tests: `test/unit/hindsight.service.test.js` (bank isolation) and `test/integration/memory-loop.test.js` (worker B cannot read worker A's investigation; worker B's answers and memory bank contain nothing from worker A; spoofed `workerId` ignored).

## Input validation & errors
- Request validators for every route (`routes/validators.js`) and JSON-schema validation for every agent tool. Body size is limited to 2 MB; uploads are limited to 5 MB and PNG/JPEG/WebP/PDF.
- The error handler returns operational messages only; unexpected errors return a generic message. Stack traces are logged server-side, never sent. (The original code returned stack traces outside production; removed.)
- The logger scrubs keys named like `token`, `secret`, `password`, `apiKey`, `authorization`. Hindsight and LLM keys are never logged; the status endpoint exposes only the Hindsight host.

## Other controls
- Helmet, CORS restricted to `CORS_ORIGIN`, `x-powered-by` disabled.
- In-memory rate limits on auth, agent and pattern-learning routes (single instance; use a shared store when scaling out).
- Evidence files are not served statically; they are available only through an authenticated, ownership-checked route.
- The previously unauthenticated `POST /triggers/events` endpoint was removed with the insurance domain.
- Demo login/reset/steps exist only with `DEMO_MODE_ENABLED=true` (default off in production), only for the demo worker or an admin, and only affect synthetic profiles.
- `.env` is git-ignored; `.env.example` contains placeholders only.

## Legal / policy safety
- The anomaly states are internal product states. The agent prompt and the deterministic reasoning never claim wrongdoing or cite laws, deadlines or regulations.
- Reports carry the disclaimer: *"This report summarises observed data and historical context… It does not independently establish legal liability… Applicable legal or platform-policy requirements should be verified against authoritative sources."*
- The LLM (optional) cannot record outcomes or retain memories other than preferences and feedback, and its numbers are grounding-checked against tool output.
