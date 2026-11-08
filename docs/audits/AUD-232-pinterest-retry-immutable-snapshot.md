# AUD-232 — Retry failed schedules from their immutable creative snapshot

## Finding
The calendar retryability helper correctly accepted either the saved schedule snapshot or the live pin image as the available creative. However, retry_failed_pin_schedule in the database still required pins.image_url to be non-NULL. If the live pin image was removed or changed after scheduling, the UI could show a safe retry action while the database rejected it as pin_unavailable, despite the schedule retaining its immutable snapshot.

## Changes
- Added migration 096, overriding retry_failed_pin_schedule while preserving the owner/account/schedule/attempt checks, lock order, duplicate-publication protections, and service_role-only grant.
- The RPC now requires the owned pin record to exist and accepts either a non-empty live image URL or a non-empty snapshot_image_url stored on the schedule.
- Extended the failed-schedule retry integration test: after verifying wrong-board journal rejection, it aligns the journal identity, removes the live pin image, and proves the immutable schedule snapshot still permits the safe retry.
- Wired migration 096 into the atomic-payment integration workflow immediately after migration 095. The same SQL regression test exercises the updated function.

## User impact
A user can still safely retry a failed scheduled Pin even if they later removed or replaced the image on the original Pin. The retry uses the exact image snapshot captured when the schedule was created, rather than depending on the current editable Pin image. A missing snapshot and missing live image still block retry.

## Verification and boundaries
- Migration, SQL test, workflow, and documentation were written through GitHub and re-read for verification.
- Tests have not been executed locally. CI must confirm the disposable PostgreSQL regression.
- No production migration, deployment, Pinterest API request, or PR merge was performed.
