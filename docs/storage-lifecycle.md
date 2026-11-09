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
- Completed generation and regeneration journals currently have no expiry/pruning workflow. Their image URLs remain durable references even after a pin is replaced or deleted, so generated objects can accumulate indefinitely. Do not remove these journal references or delete those objects until an explicit idempotency-retention policy and replay behavior are implemented together.
- Existing orphan objects created before this code are not inventoried or deleted.
- There is no dedicated object registry with a delayed deletion state. A very narrow race between a concurrent schedule insert and the final Storage remove is not fully eliminated; the schedule endpoint re-reads the pin after remote board verification to reduce stale-snapshot windows.
- Cleanup is best-effort. Storage removal failures are logged; the user's successful pin update remains committed. Definitive failures can now be retried by an administrator through the bounded recovery endpoint; ambiguous outcomes remain fenced and are not included in that retry inventory. A Storage 404 is treated as successful deletion only when both the error code and message identify the target object/key as missing; a generic 404 (for example, a missing bucket/endpoint) is recorded as a failed deletion instead.
- Lifecycle finalization is retry-safe: migration 100 stores the exact last finalized fencing token and terminal outcome. If PostgreSQL commits a finalize RPC but its response is lost, replaying that RPC with the same token/outcome is acknowledged; a different token or conflicting outcome is rejected. Backend makes at most one retry of the upload/deletion finalization RPC. Ambiguous Storage operations themselves are not blindly retried: expired in-flight claims remain quarantined to prevent a late remote request from racing a new write/delete.

Do not delete objects manually based only on age. Before a one-time cleanup, export candidate object paths and cross-check all database references, including schedule snapshots and all generation/regeneration journal rows (not only in-progress tasks).


## Read-only retention candidate inventory

Migration 103 adds a bounded, service-role-only RPC, exposed to administrators as `GET /admin/storage/retention-candidates?days=90&limit=100`. It reports managed image paths referenced only by completed generation/regeneration journals older than the selected retention window. It excludes paths still referenced by pins, non-cancelled schedule snapshots, recent or non-terminal generation tasks, recent regeneration requests, or recent generation replay payloads. The default is 90 days; allowed windows are 30–3650 days and result limits are 1–100.

This is deliberately an inventory-only first phase. It does not change idempotency replay behavior, clear journal URLs, or delete Storage objects. A future cleanup worker must retire replay payloads and journal references transactionally before attempting the normal fenced deletion claim. A crash-safe durable cleanup queue is still required before automatic deletion is enabled.
