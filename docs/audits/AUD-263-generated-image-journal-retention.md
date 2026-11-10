# AUD-263 — generated image replay references and Storage retention

**Date:** 2026-11-09  
**Status:** IMPLEMENTED — documentation and operational contract corrected; retention automation intentionally not introduced.

## Finding

The storage lifecycle documentation said completed/failed generation-task journal references were historical and could be ignored once final pins were covered. That did not match the active SQL implementation.

The current `claim_pin_image_deletion` implementation (migration 102) treats both of these as durable references without filtering by parent status:

- `pin_generation_tasks.storage_url`
- `pin_regeneration_requests.storage_url`

Consequently, replacing or deleting a visible pin does not make a generated object eligible for deletion while a generation or regeneration journal row still references it. This can retain generated images indefinitely.

## Why the SQL guard was not weakened

Completed generation requests can replay their saved pin response for the same idempotency key. Regeneration requests can replay the saved result pin. Deleting an object while leaving those journal records replayable could return a dead image URL on a retry.

Therefore, changing the SQL reference checks to ignore completed/failed journals would trade storage growth for a correctness regression. No production deletion, journal pruning, or migration was introduced.

## Changes

- Corrected `docs/storage-lifecycle.md` to describe the actual SQL reference checks.
- Documented that completed/failed generation and regeneration journals remain durable references.
- Explicitly recorded the current unbounded-retention limitation and prohibited age-only cleanup.
- Kept the existing PostgreSQL integration assertions that verify a completed generation journal and a regeneration journal continue to block deletion after the visible pin reference is removed.

## Required follow-up design

A safe retention feature must define all of the following together:

1. A documented idempotency/replay retention window.
2. An API behavior for requests whose completed journal has expired (for example, explicit expired-key response rather than replaying a stale URL).
3. A transactional way to retire journal references before object deletion.
4. A bounded inventory and operator-visible dry run before any deletion.
5. Tests for retries before/after expiry, concurrent pin replacement, and late provider completion.

Until then, retaining these objects is safer than silently breaking idempotent recovery.

## Verification and safety

- Repository files were inspected on the current PR branch.
- Existing SQL integration coverage already asserts the completed generation-task and regeneration-journal reference guards; it was reviewed but not executed in this environment.
- Node/PostgreSQL tests were not run locally.
- Production database and Storage were not changed; no deployment or merge was performed.
