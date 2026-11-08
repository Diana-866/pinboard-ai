# AUD-177 — Make aspect-ratio editing responsive and isolated per pin

## Finding

The aspect-ratio editor used one component-wide saving flag. While a format update was being saved for one pin, the controls for every other pin were disabled as well. The canvas also waited for the network response before showing the newly selected ratio, making the editor feel unresponsive.

## Implementation

- Changed the saving indicator from a global boolean to the ID of the pin currently being saved.
- Apply the selected ratio optimistically so the canvas and format badge update immediately.
- Disable ratio controls only for the pin whose save is in progress; switching to another pin no longer blocks its editor.
- If a PATCH fails, roll back only the affected pin and only if it still displays the value from that failed request.
- Extracted guarded rollback into `frontend/src/utils/pinAspectRatio.ts` and added three regression tests.

## User-visible effect

Changing a pin from 2:3 to 9:16 updates the preview immediately. While that pin is saving, the user can switch to another pin and adjust its format independently. If the first save fails, only that pin is restored; another pin's settings are not affected.

## Verification and scope

- Reviewed the per-pin loading state, optimistic update, guarded rollback, and format button disabled condition.
- Added three focused tests for rollback, stale-failure protection, and pin isolation. Tests have not been executed in this environment.
- Frontend TypeScript check, Vite build, and browser interaction tests have not been run.
- No backend, database, production data, deployment, or PR merge was changed.
