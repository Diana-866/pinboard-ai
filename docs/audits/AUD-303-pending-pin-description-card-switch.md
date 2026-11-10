# AUD-303 — preserve pending pin description when switching cards

**Date:** 2026-11-09  
**Area:** Pin generator / pin description autosave  
**Status:** Implemented; automated verification not run

## Finding

The description editor uses one debounce timer and one pending-save reference for the currently edited card. If a user typed in pin A and switched to pin B before the 800 ms debounce elapsed, B's change handler cleared A's timer and replaced the pending-save reference. A's latest description remained in local recovery storage but was not sent to the API in that interaction. This could make a user believe the edit was saved when it had only been retained locally.

## Fix

- Before assigning the shared debounce slot to a different pin or board, enqueue the previous pending description through the existing per-pin FIFO save queue.
- Keep normal debounce behavior when the user continues editing the same pin.
- Make the timer callback clear the pending slot only when the slot still belongs to that exact revision, so an older callback cannot erase a newer card's pending save.
- Preserve the local recovery draft until the exact value is confirmed saved.

## Regression coverage

Added `frontend/src/utils/pendingPinDescriptionSwitch.ts` and `frontend/src/utils/pendingPinDescriptionSwitch.test.ts` for:

1. Continuing to edit the same pin does not force a flush.
2. Switching to another pin on the same board requires a flush.
3. Switching boards requires a flush.

## Verification and safety

- Changed files were written to the GitHub branch.
- Automated tests, lint, typecheck, and build were not run.
- No production SQL, deployment, or merge was performed.
