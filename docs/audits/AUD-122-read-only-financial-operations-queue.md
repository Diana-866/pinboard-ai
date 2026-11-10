# AUD-122 — Read-only financial operations queue

**Status:** implementation committed; source review complete; runtime verification not performed.  
**Branch:** `feat/persisted-boards-api`

## Delivered

Added `GET /admin/financial-operations/unresolved`, protected by `requireAuth` and the database-backed `requireAdmin` middleware.

Query parameters:
- `older_than_minutes`: defaults to 30; clamped to 5 minutes–30 days.
- `limit`: defaults to 50; clamped to 1–100 per category.

The endpoint returns three independent, bounded categories:
1. Old processing multi-pin generation requests, with safe task-status counts and a derived review reason.
2. Old processing single-pin regeneration requests, with provider outcome status and a derived review reason.
3. Old active credit reservations, with a matching opaque request ID where unambiguous, the reserved credit amount, and a review reason.

The response includes per-category truncation flags, applied thresholds, ages, and an explicit read-only warning.

## Privacy and safety boundaries

The API does not return:
- user IDs or email addresses;
- idempotency keys (provider or request);
- provider task IDs;
- claim/fencing tokens;
- prompts, descriptions, image URLs, or provider result URLs;
- raw provider payloads or raw internal error messages.

Reservation matching is performed server-side using user ID plus idempotency key. If multiple request rows match the same reservation, the result is flagged as ambiguous rather than selecting one arbitrarily.

The queue never updates request rows, reservation rows, user balances, provider state, or audit records. It does not call GPTunnel. An old reservation is an investigation signal only; it is not a release recommendation.

Task reads are batched in groups of 50 requests, with a maximum of 500 task rows per batch, avoiding reliance on a single response larger than common Supabase REST row caps.

## Files changed

- `backend/adminFinancialOperations.js` — bounded read model, reason classification, privacy filtering.
- `backend/index.js` — authenticated admin GET route.
- `backend/test/admin-financial-operations.test.js` — tests for classification, privacy exclusions, and parameter bounds.

## Verification status

- Repository source reads confirmed the route, helper module, referenced table names/columns, and migration-backed lifecycle fields.
- Tests were added but **not executed** in this environment.
- No Node test suite, build, lint, CI, live Supabase query, or production deployment was run.
- No SQL migration was added or applied.
- No financial data was changed.

## Next gate

Add the queue to the admin UI only after the endpoint is exercised against a staging database with realistic rows, including:
- a provider task that may still be running;
- a failed provider task with refund metadata missing;
- a reconciled all-failed generation awaiting finalization;
- an old reservation attached to a recently heartbeating request;
- a reservation with no matching request;
- a reservation whose matching request is terminal or ambiguous.

The next write-capable phase must introduce an append-only operator action journal and transactionally bind it to the existing reconciliation/finalization RPCs. Do not add a direct reservation-release endpoint.
