# AUD-129 — Express endpoints for operator provider-refund actions

## Delivered

- `backend/adminProviderRefundActions.js` — request validation, narrow Supabase RPC calls, safe HTTP error mapping.
- `backend/index.js` — four protected administrative POST routes and a dedicated rate limiter.
- `backend/test/admin-provider-refund-actions.test.js` — unit coverage for RPC arguments, input rejection, and safe error mapping.

## Routes

All routes require a valid JWT and pass `req.userId` from the verified token as `p_operator_user_id`. A caller-supplied operator ID is ignored. The existing `requireAdmin` middleware performs an early admin check; migration 078 independently locks and rechecks the operator row inside the same transaction as the financial action.

| Route | Required JSON fields |
| --- | --- |
| `POST /admin/provider-refunds/generation/reconcile` | `request_id`, `task_index`, `provider_refunded`, `evidence_type`, `evidence_reference`, `action_id` |
| `POST /admin/provider-refunds/regeneration/reconcile` | `request_id`, `provider_refunded`, `evidence_type`, `evidence_reference`, `action_id` |
| `POST /admin/provider-refunds/generation/finalize` | `request_id`, `action_id` |
| `POST /admin/provider-refunds/regeneration/finalize` | `request_id`, `action_id` |

## API safeguards

- Request IDs accept positive decimal strings up to PostgreSQL BIGINT max. Numeric JSON values must be safe JavaScript integers.
- Generation task indexes are limited to 1–10. Regeneration uses the database-defined task index 0.
- Refund status must be a JSON boolean; truthy strings are rejected.
- Evidence type is allowlisted. Evidence reference is bounded and restricted to safe ASCII identifier characters; URLs and email-like values are rejected.
- Action IDs must be UUIDs and are passed through to the SQL idempotency journal.
- A per-source-IP rate limiter runs before authentication and allows at most 20 calls per minute, including invalid-token traffic.
- Database errors are converted to safe 403/404/409/422/500 responses. Unknown database messages are never returned to clients.

## Verification

- Reviewed the new adapter, route registration, existing JWT middleware, existing admin middleware, and actual exception messages in migrations 073, 077, and 078.
- Added unit assertions for missing requests (404), invalid finalization payloads (422), already-finalized requests (409), authorization failures (403), and unknown internal errors (safe 500).
- Tests were not executed: this session has GitHub source access but no checked-out runtime or database connection. No build, lint, CI, SQL execution, deployment, or production mutation was performed.
- Migration 078 remains unapplied. The SQL integration test and multi-session concurrency tests remain outstanding.

## Operator API usage notes

The caller must generate a fresh UUID for each new logical action and reuse the same UUID only for an exact retry after a timeout. Do not send the operator identity in the JSON body. For reconciliation, the operator must verify the provider refund fact against the chosen evidence before submitting it; the API stores a reference, not a copy of provider proof.
