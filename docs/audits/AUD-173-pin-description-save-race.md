# AUD-173 — Prevent stale pin-description saves from deleting newer drafts

## Finding

Pin description edits are written to browser storage immediately and PATCH requests are serialized per pin. However, a successful older PATCH unconditionally removed the local recovery draft. If the user typed a newer description while that request was in flight, the older response could erase the newer draft even though the newer text had not yet reached the server.

This was a real race in the recovery path, not merely a theoretical network concern.

## Implementation

- Added `clearPendingPinDescriptionIfMatches` to the pending-description utility.
- The helper reads the current stored draft and removes it only when its description exactly matches the value confirmed by the completed PATCH.
- Updated normal debounced saves and the board-change/unmount flush to use conditional cleanup.
- Added regression tests proving that an older save cannot clear a newer draft and that a matching successful save still clears its own draft.
- Removed the now-unused unconditional cleanup import from the pin generator.

## User-visible effect

If a user types a new description while an earlier save is still finishing, the earlier save can no longer wipe out the newer local recovery copy. If the network then fails or the page is refreshed, the latest text remains available for recovery. Successfully saved text is still cleaned up normally.

## Verification and scope

- Reviewed the changed helper, both save call sites, and the focused regression tests in the repository.
- Added two regression tests; the frontend test suite and TypeScript/build commands have not been executed in this environment.
- No backend, database, production data, deployment, or PR merge was changed.
