# AUD-355 — request correlation IDs and worker log hardening

**Date:** 2026-11-11  
**Status:** IMPLEMENTED IN SOURCE — runtime validation pending

## Changes

- Added `AsyncLocalStorage` correlation context to `backend/safeLogger.js`. Error, warning and info records automatically include only the allowlisted `correlation_id` when a valid UUID context exists.
- Added an early Express middleware in `backend/index.js`. It creates a server-side UUID with `crypto.randomUUID()`, returns it in `x-request-id`, and runs the request pipeline inside the async context.
- The middleware does not trust or echo a caller-supplied request/correlation header, so a client cannot inject arbitrary identifiers or PII into logs.
- Added tests for async context propagation, context isolation outside the request and rejection of malformed caller-controlled values.
- Fixed a remaining worker logging gap: `scheduleWorker.js` previously used its injectable console-like logger to print raw `error.message` on failed HTTP requests. Production now defaults to `safeLogger` and emits only `schedule_worker.batch_failed`; worker tests assert the safe event instead of raw error text.

## Scope and limitations

- Correlation IDs currently cover the Express request async context. Detached jobs, independently running worker ticks, scheduled/outbox callbacks and external provider-side logs do not automatically share this ID.
- `x-request-id` is returned to callers; CORS exposure for browser JavaScript is not added in this change.
- The ID is an operational trace handle, not an authentication factor and must not be used for authorization.
- The worker safe default omits raw errors. The existing injectable test logger still receives the safe event and existing non-sensitive counters.

## Validation

- Source and test changes were read back from GitHub.
- Runtime tests, lint, build and CI were not run; no passing status is claimed.
- No production requests/logs, payment operations, email sends, Pinterest API/OAuth, database changes or deployments were performed.
- PR #4 remains open and Draft.
