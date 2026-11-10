# AUD-227 — Stop scheduled Pinterest retries when subscription is inactive

## Finding

The schedule worker checks the user's active generation plan before calling `publishPin`. If the plan is inactive, the worker throws HTTP 403 before a new Pinterest request or publication-journal reservation is made.

A schedule can nevertheless have an older `pinterest_publish_attempts` row marked `failed/retry_safe=true`. The generic worker failure policy previously allowed that old marker to authorize a retry even when the current failure was the local subscription gate. The schedule could therefore be requeued several times while the account remained ineligible.

## Change

- Mark the inactive-plan worker error explicitly as `retryable=false`.
- The existing failure policy already gives an explicit terminal preflight decision precedence over an older retry-safe journal.
- Add a regression test proving that an inactive subscription finalizes the schedule as `failed`, with no retry timestamp, despite an older `failed/retry_safe=true` attempt.

## Safety

- No Pinterest POST is made when the tariff gate rejects the schedule.
- Transient backend/database failures remain eligible for the existing bounded retry policy.
- Existing safe retry behavior for confirmed Pinterest rejections is unchanged.
- No database migration, production change, deployment, or merge was performed.

## Verification

Source and test changes were committed to the existing Draft PR branch. Automated tests were not run in this environment; the regression test is added but remains unexecuted until CI can start a runner.
