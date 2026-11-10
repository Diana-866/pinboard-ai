# AUD-329 — GPTunnel generation spend controls and task recovery

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Scope:** source-level review of GPTunnel image/text call sites, image quote and reservation lifecycle, provider task journaling, retries, storage recovery, rate limits, and related regression tests.  
**Safety:** no provider API call, live customer generation, database query/migration, payment, deployment, or production configuration change was performed.

## Executive result

The core multi-image and single-pin image-generation flows have strong source-level protections against duplicate provider submissions and user-credit double charging: exact image quotes are journaled, credits are reserved before provider submission, provider task IDs are persisted, ambiguous outcomes are not blindly retried, and settlement uses terminal provider prices.

The principal uncovered exposure is outside those hardened image workflows: two older GPTunnel text call sites (`POST /projects/:id/analyze` and `POST /projects/:id/boards/generate`) still call the legacy `generateText()` adapter directly. They do not persist provider usage/cost, reserve user credits, or create a durable provider-operation record. They are guarded by a process-local per-account rate limiter, but not by a durable aggregate spending budget. This is a platform cost-control gap, not evidence of user credit theft.

## Positive controls confirmed

### 1. Multi-pin image generation

- Requires an authenticated user, AI rate limit, eligible tariff, and ownership-checked board/project context.
- Requires a well-formed `Idempotency-Key`; a database request journal and claim token serialize same-key work.
- Persists the text plan and per-image quote before billable image task submission.
- Validates quote model, RUB currency, exact aspect ratio, and absence of ignored parameters.
- Reserves user credits before crossing the provider image-task boundary; resizes the reservation to actual terminal provider prices before atomic completion.
- Persists provider task ID/status before polling. Recovery polls the known task or rehosts the journaled result rather than issuing a second create request.
- Unknown/pending tasks block final completion; ambiguous provider results are not treated as safe failures/refunds.
- The final database RPC is the settlement boundary for pin insertion and user-credit debit.

### 2. Single-pin regeneration

- Checks pin ownership, requires an idempotency key, and uses a durable request claim.
- Quotes the exact prompt/model/aspect ratio and reserves credits before a new provider submission.
- Persists the provider task ID immediately after acceptance; same-key recovery polls that task.
- Records terminal provider outcome before image rehosting, allowing Storage retry without another provider generation.
- Resizes the reservation to actual provider cost before the atomic pin update/debit.
- Recovery of a possibly billable task is not blocked merely because the user's current available balance changed.

### 3. Provider adapter and result validation

- GPTunnel requests have a 30-second HTTP timeout and use a configured API key.
- Image task IDs are validated before task lookup; provider result URLs must be HTTPS and contain no embedded credentials.
- Provider result price and task ID are validated before acceptance.
- Polling is bounded to at most 30 polls per invocation; exhaustion returns a pending result rather than creating a replacement task.
- Image task creation carries the persisted idempotency key.
- Tests cover provider task recovery without a second create, pending poll exhaustion, synchronous completion journaling, URL validation, exact image quotes, ignored quote parameters, and failed-task refund metadata.

## Findings

### AUD-329-01 — Legacy project analysis bypasses usage/cost journaling

**Severity: Medium — provider COGS / abuse exposure**

Evidence:
- `POST /projects/:id/analyze` checks project ownership and uses the shared `aiLimiter`, but does not apply a tariff gate or credit reservation.
- It calls `analyzeSite()`, which calls `generateText()` rather than `generateTextWithUsage()`.
- The legacy adapter explicitly sets `requireUsage: false` and returns only text; the provider request ID and RUB usage are discarded.
- There is no durable idempotency key, text usage row, or per-user/provider cost record for this operation.

Impact:
- Each accepted request can incur GPTunnel text cost without appearing in the provider-cost reporting view introduced by migration 079.
- The per-process limiter is not a durable monthly/daily spend cap and resets with process restarts; multiple instances have independent memory stores.
- A retry after an ambiguous network failure can incur another provider call because no durable operation identity is retained.

Recommendation:
- Route this operation through a usage-aware adapter and persist an operation journal with user/project, model, request ID, RUB cost or explicit `cost_missing`, status, and idempotency identity.
- Decide explicitly whether analysis is included in a paid plan, consumes credits, or is a bounded platform subsidy. Enforce that policy server-side.
- Add durable global and per-account spending ceilings/alerts; do not treat a process-local request limiter as a financial budget.

### AUD-329-02 — Board idea generation also bypasses usage/cost journaling

