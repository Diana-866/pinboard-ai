# AUD-339 — Missing GPTunnel text-cost policy and recovery impact

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** SOURCE REVIEW COMPLETE — policy decision required before behavior change  
**Related:** AUD-329–AUD-338

## Scope

Reviewed:
- `backend/gptunnel.js` text completion adapter and `generateTextWithUsage()`;
- `backend/pins.js` text-plan generation and callback order;
- `backend/index.js` generation route, usage journal callback and failure handling;
- migrations `069_gptunnel_text_usage_ledger.sql`, `044_pin_generation_uncertainty_fence.sql`, `054_pin_generation_credit_reservations.sql`, `079_gptunnel_provider_cost_reporting_view.sql`;
- `backend/test/gptunnel-pricing.test.js`.

This is a source review. It does not verify live database migration state, actual GPTunnel billing semantics, or production usage records.

## Current behavior (confirmed)

1. `generateTextWithUsage()` defaults to strict cost metadata: if `usage.total_cost` is missing, invalid, or negative, it throws `GPTUNNEL_USAGE_COST_MISSING`.
2. The pin-plan path explicitly passes `{ requireUsage: false }`. It receives the content and a normalized `usage.totalCost: null` when total cost is missing/invalid.
3. Before parsing the plan or requesting image quotes, `generatePins()` awaits `onTextProviderUsage()`.
4. The route writes a row through `record_pin_generation_text_usage`. Migration 069 explicitly records `usage_status='cost_missing'` with `total_cost_rub=NULL`; it does not coerce unknown cost to zero.
5. If this journal write fails, the route aborts before image quotes/submissions.
6. If the journal write succeeds with a missing cost, current code continues to parse the plan, quote images and potentially submit image tasks.
7. Migration 079 reports this row as `accounting_status='cost_missing'` and `net_known_cost_rub=NULL`.
8. If the route throws after provider submission, it calls `fail_pin_generation_request` with `p_outcome_unknown=true` while `providerGenerationStarted` remains true. The request becomes `unknown`; migration 054 deliberately retains its credit reservation for unknown outcomes. Only a definitive `failed` status releases the reservation.

## Decision analysis

### Option A — Fail closed before image generation (recommended for spend control)

After successfully recording a `cost_missing` usage row, stop before parsing/persisting the plan, image quotes, or image submissions.

Implementation must explicitly mark the text-provider call as **known completed** before raising the policy error. Otherwise the current catch path incorrectly marks the whole generation outcome `unknown` and retains the user's credit reservation, even though no image task was submitted and the text response/usage row are already known.

Expected behavior:
- text usage row remains `cost_missing` for internal reconciliation;
- no image quote or image task is created;
- generation request is marked definitively `failed`;
- the existing reservation trigger releases the reserved user credits;
- response returns a retryable service error with a clear message that provider cost metadata is temporarily unavailable;
- retry with the same key follows the existing terminal-failure policy; a new attempt requires a new idempotency key.

Trade-off: this protects downstream image spend and avoids holding user credits, but the service may still have incurred an unknown text-provider charge. It does not make the provider's already-completed text call free or recover its missing cost.

### Option B — Continue with explicit reconciliation (current behavior)

Continue image generation while preserving `cost_missing` in the ledger and reporting view.

Expected behavior:
- better availability and fewer interrupted user requests;
- downstream image spend remains controlled by existing quotes/reservations/settlement;
- text provider cost remains unknown and must be reconciled from provider history or billing export;
- unknown text cost can accumulate without a hard internal cost ceiling.

Trade-off: availability is higher, but it is not strict cost-control behavior. The ledger makes the gap visible; it does not prevent it.

## Recommendation

Adopt Option A for new pin-generation requests if the product priority is strict spend containment. Keep the unknown text cost row for reconciliation and do not convert null to zero. Implement the change only with a focused test proving:
1. cost_missing is journaled;
2. image quote callback is never called;
3. image provider submission is never called;
4. request is definitively failed, not unknown;
5. reservation is released by the existing failure trigger.

Do not change `generateTextWithUsage()` default behavior, legacy analysis/board suggestion behavior, tariffs, user credits, image settlement, or payment code in this scope.

## Approval boundary

This is a user-visible product policy: it trades occasional interrupted generations for stronger protection against untracked provider spend. No behavior change was made in AUD-339. Confirm Option A or Option B before implementing.

## Validation and limitations

- Source and migrations were read from the branch.
- Existing unit test asserts the adapter's default strict behavior when `total_cost` is omitted.
- No tests, lint, typecheck, build, or live DB migration checks were executed.
- No GPTunnel request, Supabase operation, payment, or deployment occurred.

## Next

After policy confirmation, implement the selected branch and focused route/provider-boundary tests. Independently, verify actual CI execution when a GitHub Actions run becomes available.
