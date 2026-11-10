# AUD-119 — Credit ledger and provider-outcome reconciliation audit

**Scope:** source-level review of credit reservations, image/text provider outcomes, single-pin regeneration, Prodamus fulfillment, and recovery paths.  
**Branch:** `feat/persisted-boards-api`  
**Audit type:** read-only review; no production database or provider access.  
**Execution note:** migrations and tests were inspected as source only; this audit does not claim they have been applied or executed.

## Executive summary

The current design has several strong financial safeguards:

- User credits are reserved before new billable image submissions.
- Provider terminal facts are journaled separately from user-credit settlement.
- Exact provider quotes are persisted and reservations are resized to actual provider prices before settlement.
- Generation completion, pin persistence, user debit, and ledger insertion are intended to commit in one PostgreSQL transaction.
- Prodamus credit-pack fulfillment uses a locked purchase row and a durable credited marker, preventing duplicate top-ups.
- Unknown provider outcomes are intentionally not treated as refunds.

The main remaining operational gap is the **manual provider-refund reconciliation path**: migration 073 records an evidence-backed refund fact, but does not provide a corresponding atomic “finalize terminal request” operation. In single-pin regeneration, replaying the provider failure after manual reconciliation can conflict with the now-enriched refund field. This can leave a request in `processing` with a reservation still held until an operator performs additional state transition work.

## Findings

### AUD-119-01 — Manual refund reconciliation has no atomic finalization step

**Severity: High — recovery/operations**

Evidence:
- Migration 072 blocks a failed generation/regeneration transition while a provider task has an unknown refund outcome.
- Migration 073 provides `reconcile_pin_generation_provider_refund` and `reconcile_pin_regeneration_provider_refund`. These functions update the refund fact and write an evidence reference to `provider_refund_reconciliation_audit`.
- Both reconciliation functions require the parent request to remain `processing` and require an active credit reservation.
- Neither function transitions the parent request to `failed`, releases the reservation, or schedules a safe follow-up settlement.
- The regeneration route's normal failure path transitions the request to `failed` only after recording a provider outcome. The trigger in migration 072 blocks that transition if reconciliation is still incomplete.

Impact:
- After an operator resolves a previously unknown refund, the database contains the evidence-backed fact but does not itself complete the workflow.
- The request may remain `processing` and continue holding credits. A second operator action or a dedicated recovery worker is required, but no atomic finalization RPC is defined in the reviewed migrations.

Recommendation:
- Add a service-role-only finalization RPC for generation and regeneration.
- It should lock rows in the established order, require every provider task to be terminal and reconciled, verify the active reservation, then transition the parent request to `failed` (or a distinct reconciled terminal state) so the existing trigger releases the reservation.
- Write an audit event in the same transaction. Do not let the operator directly edit balances or reservation rows.

### AUD-119-02 — Regeneration replay can conflict after manual refund reconciliation

**Severity: High — retry correctness**

Evidence:
- Migration 063 treats a repeated provider outcome as idempotent only when all stored facts match, including `provider_refunded`.
- Migration 073 fills `provider_refunded` when it was previously unknown.
- The regeneration route resumes an existing provider task and, when GPTunnel reports failure again, calls `record_pin_regeneration_provider_outcome` with the provider's current refund field.
- The original row may contain `provider_refunded = null`; after manual reconciliation it contains `true` or `false`. The replay comparison therefore rejects an otherwise identical provider failure as a conflicting replay.

Impact:
- A same-key retry after manual reconciliation can fail while trying to re-record the already-known failed provider task. The request can remain `processing` instead of completing the intended failure/release path.
- This is not a reason to weaken immutable provider facts. Reconciliation should be represented as a separate audited fact, and the replay comparison should distinguish the original provider response from later operator evidence.

Recommendation:
- Keep the original provider response immutable in separate columns or a separate provider-outcome record.
- Store the reconciled refund fact separately (or explicitly permit a null-to-known enrichment only when a matching reconciliation-audit row exists).
- Make the finalization RPC from AUD-119-01 the supported recovery path; same-key retries should not be required to mutate the original provider outcome.

### AUD-119-03 — Text-provider spend can be recorded as cost-missing while image work proceeds

**Severity: Medium — cost observability**

Evidence:
- `generateTextWithUsage(..., { requireUsage: false })` accepts a successful text response even if GPTunnel omits a usable total cost.
- Migration 069 intentionally stores `usage_status = 'cost_missing'` when `total_cost_rub` is null.
- The route records the usage row, but does not block image generation solely because the text cost is missing.

Impact:
- User-facing image credit accounting remains separate, but internal provider-cost reporting can understate spend until the missing text cost is reconciled.
- This is an observability/COGS gap, not evidence of duplicate user credit charges.

