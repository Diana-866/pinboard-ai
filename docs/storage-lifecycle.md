# Pin image storage lifecycle

PinPosy uploads managed pin images to the public `pin-images` Supabase Storage bucket under unique `pins/<timestamp>-<random>.<ext>` keys.

## Replacement lifecycle

After a pin image URL is successfully committed to `pins.image_url` (manual image replacement or successful regenerate + atomic credit charge), backend attempts to remove the previous object. A failed DB update never triggers deletion. A failed cleanup is logged and does not turn a successful image update into an API failure.

Before removal, backend:
1. Accepts only a URL from the configured Supabase project, public `pin-images` bucket, and the managed `pins/<timestamp>-<random>.<ext>` naming pattern.
2. Checks whether any row in `pins` still references the URL.
3. Checks whether a non-cancelled `pin_schedules.snapshot_image_url` still references it.
4. Checks `pin_generation_tasks.storage_url` and keeps the object while any parent generation request is still `processing` or `unknown`. Completed/failed task journal references are historical; final pin rows remain covered by step 2.
5. Fails closed (does not delete) if any reference lookup fails or a task journal has no resolvable parent request.

Cancelling a schedule triggers the same reference check for its snapshot image. Published and failed schedules keep their snapshot image because they remain visible/retryable records.

## Current limitations

- This is reference-checked cleanup on replacement/cancellation, not a periodic orphan sweeper.
- Existing orphan objects created before this code are not inventoried or deleted.
- There is no dedicated object registry with a delayed deletion state. A very narrow race between a concurrent schedule insert and the final Storage remove is not fully eliminated; the schedule endpoint re-reads the pin after remote board verification to reduce stale-snapshot windows.
- Cleanup is best-effort. Storage removal failures are logged; the user's successful pin update remains committed.

Do not delete objects manually based only on age. Before a one-time cleanup, export candidate object paths and cross-check all database references, including schedule snapshots and in-progress generation tasks.
