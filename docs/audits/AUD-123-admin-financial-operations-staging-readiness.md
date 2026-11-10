# AUD-123 — Admin financial operations staging readiness

**Status:** source-level readiness review complete; staging/runtime verification blocked (no staging credentials or environment access available in this task).  
**Branch:** `feat/persisted-boards-api`  
**Scope:** frontend integration points and a safe staging verification plan for `GET /admin/financial-operations/unresolved`.

## Findings

### Existing admin UI integration points

- `frontend/src/components/admin/AdminPanel.tsx` owns the tab state and renders the admin sections.
- It already has dedicated `billing_exceptions` and `email_outbox` tabs, rendered through separate components.
- `frontend/src/components/admin/AdminBillingExceptions.tsx` and `AdminEmailOutbox.tsx` use the shared `apiRequest` helper, load on mount, display errors, and expose a refresh action.
- `frontend/src/lib/api.ts` attaches the stored bearer token and handles API errors centrally.
- The admin panel contains a prominent demo-data warning for mock users/accounting/night-generation sections. A new operational queue must be visually and semantically separated from mock/demo data.

### Backend contract confirmed from source

Route: `GET /admin/financial-operations/unresolved`  
Authorization: `requireAuth` followed by database-backed `requireAdmin`.  
Query:
- `older_than_minutes`: default 30; clamped to 5–43,200.
- `limit`: default 50; clamped to 1–100 per category.

Response fields:
- `older_than_minutes`, `limit_per_category`
- `truncated.generation|regeneration|reservations`
- `counts.generation|regeneration|reservations`
- `generation[]`: opaque request ID, operation/status/reason, task counts, timestamps, age.
- `regeneration[]`: opaque request ID, operation/status/reason, provider status, timestamps, age.
- `reservations[]`: opaque reservation ID, operation classification, credit amount, status/reason, optional opaque request ID, timestamps, age.
- `read_only: true` and a warning that age does not prove failure/refund or authorize reservation release.

The shared API helper is compatible with this GET endpoint; no new authentication mechanism is needed.

## Staging gate — not yet satisfied

No staging URL, staging database access, or authorized test credentials were available during this source review. Therefore:
- no HTTP request was sent to staging or production;
- no realistic database fixtures were created;
- no live response shape, latency, query behavior, or role enforcement was verified;
- the frontend queue was intentionally **not** connected or exposed.

Do not treat a successful source inspection as a staging smoke test.

## Required staging fixtures

Use isolated staging data only. Avoid production users, balances, provider submissions, or real payment/refund events.

1. Old processing generation request with a task still queued/running: it must appear as review-needed, never as proven failed.
2. Old failed generation task with missing refund/reconciliation metadata: reason should indicate unresolved provider refund fact.
3. All-failed generation tasks with durable refund/reconciliation metadata and active reservation: reason should indicate awaiting finalization.
4. Old active reservation whose matching request has a recent heartbeat/update: it should not be mistaken for an abandoned operation merely because the reservation is old; confirm the query's updated-at filtering behavior.
5. Reservation with no matching request: classify as unmatched and require integrity review.
6. Reservation with multiple matching requests for the same user/idempotency key: classify as ambiguous, never choose one.
7. Old processing regeneration with provider status failed but refund metadata incomplete; and a separate reconciled failed regeneration awaiting finalization.
8. Authorization checks: unauthenticated request returns 401; authenticated non-admin returns 403; admin receives the bounded response.

For fixtures involving provider outcome facts, set durable fields directly in staging SQL; do not call GPTunnel, Pinterest, Prodamus, or any external provider.

## Smoke-test procedure

1. Confirm staging backend points only to staging Supabase and has the intended schema/migrations.
2. Create the fixtures above with synthetic users and isolated request/reservation rows.
3. Call the endpoint as admin with defaults, then with `?older_than_minutes=5&limit=1`.
4. Verify per-category counts, ordering, age values, truncation flags, and safe reason codes.
5. Verify response contains no user IDs, emails, idempotency keys, provider task IDs, fencing/claim tokens, prompts, URLs, raw payloads, or raw internal errors.
6. Verify unauthenticated and non-admin access is denied.
7. Capture sanitized results (no bearer token, user identifiers, or raw response secrets) and compare the observed schema to the frontend contract before implementing the UI.
8. Confirm the endpoint is read-only by comparing relevant staging row counts/statuses/balances before and after the calls.

## Implementation decision

Do not add the frontend tab/component until the staging gate passes. Afterward, add a read-only component adjacent to billing exceptions, with:
- explicit “операционная диагностика / только чтение” label;
- age threshold and bounded limit controls;
- separate sections for generation, regeneration, and reservations;
- safe reason-code labels and truncation notices;
- refresh/manual loading and clear 401/403/network error states;
- no release, retry, refund, finalize, or other mutation controls.

Any later write-capable workflow remains blocked on an append-only operator action journal and transactional integration with the existing reconciliation/finalization RPCs. Never add a direct reservation-release endpoint.

## Verification status

- Admin UI integration points and API helper inspected from repository source.
- Route middleware and response producer inspected from repository source.
- No staging or production HTTP requests made.
- No database fixtures created; no live database accessed.
- No tests, build, lint, CI, or deployment run.
- No frontend files changed; no migrations or financial data changed.
