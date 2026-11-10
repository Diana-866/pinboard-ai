# AUD-373 — financial ledger, balances and payment lifecycle integrity

**Date:** 2026-11-11  
**Status:** source review complete  
**Scope:** credit adjustment helpers, credit purchase fulfillment, subscription activation, generation reservations, Prodamus refund runbook, migrations 010/011/074 and prior financial audits AUD-328/AUD-346/AUD-367/AUD-368.

## Executive result

Current purchase and generation paths have strong transactional/idempotency protections in source. No new confirmed double-credit or unauthenticated fulfillment defect was identified in the inspected paths. The most important remaining integrity gap is operational: a legacy service-role balance-only RPC remains executable and can cause balance/ledger drift; no independent scheduled read-only reconciliation was found.

Refunds remain manual and do not have a first-class refund ledger. Do not automate balance clawbacks until partial refunds, already-spent credits, subscription overlap and chargeback policy are explicitly decided.

## Confirmed protections

### Paid credit purchases

- Checkout uses server-side package catalog/amount, not a client-supplied price.
- Idempotency key is bound to user, product and currency; provider order is persisted before contacting Prodamus.
- Ambiguous provider checkout result is marked unknown and blocks blind invoice recreation.
- Signed webhook validates order, final status, currency and amount before fulfillment.
- `credit_paid_purchase` locks the purchase row and atomically updates user balance, writes one purchase-linked ledger row and sets paid/credited markers.
- A unique partial index on `credit_transactions.purchase_id` provides an additional duplicate guard.
- Duplicate callbacks after an already committed credit return idempotently. Settlement of checkout idempotency occurs after fulfillment.
- A later signed success can recover a locally denied/canceled purchase after exact amount/currency validation.

### Subscription purchases

- `activate_paid_subscription` is the transactional boundary for paid period and entitlement.
- Duplicate callbacks do not extend the same purchase twice.
- Subscription/user locks and later-period protection prevent an older payment from downgrading a newer entitlement.
- Checkout settlement requires the exact matching local payment and request identity.

### Generation and regeneration

- Credits are reserved before provider work. Reservation identity is idempotent per user/request.
- The reservation path serializes on the user row; generic ledger debits check unreserved balance.
- Final settlement validates request ownership, claim fencing and reservation ceiling, then atomically inserts pins, debits balance, writes ledger and completes request.
- Definitive failures release reservations; uncertain provider outcomes retain the hold pending reconciliation.

## Findings

### AUD-373-01 — legacy balance-only RPC remains callable by service_role (medium integrity risk)

Migration 074 retains `public.adjust_credits_balance(text, integer)`, revokes public/anon/authenticated, but grants EXECUTE to `service_role`. It locks the user row and respects active generation reservations, but updates `users.credits_balance` without inserting a corresponding `credit_transactions` row.

The current backend helper `backend/credits.js` calls `adjust_credits_balance_and_log`, not the legacy RPC. No current call site was found in the inspected backend source. However, any deployed legacy integration or future service-role caller can silently create ledger drift.

**Recommendation:** inventory all deployed callers, scheduled jobs and external services. If none remain, revoke service_role EXECUTE in a reviewed migration. If compatibility is required, replace the legacy function with a ledger-writing implementation and test every caller. Do not revoke before verifying deployed dependencies.

### AUD-373-02 — no independent balance-to-ledger reconciliation control found (medium operational risk)

The current write paths update balance and ledger transactionally, but no scheduled read-only control was found that compares each user's balance against the signed sum of ledger entries and reports discrepancies.

A naïve sum may be wrong for legacy opening balances, migration-era corrections, balance-only RPC calls or records whose semantics are not additive. Therefore:
- establish a documented opening-balance baseline/cutover timestamp;
- classify all legacy adjustments and migrations;
- reconcile reservations separately (they are holds, not debits);
- report discrepancies without changing balances;
- require human-reviewed evidence before any repair.

Suggested conceptual formula after a validated baseline:
`expected_balance = opening_balance + SUM(credit_transactions.amount after cutover)`.
Do not run this formula as an automatic repair or assume all historical rows belong to one baseline.

### AUD-373-03 — refunds have no first-class financial ledger (medium product/operations gap)

The current refund runbook confirms no refund webhook, refund status, partial refund total or refund ledger for subscriptions/credit purchases. Prodamus refund completion therefore does not automatically reconcile PinPosy entitlement or credits.

Before implementation, decide:
- treatment of partial vs full refunds;
- whether spent credits create a negative balance, debt or manual exception;
- whether subscription entitlement is revoked immediately or at period boundary;
- how overlapping later paid periods are preserved;
- chargeback/dispute handling and evidence retention;
- how a provider refund is authenticated and made idempotent.

Do not subtract the original credit pack from a user who may have spent some credits. Do not downgrade a user based only on a refund of an older subscription.

### AUD-373-04 — live financial correctness is not established by source review

The repository contains tests and SQL integration/concurrency harnesses, but no evidence in this audit that the complete ordered migration chain is applied to production or that the harnesses ran against a disposable PostgreSQL instance. Production balances, Prodamus settlements and webhook delivery were not inspected.

## Safe reconciliation procedure (read-only first)

1. Take a consistent, access-controlled database snapshot or read-only transaction.
2. Establish baseline and migration cutover rules from actual historical ledger and migration records.
3. Compute per-user expected balances from validated opening balances and post-cutover ledger entries.
4. Independently list legacy service-role adjustments, purchase-linked rows, generation debits, refunds/chargebacks and manual corrections.
5. Compare to `users.credits_balance`; classify every difference before any repair.
6. Report only user ID or a restricted internal reference, stored balance, computed balance, delta, and evidence references. Never expose emails or payment secrets in broad diagnostics.
7. Repeat after concurrent payment/generation operations are quiesced or use a consistent snapshot.
8. Require dual review and an auditable ledger correction for each approved discrepancy. Never silently overwrite the balance.

## Recommended next steps

1. Verify whether any deployed caller uses `adjust_credits_balance`; if none, prepare a narrowly scoped revoke migration and privilege integration test.
2. Add a read-only balance reconciliation query/report after baseline rules are documented.
3. Add discrepancy alerts and an operator case workflow; never auto-correct.
4. Run existing SQL integration and concurrency tests in disposable PostgreSQL using the full ordered migration chain.
5. Design a refund ledger and policy separately, including partial refunds and already-consumed credits.
6. Verify production migration/grant state and Prodamus webhook configuration through non-destructive checks before real payments.

## Validation and safety

- Source and existing test/runbook review only.
- Tests, SQL integration, lint, build, CI, production Supabase and Prodamus checks were not run.
- No balance, payment, refund, secret, migration, deployment or production record was changed.
