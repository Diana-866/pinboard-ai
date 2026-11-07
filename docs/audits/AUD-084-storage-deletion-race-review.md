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

## Follow-up implementation — stale upload reconciliation (2026-11-07)

Added service-role-only RPC `list_stale_pin_image_uploads` with bounded age and result limits, plus admin-authenticated `POST /admin/storage/reconcile-stale-uploads`. The backend checks the exact filename in the exact managed Storage folder. It finalizes only when the object is positively visible and the original fencing token still matches. The HTTP response does not expose upload tokens.

A missing object is intentionally left in `uploading`: an absent listing is not proof that an ambiguous remote request cannot still complete later. Storage listing errors and stale-token conflicts are also left unresolved. There is no automatic TTL unlock and no scheduled job; an administrator must invoke the endpoint after the migration is applied.

Added unit coverage for successful confirmation, missing-object fencing, and Storage inventory errors. Added SQL coverage for the stale inventory RPC, role grants, and minimum age bound.

**Verification limitation:** JavaScript syntax checks passed for the lifecycle helper, backend entrypoint, and unit test source. Node tests and PostgreSQL integration tests have not been executed. Migration 070 remains unapplied to Supabase; no production deploy or PR merge occurred.


## Safety correction — stale upload inventory is observational only (2026-11-07)

A second-order race was identified in the first reconciliation implementation: Storage listing can show an object that existed before the current reservation, while the current `upsert` request is still in flight. Treating visibility as proof of completion could clear the upload fence and permit a late overwrite. A matching fencing token protects database finalization from stale workers, but it does not prove that the external Storage request has stopped.

The implementation was tightened:
- `reconcileStalePinImageUploads` now only inventories and classifies stale reservations;
- visible objects are reported as `object_visible_requires_operator_confirmation`;
- missing objects remain `object_missing_keep_fenced`;
- Storage listing failures do not change lifecycle state;
- the reconciliation helper never calls `finalize_pin_image_upload`.

Unit tests now assert that no stale-upload inventory outcome finalizes or unlocks a reservation. The architecture document explicitly records that an independent operator procedure is still required to prove the original request/process has terminated before a token-checked resolution can be designed and used.

**Verification:** code and test changes are committed to the PR branch; tests have not been executed. Migration 070 remains unapplied to Supabase. No production deployment or PR merge occurred.


## Additional hardening — classify Storage HTTP errors conservatively (2026-11-07)

A returned Storage error object is not automatically a definite rejection. A 5xx response (or an unclassified response) may occur after a remote operation has committed. Releasing an upload reservation or deletion claim in that case could permit a late write/delete to race a newly committed reference.

The lifecycle helper now finalizes only a classifiable 4xx rejection, excluding 408, 409, 425 and 429. Returned 5xx, timeout/conflict/throttle, missing/unparseable status, and thrown transport errors remain fenced. Added unit tests for returned 5xx on both upload and delete; definite 4xx tests now carry explicit status codes.

**Verification:** tests are added but have not been executed. No live Storage requests, Supabase migration, production deployment, or PR merge were performed.


## Recovery design — permanently quarantine stale upload paths (2026-11-07)

A safe unlock cannot be based on elapsed time, Storage listing, or a matching database token: none proves that a remote Storage request has stopped. Rather than reopening a potentially active path, the lifecycle now supports permanent path retirement.

Migration 070 adds the `quarantined` state and service-role-only `quarantine_stale_pin_image_upload` RPC. It requires the exact current upload token, an expiry at least 15 minutes old, and no durable references. Quarantined paths are rejected by:
- new upload reservations;
- all four reference-write triggers;
- deletion claims;
- stale upload finalization using the old token.

An in-flight remote write may still finish after quarantine, but its path is permanently retired and can never be referenced or reused. This may leave an orphaned Storage object; correctness is preferred over unsafe deletion or reuse. New uploads use fresh paths.

Added admin-only `POST /admin/storage/quarantine-stale-uploads`, backend helper, unit tests, and SQL integration assertions for token fencing and permanent retirement. The existing reconcile endpoint remains read-only.

**Verification:** code and tests committed to the Draft PR branch. Unit and PostgreSQL integration tests have not been executed; migration 070 remains unapplied in Supabase. No production deployment or PR merge occurred.
