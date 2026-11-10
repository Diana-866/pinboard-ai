# AUD-400 — Proposed Prodamus receipt/entitlement SQL contract (not executable migration)

This is a design contract, not a ready-to-run SQL migration. Do not paste into Supabase SQL Editor. Exact DDL depends on read-only catalog preflight and the final lifecycle schema.

## Proposed objects

### payment_provider_receipts (immutable facts)
Columns:
- id uuid primary key
- provider text not null, constrained to prodamus
- payment_kind text not null, constrained to subscription/credits
- provider_order_id text not null
- provider_status text not null, bounded normalized status
- received_amount numeric(12,2)
- received_currency text
- event_hash char(64) not null
- received_at timestamptz not null
- optional provider_paid_at timestamptz only after provider semantics verified
Unique (provider,event_hash); index by provider_order_id and received_at.

No raw payload, signature, email, customer PII, card data, or secret.

### payment_entitlement_decisions (mutable processing outcome)
- receipt_id uuid primary key, FK to receipt ON DELETE RESTRICT
- local_payment_kind text
- local_payment_id uuid
- user_id text
- decision text: pending_review, granted, withheld_account_lifecycle, rejected_mismatch, unmatched, superseded
- safe_reason_code text
- decided_at timestamptz

### Required RPC contracts

1. `record_prodamus_receipt(...)`
   - service_role EXECUTE only; fixed search_path; bounded input validation.
   - Called only after backend HMAC verification.
   - Insert immutable fact with ON CONFLICT(provider,event_hash) DO NOTHING; return existing/new receipt ID.
   - Must not grant entitlements.

2. `fulfill_prodamus_subscription(p_receipt_id uuid, p_subscription_id uuid)`
   - Resolve owner from subscription without row lock.
   - Lock users first; then subscription; then decision.
   - Revalidate receipt provider/order/kind/status/amount/currency and local owner/order/amount/plan.
   - If account not active: record withheld decision, no tariff update.
   - Else atomically activate subscription and record granted decision.
   - Preserve tariff-period monotonicity.

3. `fulfill_prodamus_credit_purchase(p_receipt_id uuid, p_purchase_id uuid)`
   - Resolve owner without lock; lock users first; then credit purchase; then decision.
   - Revalidate receipt and purchase identities and amount/currency/package/credits.
   - If account not active: record withheld, no balance/ledger.
   - Else update balance, insert unique purchase ledger, set purchase paid markers and granted decision in one transaction.
   - Preserve active-account late success for canceled/denied local purchase and duplicate idempotency.

4. `settle_payment_creation_request` must not create reverse lock order. Either include checkout row after user and domain payment row in the same RPC, or settle through a separate non-entitlement reconciliation transaction whose lock order cannot be reversed by fulfillment/deletion.

## Security and grants
- Enable RLS.
- Revoke all direct table privileges from PUBLIC, anon, authenticated and service_role.
- Add append-only trigger for receipt facts (reject UPDATE/DELETE).
- SECURITY DEFINER RPCs: `SET search_path = pg_catalog, public`, fully qualify objects, validate all IDs and ownership, revoke PUBLIC/anon/authenticated, grant EXECUTE only to service_role.
- service_role bypasses RLS; table grants must be revoked explicitly.
- No raw provider body or HMAC secret in database.

## Compatibility
- Preserve users UUID and payment user_id TEXT.
- Do not remove legacy RPCs until all callers are migrated and deployed.
- No automatic refund is implemented by this contract.
- Do not number this as migration 124 until branch and live schema preflight.
