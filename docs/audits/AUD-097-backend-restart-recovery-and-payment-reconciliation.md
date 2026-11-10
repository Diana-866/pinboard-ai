# AUD-097 — Backend restart recovery and payment reconciliation

**Status:** reviewed; no production actions performed  
**Scope:** Prodamus subscription and credit webhooks, durable webhook exceptions, subscription email outbox, stale pending-order inventory, backend startup lifecycle.

## Summary

The payment fulfillment path is database-backed and does not depend on an in-memory queue. A backend restart does not erase pending orders, committed subscription activation, credit ledger entries, or queued subscription emails.

The remaining operational gap is visibility and manual handling of exhausted email-outbox entries. The existing dispatcher retries automatically, but rows that exhaust their retry budget become `dead`; no dedicated admin endpoint for inspecting that queue was found in the reviewed backend routes.

## Findings

### 1. Webhook processing and restart behavior

- `POST /billing/webhook` dispatches signed callbacks to the subscription or credit handler based on the `ppc-` order prefix.
- Subscription activation is performed through the PostgreSQL RPC `activate_paid_subscription`; credit fulfillment uses `credit_paid_purchase`. Both are database transactions and are protected against duplicate fulfillment.
- Database lookup, RPC, or durable-audit failures return HTTP 500. This avoids acknowledging an event as successfully processed when the required durable write failed.
- Invalid signatures return HTTP 403.
- Signed but unmatched or amount/status exceptions are persisted in `billing_webhook_exceptions` before the handler returns an acknowledged ignored/review response. The audit stores a fingerprint and limited payment metadata, not the raw payload or customer PII.
- Exception fingerprints exclude Prodamus' transport `attempt` field, so repeated delivery of the same event does not create duplicate exception rows.
- The exception log is exposed through an authenticated admin-only read route. Service-role SELECT is explicitly granted by migration 042.

### 2. Subscription email outbox recovery

- Migration 030 creates a durable `email_outbox` and inserts the subscription-activation email event in the same transaction as subscription activation.
- The unique `event_key` prevents duplicate enqueueing for the same subscription.
- Backend startup invokes the dispatcher; while the process is awake, a one-minute interval checks the outbox. A successful or duplicate subscription webhook also attempts to drain queued email events.
- A claimed row has a two-minute lease. If the process dies while sending, a later dispatcher can reclaim the expired lease.
- Failed delivery is rescheduled with exponential backoff, capped at one hour. After the configured maximum of eight attempts, the row becomes `dead`.
- If SMTP accepts a message but the process/database connection fails before the sent acknowledgement, a retry may send the message again. Delivery is therefore **at-least-once**, not exactly-once. The implementation uses a deterministic Message-ID to make duplicate delivery recognizable, but this does not guarantee that every recipient mail system deduplicates it.
- If SMTP is not configured, dispatch is skipped and pending rows remain in the database. A later startup or active process can try again after configuration is corrected.

### 3. Pending payment reconciliation

- The admin-only `GET /admin/billing/pending-orders` endpoint is read-only and lists old pending subscription and credit orders.
- It intentionally does not mark orders failed or generate replacement checkout links. Age alone cannot establish whether the provider collected payment or whether a delayed callback will arrive.
- User-facing payment history and the periodic frontend refresh added in AUD-096 help surface a late successful callback once the database is updated.
- No automatic provider-side lookup/reconciliation operation was verified in the reviewed code. Unknown or ambiguous orders therefore still require manual comparison with Prodamus before any status correction.

## Operational risks / follow-up

1. **Dead email outbox rows are not surfaced in a dedicated admin view.** Add a read-only, PII-minimized outbox health endpoint (counts by status, oldest pending age, dead-row metadata) and a documented manual recovery procedure before building any retry action.
2. **Render sleep can delay email retries.** The one-minute timer is in-process and unref'ed; it does not run while the service is asleep. The next request/startup wakes the application and invokes a drain, but this is not a strict delivery-time guarantee.
3. **Email delivery can duplicate after an ambiguous SMTP acknowledgement.** Keep the deterministic Message-ID and describe delivery as at-least-once.
4. **Pending payment reconciliation remains manual.** Do not auto-cancel, reissue, or fulfill an order solely based on age or an unverified provider lookup.

## Verification boundaries

- Reviewed source files: `backend/index.js`, `backend/billing.js`, `backend/creditsBilling.js`, `backend/billingWebhookAudit.js`.
- Reviewed migrations: `029_billing_webhook_exceptions.sql`, `030_transactional_email_outbox.sql`, `042_allow_admin_audit_reads.sql`.
- Reviewed regression coverage: `backend/test/prodamus-webhook.test.js`, `backend/test/email-outbox.test.js`.
- Tests were inspected but **not executed**. No local checkout, Supabase instance, live Prodamus account, SMTP delivery, production deployment, or payment state was modified.
- Prodamus retry timing/guarantees were not independently verified here; the code's 500 response is the application's retry signal, not proof of a provider retry schedule.
