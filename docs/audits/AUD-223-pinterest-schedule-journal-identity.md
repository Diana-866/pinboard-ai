# AUD-223 — Exact Pinterest schedule journal identity during worker recovery

## Finding
The worker previously looked up a publish attempt by local pin ID and Pinterest account ID only. When classifying a failed worker run, it trusted a journal row with status `published` and copied its remote pin ID into the schedule. The completion RPC already enforces board integrity, but the recovery/read path did not independently verify that the journal's owner, pin, account, and destination board were the exact identities in the claimed schedule.

This was a defensive integrity gap: corrupted, legacy, or mismatched journal data could make the worker report a schedule as published against the wrong destination.

## Changes
- The worker now scopes the journal lookup by `user_id`, `pin_id`, and `pinterest_account_id`.
- It selects the full identity tuple, including `pinterest_board_id`.
- Added pure helper `hasMatchingScheduleAttemptIdentity` to require exact user, pin, account, and board matches before trusting a journal row.
- If a returned row does not match the claimed schedule, the worker treats the journal as unreadable/uncertain, does not copy its remote ID, and does not automatically retry.
- Added unit coverage for a matching tuple and for a mismatch in each of the four identity fields.

## User impact
A schedule can only be marked published from its attempt journal when the saved publication belongs to the same user, local pin, Pinterest account, and selected Pinterest board. If the records disagree, PinPosy keeps the outcome uncertain instead of showing a potentially false success or retrying a possibly published pin.

## Verification and safety
- Re-read the updated worker, helper, and unit-test files from the feature branch after commits.
- Tests were added but not executed in this environment. No claim is made that Node tests, SQL integration, lint, or build passed.
- No production database, Pinterest API, deployment, or merge operation was performed.
- PR #4 remains the working Draft PR; changes are committed to `feat/persisted-boards-api`.

## Commits
- `8e827b45dba271d8fdbb6a235f2ce49af2e6a349` — identity matcher
- `86bc7519405360544b7b60cdeb5436d0d08620dd` — worker lookup fencing
- `3035da95f315e33d54213e9355883a762356cb2b` — regression tests
