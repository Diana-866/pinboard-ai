# AUD-193 — Release unused image credits after pre-image generation crash

## Finding

Multi-pin generation reserves user credits before requesting text ideas. The text plan is persisted as image-task journal rows before the first billable image-provider submission. If the backend process dies after the text-provider boundary but before the plan is persisted, recovery correctly marks the request `unknown` to prevent a blind duplicate text request. However, the existing reservation synchronization released credits only for `failed` requests. The `unknown` request therefore retained an image-credit reservation indefinitely even though no image task had ever been submitted.

## Change

- Added migration `088_release_image_credit_reservation_without_image_tasks.sql`.
- Updated the reservation sync trigger function: when a request transitions to `unknown` and has no rows in `pin_generation_tasks`, its unused image-credit reservation is released.
- The request remains `unknown`; this change does not make the request retryable or repeat a possibly billable text-provider call.
- If at least one image task exists, an unknown outcome continues to retain its reservation. That preserves protection against spending credits that may already cover a provider-accepted image task.
- Added integration coverage for both branches: unknown/no image tasks releases; unknown/with an image task retains.

## User-visible effect

If PinPosy stops after preparing text ideas but before it has durably saved any image tasks, the request remains safely blocked from accidental duplicate execution, but the reserved image credits become available again. If image generation may already have started, the credits remain protected until the outcome is resolved.

This does not charge or refund credits a second time. It changes only the reservation status; the user's balance and `credit_transactions` are not modified.

## Verification and scope

- Reviewed the generation sequence in `backend/pins.js`: the complete image-task plan is persisted before the image-provider loop begins.
- Reviewed the existing reservation trigger in migration 054 and the generation request/task journal introduced by migrations 045–046.
- Added SQL integration regression cases to `backend/test/pin-generation-credit-reservations.integration.sql`.
- PostgreSQL integration tests were not run in this environment; the migration has not been applied to Supabase.
- No production data, provider calls, deployment, or PR merge were performed.
