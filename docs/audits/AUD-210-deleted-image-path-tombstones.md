# AUD-210 — Permanently retire confirmed-deleted image paths

**Status:** implemented on `feat/persisted-boards-api`  
**Scope:** managed image upload reservations and deterministic generation recovery

## Finding

Migration 070 made image deletion terminal for the deletion RPC and reference triggers: `claim_pin_image_deletion` rejects a lifecycle row in state `deleted`, and new references are rejected for that state. However, `begin_pin_image_upload` did not reject `deleted`. With no remaining references it could transition the same row back to `uploading`, then `active`, and write new bytes under a previously issued public URL.

That violated URL immutability: a stale bookmark, cached Pinterest image URL, or old pin payload could begin serving different image bytes after the original object had been deleted.

## Changes

### Database

Added `db/migrations/090_prevent_reuse_of_deleted_pin_image_paths.sql`:
- overrides `begin_pin_image_upload`;
- returns `{ reserved: false, reason: 'already_deleted' }` for a tombstoned path;
- keeps the check under the lifecycle row lock;
- preserves the existing upload reservation, reference scan, TTL bounds, token fencing, and service-role-only grants.

The tombstone is permanent. A new image must use a new object path.

### Backend recovery

Updated `backend/storage.js`:
- maps `already_deleted` to HTTP 409 instead of a generic HTTP 500;
- treats both `already_deleted` and `path_quarantined` as retired deterministic paths during provider-result recovery;
- advances to a bounded, deterministic recovery key, reusing the same recovery key on subsequent retries;
- does not skip unrelated conflicts, active uploads, lookup failures, or ambiguous Storage outcomes.

### Regression tests and CI

- Extended `backend/test/pin-image-deletion-claims.integration.sql` to assert that paths in `deleting`, `deleted`, and `quarantined` states cannot be reserved for upload, with the expected reason for each state.
- Extended `backend/test/storage-rehost.test.js` to verify that a deterministic provider result whose original path is already deleted is recovered at a fresh stable path, and that the same key is looked up on retry.
- Added migration 090 to the disposable PostgreSQL migration sequence in `.github/workflows/atomic-payment-integration.yml`.

## User-visible effect

A deleted image URL will never silently start displaying a different image later. If a generation retry encounters an address that has already been deleted, PinPosy attempts to restore the same provider result at a new stable address rather than overwriting the old one or launching another paid generation.

## Verification limits

Code, migration, tests, CI wiring and this report were committed to the feature branch. GitHub Actions must run to validate the PostgreSQL migration and Node tests; no test success is claimed here. No production migration, Storage mutation, deployment, or PR merge was performed.
