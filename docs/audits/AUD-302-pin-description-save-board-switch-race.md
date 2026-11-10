# AUD-302 — ignore stale pin-description save completions after board switch

**Date:** 2026-11-09  
**Area:** Pin generator / autosaved pin descriptions  
**Status:** Implemented; automated verification not run

## Finding

The description editor serializes PATCH requests per pin and scopes local recovery drafts by board and pin. However, the completion handler used only a global edit revision to decide whether it could update the shared save-status indicator. When a request from board A completed after the user had switched to board B, its revision could still be current. The old completion could therefore update status in the new board context.

This was a UI-state race, not evidence that the PATCH was sent to the wrong pin: requests continue to target the captured pin ID.

## Change

- Track the currently selected internal board in a ref updated synchronously during render.
- Centralize the completion fence in `isCurrentPinDescriptionSave`.
- Permit save-start, success, and error status updates only when both the revision and board ID still match.
- Preserve the original PATCH target, per-pin FIFO queue, local draft matching, and board-switch flush behavior.

## Regression coverage

Added `frontend/src/utils/pinDescriptionSaveGuard.test.ts` covering:

1. Current revision on the active board is accepted.
2. A completion from a previous board is rejected even if its revision number matches.
3. An older revision on the same board is rejected.

## Verification and safety

- Changed source, helper, test, and handoff were read back from GitHub.
- Automated tests, lint, typecheck, and build were not run in this environment.
- No production SQL, deployment, or merge was performed.
