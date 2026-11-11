# AUD-356 — correlation context for detached dispatchers

**Date:** 2026-11-11  
**Status:** IMPLEMENTED IN SOURCE — runtime validation pending

## Changes

- `backend/scheduleWorker.js`: each independent polling tick now creates its own cryptographically random UUID and executes the complete asynchronous tick inside `runWithCorrelationId`. The safe logger therefore attaches the same `correlation_id` to the tick's completion or failure event.
- Worker completion logging now uses the stable event name `schedule_worker.batch_completed`; failure remains `schedule_worker.batch_failed`. Raw exceptions and HTTP client configuration remain excluded.
- `backend/index.js`: each scheduled/startup invocation of the subscription email outbox dispatcher now receives a fresh UUID context. Failures logged by the dispatch promise retain that invocation's ID even though the dispatcher runs outside an HTTP request.
- Added a worker test that captures the production safe logger output and checks for a UUID correlation field without exposing the scheduler secret.

## Correlation boundaries

- HTTP request IDs, each independent Pinterest worker tick ID, and each email outbox dispatch ID are separate trace scopes.
- The worker currently calls the backend over HTTP. The backend intentionally generates its own request ID and does not trust arbitrary client correlation headers. This change does not claim end-to-end correlation between a worker tick and the server-side processing request.
- Durable generation/Pinterest records do not yet persist correlation IDs. Adding such a column or changing RPC payloads would require a separate schema/retention decision and migration review; this audit deliberately makes no DB changes.
- Correlation IDs are diagnostic identifiers only, not authorization credentials.

## Validation and safety

- Updated source and test files were read back from GitHub.
- Runtime tests, lint, build and CI were not run; no passing status is claimed.
- No production logs/requests, payments, email delivery, Pinterest API/OAuth, database changes or deployments were performed.
- PR #4 remains open and Draft.
