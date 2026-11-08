# AUD-205 — Report quarantined image uploads as conflicts

## Finding

The image lifecycle can permanently quarantine an object path when an earlier Storage request has an ambiguous outcome and may still complete later. This is an intentional safety fence: the same deterministic path must not be reused while a late write could overwrite an object. The upload layer returned an internal-server-error response for the `path_quarantined` reservation refusal, which incorrectly presented a permanent lifecycle conflict as a generic server failure.

## Change

- `uploadPinImage` now maps the explicit `path_quarantined` lifecycle result to HTTP 409 Conflict.
- The response explains that saving was stopped to protect against duplicate/late writes and that a safe retry is required.
- Added a regression test proving that this condition is surfaced as 409 rather than 500.

## User impact

If an old upload path has been quarantined for safety, PinPosy no longer tells the user that an ordinary internal server error occurred. The response makes clear that this particular save was blocked by the image-safety mechanism. It does not silently reopen or overwrite the quarantined object.

## Verification

- Reviewed the updated storage handler and regression test on the feature branch.
- Node tests were not executed in this environment; there is no local checkout with installed dependencies.
- No production database, Storage bucket, provider account, payment flow, or deployment was changed.
