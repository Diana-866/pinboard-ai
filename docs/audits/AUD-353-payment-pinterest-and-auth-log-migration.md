# AUD-353 — migration of payment, Pinterest, auth and storage logs

**Date:** 2026-11-11  
**Status:** PARTIAL IMPLEMENTATION — selected high-risk backend modules migrated

## Changes

- Migrated all direct `console.log/error/warn/info` calls in `backend/auth.js` (6), `backend/billing.js` (24), `backend/creditsBilling.js` (21), `backend/pinterest.js` (29), `backend/storage.js` (3), and `backend/index.js` (22) to the allowlisted logger introduced in AUD-352.
- Event names are stable module-scoped identifiers with per-file sequence numbers, such as `billing.event_001` and `pinterest.event_001`.
- Routine logs no longer include raw provider/database messages, Prodamus order IDs, payment amounts/status descriptions, Pinterest usernames, internal user IDs, OAuth denial details, or image source URLs from these migrated call sites.
- The logger supports error, warning and info severity while serializing only level/event plus optional allowlisted status/error code. Migrated call sites currently prefer event-only records to avoid leaking untrusted upstream details.
- Extended `backend/test/safe-logger.test.js` to cover warning and info events in addition to secret omission and unsafe error objects.

## Important operational trade-off

This migration intentionally reduces diagnostic detail. It does not yet add a request correlation ID or a separate restricted diagnostic channel. If operators need to investigate a failure, they can identify the module/event class but may need to correlate it with provider/database audit records. Do not reintroduce raw error messages or identifiers to compensate.

## Remaining work

- Other backend modules may still contain direct console calls; this pass covered the central Express entry point and the selected auth, billing, credits billing, Pinterest and storage modules only.
- Add request correlation IDs using cryptographically random identifiers and an explicit safe logger field, then thread them through route and worker boundaries.
- Review startup/worker/mail/AI/generation/admin modules in a follow-up sweep and remove any remaining raw error logging.
- Define log access and retention settings with hosting providers; source changes cannot verify deployed log retention.

## Validation and limitations

- Changed files and tests were saved and read back from GitHub.
- Runtime tests, lint, build and CI were not run. No claim is made that the code has passed them.
- No production logs, live payment webhooks, Pinterest OAuth, database, deployment or user data were accessed.
- Payment settlement, credit accounting, OAuth token storage, publishing journals and storage lifecycle logic were not intentionally changed.
- PR #4 remains open and Draft at the time of this audit.
