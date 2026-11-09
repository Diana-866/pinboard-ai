# AUD-261 — Failed pin image deletion recovery

Date: 2026-11-09

## Finding

A definitive Storage rejection was finalized as `delete_failed`, correctly releasing the claim because the provider explicitly rejected the operation. However, the application had no bounded inventory or operator action to retry these terminal failures. Objects could therefore remain orphaned indefinitely after a transient configuration, permission, or provider-side 4xx issue was corrected.

Ambiguous outcomes are different: timeouts, transport failures, throttling, conflicts, and server errors may arrive after the remote operation committed. Those must remain fenced and must not enter this retry path.

## Changes

- Added `db/migrations/101_retryable_pin_image_deletion_inventory.sql`.
  - Adds `list_failed_pin_image_deletions(limit)`.
  - Returns only `delete_failed` rows in `pin-images`.
  - Enforces a 1–100 bound and grants execution only to `service_role`.
- Added `retryFailedPinImageDeletions` in `backend/pinImageLifecycle.js`.
  - Validates bucket and managed object path before attempting a retry.
  - Processes rows independently and reports deleted/skipped/failed counts.
  - Reuses `deleteManagedPinImageObject`, preserving claim fencing and idempotent finalization.
- Added authenticated, admin-only, rate-limited endpoint:
  - `POST /admin/storage/retry-failed-deletions`
  - Optional JSON `limit`, default 25, maximum 100.
- Added Node regression tests and SQL integration assertions.
- Added migration to `.github/workflows/atomic-payment-integration.yml`.
- Documented operator recovery in `docs/storage-lifecycle.md` and `HANDOFF.md`.

## Safety properties

Every retry re-enters `claim_pin_image_deletion`. That function locks the lifecycle row and rechecks durable references in pins, non-cancelled schedules, generation task journals, and regeneration request journals before Storage is contacted. A newly referenced object is skipped. Active deletion claims and quarantined paths remain unavailable. Ambiguous remote outcomes are excluded from the retry inventory.

This is deliberately an administrator-triggered recovery action, not an unattended background sweeper.

## Verification and rollout

- Regression tests were added but not run locally in this environment.
- SQL integration assertions were added but not executed against a local PostgreSQL instance here.
- CI must be inspected after GitHub Actions runs; do not treat unobserved tests as passing.
- Migration 101 has not been applied to production Supabase.
- No production Storage mutation, deployment, or PR merge was performed.
