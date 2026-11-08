# AUD-174 — Flush the latest pin description before scheduling

## Finding

The description editor saves with an 800 ms debounce. The schedule action previously waited only for requests already present in the per-pin save queue. During the debounce window, the newest description was still only in the timer/local recovery draft and had not entered that queue. A user could therefore schedule a pin while its latest description was still unsaved.

## Implementation

- Changed the description-save routine to return an explicit success/failure result.
- Before creating a calendar item, the generator now cancels the pending debounce for the active pin and immediately sends its latest pending description. It also checks the browser recovery draft, so a previous failed PATCH can be retried even after its debounce timer has fired.
- Scheduling stops with a clear message if that save fails; the user can retry rather than silently scheduling stale metadata. The handler then awaits the per-pin queue, covering the final description PATCH and any in-flight title/format updates.
- After the debounce flush, the handler reads and awaits the per-pin save queue, covering the final description PATCH and any in-flight title/format updates.

## User-visible effect

When a user edits a description and immediately clicks to add the pin to the calendar, PinPosy now saves that last edit first. If saving fails, it does not proceed with scheduling as if the data were current; the user is told to retry.

## Verification and scope

- Reviewed the scheduling flow, debounce state, and per-pin serialization logic after the change.
- No dedicated component-level test runner was available in this environment; frontend tests, TypeScript check, Vite build, and browser tests have not been run.
- No backend, database, production data, deployment, or PR merge was changed.
