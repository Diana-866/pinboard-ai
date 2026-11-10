# AUD-401 — Proposed payment/deletion concurrency test contract

No executable test yet; depends on reviewed lifecycle and receipt migrations.

## Test file proposal
- `backend/test/prodamus-deletion-race.sh`: two independent psql sessions.
- `backend/test/prodamus-deletion-race.integration.sql`: aggregate invariants and role/receipt checks.
- Extend `.github/workflows/atomic-payment-integration.yml` to invoke the shell script after the new migration sequence.

## Race matrix

| Winner for users row | Expected payment outcome | Expected deletion outcome |
|---|---|---|
| Deletion acceptance | Receipt retained; entitlement withheld; no balance/ledger | Fence commits first |
| Payment fulfillment | Receipt + one ledger + entitlement granted | Deletion waits, then fence commits |
| Duplicate payment callbacks | One receipt identity and one entitlement | Deletion ordering unaffected |
| Receipt committed, RPC response lost | Retry resumes idempotently | No duplicate entitlement |
| Unknown provider outcome | Preserve unknown; no blind refund/retry | Cleanup waits for reconciliation |

## Required SQL assertions
- For withheld: `balance_credited_at IS NULL`, no purchase ledger row, unchanged user balance, decision `withheld_account_lifecycle`.
- For granted: balance increases by package credits exactly once, one `credit_transactions.purchase_id`, purchase success marker, decision `granted`.
- In both paths: immutable receipt remains; no duplicate decision; no deadlock; no provider/network call in DB transaction.

## Implementation gate
Do not add test file or workflow step until migration and RPC signatures are final. Use synthetic fixture and disposable PostgreSQL 16 only.
