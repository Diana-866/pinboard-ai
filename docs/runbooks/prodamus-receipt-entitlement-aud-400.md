# AUD-400 — Prodamus receipt and entitlement rollout runbook

**Design only. No production operation is authorized by this document.**

## Preflight
- [ ] Confirm actual Supabase schema matches migration history; read-only catalog only.
- [ ] Confirm actual migration numbering after 123.
- [ ] Inventory all backend callers of `activate_paid_subscription`, `credit_paid_purchase`, `settle_payment_creation_request`.
- [ ] Confirm old payment rows, order ID uniqueness, credit ledger uniqueness and status distribution.
- [ ] Verify service_role function/table grants and SECURITY DEFINER owners.

## Schema / RPC
- [ ] Immutable `payment_provider_receipts` table and dedupe key `(provider,event_hash)`.
- [ ] Mutable `payment_entitlement_decisions` table unique per receipt.
- [ ] SECURITY DEFINER receipt insert RPC; fixed search_path; exact grants.
- [ ] Receipt immutability trigger; direct DML revoked including service_role.
- [ ] Subscription fulfillment RPC locks users → subscriptions → decision.
- [ ] Credit fulfillment RPC locks users → credit_purchases → decision/ledger.
- [ ] Non-active owner records paid receipt + withheld decision; no new entitlement.
- [ ] Existing late success for active owner, unique ledger, subscription no-downgrade and webhook-before-checkout-response preserved.

## Backend
- [ ] HMAC verification occurs before trusted receipt insertion.
- [ ] Persist receipt before fulfillment RPC.
- [ ] Validate amount/currency and order identity; mismatches become review records, not entitlement.
- [ ] Retry after commit-then-network-error is idempotent.
- [ ] Dispatch emails only after subscription transaction commit.
- [ ] No provider HTTP or email inside DB transaction.
- [ ] Do not return a usable checkout URL if checkout became settled or account lifecycle was fenced.
- [ ] Preserve existing legacy orders with no payment_creation_requests row.

## Required concurrency / regression tests
- [ ] Two concurrent duplicate subscription success callbacks: one entitlement, one decision, no deadlock.
- [ ] Two concurrent duplicate credit callbacks: one balance increment and one ledger row.
- [ ] Deletion locks user while webhook arrives: either fulfillment commits first or webhook records withheld; no deadlock or entitlement after fence.
- [ ] Webhook starts before deletion but waits on user: after acquiring lock, it observes non-active state and withholds.
- [ ] Deletion starts after webhook has locked user: deletion waits; fulfillment commits; deletion then proceeds.
- [ ] Payment receipt commit succeeds but fulfillment RPC/network response fails: retry resumes from receipt, no duplicate grant.
- [ ] Late success after local canceled/denied purchase for active owner still grants once.
- [ ] Late success after deletion_pending records receipt but no credits/subscription.
- [ ] Amount mismatch, currency mismatch, unknown order, invalid signature, unrecognized status.
- [ ] Checkout webhook wins race against checkout response; no paid checkout URL leaks.
- [ ] Checkout creation vs deletion acceptance: no new provider request after lifecycle fence.
- [ ] Subscription old webhook cannot downgrade a newer tariff period.
- [ ] Receipt UPDATE/DELETE rejected; service_role cannot directly DML tables; only exact RPC EXECUTE granted.
- [ ] Verify no HTTP or SMTP request runs inside transaction.

## Go/no-go
GO only after disposable PostgreSQL migration and concurrency suite pass, actual schema drift is reconciled, staging callbacks are verified, and explicit approval is given. Never run this against production as an exploratory test.
