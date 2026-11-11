# AUD-400 — Prodamus receipt vs entitlement transaction contract

**Date:** 2026-11-11  
**Status:** source-grounded design; implementation intentionally deferred.

## Executive decision

Do not replace the current webhook handler with a new "payments table" in one step. PinPosy already has:
- signed webhook verification and amount/currency checks;
- local subscription and credit-purchase rows keyed by provider order ID;
- exactly-once credit ledger marker `balance_credited_at` and unique purchase ledger index;
- atomic subscription activation;
- checkout idempotency rows with durable provider order reference;
- durable exception audit for signed unmatched/mismatched callbacks;
- recovery for webhook-before-checkout-response races.

The missing capability is an immutable record that a valid provider success was received, independent from whether PinPosy is allowed to grant the corresponding entitlement. Add a receipt journal and an entitlement decision layer; do not overload `subscriptions.status`, `credit_purchases.status`, or `payment_creation_requests.status` to represent both facts.

**No code or SQL changed in AUD-400.** Account lifecycle columns/RPCs proposed by AUD-397/398 are not implemented in the branch, and live Supabase catalog was not inspected. Therefore no migration should be applied yet.

## Verified current implementation

### Existing schema and constraints

- `db/migrations/001_baseline.sql`: `users.id` is UUID; `subscriptions.user_id`, `credit_purchases.user_id`, `credit_transactions.user_id` are TEXT. Preserve these types until a separately audited data migration.
- `credit_purchases` has unique partial index on `provider_payment_id`; purchase status is constrained to pending/success/canceled/denied.
- `credit_transactions.purchase_id` is unique when non-null (migration 010), preventing a second ledger row for the same purchase.
- `billing_webhook_exceptions` (029) stores a minimal event fingerprint and reason, not raw payload; duplicate fingerprint is ignored. It is an exception journal, not a successful-payment journal.
- `payment_creation_requests` (116–118) stores idempotency identity, request kind/fingerprint, provider order ID, checkout result and status. It is not a provider receipt log.

### Current successful webhook paths

- Subscription: `backend/billing.js::handleWebhook` verifies signature, finds subscription by provider order ID, validates signed amount/currency, then calls `activate_paid_subscription`; afterward it separately calls `settle_payment_creation_request`.
- Credits: `backend/creditsBilling.js::handleCreditsWebhook` verifies signature, finds purchase by provider order ID, validates amount/currency, then calls `credit_paid_purchase`; afterward it separately settles checkout idempotency.
- Credit RPC (010) locks `credit_purchases` first and then updates `users`. Subscription RPC (011) locks `subscriptions` first and then `users`. Both conflict with deletion's user-first fence.
- Both paths currently grant entitlements without checking account lifecycle. Credit purchase RPC deliberately accepts late success for locally canceled/denied purchases; preserve that behavior for active accounts.
- Webhook-before-checkout-response is explicitly handled in migration 118: a settled checkout does not return a payment URL to the browser.

## Required data model

Use two distinct concepts.

### A. Immutable provider receipt

Proposed table name: `payment_provider_receipts`.

One row per normalized signed provider event:
- `id uuid primary key`
- `provider text not null check (provider='prodamus')`
- `payment_kind text not null check in ('subscription','credits')`
- `provider_order_id text not null`
- `provider_status text not null` (normalized status, not arbitrary raw text)
- `received_amount numeric(12,2)` nullable for events without a valid amount
- `received_currency text` nullable/normalized
- `event_hash char(64) not null`
- `received_at timestamptz not null default clock_timestamp()`
- optional `provider_paid_at` only if a trustworthy provider timestamp exists and its semantics are documented
- unique `(provider,event_hash)`; index `(provider_order_id,received_at desc)`

Do not store raw webhook body, email, customer name, card data, full request headers, or signature. The hash is calculated from the canonical verified callback with the transport-only `attempt` field removed, matching the existing exception fingerprint semantics.

The receipt is an immutable fact: database trigger rejects UPDATE/DELETE; no direct table DML for PUBLIC/anon/authenticated/service_role; a SECURITY DEFINER insert RPC with fixed `search_path = pg_catalog, public` and service_role-only EXECUTE validates fields and inserts with ON CONFLICT DO NOTHING. The backend calls it only after HMAC verification. Database cannot independently validate HMAC unless a separate secure verifier is designed; never imply that receipt RPC itself proves the signature.

A successful receipt must be committed **before** entitlement processing. If the later transaction fails, the receipt remains and the provider can retry or an operator can reconcile it.

### B. Mutable entitlement decision / reconciliation state

Proposed table name: `payment_entitlement_decisions` (or an equivalent durable processing journal).

