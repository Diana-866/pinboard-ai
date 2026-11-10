# AUD-392 — financial settlement and entitlement fencing during account deletion

**Date:** 2026-11-11  
**Status:** source/migration/test review; design only. No production access.

## Confirmed protections

- Prodamus webhook handlers verify HMAC before order lookup, normalize documented statuses, validate amount/currency, and persist unmatched/unsupported/mismatched events for review.
- Credit fulfillment locks one purchase, updates user balance, inserts one ledger row protected by unique purchase_id, and marks success/paid_at/balance_credited_at atomically. Duplicate delivery does not double-credit.
- Subscription activation locks subscription and user, extends paid period atomically, and protects the newest plan from late older callbacks.
- Checkout idempotency is unique by user/key and provider order. Ambiguous provider outcomes remain fenced. Settlement validates exact local order/user/kind and fulfilled state; settled records clear reusable checkout URL.
- Refund reconciliation requires evidence before reservation release. Privileged payment RPCs are restricted to service_role in reviewed migrations.
- Existing SQL tests cover duplicate fulfillment and payment concurrency, but were inspected, not executed.

## Findings

### AUD-392-01 — Lock order conflicts with deletion

Credit fulfillment locks credit_purchases then updates users. Subscription activation locks subscriptions then users. The AUD-390 deletion transition is designed to lock users first. This inversion can deadlock when deletion holds the user row while a webhook holds the payment row.

**Required:** one lock order everywhere: users → subscription/credit_purchase → payment_creation_request → ledger/outbox/journal. Deterministic ordering for multiple rows. Never hold DB locks during network calls.

### AUD-392-02 — Provider settlement and entitlement are coupled

The credit RPC writes purchase success, paid_at, balance_credited_at, ledger movement and balance in one transaction. Subscription activation writes success and the user's tariff period/plan in one transaction.

Blocking these RPCs after deletion risks losing a real provider payment. Allowing them unchanged can credit a deleted account or restore a subscription.

**Required:** immutable provider-settlement receipt separate from entitlement. Store validated amount, currency, paid timestamp, order identity, normalized event hash and reconciliation state; avoid raw webhook payload and direct PII. Provider success must be recorded idempotently regardless of lifecycle. Entitlement grant requires account_status=active under the user lock. For a non-active user, record a held-for-deletion/refund-review disposition and grant no credits or tariff.

### AUD-392-03 — Late success is intentionally accepted

The credit RPC accepts pending, denied, canceled and success. Its integration test explicitly checks late success after cancellation is credited. Subscription activation also accepts canceled/denied states.

This is valid recovery behavior for active users, but unsafe after deletion unless lifecycle is checked inside the fulfillment transaction.

**Required:** preserve late-success behavior for active accounts; for non-active accounts record provider settlement only. Test both outcomes.

### AUD-392-04 — Checkout creation has no lifecycle gate

The checkout RPC creates/locks payment_creation_requests without locking/checking users. Backend then creates pending payment rows before contacting Prodamus. Completion can persist a reusable payment URL without checking lifecycle.

**Required:** checkout begin locks user first and requires active. Use lifecycle version/state fencing for local row creation and post-network completion. If the provider call returns after deletion begins, persist its exact outcome but do not return a reusable URL or grant entitlement. Never hold the user lock across the provider HTTP request.

### AUD-392-05 — Checkout settlement is not an independent money receipt

settle_payment_creation_request marks checkout settled only after local subscription activation or credit fulfillment. If entitlement is withheld for deletion, current settlement rejects the order as not fulfilled.

**Required:** separate durable provider receipt from checkout completion. A paid provider order must reach a durable state even when entitlement is withheld. Do not fake local success or clear evidence to satisfy settlement.

### AUD-392-06 — Refund/chargeback evidence must survive anonymization

Refund audit and webhook exceptions retain minimal evidence; the latter avoids raw PII. But deleting or scrubbing identifiers can break linkage between provider order, purchase, refund and ledger. AUD-388 also found no verified opening ledger baseline and a service-role balance-only legacy RPC.

**Required:** retain provider references, amounts, currency, timestamps, immutable ledger movements and reconciliation evidence under approved retention, linked by a stable pseudonymous account reference. Never retain email merely as a join key. Refund/chargeback must not blindly decrement a deleted user's mutable balance; record the provider fact and use explicit reconciliation policy.

### AUD-392-07 — Existing concurrency tests omit deletion races

subscription-concurrency.sh and credit-concurrency.sh test webhook/webhook contention, not payment-vs-deletion. They do not prove provider receipt can exist without entitlement.

## Required model

Keep provider money and entitlement as independent dimensions.

Suggested provider receipt states: received_validated, settled_confirmed, refund_pending, refunded_confirmed, chargeback_open, chargeback_won/lost, needs_operator_review.

Suggested entitlement disposition: granted, withheld_account_deletion, reversed_by_approved_adjustment, not_applicable.

Use unique provider/order/event identity and append-only event history. Do not overload subscriptions.status or credit_purchases.status to represent both provider settlement and entitlement.

## Transaction boundaries and lock order

1. Lock users row by stable ID.
2. Lock one subscription or credit_purchase.
3. Lock linked payment_creation_request if needed.
4. Write provider receipt, entitlement disposition, ledger and outbox in deterministic order.

If webhook has only order ID, resolve mapping without lock, then revalidate it inside the user-first RPC. If user no longer exists, store an unassigned provider receipt and do not grant entitlement. No Prodamus, SMTP or other network call inside transaction.

## Implementation phases

1. Add immutable provider settlement/event journal and entitlement disposition schema, constraints, RLS and service_role-only RPCs.
2. Refactor checkout begin to require active under user lock; fence post-network completion by lifecycle version.
3. Refactor subscription and credit fulfillment to user-first locking and separate provider receipt from entitlement.
4. Preserve active-account late-success and duplicate webhook behavior.
5. Add held-for-deletion refund/reconciliation inventory and operator audit.
6. Update restore reconciliation to include provider receipts and held entitlements.
7. Only then connect deletion worker to financial reconciliation.

## Mandatory regression matrix

- Duplicate credit webhook: one provider receipt, one ledger row, one balance increment.
- Duplicate subscription webhook: one provider receipt, one paid period.
- Active canceled purchase + late success still fulfills once.
- Deletion commits before paid webhook: one provider receipt, zero credit/period grant, held review state.
- Webhook locks user before deletion: entitlement may commit, then deletion reconciles it.
- Deletion locks user before webhook: provider money recorded, entitlement withheld.
- Checkout creation vs deletion: either intent commits while active and is reconciled, or no invoice request is sent.
- Provider call returns after deletion: outcome stored, no reusable checkout URL.
- Refund/chargeback vs deletion: immutable provider fact, no blind balance mutation.
- Missing user: unassigned provider receipt, no entitlement.
- Retry never repeats external invoice/refund action without provider evidence.
- Restore reconciles provider receipts against provider exports, not entitlement status alone.

## Release gates

No deletion rollout until lock order is consistent across checkout, subscription activation, credit fulfillment and refund paths; provider receipts are independent from entitlement; webhook/deletion races pass on disposable PostgreSQL; retention is approved.

## Safety

Source/migration/test review only. No tests, SQL, live Supabase data, Prodamus dashboard, payments, refunds, balances or production settings accessed or changed. Live migration state remains unverified.
