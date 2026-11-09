# AUD-293 — require complete identity when reconciling Pinterest publication ledger

## Problem

After `complete_pinterest_publish_v2` returns an ambiguous database/transport error, the worker checks `pinterest_publications` before deciding whether the remote publication is durably confirmed. The matcher compared normalized strings, so an absent or blank field could compare equal when the expected value was also absent/blank.

The current caller supplies all five identity fields, but the helper is a safety boundary and should not allow incomplete identities to become confirmation if a future caller omits a value or a malformed row is returned.

## Changes

- Hardened `matchesConfirmedPublicationLedger` in `backend/pinterestSchedule.js`.
- Confirmation now requires non-empty trimmed values on both sides for owner, local pin, Pinterest account, Pinterest board, and remote Pinterest pin IDs.
- Exact identity equality remains mandatory; no fuzzy matching or fallback matching was introduced.
- Added regression coverage in `backend/test/pinterest-schedule.test.js` for exact matches, missing inputs, blank expected/actual fields, and whitespace-only ledger values.

## Safety

- This only makes confirmation stricter. It cannot authorize an additional publish attempt.
- Ambiguous Pinterest outcomes remain blocked unless a complete exact ledger row is confirmed.
- No schema or production migration is required.

## Verification

- Changed source and test files were read back from the PR branch after writing.
- Tests, lint, typecheck, and build were not executed in this environment.
- No production database change, deployment, merge, or external Pinterest action was performed.