Recommendation:
- Add an admin reconciliation view/metric for `cost_missing` rows and alert on their age/count.
- Preserve the current explicit missing-cost state; do not replace it with a guessed zero.

### AUD-119-04 — Prodamus credit-pack fulfillment has a strong atomic idempotency boundary

**Severity: Positive control**

Evidence:
- The webhook validates signature, order identity, normalized success status, currency, and exact expected amount before fulfillment.
- Migration 010 locks the purchase row, checks `balance_credited_at`, increments the user balance, inserts a `credit_transactions` row with unique `purchase_id`, and marks the purchase credited in one transaction.
- A late verified success can fulfill a previously denied/canceled purchase, which is necessary when payment creation or webhook delivery was ambiguous.
- Duplicate fulfillment returns the current balance without inserting another top-up.

Assessment:
- This is a sound pattern. Keep the database RPC as the only fulfillment boundary; do not move the balance increment into application-level read/modify/write logic.

### AUD-119-05 — Generation reservations and settlement are consistently guarded at the database boundary

**Severity: Positive control**

Evidence:
- Migrations 065–068 resize reservations using user → request → reservation lock order and persist exact provider quotes against immutable model/aspect-ratio data.
- Migration 071 validates the terminal task journal against the completed pin payload.
- Migration 072 prevents request completion/failure while failed provider tasks have unresolved refund facts.
- Migration 074 makes generic negative credit adjustments respect active reservations.
- Migration 075 applies the same unreserved-credit invariant to the legacy regeneration debit RPC.
- The current generation route resizes the reservation to actual marked-up provider prices before calling the atomic completion RPC.

Assessment:
- These controls substantially reduce double-spend, over-reservation, and journal/settlement divergence risks.
- They depend on the relevant migrations having been applied in the intended order. This was not verified against the live Supabase database.

### AUD-119-06 — Unknown outcomes intentionally hold reservations; operational visibility is still needed

**Severity: Medium — operations**

Evidence:
- Generation and regeneration routes retain an `unknown`/processing state rather than silently retrying a possibly billable provider submission.
- Reservations remain active while the provider outcome or refund fact is unresolved.
- Migration 073 records evidence references but no user-facing or admin-facing queue/health endpoint for aging unresolved refund reconciliations was identified in this review.

Impact:
- The financial behavior is conservative, but users can experience credits being unavailable for an extended period if provider outcomes need manual investigation.
- Without an aging queue and owner, safe holds can become indefinite holds.

Recommendation:
- Expose an admin-only queue with request kind, user ID, idempotency key, provider task ID, age, amount reserved, and reconciliation status. Do not expose provider credentials, raw payloads, or internal claim tokens.
- Add alerts for unresolved outcomes older than an agreed threshold and a documented operator runbook.

## User-visible vs internal financial data

Suitable for a future user billing/history view or account export:
- Credit transaction date, signed amount, transaction category, and a safe human-readable description.
- Purchase package, paid amount/currency, status, paid timestamp, and credits granted.
- Subscription plan, paid amount/currency, status, and period start/end.
- For generation history: user-facing task status and user credit charge, but only when the operation is terminal and settled.

Keep internal/admin-only:
- Provider task IDs and provider request IDs unless a specific support workflow requires them.
- Provider quote payloads, raw provider prices, refund-reconciliation evidence references, raw webhook bodies, and raw provider errors.
- Idempotency keys, claim/fencing tokens, worker leases, and reservation implementation details.
- Internal provider-cost/COGS ledgers and operational reconciliation audit rows.

Never export:
- Prodamus signing secrets, GPTunnel API keys, OAuth tokens, password/reset tokens, session/JWT secrets, or raw authorization headers.

## Test and verification status

Inspected relevant source files and migration definitions:
- Migrations 010–014, 045–046, 053–054, 063–069, and 071–075.
- `backend/index.js`, `backend/pins.js`, `backend/gptunnel.js`, `backend/credits.js`, `backend/creditsBilling.js`, `backend/billing.js`, and `backend/prodamus.js`.
- Existing test assets include provider-outcome, quote, reservation, concurrency, text-usage, and Prodamus fulfillment tests.

Not performed:
- No tests, npm audit, build, or CI run.
- No live Supabase schema/migration verification.
- No live GPTunnel or Prodamus calls.
- No production configuration or data inspection.

## Recommended next work

1. Implement the atomic provider-refund finalization workflow and the replay-safe representation of reconciled refund facts.
2. Add an admin-only unresolved-outcome queue and aging alert.
3. Add regression tests covering: unknown refund → evidence reconciliation → finalization → reservation release; regeneration same-key retry after reconciliation; multi-task generation with mixed success/failure/refund outcomes.
4. Only after these controls are in place, return to the user export implementation and include settled user-facing financial records while excluding internal reconciliation data.