One decision per receipt:
- `receipt_id uuid primary key references payment_provider_receipts(id) ON DELETE RESTRICT`
- `local_payment_kind`, `local_payment_id uuid`, `user_id text`
- `decision` constrained to `pending_review | granted | withheld_account_lifecycle | rejected_mismatch | unmatched | superseded`
- `decided_at`, `safe_reason_code`, optional operator/reconciliation reference
- unique receipt identity prevents duplicate grants; never store secrets or raw webhook payload.

This row is mutable only through narrowly scoped SECURITY DEFINER RPCs. It is not the source of truth for the provider event; the receipt remains immutable.

A single payment can have more than one provider event (e.g. processing then success, duplicate success with different transport attempt). Each distinct event gets its own receipt; fulfillment is still unique by local payment row and existing purchase/ledger idempotency.

## Atomic success fulfillment contract

Implement one RPC per payment kind or one carefully typed dispatcher. In either case, the complete entitlement decision must be one PostgreSQL transaction.

### Subscription success

1. Backend verifies HMAC, resolves the order to a local subscription candidate, validates amount/currency against that candidate, and inserts immutable receipt. If no local candidate exists, persist receipt as unmatched/review and return a controlled acknowledgement only after durable receipt.
2. RPC receives `receipt_id` and local subscription ID. It first reads the candidate's `user_id` without a row lock solely to resolve owner UUID. It must not trust a caller-supplied user ID as authority.
3. Lock `users` row first. Verify the owner exists. Require lifecycle `active` before granting entitlement. For non-active owner, record `withheld_account_lifecycle` and paid receipt; do not activate tariff, do not enqueue subscription activation email, do not restore account.
4. Lock subscription row second; re-check its owner and provider order identity, expected amount/currency, product/plan, and allowed status under lock.
5. Apply subscription paid state and tariff period atomically, preserving existing "older delayed webhook must not downgrade newer entitlement" rule.
6. Record decision `granted`; commit. Then settle the matching checkout idempotency request in the same transaction if it can be incorporated without reverse lock order. Otherwise move checkout settlement to a separate user-first RPC or make it an independent non-entitlement reconciliation step.
7. Only after successful commit, dispatch outbox email as existing code does. No email/network I/O inside transaction.

### Credit purchase success

1. Same signature → immutable receipt → owner resolution sequence.
2. Lock `users` row first, then `credit_purchases` row. Re-check order, owner, package, credits, amount/currency and status under lock.
3. For active owner, add credits, insert one ledger row, set `status='success'`, `paid_at`, `balance_credited_at`, and decision `granted` atomically. Preserve existing unique `credit_transactions.purchase_id` and duplicate return semantics.
4. For non-active owner, do not change balance or create a top-up ledger row. Persist `withheld_account_lifecycle` with the paid receipt. The financial fact remains available for refund/manual handling.
5. Keep existing late success for locally canceled/denied purchases when the account is active. Do not silently change this business rule.

### Unknown order / amount mismatch / currency mismatch

- A valid HMAC but unmatched order is a real signed provider event. Persist the receipt first, then decision `unmatched`; never discard it.
- Amount/currency mismatch: persist receipt and decision `rejected_mismatch`, plus the existing exception audit reason; do not grant.
- Invalid signature: do not create a trusted provider receipt. Existing security logging/403 remains.
- Unknown/unrecognized provider status: retain existing exception path; if desired store a normalized `unrecognized` receipt only after a bounded allowlist design, never persist arbitrary status without limits.
- Non-success final statuses: persist the event fact and reconcile local pending state only after matching order identity. Never overwrite a locally successful/credited payment with canceled/denied status.

## Lock order and deadlock prevention

Target:
`users → subscriptions | credit_purchases → payment_entitlement_decisions`

Receipt insertion is a separate short transaction and does not lock the owner or payment rows. The fulfillment RPC locks user first and payment second. Checkout idempotency state must not be locked before the user in a transaction that later touches entitlement rows.

Do not call Prodamus from a transaction. Do not hold locks across email dispatch.

## Checkout creation lifecycle gate

Current `begin_payment_creation_request` locks the idempotency row, and checkout routes subsequently create local payment rows and call Prodamus. Add an owner-first lifecycle gate before any new checkout intent:
- lock user; require active; then lock/create idempotency row; insert local payment row / attach order identity in the same transaction where practical;
- commit before Prodamus HTTP;
- after HTTP, completion update must not return a usable payment URL if the account is no longer active. But a paid callback that arrives later must still be receipted and withheld, not discarded.
- do not attempt to cancel a Prodamus invoice under DB lock. Provider cancellation is best effort and must be independently reconciled.

## Migration and compatibility cautions

