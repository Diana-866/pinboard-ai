# AUD-170 — Recover unsaved pin descriptions after reloads and network failures

## Finding

The generator kept edited descriptions in React state until the debounced PATCH completed. A failed request left the text visible only in memory; refreshing or closing the tab discarded the user's latest text. The previous navigation flush also depended on the page remaining alive long enough for its asynchronous request to finish.

## Implementation

- Added `frontend/src/utils/pendingPinDescription.ts` with isolated local draft storage keyed by board ID and pin ID.
- Persist the latest description to browser local storage immediately on input, before the debounced server request.
- When loading a board's saved pins, overlay a locally preserved draft on the server description so the user's latest text is restored after a reload.
- Mark restored local drafts as unsaved and expose an explicit “Повторить сохранение” action instead of implying that the server has the latest version.
- Remove the local draft only after a successful server PATCH. Failed requests retain the draft for recovery.
- The navigation cleanup flush also removes the local draft only after its PATCH succeeds.
- Added focused utility tests for persistence, board/pin isolation, successful cleanup, and malformed storage data.

## User-visible effect

If the user edits a pin description and the network fails, the latest text is kept in this browser. After refreshing and reopening the board, PinPosy restores that text and indicates that it is not yet saved on the server. The user can explicitly retry the save; a successful PATCH clears the local recovery copy. This is browser-local recovery, not cross-device synchronization or a guarantee against browser storage being cleared.

## Verification and scope

- Source-level checks cover immediate local persistence, restoration overlay, error state, success-only cleanup, and board/pin namespacing.
- Added four tests in `frontend/src/utils/pendingPinDescription.test.ts`; they have not yet been executed in this environment.
- Full frontend TypeScript check, Vite build, and browser/network-failure tests have not been run.
- No backend, database, production data, deployment, or PR merge was changed.
