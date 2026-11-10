# AUD-289 — safe calendar restoration after reload and API errors

## Problem

The calendar loaded persisted schedules asynchronously but had no explicit loading state. On a first visit, the empty array could be rendered as an ordinary empty calendar before the API response arrived. The response mapper also accepted any array and converted incomplete rows into values such as `"undefined"` or invalid dates. That could make a corrupt/partial response replace a valid calendar state.

## Changes

- Added `validatePersistedScheduleRows`: only an array is accepted; each row must be an object with a non-empty schedule ID, pin ID, status, and parseable scheduled timestamp.
- Validation is all-or-nothing. A malformed row rejects the refresh, so the last successfully loaded schedule remains intact instead of being replaced by partial data.
- Added explicit `scheduleLoading` state for initial loading and retries. The calendar announces loading accessibly and disables its retry button while the request is in flight.
- The queue view no longer displays the normal empty-state message while data is loading or unavailable.
- Account isolation remains intact: switching users clears the previous user's schedule, and cancelled/stale requests cannot update the new user's state.
- Added Node tests for valid empty responses, preservation of failure metadata, invalid top-level payloads, and incomplete/malformed rows.

## Verification

- Changed files were read back from the PR branch.
- Automated tests, TypeScript lint/typecheck, and production build were not executed in this environment.
- At the new HEAD, GitHub Actions returned no PR workflow runs. Vercel status is `failure` with `build-rate-limit`; this is not a test result.
- No production migration, deployment, merge, or Pinterest worker action was performed.
