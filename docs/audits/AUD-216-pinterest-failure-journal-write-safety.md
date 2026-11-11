# AUD-216 — Preserve safe publication fencing when the failure journal cannot be written

## Finding

Pinterest publication is a remote side effect. When a POST outcome is ambiguous, PinPosy must persist the attempt as `unknown`; when Pinterest explicitly rejects the request, it may mark the attempt safely retryable. If the database call that records this classification itself fails, the attempt remains `processing` and is intentionally fenced from another POST. Previously, the manual route could leak a raw database error (or return a generic 500), leaving the user without a clear instruction not to retry.

## Change

- Added `persistPublishFailureJournal` in `backend/pinterestSchedule.js`.
- Both returned database errors and rejected transport promises are normalized to HTTP 503 with code `PUBLISH_JOURNAL_PERSISTENCE_FAILED`.
- The error tells the user that publication is blocked pending reconciliation and explicitly says not to retry.
- The publishing route uses this helper for thrown provider requests, non-2xx Pinterest responses, and success responses without a remote pin ID.
- If Pinterest created a pin but the local completion RPC failed, the original completion error remains primary; failure to add a secondary diagnostic is logged without hiding the fact that the remote ID is known.
- Added tests for returned DB errors, thrown transport errors, and successful journal persistence.

## User impact

If Pinterest may have accepted a pin but PinPosy cannot save the outcome, the user receives a clear temporary error instead of a generic server failure. The reservation remains fenced; pressing publish again cannot silently create a duplicate. The user is told to wait for reconciliation rather than retry.

## Validation limits

- Source files and tests were re-fetched from the feature branch after edits.
- Automated tests, backend lint, and integration SQL were not executed in this environment.
- No live Pinterest request, production database write, deployment, or PR merge was performed.

## Commits

- `9cbfee4e914895cdd75d3cae75f540f3ffc26397` — publish route handles failure-journal write errors
- `ce05e3fd0206844ca780049ba4497138451e5e3a` — reusable failure-journal policy
- `ff2bc9eadc465933d4a460281c1d15d4258316b5` — route integration
- `cdf9eced5e5b6e92f8f3a816467aca07c53e5319` — regression tests
- `2f9acd6f72bff0fa7c97d1ca954450827782fe99` — normalize thrown transport errors
- `734d3b927665e6bc6e1f2a3399400fc2ef30b4cf` — thrown transport regression test
