# AUD-196 — Persist generation recovery identity across browser restarts

## Finding
The frontend stored the active generation fingerprint and idempotency key in `sessionStorage`. That survives a reload in the same tab, but it is discarded when the tab/browser session ends. If a billable generation had an ambiguous response and the user returned later, the frontend could create a fresh idempotency key and submit a second generation instead of resuming the existing journal.

The stored fingerprint also contained the full serialized request, including the user's topic.

## Change
- `frontend/src/utils/pendingGenerationRequest.ts`: use `localStorage` for the active generation identity so it survives tab/browser restarts; retain an in-memory fallback when storage is blocked.
- Store a compact deterministic fingerprint instead of the raw request text. The backend remains authoritative and rejects any request/key mismatch.
- Migrate the previous combined and legacy session-scoped records, normalizing old raw fingerprints and removing migrated session entries.
- Clear both persistent and legacy session entries after a completed generation.
- `frontend/src/components/pins/PinGenerator.tsx`: compare the same compact fingerprint when deciding whether to reuse the saved idempotency key.
- Add regression tests for stable compact fingerprints, persistence after in-memory reset, legacy upgrade, blocked storage, and clearing.

## Expected user impact
A user can close the tab or browser after an interrupted generation and later retry the same settings without silently losing the original idempotency key. The backend can then resume/reconcile the existing generation journal rather than treating it as a brand-new request.

## Verification and safety
- Tests are added but have not yet been executed in this environment.
- No provider calls, production data, migrations, deployments, or payments were run.
