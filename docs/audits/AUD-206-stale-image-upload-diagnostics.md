# AUD-206 — Actionable stale image upload diagnostics

## Finding

The admin-only stale image reconciliation endpoints could identify visible, missing, or uninspectable Storage objects, but returned too little context to decide what to investigate next. Operators could not see the upload attempt count, reservation timestamps, or a safe next action from the response. Quarantine results were aggregate counters only, so a skipped or failed path was difficult to identify.

## Changes

- Read-only reconciliation entries now include the managed object path, attempt count, claim expiry, lifecycle update timestamp, and computed stale duration when available.
- Each unresolved entry includes a conservative `safe_action`:
  - visible object: keep the reservation fenced until the original upload is independently confirmed stopped;
  - missing object: keep it fenced and inspect provider/Storage logs;
  - failed inventory read: retry read-only reconciliation.
- Quarantine results now include per-object outcomes (`quarantined`, `skipped`, or `failed`) and a reason, alongside the existing aggregate counters.
- Upload claim tokens are never included in returned diagnostics.

## User impact

This is an operational reliability improvement. If an image save gets stuck, an administrator can identify which object is affected, how many upload attempts occurred, how long the reservation has been stale, and what can safely be done next. The endpoint still does not finalize or release an ambiguous upload, so a late Storage write cannot overwrite a path that has been reopened.

## Regression coverage

- Verifies per-object quarantine results and reasons.
- Verifies stale upload age, attempt count, timestamps, and conservative next-action hints.
- Verifies the private upload claim token is not exposed.
- Verifies missing objects and failed Storage inventory remain fenced.

## Verification limits

The code and tests were updated in the GitHub branch. Node tests were not executed in this environment because the repository checkout and dependencies are unavailable. No deployment, production database operation, Storage mutation, or migration was performed.
