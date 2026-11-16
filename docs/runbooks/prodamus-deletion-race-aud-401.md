# AUD-401 — Read-only Supabase preflight and payment/deletion race test runbook

**Design only. Do not run against production until the operator has verified the target project and read-only session.**

## Part A — Supabase schema preflight

- [ ] Confirm exact Supabase project ref and environment in trusted dashboard.
- [ ] Prefer staging. If production is inspected, use a read-only database role.
- [ ] Verify database, role, server version and `transaction_read_only=on`.
- [ ] Set a short statement timeout.
- [ ] Run only SELECTs against information_schema / pg_catalog.
- [ ] Inventory columns/types/nullability, constraints/indexes, function signatures/owners/search_path, grants, RLS/policies, triggers and migration ledger.
- [ ] Return aggregate integrity counts only; no user emails, provider order IDs, raw callbacks, tokens or secrets.
- [ ] Compare deployed catalog with the canonical baseline `001_baseline.sql` and the complete active migration chain `010–148`; do not infer production state from Git. The CI upgrade fixture has its own compatibility setup and is not the canonical baseline.
- [ ] Record schema drift as findings; do not "fix" drift during preflight.
- [ ] End read-only transaction with ROLLBACK.

## Part B — Disposable PostgreSQL harness

- [ ] Use only the repository's isolated PostgreSQL 16 CI service for CI tests, or the separately approved owner-side PostgreSQL 18.6 disposable runner. Never point shell concurrency tests at Supabase or a shared database.
- [ ] Use synthetic user/purchase/provider IDs.
- [ ] Apply the complete canonical lifecycle/payment migrations to a disposable database. Current payment checkout idempotency is migrations 116–118; immutable `payment_provider_receipts` / `payment_entitlement_decisions` in AUD-400 remain proposed and must not be assumed to exist.
- [ ] Session D holds the user lock and marks `deletion_pending`; Session P must be tested against the actual current payment fulfillment RPC and account lifecycle fence. Do not expect an immutable receipt/withheld-decision row until that design is implemented.
- [ ] Reverse order: Session P holds the user lock and fulfills exactly once; Session D waits, then fences the account.
- [ ] Race duplicate Prodamus webhook sessions; assert exactly-once entitlement/ledger effects using the current schema. Receipt/decision assertions belong to the future AUD-400 design only.
- [ ] Simulate checkout-settlement commit / response loss and retry using `payment_creation_requests`; no duplicate fulfillment.
- [ ] Reproduce the exact current lock order for payment fulfillment versus account deletion; retain the negative inversion test only if it is still a real current code path.
- [ ] Use `application_name`, `pg_stat_activity`, bounded waits, cleanup traps.
- [ ] Never set PGHOST/credentials to Supabase for these shell tests.

## Part C — CI

- [ ] Add the new race script only after lifecycle/receipt RPCs exist.
- [ ] Keep workflow PostgreSQL service self-contained; no Supabase secrets.
- [ ] Update migration-chain guard only when migration number is finalized.
- [ ] Run existing credit, subscription, checkout-settlement and new deletion-race suites.

## Stop conditions

Stop if project identity/read-only role cannot be verified; if any query requires customer data; if migration history differs from catalog; if RPC signatures or grants differ; if a lock wait exceeds its bound; or if a test uses a non-disposable database. Do not resolve these by guessing.


## Current repository reconciliation (2026-11-16)

- Canonical mainline migration sequence: `001_baseline.sql` plus active migrations `010–148`.
- CI compatibility workflow uses PostgreSQL 16; owner-side disposable integration runner is a separate PostgreSQL 18.6 environment.
- Payment checkout idempotency is present in migrations 116–118 (`payment_creation_requests`, provider order reference and webhook settlement). The immutable receipt/entitlement-decision tables proposed in AUD-400 are not established by those migrations.
- Migrations 072–073 concern GPTunnel generation/regeneration provider-refund reconciliation, not Prodamus customer payment refunds.
- This remains a proposed test plan; no production Supabase catalog inspection, Prodamus call, payment or deletion race was performed.
