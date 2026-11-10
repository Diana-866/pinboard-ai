# AUD-288 — Strict schedule-list validation during cancellation recovery

## Finding

The read-after-error cancellation recovery added in AUD-287 treated a list as valid when each row contained only a non-empty string `id`. Since cancellation is confirmed by the absence of the target row from `GET /schedule`, an incomplete/truncated response containing unrelated IDs could be mistaken for authoritative evidence that cancellation committed.

## Change

- `isScheduleAbsentFromActiveList` now requires every row to contain a non-empty string schedule ID, pin ID, and status; a parseable `scheduled_at`; and explicit `pinterest_board_id` / `pinterest_account_id` properties whose values are either strings or null.
- A missing field, invalid timestamp, malformed row, non-array response, or failed read is inconclusive and cannot confirm cancellation.
- Updated regression fixtures and added cases for incomplete rows, invalid timestamps, and missing destination identity fields.

## Safety

- This is a stricter client-side response validator only. It does not alter the worker claim protocol, cancellation endpoint, database state, or ownership checks.
- The target schedule is removed locally only after a successful cancellation POST or a complete valid active-schedule list that omits it.

## Verification

GitHub read-back is performed for the helper and tests. Automated tests, lint, typecheck, and build have not been executed in this environment. No production DB changes, deployment, or merge.