- The branch's latest numbered migration is 123. Migration 124 is only a candidate number; reserve it only after checking actual migration directory and live Supabase catalog.
- No live schema/catalog access was performed. Existing deployments may have drift from repository baseline.
- Keep TEXT user_id columns as-is; compare UUID via `id::text` where necessary.
- Do not drop/rename legacy `activate_paid_subscription` or `credit_paid_purchase` until all backend callers and deployed clients are moved.
- Add replacement RPCs and tests first; switch webhook path behind a server-side flag; observe; then revoke old RPC execute only after confirming no caller remains.
- Ensure service_role cannot directly mutate receipt/decision tables; SECURITY DEFINER owner and exact grants; RLS is not sufficient for service_role.
- Existing 029 exception table is insert-only for service_role; keep its data and role.
- No refund is automatic in this contract. A withheld paid transaction needs explicit provider refund/manual reconciliation, not a guessed refund API call.

## Rollout sequence

1. Read-only schema preflight on actual Supabase: columns, constraints, indexes, function signatures/owners/grants, RLS, current statuses, orphaned payment references.
2. Add receipt/decision schema and RPCs; test migration on disposable DB cloned from production schema (no production data).
3. Add two-session concurrency tests: webhook vs deletion acceptance; duplicate webhook; webhook vs webhook; checkout begin vs deletion; old denied/canceled local status + valid success; amount/currency mismatch; late receipt for non-active account; webhook-before-checkout-response; RPC commit then network error retry.
4. Backend dual-write receipt, retain old fulfillment path only behind test/staging flag. No production dual entitlement.
5. Switch to new fulfillment RPC, monitor unmatched/withheld/mismatch and idempotency counts.
6. Only after evidence and explicit approval: retire legacy RPCs / turn on account deletion.

## Explicitly not done

- No source file or migration changed.
- No SQL was executed against Supabase.
- No test was run.
- No provider webhook, refund, checkout, credit balance, subscription or production setting was touched.

## Source verification addendum — 2026-11-11

The current handlers and migrations were re-read after the initial contract was drafted. The following details must be preserved in implementation:

1. backend/billing.js::handleWebhook and backend/creditsBilling.js::handleCreditsWebhook verify HMAC before looking up local payment rows. However, a validly signed callback with an unknown order is currently written only to billing_webhook_exceptions and acknowledged with HTTP 200. This is useful exception evidence, but it is not a successful-provider-receipt journal and does not support later matching/fulfillment without manual reconstruction.
2. The existing exception fingerprint helper backend/billingWebhookAudit.js::buildWebhookException hashes paymentKind + newline + prodamus.canonicalString(payloadWithoutAttempt). It deliberately removes attempt, scopes fingerprints by payment kind, and avoids storing customer email/raw body. The new receipt path should reuse this canonicalization contract or introduce a versioned shared helper; do not silently change existing exception hash semantics or migration 029 uniqueness.
3. db/migrations/010_atomic_credit_ledger.sql::credit_paid_purchase locks credit_purchases before updating users. It increments balance, inserts the unique purchase-linked ledger row and sets balance_credited_at atomically. It accepts pending/denied/canceled/success local statuses and is idempotent once the marker is set. Replacement must retain these semantics for active accounts while changing lock order to user-first.
4. db/migrations/019_prevent_late_subscription_downgrade.sql::activate_paid_subscription locks subscriptions before users; it preserves paid-period extension and newest-order plan-selection. Replacement must preserve both, including already-activated duplicate behavior.
5. Both webhook handlers perform local order lookup and amount checks before fulfillment RPC. The RPC must independently revalidate all identities and amounts after locking; pre-RPC checks are not a concurrency/security boundary.
6. The successful receipt must be durably committed before entitlement fulfillment. If receipt insert succeeds but fulfillment response is lost, retry must recover the same receipt ID and continue idempotently. If local order is unknown, retain a durable unassigned receipt and review decision rather than only returning ignored: unknown order_id.
7. Amount/currency mismatches currently create exception records; credit mismatch may mark local purchase denied, and subscription mismatch may mark subscription denied. Do not let this local status overwrite the provider fact. Preserve existing behavior only where explicitly approved; the receipt/decision journal becomes the reconciliation source for the signed event.

### Implementation guardrails clarified

- Do not dual-write by invoking both old and new fulfillment RPCs in production: that risks double entitlement. Dual-write only the immutable receipt while old fulfillment remains enabled in staging; production cutover must select exactly one entitlement path.
- Do not insert a receipt before signature verification. Invalid signatures remain rejected and must not enter the trusted receipt journal.
- A valid signature is not the same as a valid payment: persist the signed fact, then separately classify status, order match, amount and currency. Only a fully validated success can reach the grant RPC.
- Do not treat a successful receipt insert response as fulfillment. Backend acknowledgement may be 200 only after the signed event is durably recorded and its processing state is durably classified/retryable.
- Receipt immutability must be enforced for table owner/service_role access paths, not just ordinary roles. SECURITY DEFINER function ownership, trigger bypass rules, grants, and migration execution role require explicit catalog verification.

No implementation, test execution, SQL execution, or live provider operation was performed in this addendum.