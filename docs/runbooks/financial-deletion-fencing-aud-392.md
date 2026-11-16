# AUD-392 — financial settlement fencing during account deletion

**Historical design checklist (superseded 2026-11-16).** Financial/deletion fencing has since been implemented in the mainline migration chain (including migrations 142–144) and associated backend/provider receipt flows. The unchecked items below are not a current implementation checklist. Use current code and tests; live Prodamus reconciliation and production migration state remain separate verification tasks.


**Status:** design-only runbook. Do not execute against production.

## Preconditions

- [ ] Verify live schema and applied migrations from a read-only catalog snapshot.
- [ ] Confirm provider event identifiers and available payment/refund/chargeback exports.
- [ ] Obtain accounting/legal approval for retention of provider references and financial evidence.
- [ ] Decide refund/reconciliation policy for confirmed payment with withheld entitlement.

## Schema and RPC work

- [ ] Add immutable provider settlement receipt and append-only provider event journal.
- [ ] Add entitlement disposition separate from provider settlement status.
- [ ] Add unique provider/order/event constraints and minimal pseudonymous account reference.
- [ ] Ensure service_role-only RPC grants, fixed search_path, RLS and append-only protections.
- [ ] Refactor payment creation, credit fulfillment and subscription activation to lock user first.
- [ ] Refactor checkout begin to require active account under user lock.
- [ ] Persist provider result after external call even if lifecycle changed; do not return reusable checkout URL.
- [ ] For non-active accounts, persist paid event and route to held/refund review without balance or tariff grant.
- [ ] Preserve late-success behavior for active accounts.
- [ ] Preserve unknown provider outcomes; never replay invoice creation or refunds based only on timeout.

## Required lock order

users → subscription/credit_purchase → payment_creation_request → settlement/ledger/outbox.

For multiple rows, sort identifiers before locking. Never call Prodamus, SMTP or other network service inside a transaction.

## Disposable PostgreSQL and staging tests

- [ ] Duplicate credit webhook: one receipt, one ledger row, one balance change.
- [ ] Duplicate subscription webhook: one receipt, one entitlement period.
- [ ] Active canceled order + late success retains current fulfillment semantics.
- [ ] Deletion wins lock vs paid webhook: receipt saved, no entitlement.
- [ ] Webhook wins lock vs deletion: one valid entitlement then deletion reconciliation.
- [ ] Checkout creation races deletion; no invoice after deletion commit.
- [ ] Provider call returns after deletion; durable receipt, no reusable URL.
- [ ] Refund and chargeback races; no blind balance mutation.
- [ ] Missing user; unassigned provider receipt captured, no entitlement.
- [ ] Retry never repeats an external side effect.
- [ ] Existing payment, credit, subscription, refund and restore tests still pass.

## Stop conditions

Stop rollout on missing signed provider receipt, duplicate ledger credit, duplicate paid period, entitlement granted after deletion commit, untracked provider success, lock-order deadlock, ambiguous refund replay, or missing retention approval.

## Operator handling

A paid provider event with entitlement withheld must appear in a restricted inventory with provider order, amount, currency, timestamps, pseudonymous account reference and reason. Operators attach evidence for refund/chargeback actions. Never edit users.credits_balance, mark a purchase successful merely to satisfy checkout settlement, or delete payment evidence to unblock cleanup.

## Safety boundary

This runbook does not authorize migrations, payment/refund actions, balance edits, or access to production payment-provider records.
