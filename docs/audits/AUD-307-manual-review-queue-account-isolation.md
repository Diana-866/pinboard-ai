# AUD-307 — isolate manual-review queue on authenticated-user switch

**Date:** 2026-11-09  
**Area:** Frontend account isolation

## Finding

`MainApp` owns the shared `pendingReviewPins` state consumed by the dashboard, calendar, sidebar, and manual approval desk. Unlike the persisted boards, schedule, and Pinterest account state, this queue was not reset when `user.id` changed. The prior user's pending cards could therefore remain visible after signing out and signing into another account.

The queue was also written to the legacy global localStorage key `pinposy_pending_pins`, although the current application did not restore it. Keeping that global write served no persistence purpose and could leave account-specific data in a shared browser key.

## Changes

- Track the authenticated owner associated with the in-memory review queue.
- Clear the queue in a layout effect whenever the authenticated user identity changes, before the next account's UI is painted.
- Fence queue updater callbacks by the user identity captured when the callback was created. A delayed callback from the prior account is ignored after the identity ref changes.
- Stop writing review cards to the unscoped legacy localStorage key.

## Scope and safety

- Queue remains in-memory/session-local; no cross-account persistence is introduced.
- Existing server-side ownership checks and Pinterest account loading are unchanged.
- No database migration, production SQL, deployment, or merge.

## Verification

- Source was updated through GitHub and will be read back.
- Automated tests, lint, typecheck, and build have not been run in this environment.
