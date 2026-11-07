# AUD-084 — Storage deletion race and schedule snapshot review

**Date:** 2026-11-07  
**Branch:** `feat/persisted-boards-api`  
**Reviewed HEAD:** `fda9e3db790201ee1befca370eaf54196956b3be`  
**Scope:** `backend/storage.js`, `backend/pinImageLifecycle.js`, `backend/index.js`, `backend/pins.js`, migrations 015 and 017, image lifecycle tests.

## Executive summary

The existing cleanup is deliberately conservative in ordinary sequential execution: it only recognizes service-managed object paths, checks pin/schedule/generation-journal references, and fails closed when a lookup fails or a generation request is not terminal.

However, these checks are separate Supabase queries followed by an external Storage delete. They do not form one atomic operation with concurrent writers. The race documented in AUD-083 is confirmed and has a concrete schedule-creation path: `POST /pins/:id/schedule` reads the pin and a second snapshot, then inserts a schedule row directly. A concurrent cleanup can finish its reference queries before that insert commits and delete the snapshot image that the new schedule references.

## Confirmed findings

### P1 — Reference check and object deletion are not atomic

In `deletePinImageIfUnreferenced()`, pin, schedule and generation-task references are read first; the Storage object is removed afterwards. No database lock or deletion claim spans the interval.

A concurrent writer can add a reference after the final query and before `storage.remove()`. The schedule insert route is one confirmed writer: it freezes `snapshot_image_url` from the pin and inserts a `pin_schedules` row without coordinating with cleanup.

Impact: a valid schedule can retain a URL whose Storage object has been deleted. The same general class must be reviewed for all writers of `pins.image_url`, `pin_schedules.snapshot_image_url`, and `pin_generation_tasks.storage_url`.

### P2 — Cancellation cleanup is safe only under the current status transition

The cancel route updates only rows currently in `scheduled` to `cancelled`, then asks cleanup to remove the snapshot. The reference query ignores cancelled schedules, which is consistent with the current worker claim path. This remains dependent on all future retry/reconciliation paths preserving the same state rules.

### P2 — Existing bucket configuration is only partially verified

`ensureBucket()` checks that the bucket exists and its configured size limit is not below the application's 5 MiB limit. It does not verify that an existing bucket is public as expected by the public URL design, nor that its MIME allow-list matches the application's expected PNG/JPEG/WebP/GIF set. Live Supabase configuration and Storage policies remain unverified.

### P2 — No durable orphan inventory or retry queue

Cleanup failures are logged and ignored by callers. There is no durable cleanup job/claim record or periodic orphan inventory. Existing unreferenced objects and transient cleanup failures can accumulate without an operator-visible queue.

## Why no quick code patch was made

A simple extra SELECT, short delay, or pin-row lock in only the schedule route would not close the race: cleanup would still be able to delete between its last reference query and the Storage API call, and other reference writers would remain uncoordinated.

A safe fix needs a database-backed deletion-claim protocol. At minimum:
1. Create an object-lifecycle/deletion-claim record keyed by bucket + object path.
2. Acquire the claim transactionally only after checking all current references.
3. Make every path that creates or changes a durable image reference reject or wait while a matching deletion claim exists.
4. Keep the claim while the Storage delete is in flight; finalize it only after confirmed deletion, and release/retry safely on failure.
5. Cover pin updates, schedule creation/retry/reconciliation, generation journal writes, and any future image consumer with the same protocol.
6. Add PostgreSQL concurrency tests proving that either the new reference wins and deletion is blocked, or deletion wins and the reference writer cannot commit.

Implementing only one side would create a false sense of safety. This needs a dedicated migration, SQL RPCs, backend integration and concurrency tests, so it was intentionally not improvised in this audit pass.

## Existing protections confirmed

- Managed object path allow-list limits deletion to service-generated objects in the configured Supabase project and bucket.
- Unknown/legacy object paths are left untouched.
- Cleanup blocks on pin references, non-cancelled schedule references, and generation requests that are not terminal.
- Lookup errors fail closed.
- The image upload route attempts best-effort cleanup after a failed pin update, without masking the original DB error.
- The GIF managed-object path is recognized by the lifecycle helper and covered by a regression test.

## Verification limits

- Source and migration review only.
- No Node test suite was executed in this pass.
- No live Supabase Storage bucket/policy inspection was possible.
- No live concurrent request or Storage failure-injection test was executed.
- No production data, migrations, or deployment were changed.

## Recommended next implementation

Build the deletion-claim protocol as a single cohesive change, first adding SQL-level race tests and only then wiring all backend reference writers. Until then, cleanup remains best-effort and the documented race should be treated as unresolved.


## Follow-up implementation — 2026-11-07

The deletion-claim protocol is now implemented in migration 070 and the backend cleanup executor on `feat/persisted-boards-api`. Reference-write triggers serialize four durable reference families against a deletion claim:
- `pins.image_url`
- active `pin_schedules.snapshot_image_url`
- `pin_generation_tasks.storage_url`
- `pin_regeneration_requests.storage_url`

The last family was found during the follow-up callsite review: single-pin regeneration uses a separate journal table (migration 053), which the initial migration-070 reference query and trigger set had omitted. Without this addition, a completed regeneration journal could retain a replay URL while cleanup incorrectly considered the object unreferenced. Migration 070 and its SQL integration test were updated to register and retain this fourth reference family.

**Current verification:** source-level review only. The SQL integration test now asserts four trigger registrations and exercises the single-pin regeneration journal reference. It has not yet been executed against PostgreSQL; no Supabase migration or production deployment has occurred. The audit's original findings describe the pre-protocol implementation; the follow-up section records the current branch-level remediation.

## Follow-up implementation — upload/delete serialization (2026-11-07)

The next callsite review found that deletion claims alone did not serialize Storage writes. `uploadPinImage()` used `upsert: true` without acquiring the lifecycle row, so a deterministic retry could race a deletion or overwrite an object that already had a durable reference.

Migration 070 now includes `begin_pin_image_upload` and `finalize_pin_image_upload`. The backend reserves the object path before every managed upload. The reservation shares the lifecycle-row lock with deletion claims and the four reference-write triggers. A reservation is refused while another upload/deletion is active or while any durable reference exists; this prevents overwriting bytes that are already used by a pin, schedule snapshot, or generation journal.

Definite Storage upload errors release the reservation with a sanitized error code. A thrown network/transport error, or a failed finalization after Storage success, is ambiguous and deliberately leaves the object in `uploading`; TTL does not automatically reopen the path because the remote upload may still complete. Operator reconciliation remains required for such stale reservations.

Added backend unit coverage for reservation ordering, refusal before Storage write, definite upload failure finalization, ambiguous transport failure, and failed finalization. Added SQL integration coverage for upload-vs-delete blocking, reference-write rejection during upload, and overwrite refusal while referenced. The existing atomic-payment integration workflow already applies migration 070 and runs the SQL test file.

**Verification:** JavaScript source syntax can be checked, but Node and PostgreSQL integration tests have not been executed in this environment. GitHub Actions continues to fail before runner allocation (`runner_id=0`, `steps=[]`); do not treat this as a test result. Migration 070 has not been applied to Supabase and production has not been changed.
