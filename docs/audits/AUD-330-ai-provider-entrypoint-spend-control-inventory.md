# AUD-330 — AI/provider entry-point inventory and spend-control coverage

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Scope:** source-level inventory of backend GPTunnel call sites and the corresponding API authorization, tariff, rate-limit, idempotency, and cost-journal controls.  
**Safety:** no live provider calls, database access/migrations, user generation, payment, deployment, or production configuration changes.

## Executive result

The direct GPTunnel call-site inventory found four backend entry modules:
- Multi-pin generation: usage-aware text planning plus quoted image tasks.
- Single-pin regeneration: quoted image task.
- Project website analysis: legacy text adapter.
- Board idea generation: legacy text adapter.

The image generation paths have durable request/task journals, user-credit reservations, and actual-price settlement. The two legacy text paths remain outside that accounting boundary. The project analysis route has no tariff gate; board idea generation does have a tariff gate. Both use the process-local AI request limiter, but neither persists provider usage/cost or an idempotent operation identity.

This confirms the AUD-329 findings and narrows the next implementation scope. No additional direct OpenAI SDK/provider call site was identified in the scanned JavaScript/TypeScript source files; this is a bounded source search, not proof that no indirect/provider-side integrations exist.

## Entry-point matrix

| Entry point | Auth / ownership | Tariff | Rate limit | Durable operation identity | Provider usage/cost |
|---|---|---|---|---|---|
| `POST /projects/:id/analyze` | Auth + project owner filter | No | `aiLimiter` | No | No |
| `POST /projects/:id/boards/generate` | Auth + project owner filter | Yes: start/standard/pro/agency | `aiLimiter` | No | No |
| `POST /boards/:id/pins/generate` | Auth + board owner check | Yes: start/standard/pro/agency | `aiLimiter` | Yes: idempotency key + DB request journal | Text usage journal; image quote/actual task journal |
| `POST /pins/:id/regenerate` | Auth + pin owner check | Yes: start/standard/pro/agency | `aiLimiter` | Yes: idempotency key + DB request journal | Image quote/actual task journal |

## Detailed observations

### 1. Project analysis — unmetered legacy text spend

Route: `backend/index.js` → `POST /projects/:id/analyze`  
Call chain: `backend/analyze.js` → `generateText()` → `generateTextWithUsage()`.

- Project ownership is checked before external website fetch and AI call.
- The website fetch has public-URL validation, DNS pinning, redirects disabled, timeout, and response-size limits; this reduces SSRF risk but does not constrain GPTunnel spend.
- No tariff middleware, user-credit reservation, durable idempotency key, provider usage row, or provider request ID persistence is present.
- The route can incur provider expense without being represented in the existing provider-cost view.

**Severity: Medium — platform spend and accounting.**

### 2. Board idea generation — tariff-gated but unmetered text spend

Route: `backend/index.js` → `POST /projects/:id/boards/generate`  
Call chain: `backend/boards.js` → `generateText()` → `generateTextWithUsage()`.

- Project ownership and paid-plan eligibility are checked.
- No durable request identity is required; repeating a request can create another provider call and another set of board rows.
- Provider request ID, token usage, and RUB cost are discarded.
- The shared request limiter is not a durable spend cap.

**Severity: Medium — platform spend and accounting.**

### 3. Multi-pin generation — stronger financial boundary

- Auth, tariff, AI limiter, board ownership, and validated input are checked.
- A required idempotency key and request fingerprint enter a database journal.
- Credits are reserved before billable work.
- Text usage is persisted with request/model/token/cost facts; missing cost remains explicit rather than being converted to zero.
- Image tasks are quoted, journaled, and settled against actual provider prices.
- Existing provider task IDs are recovered instead of blindly resubmitted.

**Assessment:** source-level controls present; runtime behavior and live migration state remain unverified.

### 4. Single-pin regeneration — stronger financial boundary

- Auth, tariff, AI limiter, pin ownership, and required idempotency key are checked.
- The database request journal serializes retries and claim ownership.
- A fresh image task is quoted and recorded before submission.
- Provider task and terminal outcome are retained for same-task recovery.
- Actual provider price determines final reservation/settlement.

**Assessment:** source-level controls present; runtime behavior and live migration state remain unverified.

## Cross-cutting control gaps

1. `aiLimiter` is process-local and counts requests, not actual RUB spend. It must remain an abuse throttle, not be treated as a budget.
2. There is no common durable operation ledger for every AI feature. The two legacy text routes are absent from the provider-cost reporting sources.
3. The two legacy text routes lack durable idempotency. A client retry can create duplicate provider spend.
4. No deployment-level global/provider budget, circuit breaker, or verified spend alert was established by source review.

## Recommended implementation order

1. Decide the product policy for website analysis and board generation: paid-plan allowance, explicit credit debit, or capped platform subsidy.
2. Replace the legacy text call with a usage-aware adapter and persist a durable operation identity before provider submission where the provider contract permits.
3. Add database-backed per-user and global spend ceilings, with explicit handling for unknown provider outcomes.
4. Include these operations in the normalized provider-cost reporting view without treating missing costs as zero.
5. Add tests for duplicate retries, ambiguous timeouts, missing usage/cost, journal-write failure, tariff enforcement, and concurrency.

## Verification limits

- Source inspection only. No test, lint, typecheck, build, SQL, or HTTP integration suite was run.
- No live GPTunnel API contract or provider account statement was inspected.
- No current production tariff configuration, environment variable, shared limiter store, or spend alert was verified.
- No source code, migration, user balance, provider credential, production service, or deployment was changed.

**Status:** FOUR_DIRECT_GPTUNNEL_ENTRY_MODULES_IDENTIFIED / TWO_LEGACY_TEXT_PATHS_UNMETERED / IMAGE_PATHS_HAVE_DURABLE_FINANCIAL_JOURNALS / RUNTIME_UNVERIFIED.
