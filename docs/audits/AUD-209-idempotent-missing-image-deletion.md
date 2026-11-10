# AUD-209 — Treat an already-missing Storage image as successfully deleted

**Status:** implemented on `feat/persisted-boards-api`  
**Scope:** managed image deletion lifecycle  
**Risk addressed:** stale `delete_failed` state when Storage confirms that the target object does not exist

## Finding

The deletion executor treated every definite Storage 4xx response as a failed deletion. That included HTTP 404. For an idempotent DELETE operation, an explicit object-not-found response means the desired end state already holds: the object is absent.

Previously the backend finalized the lifecycle row with `p_deleted=false`, moved it to `delete_failed`, and then surfaced an error even though there was no object left to remove. This could leave misleading lifecycle state and make later reference handling unnecessarily confusing.

## Change

`backend/pinImageLifecycle.js` now recognizes an explicit 404 from the Storage remove call as confirmed absence:
- the matching deletion claim token is still required;
- `finalize_pin_image_deletion` receives `p_deleted=true`;
- no failure code is stored;
- the helper returns success;
- other definite 4xx responses remain failed deletions;
- 5xx, timeout, conflict, throttling, and transport-ambiguous errors remain fenced and are not finalized.

This preserves the important distinction between a confirmed absent object and an ambiguous remote outcome.

## Regression coverage

`backend/test/pin-image-lifecycle.test.js` now asserts that a 404:
- still follows the claim → Storage remove → finalize sequence;
- finalizes with the exact claim token;
- marks the lifecycle row deleted;
- does not record an error code;
- returns `true` to the cleanup caller.

Existing tests continue to cover definite rejection, 5xx, thrown network errors, failed finalization, and refusal to call Storage when a deletion claim is denied.

## User-visible effect

If a user removes a pin whose managed image was already absent from Storage, cleanup no longer reports a false deletion failure. The database can record the correct final state, and the cleanup flow can finish normally. This does not make a missing image reappear; it prevents an already-completed removal from being misclassified.

## Verification limits

The change and regression test were committed to the feature branch. The test suite was not executed in this session because there is no local repository checkout/dependency environment available through this workflow. No production migration, Storage operation, deployment, or PR merge was performed.
