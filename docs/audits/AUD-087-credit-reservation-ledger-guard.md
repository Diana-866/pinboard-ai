# AUD-087 — Generic credit adjustments must respect active reservations

## Finding

Migration 054 protects active generation reservations in the generation-specific legacy charge function. However, the generic `adjust_credits_balance_and_log` RPC from migration 010 still checked only that the resulting balance stayed non-negative. A service-role caller using this generic debit path could therefore spend credits that were already held for an in-flight generation or regeneration provider request.

The backend helper `backend/credits.js` exposes this RPC as `adjustBalance`. Even if current production routes do not call that helper for ordinary generation settlement, the database function is an available service-role debit path and must preserve the same reservation invariant.

## Change

Migration 074 replaces `adjust_credits_balance_and_log` while preserving its signature and service-role-only access.

- Locks the user row first, matching the established reservation/settlement lock order.
- For negative adjustments, subtracts all active `reserved` holds from available balance before allowing the debit.
- Rejects a debit that would consume reserved credits with `insufficient unreserved credits`.
- Positive adjustments remain allowed while reservations exist.
- Adds an integer-overflow guard for positive adjustments.
- Updates balance and inserts the ledger row in the same transaction.

The migration does not alter any existing balance, reservation, or ledger row.

## Test

`backend/test/credit-reservation-ledger-guard.integration.sql` verifies:
1. A generic debit is rejected when it would consume active held credits.
2. The rejected debit leaves both balance and ledger unchanged.
3. A positive adjustment succeeds while a reservation is active.
4. The same debit succeeds after the reservation is released.

The migration and test are added to `.github/workflows/atomic-payment-integration.yml`.

## Verification status

The change is committed to the open Draft PR branch. GitHub Actions has not yet confirmed a successful run. No production Supabase migration has been applied, and no production balances or reservations were changed.
