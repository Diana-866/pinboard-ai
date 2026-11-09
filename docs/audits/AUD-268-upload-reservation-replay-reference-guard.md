# AUD-268 — upload reservation replay-reference guard

**Date:** 2026-11-09  
**Status:** Implemented in PR #4; awaiting CI verification.

## Finding

The upload reservation RPC checked live pins, schedule snapshots, generation task storage URLs, and regeneration storage URLs before allowing a path to enter the `uploading` lifecycle state. It did not check the two independently persisted replay payloads: `pin_generation_requests.pins[].image_url` and `pin_regeneration_requests.result_pin.image_url`. A legacy or inconsistent row could therefore retain a replayable image URL while a new upload reused and overwrote the same object path.

## Change

- Added migration `107_pin_image_upload_replay_reference_guard.sql`.
- `begin_pin_image_upload` now rejects paths referenced by generation replay pins or regeneration replay results, in addition to all existing reference classes.
- Preserved 128-bit path validation, lifecycle state checks, claim token generation, and service-role-only execution.
- Added SQL integration coverage for both replay-only references. Updated migration prerequisites, lifecycle documentation, and the atomic-payment integration workflow.

## Verification and safety

- Files were read back from GitHub after changes.
- PostgreSQL tests were not run locally. CI must confirm the migration and integration test.
- No production migration, Storage operation, deployment, or merge was performed.
