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
- [ ] Compare deployed catalog with migrations 001, 010, 011, 029, 116–118 and any later changes.
- [ ] Record schema drift as findings; do not "fix" drift during preflight.
- [ ] End read-only transaction with ROLLBACK.

## Part B — Disposable PostgreSQL harness

- [ ] Use the repository's PostgreSQL 16 CI service only.
- [ ] Use synthetic user/purchase/provider IDs.
- [ ] Apply reviewed lifecycle + receipt migrations to disposable schema.
- [ ] Session D holds user lock and marks deletion_pending; Session P waits then records withheld receipt with no balance/ledger grant.
- [ ] Reverse order: Session P holds user lock and grants exactly once; Session D waits, then fences account.
- [ ] Race duplicate webhook sessions; one receipt, one decision, one ledger entry.
- [ ] Simulate receipt commit / fulfillment response loss; retry does not double grant.
- [ ] Prove old purchase→user / new user→purchase inversion is detected in an isolated negative test.
- [ ] Use `application_name`, `pg_stat_activity`, bounded waits, cleanup traps.
- [ ] Never set PGHOST/credentials to Supabase for these shell tests.

## Part C — CI

- [ ] Add the new race script only after lifecycle/receipt RPCs exist.
- [ ] Keep workflow PostgreSQL service self-contained; no Supabase secrets.
- [ ] Update migration-chain guard only when migration number is finalized.
- [ ] Run existing credit, subscription, checkout-settlement and new deletion-race suites.

## Stop conditions

Stop if project identity/read-only role cannot be verified; if any query requires customer data; if migration history differs from catalog; if RPC signatures or grants differ; if a lock wait exceeds its bound; or if a test uses a non-disposable database. Do not resolve these by guessing.
