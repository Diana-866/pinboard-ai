# AUD-383 — Pinterest disconnect UI reconciliation

**Date:** 2026-11-11  
**Status:** source fix and focused regression tests committed to feature branch.

## Defect

The disconnect endpoint could successfully remove a Pinterest account, after which the card awaited `loadStatus()`. That helper swallowed its own GET failure, so the UI could retain the old account row and selection while the disconnect success notice was already visible.

## Changes

- `PinterestCard.loadStatus` now returns an explicit boolean outcome while retaining its existing error display.
- After a successful disconnect POST, the card immediately reconciles from the authoritative `accounts` array returned by the mutation. If that array is absent, it removes only the requested account from current local state.
- The selected account is recalculated; board data, board errors and pending board loading are cleared. The board request generation is incremented so an older in-flight response cannot repopulate boards from the disconnected account.
- The status callback receives the reconciled account list immediately.
- A follow-up status refresh remains in place. If it fails, the local confirmed disconnect state remains visible and the user receives a separate error indication; it cannot restore the stale row.
- Extracted the deterministic state reconciliation into `pinterestAccountState.ts`.
- Added three regression tests: disconnect one of multiple accounts, disconnect the final account, and prefer the server's authoritative account list.
- Added settings contract tests to the frontend test script.

## Validation

- Source changes and test files read back from GitHub.
- Test execution, TypeScript lint and Vite build were not run in this environment.
- No live API, Pinterest, database, storage, billing or production operations.
