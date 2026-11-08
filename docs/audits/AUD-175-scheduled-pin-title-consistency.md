# AUD-175 — Use the latest selected title when scheduling a pin

## Finding

The title-selection handler awaited the PATCH before updating React state. Scheduling also awaited the per-pin save queue, but then built its calendar item from the `currentPin` captured by the render that started the schedule action. If the user selected a title and immediately scheduled the pin while the PATCH was still running, the queue could correctly save the new title while the schedule handler still used the old captured title.

## Implementation

- Added a per-pin latest-title ref, updated synchronously when the user selects a title.
- Scheduling resolves its title from that ref after awaiting pending saves, rather than relying only on a potentially stale render closure.
- The success toast uses the same resolved title as the calendar item.
- A failed title save rolls back the ref only if that failed choice is still the latest one; it cannot undo a newer selection.
- Extracted the small selection/rollback behavior into a utility and added three focused regression tests.

## User-visible effect

Selecting a title and quickly adding the pin to the calendar now schedules the title the user actually chose, provided its save succeeds. If a newer selection is made while an older request is failing, the older failure cannot silently replace the newer choice.

## Verification and scope

- Source-level checks cover synchronous selection tracking, schedule title resolution, stale-failure protection, and the three regression cases.
- The frontend test suite, TypeScript check, Vite build, and browser tests have not been run in this environment.
- No backend, database, production data, deployment, or PR merge was changed.
