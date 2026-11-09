# AUD-270 — fenced worker for retired image replay queue (2026-11-09)

## Implemented

- Added migration 109 with bounded claim_pin_image_retention_queue (1–25 rows) and token-fenced finalize_pin_image_retention_queue_item RPCs. Both are service-role-only; direct queue table access remains revoked.
- Added processPendingPinImageRetentionQueue and admin-only, rate-limited POST /admin/storage/process-retention-queue.
- Each claimed path is validated again and passed through the existing deleteManagedPinImageObject, whose claim_pin_image_deletion RPC is the final reference/fencing barrier immediately before Supabase Storage DELETE.
- A successful Storage delete is recorded as completed only with the matching queue claim token and an unexpired lease.
- A refused claim, invalid inventory row, Storage error, or uncertain finalization becomes blocked; no automatic replay of an ambiguous remote DELETE occurs.
- An expired queue-worker lease is permanently marked blocked, never reclaimed. The remote DELETE could still be in flight after the lease expires.
- Added SQL integration coverage for claim token issuance, successful finalization, stale-token rejection, RPC privileges, and batch bounds; added Node coverage for fail-closed invalid claims and admin route middleware. Migration and test are wired into atomic-payment CI.

## Operational boundary

The worker is deliberately operator-triggered. No scheduler or automatic cron is enabled. It processes only rows already in pending, which are released by migration 108 after tombstoned replay payloads are cleared and all database references are absent. It does not process awaiting_reference_retirement, processing, blocked, or completed rows.

A blocked item requires investigation; do not manually reset it to pending unless the Storage operation's outcome and the lifecycle row state have been independently reconciled. No production migration, Storage deletion, deployment, or merge was performed in this change.

## Verification

Repository files were read back after updates. Local Node/PostgreSQL execution was unavailable; the new tests are wired into CI but are not claimed as passing until the workflow actually runs.
