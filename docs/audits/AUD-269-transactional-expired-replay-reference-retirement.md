# AUD-269 — transactional retirement of expired image replay references

Date: 2026-11-09

## Finding

Migration 105 had created expiry tombstones and staged paths, but replay payloads and task storage URLs remained permanent references. The queue therefore could not safely progress beyond `awaiting_reference_retirement`, and generated-image retention remained incomplete.

## Implemented

- Added migration `108_retire_expired_pin_image_replay_references.sql` with bounded, service-role-only RPC `retire_expired_pin_image_replay_references(1..100)`.
- The RPC only touches definitively completed journals that already have `replay_expired_at`. It clears generation replay `pins`, generation task `storage_url`, and regeneration `storage_url` / `result_pin`. Journal rows and idempotency keys are retained as permanent tombstones.
- Queue rows are promoted from `awaiting_reference_retirement` to `pending` only after checking for remaining references in live pins, non-cancelled schedules, generation tasks, generation replay payloads, and regeneration journals. A shared path remains blocked until every reference is gone.
- Existing queue claims and non-awaiting states are not overwritten. The operation does not call Storage and does not bypass the final `claim_pin_image_deletion` barrier.
- Added admin-only, rate-limited `POST /admin/storage/retire-expired-replay-references` with a bounded batch size. The generation recovery GET route now also returns the same machine-readable HTTP 410 tombstone response after expiry instead of returning an empty completed result.
- Added SQL regression coverage for clearing generation/regeneration replay URLs, preserving the expired-key response, keeping a live pin and a non-terminal journal blocked, and promoting a path only after its references disappear; added route middleware coverage and wired migration 108 into atomic-payment integration CI.

## Safety boundary

This is reference retirement and queue staging only. It does not delete Storage objects. The normal deletion worker/claim/finalization path remains mandatory. No automatic scheduler was enabled.

## Verification

Changes are committed to the existing PR branch. Local Node/PostgreSQL execution is unavailable in this environment; CI must confirm the migration and tests. No production migration, production Storage mutation, deployment, or merge was performed.
