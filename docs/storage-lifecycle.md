# Pin image storage lifecycle

PinPosy uploads managed pin images to the public `pin-images` Supabase Storage bucket under unique `pins/<timestamp>-<random>.<ext>` keys.

## Replacement lifecycle

After a pin image URL is successfully committed to `pins.image_url` (manual image replacement or successful regenerate + atomic credit charge), backend attempts to remove the previous object. A failed DB update triggers best-effort cleanup of the just-uploaded object. Reference checks protect against deleting an object if the database committed despite an ambiguous client-side error. A failed cleanup is logged and does not turn a successful image update into an API failure.

Before removal, backend:
1. Accepts only a URL from the configured Supabase project, public `pin-images` bucket, and the managed `pins/<timestamp>-<random>.<ext>` naming pattern.
2. Checks whether any row in `pins` still references the URL.
3. Checks whether a non-cancelled `pin_schedules.snapshot_image_url` still references it.
4. Checks `pin_generation_tasks.storage_url` and keeps the object while any parent generation request is still `processing` or `unknown`. Completed/failed task journal references are historical; final pin rows remain covered by step 2.

For generation tasks, the storage object key is derived from the stable provider idempotency key (`pins/generation-<sha256-prefix>.<ext>`). If Storage upload succeeds but writing `storage_url` to the generation journal fails, retrying the same provider task uploads with `upsert: true` to the same object key instead of creating another object. Manual uploads and legacy regenerate requests without a provider task key continue to use unique random keys.
5. Fails closed (does not delete) if any reference lookup fails or a task journal has no resolvable parent request.

Cancelling a schedule triggers the same reference check for its snapshot image. Published and failed schedules keep their snapshot image because they remain visible/retryable records.

## Current limitations

- This is reference-checked cleanup on replacement/cancellation, not a periodic orphan sweeper.
- Existing orphan objects created before this code are not inventoried or deleted.
- There is no dedicated object registry with a delayed deletion state. A very narrow race between a concurrent schedule insert and the final Storage remove is not fully eliminated; the schedule endpoint re-reads the pin after remote board verification to reduce stale-snapshot windows.
- Cleanup is best-effort. Storage removal failures are logged; the user's successful pin update remains committed. A Storage 404 is treated as successful deletion only when both the error code and message identify the target object/key as missing; a generic 404 (for example, a missing bucket/endpoint) is recorded as a failed deletion instead.
- Lifecycle finalization is retry-safe: migration 100 stores the exact last finalized fencing token and terminal outcome. If PostgreSQL commits a finalize RPC but its response is lost, replaying that RPC with the same token/outcome is acknowledged; a different token or conflicting outcome is rejected. Backend makes at most one retry of the upload/deletion finalization RPC. Ambiguous Storage operations themselves are not blindly retried: expired in-flight claims remain quarantined to prevent a late remote request from racing a new write/delete.

Do not delete objects manually based only on age. Before a one-time cleanup, export candidate object paths and cross-check all database references, including schedule snapshots and in-progress generation tasks.
