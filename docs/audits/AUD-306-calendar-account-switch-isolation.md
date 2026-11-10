# AUD-306 — calendar account-switch isolation

## Defect

The calendar loader already cancelled stale responses when the authenticated user
changed. However, it did not clear the schedule rows that had been loaded for the
previous user. Those rows remained in React state while the next user's schedule
request was pending, so the calendar could briefly display another account's
publication metadata after an account switch.

## Change

- Track the user ID associated with the currently displayed schedule state.
- On identity change, clear scheduled rows and the previous load error in a layout
effect, before the browser paints the new account context.
- Do not clear existing rows for a same-user manual reload; the calendar can continue
displaying its last known data while the refresh is in progress.
- Existing request cancellation and backend owner-scoped filtering remain unchanged.

## Verification

The source update was written to the PR branch and read back from GitHub. Runtime
tests, lint, typecheck, and build have not been run. No production database changes,
deployment, or merge.
