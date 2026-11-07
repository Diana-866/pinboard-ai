# AUD-088 — Legacy single-pin regeneration debit guard

## Finding

The journaled regeneration flow uses `reserve_pin_regeneration_credits` and `complete_pin_regeneration_request` (migration 066). However, the older service-role RPC `update_pin_image_and_charge(text, uuid, text, integer)` from migration 013 remained callable. It debited the user's full balance without subtracting active generation/regeneration reservations. It also locked the pin before the user row, unlike the newer global credit lock order.

This was a remaining legacy debit path even after AUD-087 guarded the two generic balance RPCs.

## Change

Migration 075 replaces the legacy RPC while preserving its signature and service-role-only grant.

- Locks the user row before the pin row.
- Verifies that the target pin belongs to the supplied user.
- Sums every active `reserved` credit hold for that user.
- Rejects a debit if the unreserved balance is insufficient.
- Updates the pin image, balance, and credit ledger in one transaction.
- Leaves active reservation rows unchanged.

## Test

`backend/test/legacy-regeneration-reservation-guard.integration.sql` creates a disposable user/project/board/pin and verifies:
1. A debit that would consume held credits is rejected.
2. The failed operation leaves the balance, pin image, and ledger unchanged.
3. The same debit succeeds after the hold is released.

Migration 075 and the integration test are wired into `.github/workflows/atomic-payment-integration.yml`.

## Scope and verification

The audit covered the older debit RPCs in migrations 012–013 and their replacements in migrations 054 and 066. The generation legacy RPC is replaced by migration 054; the journaled regeneration settlement is guarded by migration 066; the remaining single-pin legacy RPC is now guarded by migration 075.

This change is committed to the open Draft PR branch. The CI job has not yet produced a successful test run, and no production migration has been applied. No production balances or reservations were changed.
