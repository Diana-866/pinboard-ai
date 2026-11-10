# AUD-089 — Prodamus credit-purchase fulfillment database coverage

## Scope
Audited the paid-credit callback path from `backend/creditsBilling.js` into
`public.credit_paid_purchase(uuid, timestamptz, text)` (introduced in
`db/migrations/010_atomic_credit_ledger.sql`).

## Findings
- The HTTP handler validates the Prodamus signature, known order, final success
  status, expected currency, and server-stored purchase amount before invoking
  the fulfillment RPC.
- The RPC serializes duplicate fulfillment with `SELECT ... FOR UPDATE` on the
  purchase row and uses `balance_credited_at` as its idempotency marker.
- The unique partial index on `credit_transactions(purchase_id)` is a second
  ledger-level duplicate guard.
- Late signed success is intentionally allowed for a purchase previously marked
  denied/canceled; this supports delayed provider callbacks. The callback still
  has to pass the amount/currency checks before the RPC is called.
- Existing Node tests mocked the RPC. The atomic-payment PostgreSQL workflow did
  not directly execute the real `credit_paid_purchase` function, leaving a gap
  between handler tests and the database transaction contract.

## Change
Added `backend/test/prodamus-credit-fulfillment.integration.sql` and wired it
into `.github/workflows/atomic-payment-integration.yml` after all migrations.
The test executes the actual RPC twice for the same canceled purchase (simulating
a valid late success and its replay), then verifies:
- balance increases exactly once;
- exactly one purchase-linked top-up ledger row exists;
- purchase status, paid timestamp, and credited marker are committed together;
- execute privilege is granted to `service_role` and denied to `authenticated`.

The test is wrapped in a transaction and rolls back its disposable user/purchase.

## Verification limits
This change was committed to the PR branch only. The SQL test was not run from
this session: there is no local PostgreSQL client/checkout available here.
GitHub Actions must execute the integration workflow to validate the SQL on
PostgreSQL 16. Production Supabase data and live Prodamus callbacks were not
accessed. No production migration, payment, merge, or deployment was performed.
