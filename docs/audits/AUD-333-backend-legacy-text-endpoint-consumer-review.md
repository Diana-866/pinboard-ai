# AUD-333 — Backend consumer and route-contract review for legacy GPTunnel text endpoints

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** REVIEW COMPLETE — no source changes  
**Related:** AUD-329 through AUD-332

## Scope

Reviewed the backend route registrations in `backend/index.js`, implementations `backend/analyze.js` and `backend/boards.js`, and GPTunnel text adapter `backend/gptunnel.js`. The complete backend source-file inventory was inspected. This is source review only; no runtime traffic, production logs, external caller inventory, or deployment configuration was available.

## Confirmed architecture

1. The two legacy operations are registered only in `backend/index.js`:
   - `POST /projects/:id/analyze` (around lines 622–655)
   - `POST /projects/:id/boards/generate` (around lines 659–687)
2. The route handlers call `analyzeSite()` and `generateBoards()` respectively. These helpers are imported directly into the Express application.
3. The backend modules `analyze.js` and `boards.js` each call `generateText()` from `gptunnel.js`. They do not expose a queue/worker entry point or a second internal caller in the reviewed code.
4. The only in-repository invocation sites visible in the inspected route/module code are those two Express handlers. No separate worker integration was found in the reviewed architecture.
5. Both endpoints are still live backend capabilities, even though AUD-332 found no frontend caller in the reviewed frontend paths. Absence of a frontend call does not rule out direct API clients, older deployed clients, scripts, or undocumented integrations.

## Route-specific controls

### Website analysis

- Requires authentication and the process-local `aiLimiter`.
- Fetches project using both project ID and authenticated user ID.
- Requires `website_url`.
- Website fetch is protected by public URL validation, pinned DNS lookup, redirects disabled, bounded response size and timeout in `analyze.js`.
- Does not have the tariff gate applied to board generation.
- Calls `analyzeSite()`, which calls legacy `generateText()`; this wrapper discards provider usage, cost and request ID.
- Persists `niche`, `site_summary`, and `analyzed_at` under both project ID and owner ID.

### AI board suggestions

- Requires authentication, process-local `aiLimiter`, and `requireTariff([standard, pro, agency, start])`.
- Fetches project under authenticated owner.
- Calls `generateBoards()`, which calls legacy `generateText()`; usage/cost/request ID are discarded.
- Inserts generated rows into `boards` and returns serialized rows.
- No durable idempotency key, operation journal, or provider request recovery is present in this route.

## Additional correctness observations

1. `analyzeSite()` catches JSON parse failure and returns the entire raw provider text as `summary`. The route does not validate that `niche` and `summary` are bounded non-empty strings before writing them. This can persist malformed or unexpectedly large model output.
2. `generateBoards()` only parses a JSON array. It does not validate array length, each item shape, title/description types, or string bounds before the route inserts rows. A malformed but parseable response may reach the database insert.
3. Website text is incorporated into an LLM prompt as untrusted content. No explicit instruction boundary or output validation currently mitigates prompt-injection influence. The existing SSRF controls mitigate network targeting, not prompt injection.
4. Both endpoints use a process-local request limiter, not a durable provider spend limit.
5. These findings do not establish an exploitable vulnerability or an actual production incident; they identify missing validation and accounting controls in the reviewed code.

## Decision

Do not delete these endpoints automatically. They remain authenticated API routes and could have external consumers not represented in this repository. Do not enforce a breaking `Idempotency-Key` until the owner confirms whether external clients exist and whether the features should remain supported.

Recommended near-term engineering order:
1. Add strict schema validation and bounded output for analysis and board ideas (low-risk hardening, preserving route response contracts).
2. Add structured usage capture to the provider adapter and persist it only if the operation is deliberately retained.
3. Add durable operation journal/idempotency only after confirming these are supported product capabilities or documenting the external API contract.
4. If unused, deprecate with telemetry/notice and remove in a separate approved change.

## Validation and limitations

- No source code, SQL, migrations, or API behavior changed.
- No production database writes, GPTunnel calls, or deployments.
- No tests/build executed.
- No access to production access logs or external consumer inventory; cannot assert zero external callers.
