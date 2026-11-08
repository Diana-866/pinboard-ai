# AUD-203 — Validate generated results before releasing recovery identity

## Problem

The generation UI accepted any non-empty array returned by the generation endpoint, mapped it directly into canvas state, and immediately removed the pending idempotency identity. A malformed or partially decoded 2xx payload could therefore look like a successful generation even when a pin had no stable ID or permanent image URL. The backend already persists completed pins and their credit settlement atomically, but the browser should not discard its recovery handle until it can safely render the response.

## Change

- Added `requireGeneratedPinsArray` to validate the successful response before mapping it into UI state.
- The validator requires 1–10 pin objects, a non-empty stable pin ID, and an absolute HTTPS image URL for every pin.
- `PinGenerator.handleGenerate` now validates first. Only after validation succeeds does it update the canvas and clear the pending generation identity.
- Invalid payloads enter the existing error path and retain the same idempotency key, allowing the user to retry/reconcile the already-persisted server result without starting a new paid generation.
- Added focused tests for valid responses, empty/oversized payloads, missing IDs/URLs, malformed URLs, non-HTTPS URLs, malformed entries, and duplicate pin IDs (which could otherwise collide in React/UI editing state).

## User impact

If the server confirms a generation but the browser receives incomplete pin data, PinPosy no longer silently treats it as a finished result and forgets the recovery key. The user can retry the same request identity and recover the server's saved pins; this does not initiate a new generation when the backend has already completed the request.

## Verification and limits

- Source-level change and focused tests were added.
- Frontend dependencies are not installed in this working environment, so the frontend test runner and production build were not executed here.
- No real AI generation, credit charge, database migration, production configuration, deployment, or PR merge was performed.
