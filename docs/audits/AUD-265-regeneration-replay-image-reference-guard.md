# AUD-265 — regeneration replay image-reference guard

**Date:** 2026-11-09  
**Status:** Implemented in PR #4; PostgreSQL CI execution not yet verified.

## Finding

A completed `pin_regeneration_requests` row stores a replayable response in `result_pin` as well as a managed object URL in `storage_url`. The deletion claim from migration 102 and the retention inventory from migration 103 only inspected `storage_url`.

The normal completion RPC writes both values together, but a legacy or inconsistent row can still retain `result_pin.image_url` while `storage_url` is null or different. In that state, the idempotency replay could return an image URL whose Storage object had been deleted.

## Change

Migration `104_pin_regeneration_replay_image_reference_guard.sql`:

- Extends `claim_pin_image_deletion` to treat `result_pin.image_url` as a durable reference.
- Extends `list_pin_image_retention_candidates` to report replay-payload paths as `regeneration_replay`.
- Excludes paths referenced by recent or non-terminal regeneration replay payloads.
- Preserves service-role-only RPC permissions, 128-bit object-path validation, claim TTL, and permanent quarantine behavior.

The integration regression test creates a completed regeneration journal with `storage_url = NULL` and a managed URL in `result_pin.image_url`. It verifies that deletion is refused, the inventory exposes the replay reference, and the path becomes claimable only after the journal is removed.

## Verification and safety

- Migration 104 and the regression test are included in `.github/workflows/atomic-payment-integration.yml`.
- Test fixture and migration were read back from GitHub after writes.
- Local PostgreSQL/Node tests were not run. Do not treat the regression test as passed until CI actually executes it.
- No production migration, Storage operation, deployment, or merge was performed.
- This closes a replay-reference gap only. It does not yet expire idempotency journals or automatically delete old generated images.
