# AUD-281 — Deterministic per-pin save queue

## Problem

Pin title, description, and aspect-ratio edits can be triggered close together. The UI already serialized PATCH requests per pin, but that ordering logic was duplicated between the normal save path and the board-switch/unmount flush path. It had no focused regression tests, so a future refactor could accidentally allow an older request to overwrite a newer edit or let one failed request block later saves.

## Change

- Extracted the per-pin promise queue into `frontend/src/utils/pendingPinSaveQueue.ts`.
- Both normal PATCH persistence and the pending-description flush now use the same queue.
- Saves for one pin execute in enqueue order; saves for different pins remain independent.
- A failed save does not poison subsequent saves.
- Queue cleanup removes an entry only if it still points to the completing request, so an older completion cannot delete a newer queued operation.
- Cleanup observes both promise outcomes without creating an unhandled rejected promise.

## Regression coverage

Added `frontend/src/utils/pendingPinSaveQueue.test.ts` for:
1. FIFO ordering for repeated saves to one pin.
2. Recovery after a failed request.
3. Independent saves for different pins.

## Verification and safety

- GitHub read-back confirmed the component imports and uses the shared queue in both persistence paths and the three tests are present.
- Tests, TypeScript, and production build have not been executed in this environment.
- No database migration, production data change, deployment, or merge was performed.
