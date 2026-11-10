# AUD-169 — Flush pending pin description edits on navigation

## Finding

Pin descriptions are autosaved after an 800 ms debounce. The pending value previously existed only inside the timeout callback. If the user switched boards or left the generator before the timeout fired, the effect cleanup marked the previous load inactive but did not flush or persist the pending description. The latest keystrokes could therefore disappear without a save request.

## Implementation

- Keep the latest debounced description, pin ID, and revision in a ref.
- When the selected board changes or the generator effect is cleaned up, cancel the outstanding timer and enqueue the pending PATCH request before abandoning the previous board view.
- Reuse the per-pin promise queue so the final description update remains ordered after any earlier save for the same pin.
- Clear the pending ref when the normal debounce fires, preventing the cleanup path from submitting the same edit twice.
- Log a failed navigation-triggered save rather than creating an unhandled promise rejection.

## User-visible effect

If a user types a description and immediately switches boards or leaves the generator, PinPosy now sends the last entered text to the backend instead of silently discarding it just because the 800 ms timer had not fired yet. The update is still subject to network/backend availability; this change does not claim offline persistence or guarantee success when the server rejects the request.

## Verification and scope

- Reviewed the debounce callback, per-pin serialized PATCH queue, and board-loading effect cleanup.
- Confirmed the pending value is cleared on normal timer execution and flushed on effect cleanup.
- Full frontend TypeScript check, Vite build, and browser-level navigation/network tests have not been run.
- No backend, database, production data, deployment, or PR merge was changed.
