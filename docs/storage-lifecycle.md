# Pin image storage lifecycle

PinPosy uploads managed pin images to the public `pin-images` Supabase Storage bucket. Manual uploads use unique `pins/<timestamp>-<random>.<ext>` keys; generated images use deterministic `pins/generation-<sha256-prefix>.<ext>` keys derived from the stable provider idempotency key.

## Replacement lifecycle

After a pin image URL is successfully committed to `pins.image_url` (manual image replacement or successful regenerate + atomic credit charge), backend attempts to remove the previous object. A failed DB update triggers best-effort cleanup of the just-uploaded object. Reference checks protect against deleting an object if the database committed despite an ambiguous client-side error. A failed cleanup is logged and does not turn a successful image update into an API failure.

Before removal, backend:
1. Accepts only a URL from the configured Supabase project, public `pin-images` bucket, and the managed `pins/<timestamp>-<random>.<ext>` naming pattern.
2. Checks whether any row in `pins` still references the URL.
3. Checks whether a non-cancelled `pin_schedules.snapshot_image_url` still references it.
4. Checks every `pin_generation_tasks.storage_url` and `pin_regeneration_requests.storage_url` reference, including completed and failed journal rows. These rows are deliberately treated as durable references because the same idempotency key can replay a completed response or resume a saved provider result even after the visible pin has changed.
5. Fails closed (does not delete) if any durable reference remains or a reference lookup fails.

For generation tasks, the storage object key is derived from the stable provider idempotency key (`pins/generation-<sha256-prefix>.<ext>`). If Storage upload succeeds but writing `storage_url` to the generation journal fails, retrying the same provider task first looks up the finalized object and reuses it; it does not blindly overwrite an existing object. If the original path is permanently quarantined/deleted, bounded deterministic recovery keys are used. Manual uploads continue to use unique random keys.

Cancelling a schedule triggers the same reference check for its snapshot image. Published and failed schedules keep their snapshot image because they remain visible/retryable records.

## Recovering definitively failed deletions

A Storage response that definitively rejects a delete is finalized as `delete_failed`; it is safe to retry because the provider rejected that request rather than leaving an unknown in-flight outcome. Migration 101 adds a bounded, service-role-only inventory for these rows. An administrator can trigger `POST /admin/storage/retry-failed-deletions` with an optional JSON limit (default 25, capped at 100). Each candidate is re-claimed through `claim_pin_image_deletion`, which locks the lifecycle row and rechecks pin, schedule snapshot, generation-task, and regeneration-journal references before contacting Storage. Referenced objects are skipped; active claims and quarantined paths remain fenced. Per-object failures are returned without aborting the rest of the batch. This is an operator-triggered recovery action, not an unattended sweeper. Migration 102 also updates `claim_pin_image_deletion` to accept the same 32-hex random suffix as migrations 098 and the upload path generator; without it, fresh 128-bit random object keys could upload successfully but fail deletion-claim validation.

## Current limitations

- This is reference-checked cleanup on replacement/cancellation, not a periodic orphan sweeper.
- Completed generation and regeneration journals now have an explicit, operator-triggered replay-expiry tombstone phase (migration 105). Their image URLs are still retained as durable references after tombstoning; they are not yet cleared and no Storage deletion is performed. Generated objects can therefore still accumulate until the later reference-retirement and fenced worker phases are implemented.
- Existing orphan objects created before this code are not inventoried or deleted.
- There is no dedicated object registry with a delayed deletion state. A very narrow race between a concurrent schedule insert and the final Storage remove is not fully eliminated; the schedule endpoint re-reads the pin after remote board verification to reduce stale-snapshot windows.
- Cleanup is best-effort. Storage removal failures are logged; the user's successful pin update remains committed. Definitive failures can now be retried by an administrator through the bounded recovery endpoint; ambiguous outcomes remain fenced and are not included in that retry inventory. A Storage 404 is treated as successful deletion only when both the error code and message identify the target object/key as missing; a generic 404 (for example, a missing bucket/endpoint) is recorded as a failed deletion instead.
- Lifecycle finalization is retry-safe: migration 100 stores the exact last finalized fencing token and terminal outcome. If PostgreSQL commits a finalize RPC but its response is lost, replaying that RPC with the same token/outcome is acknowledged; a different token or conflicting outcome is rejected. Backend makes at most one retry of the upload/deletion finalization RPC. Ambiguous Storage operations themselves are not blindly retried: expired in-flight claims remain quarantined to prevent a late remote request from racing a new write/delete.

Do not delete objects manually based only on age. Before a one-time cleanup, export candidate object paths and cross-check all database references, including schedule snapshots and all generation/regeneration journal rows (not only in-progress tasks).


## Read-only retention candidate inventory

Migration 103 adds a bounded, service-role-only RPC, exposed to administrators as `GET /admin/storage/retention-candidates?days=90&limit=100`. It reports managed image paths referenced only by completed generation/regeneration journals older than the selected retention window. It excludes paths still referenced by pins, non-cancelled schedule snapshots, recent or non-terminal generation tasks, recent regeneration requests, or recent generation replay payloads. The default is 90 days; allowed windows are 30–3650 days and result limits are 1–100.

This is deliberately an inventory-only first phase. It does not change idempotency replay behavior, clear journal URLs, or delete Storage objects. A future cleanup worker must retire replay payloads and journal references transactionally before attempting the normal fenced deletion claim. A crash-safe durable cleanup queue is still required before automatic deletion is enabled.


