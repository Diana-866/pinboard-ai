# AUD-328 — Credits, payment fulfillment, and financial integrity review

Date: 2026-11-10
Branch: `feat/persisted-boards-api`

## Scope

Reviewed the current checkout creation flows, Prodamus signature and amount validation, credit and subscription webhooks, credit ledger helpers, generation credit reservations and settlement, SQL migrations 010/011/041/054/074/116/117/118, administrative provider-refund actions, and relevant unit/integration/concurrency test sources. Prior financial audits AUD-119, AUD-133, AUD-146 and AUD-308 were considered to avoid reopening already addressed items. Source review only; no tests, database, provider or live payment calls were run.

## Executive result

**No confirmed double-credit, unauthenticated payment fulfillment, or cross-user financial mutation was found in the inspected current paths.** The strongest guarantees live in PostgreSQL transactions and row locks, not in JavaScript alone. Paid credit fulfillment locks the purchase row, updates the user balance, inserts a uniquely purchase-linked ledger row and marks the purchase successful in one transaction. Replayed callbacks return without applying the package again.

## Confirmed controls

### Paid credit fulfillment

- Prodamus webhook signature is checked before order lookup or financial mutation. A separate webhook secret is preferred; comparison is constant-time via fixed-length SHA-256 digests.
- Only documented final statuses are accepted. Unknown/in-progress statuses are not treated as payment success.
- The callback is matched to the local provider order ID. Amount and currency are checked against the stored purchase; foreign-currency callbacks require both currency and currency_sum. Mismatches are durably audited and do not credit.
- `credit_paid_purchase` locks the purchase row `FOR UPDATE`, credits the purchase's stored user and stored credit quantity, inserts one ledger row with purchase_id, and sets success/paid/credited markers atomically.
- A partial unique index on `credit_transactions.purchase_id` provides a second duplicate-ledger barrier. The purchase row lock and `balance_credited_at` marker make concurrent/retried webhook fulfillment idempotent.
- Late valid success after a local denial/cancellation is intentionally supported; the webhook still requires a valid signature and matching amount/currency before invoking the RPC.
- RPC execution is revoked from public/anon/authenticated and granted to service_role.

### Generation and regeneration credit controls

- Reservation creation locks the user row before summing active holds and checking spendable balance.
- Reservation identity is unique by `(user_id,idempotency_key)`; retries must use the same amount.
- Settlement checks the request owner, board ownership, claim token, reservation status and charge ceiling. The user row and request/reservation rows are locked before the debit and pin insert.
- The debit, ledger insert, pin creation, request completion and reservation transition commit in one transaction.
- Generic ledger debits and legacy generation charging respect active reservations. Definitive provider failures release holds; ambiguous provider outcomes keep holds unavailable pending reconciliation.
- SQL functions use a trusted `pg_catalog, public` search path and service-role-only execute grants.

### Subscription fulfillment

- Subscription activation locks both the subscription and user rows, creates the paid period and updates the user's entitlement atomically.
- Repeated success callbacks do not extend the same subscription a second time.
- Delayed older payments cannot downgrade a later entitlement; overlapping concurrent paid periods are serialized.
- Checkout settlement requires the exact provider order, request kind, local payment ID, owner, successful status and a valid activated period.

### Checkout creation and payment replay

- Checkout idempotency is unique per user and key; request fingerprint binds key to payment type, product and currency.
- Provider order ID is persisted before contacting Prodamus and has a unique index.
- Ambiguous provider outcomes are fenced as unknown; retrying the same key cannot create another invoice.
- Checkout completion accepts only the exact previously attached provider order. Once settled, the stored payment URL is cleared and cannot be replayed.
- Payment webhook exceptions are recorded without storing customer email in the audit projection.
- Administrative refund reconciliation routes require authenticated DB-authorized admins; actions carry an action UUID, strict field allowlist and evidence reference. The SQL RPCs re-check operator identity and state.

## Findings and hardening opportunities

### AUD-328-01 — Legacy balance-only adjustment RPC can bypass the credit ledger (low severity, integrity)

Migration 074 deliberately retains `public.adjust_credits_balance(text, integer)` for legacy integrations. It is protected by SECURITY DEFINER, trusted search_path, service_role-only EXECUTE, row locking and active-reservation checks, but it changes `users.credits_balance` without inserting a matching `credit_transactions` row. The current backend helper `adjustBalance` uses `adjust_credits_balance_and_log`, and no current application call to the balance-only function was identified in the reviewed source. Nevertheless, the legacy RPC remains an available service-role capability and can create balance/ledger drift if a future or external service invokes it. Prefer revoking its service_role grant after confirming no deployed legacy caller remains, or change it to append an auditable ledger entry.

### AUD-328-02 — Development top-up relies on explicit environment gating and a shared secret (low severity, deployment configuration)

`POST /credits/dev-topup` is intentionally not JWT-protected; it relies on `NODE_ENV !== "production"`, `ENABLE_DEV_TOPUP === "true"`, and a shared `ADMIN_SECRET` of at least 32 characters checked in constant time. The production guard is fail-closed only when `NODE_ENV` is actually set to the exact string `production`. If a deployed environment accidentally omits NODE_ENV and enables the feature flag, a holder of the shared secret can top up any account by email. Keep `ENABLE_DEV_TOPUP` unset/false in every deployed environment, explicitly set `NODE_ENV=production`, and preferably add JWT + DB-backed requireAdmin as a second gate or remove this endpoint from production builds entirely. No evidence that it is enabled in the live deployment was available.

### AUD-328-03 — Ledger and balance reconciliation is not an enforced invariant (medium operational risk)

The system has atomic writes for its current financial paths, but there is no inspected scheduled control that independently reconciles each user's stored balance against the opening balance plus all credit ledger entries, including reservations/refund corrections. The retained balance-only RPC makes this especially important. Add a read-only reconciliation query/report and alert on discrepancies before attempting any automatic repair. Never auto-correct a discrepancy without classifying legacy adjustments, refunds and migration history.

## Test coverage and verification limits

- Existing source includes PostgreSQL integration tests for purchase fulfillment, exact checkout settlement, generation reservation/overcharge/ambiguous outcomes, and shell concurrency harnesses for duplicate credit webhooks and overlapping subscription activations.
- Unit tests exercise signed webhooks, amount/currency mismatches, duplicate callbacks, commit-then-error recovery, settlement retry, cancelled-after-success protection, checkout idempotency and ambiguous provider timeouts.
- The integration SQL files are test source, not evidence that the current production database has run them. The shell concurrency harnesses require a disposable PostgreSQL environment.
- No live Prodamus account, production database, webhook delivery, SQL migration, refund, or payment was accessed or changed. No test/lint/build was run in this audit.
- GitHub CI for the audit commit must be checked separately; prior Vercel failure was reported as build-rate-limit, not a source-code failure.

## Recommended next steps

1. Inventory all service-role callers and deployed jobs for `adjust_credits_balance`; revoke its grant or make it ledgered once legacy compatibility is confirmed.
2. Enforce dev-top-up off in production configuration and add a DB-backed admin guard or remove the endpoint from deployable production routes.
3. Add a read-only balance-vs-ledger reconciliation report, discrepancy thresholds and operator runbook; investigate rather than auto-fix.
4. Run the existing PostgreSQL integration/concurrency suite against a disposable database with the complete migration chain before enabling real payments.
5. Verify the production Prodamus webhook secret, demo flag, exact webhook URL, and environment flags through deployment configuration without exposing secret values.

## Safety

No source code, database, account, payment, provider credential, environment variable, production configuration or deployment was changed.
