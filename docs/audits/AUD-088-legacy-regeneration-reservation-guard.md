# AUD-088 — Legacy single-pin regeneration debit guard

## Finding

The journaled regeneration flow uses `reserve_pin_regeneration_credits` and `complete_pin_regeneration_request` (migration 066). However, the older service-role RPC `update_pin_image_and_charge(text, uuid, text, integer)` from migration 013 remained callable. It debited the user's full balance without subtracting active generation/regeneration reservations. It also locked the pin before the user row, unlike the newer global credit lock order.

## Change

Migration 075 replaces the legacy RPC while preserving its signature and service-role-only grant. It locks the user before the pin, verifies ownership, subtracts active reserved holds from available balance, and updates the pin, balance, and ledger atomically. It does not modify reservations.

## Test

`backend/test/legacy-regeneration-reservation-guard.integration.sql` verifies that a debit consuming held credits is rejected without changing state, then succeeds after the reservation is released.

Migration 075 and the test are wired into `.github/workflows/atomic-payment-integration.yml`.

## Verification

The change is committed to the open Draft PR branch. CI has not confirmed a successful run; no production migration was applied and no production balances or reservations were changed.
