# AUD-172 — Do not hide saved pins after an invalid API response

## Finding

The board restoration path fetched `GET /boards/:id/pins`, but converted any non-array response into `[]`. A malformed success payload (for example, an unexpected object or `null` caused by a proxy/API regression) was therefore indistinguishable from a genuinely empty board. The user could see an empty workspace even though the server had not confirmed that the board contained zero pins.

This was a presentation/data-visibility defect, not evidence that database rows were deleted.

## Implementation

- Added `frontend/src/utils/savedPinsResponse.ts` with `requireSavedPinsArray`.
- The board restore path now validates the response before mapping it into the UI.
- Unexpected payloads throw into the existing saved-pins load-error state instead of silently displaying an empty board.
- Added an explicit «Повторить загрузку» button. The previous error text suggested changing the board, but selecting the already-selected board does not reliably trigger another request.
- A valid empty array remains a normal empty-board response.
- Added focused tests for a valid empty array, a populated array, `null`, object, and string payloads.

## User-visible effect

If the server or an intermediary returns an unexpected response, PinPosy now tells the user that saved pins could not be loaded. It no longer suggests that the board has no pins. The user can retry the load directly from the error message instead of switching boards or assuming their work disappeared.

## Verification and scope

- Source-level review confirms the restore path validates the response before rendering.
- Added `frontend/src/utils/savedPinsResponse.test.ts`.
- Tests, TypeScript check, Vite build, and browser-level reload/network-failure tests have not been run in this environment.
- No database, production data, deployment, or merge was changed.
