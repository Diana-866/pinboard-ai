# AUD-264 — bounded generated-image retention inventory

**Date:** 2026-11-09  
**Status:** Implemented — read-only operator inventory; no automatic deletion.

## Problem

Completed generation and regeneration journal rows preserve image URLs so that retries with the original idempotency key can replay the saved result. There was no supported way to identify old generated objects that are referenced only by those completed journals and no longer by visible pins or scheduled publications.

Deleting journal rows or ignoring them in the deletion claim would break replay safety. A first safe step is to measure eligible objects without mutating any data.

## Implementation

- Migration 103 adds `list_pin_image_retention_candidates(p_retention_days, p_limit)`.
- Allowed retention windows are 30–3650 days; the result limit is 1–100. Defaults are 90 days and 100 rows.
- The function groups managed paths from completed generation-task rows, completed generation replay payloads, and completed regeneration rows.
- It excludes paths referenced by live pins, non-cancelled schedules, non-terminal or recent generation tasks, recent/non-terminal regeneration requests, or recent generation replay payloads.
- It only reports lifecycle rows in `active` or `delete_failed` states. It never claims or deletes an object.
- Execution is revoked from public, anon, authenticated, and service_role initially, then granted only to service_role.
- Added admin endpoint `GET /admin/storage/retention-candidates`, protected by auth, DB-backed admin authorization, and rate limiting.
- Added PostgreSQL integration coverage and CI wiring, plus route middleware coverage.

## Safe cleanup boundary

This inventory is not a deletion authorization. A later implementation must atomically retire completed replay payloads and URL references, retain an idempotency tombstone so an expired key cannot silently start a new provider task, and enqueue object paths in a durable cleanup queue. The worker must then use the existing claim/fencing protocol. A durable queue is necessary because a process can crash after journal retirement but before Storage deletion.

## Verification

- All changed files were read back from GitHub.
- Local Node/PostgreSQL tests were not run in this environment.
- CI results on the new HEAD are checked separately and must not be assumed successful.
- Production DB/Storage, deployment, and merge were not touched.