### Regeneration replay payload references (migration 104)

A regeneration journal has two independently persisted replay surfaces: `storage_url` and `result_pin.image_url`. Migration 104 makes both durable references visible to the deletion claim and retention inventory. This is defense in depth for legacy or inconsistent rows where the saved replay payload contains the managed URL but `storage_url` is null or differs. A path remains protected until both replay surfaces and all other live references are retired. The migration does not expire idempotency keys or delete Storage objects.


## Replay expiry tombstones and durable queue staging

Migration 105 adds `replay_expired_at` to generation and regeneration request journals and a service-role-only `pin_image_retention_queue`. Administrators can trigger the bounded operation through `POST /admin/storage/expire-replay-results` with `days` (default 90, range 30–3650) and `limit` (default 100, maximum 100).

Only rows with status `completed`, older than the selected retention window, and not already tombstoned are eligible. Processing, unknown, failed, and other uncertain provider outcomes are never expired. The expiry RPC preserves each row and its unique idempotency key, stamps `replay_expired_at`, and adds every managed image path from its generation task/result or regeneration storage/replay payload to a deduplicated queue in state `awaiting_reference_retirement`.

After expiry, both generation and regeneration begin RPCs return `status = expired` for the same key. The backend responds with HTTP 410 and code `idempotency_result_expired`; it does not submit another provider task. The operation is rate-limited and admin-only.

This migration is the tombstone-and-staging phase only: it does not clear replay payloads or delete Storage objects. Migration 108 adds the separate transactional reference-retirement step described below. Even after a queue row becomes `pending`, that state is not permission to delete: a worker must still acquire its own lease and pass the exact path through the existing fenced deletion-claim protocol.


### Generation replay payload references (migration 106)

Generation idempotency journals also persist a replayable pins JSON array independently of pin_generation_tasks.storage_url. Migration 106 adds pin_generation_requests.pins[].image_url to the final deletion-claim reference check. This protects legacy/inconsistent journals where a task URL is missing but the saved generation response still points at the object. The deletion claim and retention inventory now account for both generation replay payloads and regeneration replay payloads. The SQL integration test verifies that a generation replay URL blocks deletion until its journal is removed.


### Upload reservation replay-reference guard (migration 107)

The upload reservation RPC now checks the same two replay payloads as the deletion claim: generation request pins[].image_url and regeneration request result_pin.image_url. This prevents a reused object path from being overwritten while an old idempotent response still points to it, including legacy rows where the task/storage URL column is missing. The SQL integration test verifies both replay sources block upload reservation.


### Transactional replay-reference retirement (migration 108)

Migration 108 adds the bounded, service-role-only RPC `retire_expired_pin_image_replay_references(limit)`, exposed through the admin-only, rate-limited `POST /admin/storage/retire-expired-replay-references` endpoint. It only processes rows already marked with `replay_expired_at`: generation response `pins` are replaced with an empty array, generation task `storage_url` values are cleared, and regeneration `storage_url` / `result_pin` values are cleared. Idempotency rows and keys remain, so the same key continues to return HTTP 410 rather than creating a new paid task.

The RPC then promotes at most `limit` queue rows from `awaiting_reference_retirement` to `pending`, but only if no live pin, non-cancelled schedule, generation task, generation replay payload, or regeneration journal still references the path. Shared paths remain blocked until every journal reference has been retired. Existing queue claims and other queue states are not rewritten. This operation never calls Storage and does not itself delete objects; pending paths must still pass the existing final `claim_pin_image_deletion` reference/fencing barrier before any Storage removal.


# AUD-270 — fenced worker for retired image replay queue (2026-11-09)

## Implemented

- Added migration 109 with bounded claim_pin_image_retention_queue (1–25 rows) and token-fenced finalize_pin_image_retention_queue_item RPCs. Both are service-role-only; direct queue table access remains revoked.
- Added processPendingPinImageRetentionQueue and admin-only, rate-limited POST /admin/storage/process-retention-queue.
- Each claimed path is validated again and passed through the existing deleteManagedPinImageObject, whose claim_pin_image_deletion RPC is the final reference/fencing barrier immediately before Supabase Storage DELETE.
- A successful Storage delete is recorded as completed only with the matching queue claim token and an unexpired lease.
- A refused claim, invalid inventory row, Storage error, or uncertain finalization becomes blocked; no automatic replay of an ambiguous remote DELETE occurs.
- An expired queue-worker lease is permanently marked blocked, never reclaimed. The remote DELETE could still be in flight after the lease expires.
- Added SQL integration coverage for claim token issuance, successful finalization, stale-token rejection, RPC privileges, and batch bounds; added Node coverage for fail-closed invalid claims and admin route middleware. Migration and test are wired into atomic-payment CI.

## Operational boundary

The worker is deliberately operator-triggered. No scheduler or automatic cron is enabled. It processes only rows already in pending, which are released by migration 108 after tombstoned replay payloads are cleared and all database references are absent. It does not process awaiting_reference_retirement, processing, blocked, or completed rows.

A blocked item requires investigation; do not manually reset it to pending unless the Storage operation's outcome and the lifecycle row state have been independently reconciled. No production migration, Storage deletion, deployment, or merge was performed in this change.

## Verification

Repository files were read back after updates. Local Node/PostgreSQL execution was unavailable; the new tests are wired into CI but are not claimed as passing until the workflow actually runs.