**Severity: Medium — provider COGS / accounting completeness**

Evidence:
- `POST /projects/:id/boards/generate` checks project ownership, requires an eligible tariff, and uses the shared `aiLimiter`.
- `generateBoards()` calls legacy `generateText()` and discards provider usage, request ID, and cost.
- The route does not create a durable idempotency journal or provider-cost ledger entry.

Impact:
- Paid-plan gating limits eligibility but does not quantify or cap provider spend per account.
- Repeated calls can create provider expense that is absent from migration 079's normalized provider cost view.
- Client retries can produce duplicate board suggestions and repeated text-provider spend.

Recommendation:
- Persist usage and operation identity for board generation, then choose a product rule: charge credits, include a bounded allowance, or impose a durable plan quota.
- Make the operation idempotent (or explicitly document that each invocation is a separately billable action).
- Include this operation in cost reporting and account-level spend limits.

### AUD-329-03 — Existing process-local AI limiter is not a hard spend ceiling

**Severity: Medium — operational control**

Evidence:
- `aiLimiter` allows 12 requests per user per minute and is shared across the billable AI routes in one backend process.
- The code comment explicitly notes that MemoryStore is process-local and a shared store is required for a cross-instance global quota.
- The two legacy text routes above also use this limiter, but no persistent daily/monthly provider-spend ceiling was identified in the reviewed call sites.

Impact:
- Restarting an instance resets the counter; horizontal scaling multiplies the effective allowance.
- Request count does not correspond to a fixed RUB cost because models, prompt sizes, and generated token counts vary.

Recommendation:
- Keep rate limiting as an abuse throttle, but add a database-backed or shared-store spend budget based on recorded provider cost.
- Add separate low-cost ceilings for unknown/unrecorded provider outcomes and alert on missing-cost records.

### AUD-329-04 — Text generation inside the pin-generation plan has an acknowledged unknown-cost case

**Severity: Medium — cost observability (carried forward from AUD-132/AUD-119)**

Evidence:
- Pin generation uses `generateTextWithUsage(..., { requireUsage: false })`.
- Missing provider `total_cost` is represented as `cost_missing` by the text usage journal, not silently converted to zero.
- Image generation can continue after the text plan is saved even when its text cost is missing.
- The text request has no confirmed provider-side idempotency or pre-submission provider operation identifier.

Recommendation:
- Keep missing cost as an unresolved value, alert on its age/count, and decide whether it blocks image submission or is allowed under a capped platform subsidy.
- Verify GPTunnel's official support for text idempotency or request-history lookup before attempting automatic retry/reconciliation.

## Test and verification matrix

| Area | Source evidence | Runtime status |
|---|---|---|
| Image quote validation | Unit tests present | Not executed in this audit |
| Image task idempotency/recovery | Unit tests present | Not executed in this audit |
| Image result URL/price validation | Unit tests present | Not executed in this audit |
| Multi-pin reservation/settlement | PostgreSQL integration tests and migrations present | Not executed against PostgreSQL |
| Regeneration reservation/settlement | PostgreSQL integration tests and migrations present | Not executed against PostgreSQL |
| Legacy project analysis cost journaling | No dedicated usage-journal path identified | Gap confirmed by source |
| Legacy board generation cost journaling | No dedicated usage-journal path identified | Gap confirmed by source |
| Shared/global spend budget | Process-local limiter found | Not verified/configured in deployment |

## Recommended implementation order

1. Add durable operation/usage journaling for project analysis and board idea generation, reusing the usage-aware GPTunnel response contract where supported.
2. Define product charging policy for those two text operations and enforce it server-side.
3. Add a shared/durable provider-spend budget and alerts; retain request rate limits as a separate abuse control.
4. Extend migration 079's reporting view only after the new source journal semantics are defined.
5. Run the existing Node unit tests and PostgreSQL integration/concurrency suite in CI/disposable PostgreSQL; compare normalized cost totals with GPTunnel account statements.

## Conclusion

No duplicate image-task submission or image-credit double-charge path was demonstrated by this bounded source review. The hardened image-generation path is materially stronger than the two legacy text-generation paths. The actionable gap is unmetered/unledgered GPTunnel text spend for project analysis and board idea generation, plus the absence of a durable spend ceiling.

**Status:** IMAGE_GENERATION_GUARDS_SOURCE_CONFIRMED / LEGACY_TEXT_COGS_GAP_CONFIRMED / PROCESS_LOCAL_LIMITER_ONLY / RUNTIME_UNVERIFIED.
