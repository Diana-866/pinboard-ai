# AUD-282 — Freeze pin edits while scheduling

## Problem
The calendar action flushes the current description draft and waits for the current per-pin save promise. However, the editor remained interactive during those awaits. A user could change the title, aspect ratio, or description after the scheduling handler had captured its current save promise. The new PATCH could then remain queued or debounced while the calendar item was created from an older snapshot.

## Change
- The title, aspect-ratio, and description handlers now check the synchronous scheduling lock and ignore edits once scheduling starts.
- The corresponding controls are disabled while scheduling is in progress.
- Pin navigation tabs are also disabled during scheduling so the editor does not visually switch to another pin while the captured pin is being scheduled.
- The existing flush-and-await sequence remains unchanged: the last description draft is persisted first, then the per-pin queue is awaited, and only then is the calendar item submitted.
- The lock is released in the existing finally block on both success and failure.

## Scope and safety
- No backend, database, migration, payment, Pinterest publication, or production configuration changes.
- No change to scheduling status semantics or provider calls.

## Verification
- GitHub read-back is required after the change.
- Automated tests, lint, typecheck, and build have not been run in this environment.
