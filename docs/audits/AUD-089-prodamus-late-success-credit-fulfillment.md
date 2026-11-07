# AUD-089 — Prodamus late-success credit fulfillment

**Scope:** SQL fulfillment behavior for signed Prodamus success callbacks that arrive after an earlier `order_canceled` or `order_denied` notification.

## Finding

The webhook handler deliberately permits a valid, amount-matched `success` callback to reach `credit_paid_purchase` even when the purchase row currently has status `canceled` or `denied`. This is necessary because provider notifications can arrive out of order.

The RPC in `db/migrations/010_atomic_credit_ledger.sql` locks the purchase row with `FOR UPDATE`, checks `balance_credited_at`, adds the package credits, inserts a ledger row keyed by `purchase_id`, and marks the purchase successful in one PostgreSQL transaction. A duplicate callback returns the current balance without a second credit.

## Change

Extended `backend/test/postgres-integration.sql` with regression coverage for:
- late success after `canceled`;
- late success after `denied`;
- duplicate late success after `canceled`;
- final purchase status and exactly one `credit_transactions` row per purchase.

The test runs through the existing `atomic-payment-integration.yml` workflow, which applies migration 010 and executes `backend/test/postgres-integration.sql`.

## Verification status

- Source and workflow wiring inspected on `feat/persisted-boards-api`.
- Test changes committed, but not executed locally (no local PostgreSQL client/database available in this session).
- Current GitHub Actions jobs report failure, but job logs are unavailable from GitHub (`BlobNotFound`). Therefore this regression test is **not yet verified by execution**.
- No Supabase production migration, live payment, PR merge, or deployment was performed.

## Operational note

Do not manually change purchase statuses or credit balances to resolve a delayed callback. Reconcile the provider payment first, then use the signed webhook flow or a separately audited administrative repair procedure.
