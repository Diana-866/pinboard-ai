# AUD-201 — Recovery panel in PinGenerator

## Problem
AUD-199 added an authenticated, read-only endpoint for generation status and completed pins, and AUD-200 added browser-side enumeration of pending identities. The feature was not yet connected to the actual generator UI, so users could not discover an earlier completed run after a reload or changing generation settings.

## Product changes
- PinGenerator now checks up to 10 enumerated local recovery identities when it mounts and a login token is present.
- Requests are checked sequentially to avoid a burst against a sleeping/free backend.
- Users can manually refresh statuses with “Check again”; the button is disabled while a check is in progress, and lookups reuse the saved idempotency keys without starting generation.
- The panel distinguishes completed, processing, failed, unknown, and server-not-found records.
- A completed record can be opened when its board is present in the current board list. The UI switches to that board and uses the existing persisted-board pins loader; it does not call the generation endpoint.
- A server 404 is shown as “not found”; the local identity is deliberately retained. Network and other transient errors do not erase recovery keys.
- The panel explicitly tells the user that checking does not start generation or spend credits.
- The panel heading and explanatory copy are localized for the seven supported interface languages; individual status labels currently use Russian or English fallback.

## User impact
After reopening the generator, users can see if a previously attempted generation finished, is still processing, failed, or cannot be found. If completed, they can open the saved pins from the original board without generating them again. A missing or uncertain result never triggers an automatic retry. If a request was still processing during the first check, users can return later and refresh its status without reloading the page or risking a duplicate generation.

## Verification and limitations
- Confirmed the frontend calls the existing authenticated `GET /generation/requests/:key` endpoint and uses the existing board-pins read endpoint to display saved results.
- Existing pending-identity tests cover enumeration, deduplication, merging storage sources, and read-only behavior.
- Full frontend test suite, TypeScript check, and production build were not run in this environment; project dependencies are not installed here.
- No database migration, production change, deployment, or PR merge was performed.
