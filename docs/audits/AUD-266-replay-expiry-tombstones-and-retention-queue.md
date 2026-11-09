# AUD-266 — replay-expiry tombstones and durable retention queue staging

**Date:** 2026-11-09  
**Status:** Implemented in PR #4; awaiting CI verification.

## Problem

Completed generation and regeneration journals retain replayable image URLs indefinitely. Deleting those objects while the saved idempotent response remains replayable would return broken image URLs. Simply deleting old journal rows would also discard the idempotency key and could allow a later retry to create a new paid provider task.

## Changes

- Migration `105_pin_image_replay_expiry_tombstones.sql` adds nullable `replay_expired_at` markers to both journal tables.
- Adds `pin_image_retention_queue`, uniquely keyed by bucket and object path. The initial state is `awaiting_reference_retirement`; queue rows are deliberately not eligible for Storage deletion in this phase. Direct table privileges are revoked and RLS is enabled.
- Adds bounded service-role-only RPC `expire_pin_image_replay_results(30..3650 days, 1..100 rows)`. It processes only `completed` rows older than the selected retention window, captures managed paths from generation task/result and regeneration storage/result payload references, merges source types into the deduplicated queue, and writes the tombstone in the same transaction.
- Preserves the latest generation claim-fencing behavior from migration 046, including fresh/resume `claim_token` issuance. The initial implementation accidentally copied the older 045 function; that regression was corrected before handoff. Queue upserts also preserve an existing `processing` lease and token rather than resetting an in-flight worker claim.
- Both begin RPCs now return `status=expired` for a tombstoned key. The generation and regeneration endpoints map that state to HTTP 410 / `idempotency_result_expired` rather than submitting another provider task.
- Adds an admin-only, rate-limited `POST /admin/storage/expire-replay-results` operation and integration coverage for tombstones, shared-path deduplication, exclusion of uncertain states, RPC/table privileges, parameter bounds, claim-token preservation, and preservation of an already active queue lease.

## Safety boundary

This phase does **not** clear generation `pins`, task `storage_url`, regeneration `storage_url`, or `result_pin`. It does not promote queue entries to `pending`, invoke `claim_pin_image_deletion`, or contact Storage. The existing deletion claim remains the final reference/fencing barrier. A later phase must transactionally retire replay payloads only after tombstoning and verify all remaining pin, schedule, and journal references before enabling deletion.

## Verification

- Migration and SQL integration test are wired into `.github/workflows/atomic-payment-integration.yml` after migrations 098–104.
- Static source checks and GitHub read-backs were performed after edits.
- Local Node/PostgreSQL tests were not run in this environment. CI status must be checked on the current PR HEAD before treating the SQL as verified.
- No production migration, Storage operation, deployment, or merge was performed.
