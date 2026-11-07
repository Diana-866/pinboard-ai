# AUD-078 — Credit reservation and provider-cost reconciliation review

**Date:** 2026-11-07  
**Scope:** Multi-pin generation, single-pin regeneration, GPTunnel provider outcomes, and user-credit settlement.  
**Branch:** `feat/persisted-boards-api`

## Executive summary

The current implementation has a coherent reservation-and-settlement path for new image generation requests. Both multi-pin generation and single-pin regeneration reserve user credits before image submission, persist provider task identity/outcome, and resize the reservation to the provider's terminal price before settlement. The database settlement functions perform the user debit and pin persistence in one transaction.

No confirmed path was found in this review that debits the same completed request twice. This is a code-level review only; PostgreSQL integration tests and live provider reconciliation have not been executed in this environment.

## Verified controls

### Multi-pin generation

- Migration 054 creates a per-user/idempotency-key reservation and serializes balance changes by locking the user row.
- Migration 065 resizes an active reservation while preserving the user → request → reservation lock order.
- Migration 067 persists immutable per-task GPTunnel quotes before image submission.
- Backend `ensureTaskQuotes` validates saved quote model, currency, aspect ratio, and positive finite price, persists missing quotes, then resizes the reservation before the first image submission.
- Migration 054's `complete_pin_generation_request` requires the matching reservation, rejects a charge above the reserved amount, and settles the reservation and credit debit atomically with pin creation.
- If terminal provider cost exceeds the current available credit ceiling, the route can retain recoverable provider results and require a top-up rather than submit a second image task.

### Single-pin regeneration

- Migration 066 reserves credits before a new image task is submitted and keeps reservations for unknown provider outcomes.
- Migration 068 persists the exact quote and resizes the reservation to the quote-derived credit amount.
- The backend reuses the saved quote on same-key recovery and does not create a new provider task when a provider task ID is already journaled.
- After a terminal provider result, the backend resizes to `ceil(actual provider RUB price × markup)` before calling `complete_pin_regeneration_request`.
- Migration 066 locks the user, request, and reservation, checks other active reservations, and commits the credit debit, pin update, transaction row, and reservation settlement together.

### Provider failures and refunds

- Migrations 063 and 064 persist terminal provider outcome facts separately from user-credit settlement.
- Missing refund metadata is not inferred as a refund.
- Confirmed terminal failure releases the user's reservation; this means PinPosy absorbs any provider charge when GPTunnel explicitly reports that a failed task was not refunded. This is a product/business policy decision, not an accidental duplicate debit.

### Text generation spend

- Migration 069 records GPTunnel text usage independently, including token counts, model, request ID, and provider-reported RUB cost when available.
- A missing `total_cost` is explicitly stored as `cost_missing`; the implementation does not invent a zero cost.
- **Important margin limitation:** text-generation spend is currently recorded for observability but is not added to the user's per-image credit settlement. The current image markup may cover this overhead in aggregate, but the repository does not prove that it always does—especially for requests with different pin counts or changing text-model prices. This is not a double-charge vulnerability; it is a unit-economics/accounting gap that should be measured before final tariff approval.

## Remaining risks / follow-up

1. **No executed database proof yet.** The SQL integration tests for migrations 067–069 must pass in CI or a disposable PostgreSQL instance before these migrations are considered production-ready.
2. **Provider cost missing.** The text ledger records `cost_missing`, but the route currently proceeds to image-task preparation after that record. Decide whether a missing text cost should block further billable image submissions or remain an explicitly monitored exception.
3. **Text-cost allocation.** Decide whether text-generation provider cost should be allocated across generated pins, included in a fixed request fee, or treated as platform overhead. Do not change customer credit prices until measured GPTunnel usage data supports the policy.
4. **Provider failure economics.** Confirm that releasing user credits after a terminal non-refunded provider failure is the intended customer policy and that platform-level provider spend is separately reconciled.
5. **Live reconciliation remains unverified.** No real GPTunnel tasks, payments, customer balances, Supabase production migrations, deployments, or merges were performed.

## Verification status

- Reviewed migrations 045, 046, 054, 063–069 and relevant backend routes/modules.
- Confirmed migration 069 integration test now includes exact replay, conflicting replay, missing-cost, negative-token, and stale-claim cases.
- GitHub Actions logs for the prior failed runs were unavailable from GitHub's log artifact endpoint (`BlobNotFound`); therefore their root causes remain unknown.
- Vercel's latest status reported `build-rate-limit`; no successful frontend build is claimed.
- PR #4 remains Draft and unmerged. Production remains untouched.
