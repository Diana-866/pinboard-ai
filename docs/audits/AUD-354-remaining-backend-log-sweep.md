# AUD-354 — remaining backend log sweep

**Date:** 2026-11-11  
**Status:** PARTIAL IMPLEMENTATION — additional modules migrated

## Changes

- Migrated 29 direct console calls in eight modules to `safeLogger`: `mail.js` (2), `email-verify.js` (8), `password-reset.js` (6), `pins.js` (5), `prodamus.js` (2), `scheduleWorker.js` (3), `paymentCreationIdempotency.js` (2), and `tariff.js` (1).
- Provider response bodies, provider/database exception messages, email subjects, task indexes and shutdown signal metadata are no longer emitted by these call sites.
- The worker's `use strict` directive remains first; the logger import is placed after it.
- Previous AUD-353 migrations remain in place.

## Backend sweep

- Inspected the 63 JavaScript source modules under `backend/` (excluding tests) for direct `console.log/error/warn/info` calls in this pass and the preceding AUD-353 work.
- All direct console calls identified in the inspected modules have been replaced except the intentional output primitives inside `backend/safeLogger.js` itself.
- This is a source-level search, not proof that dynamically loaded dependencies or deployed runtime output are clean.

## Remaining security/operability work

- Add safe request correlation IDs and carry them across HTTP request, worker and provider boundaries without including user or account identifiers.
- Review non-JavaScript logging paths, hosting platform logs, database/provider audit logs and retention settings; these cannot be verified from this repository.
- Consider restricted, access-controlled diagnostic detail only if operationally necessary; do not reintroduce raw upstream messages into routine logs.

## Validation and limitations

- Changed source files were read back from GitHub; no direct console calls remain in the migrated modules.
- Runtime tests, lint, build and CI were not run. No claim is made that the code has passed them.
- No production logs, live payment events, email sends, Pinterest OAuth/API calls, database changes or deployment actions were performed.
- Payment/order logic and user-facing error responses were not intentionally changed.
- PR #4 remains open and Draft.
