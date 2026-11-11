# AUD-359 — sanitized fatal diagnostics and fail-fast process termination

**Date:** 2026-11-11  
**Status:** IMPLEMENTED IN SOURCE — runtime validation pending

## Changes

- Added `backend/fatalProcessHandlers.js` with handlers for `uncaughtException` and `unhandledRejection`.
- Fatal events emit only fixed event identifiers (`process.uncaught_exception` / `process.unhandled_rejection`) through `logFatalSync`; the thrown value, rejection reason, message, stack, cause and arbitrary metadata are never inspected or serialized.
- `logFatalSync` writes one JSON record synchronously to stderr with `fs.writeSync` before termination, avoiding the asynchronous console flush risk on a fatal exit.
- Both API server (`backend/index.js`) and standalone Pinterest scheduler worker (`backend/scheduleWorker.js`, only when run as the main module) install the handlers.
- The handler is fail-fast: it exits with code 1 and does not resume normal work after a fatal process event. The hosting supervisor is expected to restart the failed process according to its restart policy.
- Added unit tests for one-time fatal handling, exit code 1, diagnostic write failure, no reason/message leakage and synchronous output formatting.

## Important behavior decision

- No attempt is made to continue serving traffic or to drain application work after `uncaughtException` / `unhandledRejection`. Node process state may be corrupted; resuming would be unsafe.
- This is intentionally distinct from normal SIGTERM/SIGINT shutdown, where the worker already uses its bounded drain path.
- Restart policy, restart backoff, health checks and whether the hosting provider retains stderr were not verified. A process exit is not itself proof that the host will restart it.

## Validation and limitations

- Updated source and tests were read back from the feature branch.
- Runtime tests, lint, build and CI were not run; no passing status is claimed.
- A misplaced draft file was briefly created on the repository default branch during the operation and immediately removed in a follow-up commit; the implementation and tests are on `feat/persisted-boards-api`. No application runtime or deployment was affected.
- No production requests, logs, payments, email delivery, Pinterest API/OAuth, database changes or deployments were performed.
- PR #4 remains open and Draft.
