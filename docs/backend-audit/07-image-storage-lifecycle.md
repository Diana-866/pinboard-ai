# Backend audit — batch 07: image storage and lifecycle

**Дата:** 2026-11-16  
**Проверенная база:** `main`, HEAD `1f4cf095ad4c2adcf4f051d07c6379b810065761`  
**Объём:** 8 image/storage modules, upload/rehost/delete routes, related unit/integration tests and image lifecycle SQL migrations. Статическая проверка.

## Проверенные backend-модули

- `backend/storage.js` — bucket validation, image upload, provider-image rehosting, managed-object deletion.
- `backend/imageValidation.js` — 5 MiB bound and PNG/JPEG/WebP/GIF magic-byte checks.
- `backend/imageUploadValidation.js` — MIME allowlist.
- `backend/imageUploadErrors.js` — safe multipart error mapping.
- `backend/publicUrl.js` — public DNS resolution, private/special IP rejection, pinned DNS lookup, HTTPS-only provider image download, no redirects/proxy.
- `backend/pinImageLifecycle.js` — upload/delete reservation state machine, fencing tokens, ambiguous outcome handling, stale upload quarantine, deletion retry, retention queue and read-only inventories.
- `backend/pinImageCompareAndSwap.js` — image URL compare-and-swap.
- `backend/pinImageRateLimitKey.js` — per-user upload rate-limit identity.

## Проверенные routes

- `POST /pins/:id/image`: authenticated + upload limiter; pin owner lookup; one file; content signature validation; compare-and-swap image replacement; old/new objects deleted only through DB reference-aware claim.
- Generation/regeneration image rehosting uses stable idempotency keys; an existing completed managed object is reused rather than uploaded twice.
- Admin storage retry/quarantine/retention endpoints are behind `adminActionLimiter`, `requireAuth`, `requireAdmin`; diagnostics are read-only.
- Public image bucket is deliberate for Pinterest-compatible public URLs; uploads/deletes remain server-side through service-role client.

## Проверенные tests

- `storage-rehost.test.js`
- `pin-image-lifecycle.test.js`
- `pin-image-compare-and-swap.test.js`
- `image-upload-errors.test.js`
- `image-upload-validation.test.js`
- `image-validation.test.js`
- `pin-image-access-contract.test.js`
- `pin-image-deletion-claims.integration.sql`
- `pin-image-retention-inventory.integration.sql`
- `pin-image-retention-queue.integration.sql`
- `pin-image-retention-queue-blocked-inventory.integration.sql`
- `pin-image-replay-expiry.integration.sql`

## Проверенные SQL migrations

- `090_prevent_reuse_of_deleted_pin_image_paths.sql`
- `098_pin_image_paths_support_128_bit_random_ids.sql`
- `099_pin_image_quarantine_inventory.sql`
- `100_idempotent_pin_image_lifecycle_finalization.sql`
- `101_retryable_pin_image_deletion_inventory.sql`
- `103_pin_image_retention_candidate_inventory.sql`
- `104_pin_regeneration_replay_image_reference_guard.sql`
- `105_pin_image_replay_expiry_tombstones.sql`
- `106_pin_generation_replay_image_reference_guard.sql`
- `107_pin_image_upload_replay_reference_guard.sql`
- `108_retire_expired_pin_image_replay_references.sql`
- `109_pin_image_retention_queue_worker.sql`
- `110_pin_image_retention_queue_blocked_inventory.sql`

Проверено: upload/delete state uses row locks and fencing tokens; ambiguous Storage outcomes remain fenced; expired delete claims quarantine the object path instead of retrying a possibly in-flight operation; confirmed deleted paths are tombstoned; reference checks include pins, non-cancelled schedules, provider task records and generation/regeneration replay payloads; replay expiry is a separate step before deletion queue release; queue worker rechecks lifecycle references immediately before Storage DELETE; failed/quarantined inventories are bounded and service-role-only.

## Подтверждённые дефекты

В просмотренном storage/image lifecycle пакете подтверждённый критический дефект не найден. Это статический вывод по указанным модулям и контрактам, не гарантия отсутствия storage-provider/production configuration issues.

## Проверки исполнения и ограничения

- CI runner blocker остаётся; Node tests и PostgreSQL integration SQL не запускались в этой сессии.
- Не проверялись фактический Supabase bucket configuration, bucket policy, storage quota, production object inventory, stale/quarantined rows и реальная загрузка изображения.
- Production Storage не изменялся; реальные изображения не загружались/не удалялись.

## Следующий шаг

Продолжить projects/boards/pins ownership and lifecycle modules, full route map `backend/index.js`, account deletion and migration chain; затем восстановить CI runner и выполнить unit/integration + disposable PostgreSQL migration tests.
