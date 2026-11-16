# Backend audit — batch 10: platform primitives and runtime guards

**Дата:** 2026-11-16  
**Проверенная база:** `main` (platform primitive review after route-map follow-ups)  
**Объём:** 7 platform modules, their unit tests, plus recently added startup/tariff/mail/pagination guards.

## Проверенные модули

- `backend/dbErrors.js` — normalizes PostgREST/database errors into safe application errors; preserves only the fields used by the handler contract.
- `backend/email-locales.js` — explicit supported locales and fallback language; no raw user content interpolated into locale keys.
- `backend/fatalProcessHandlers.js` — installs process-level uncaught/unhandled handlers, emits stable event codes and exits without dumping raw secrets/error payloads.
- `backend/pinterestRateLimit.js` — bounds Pinterest provider request rate and Retry-After handling. Store is process-local; multi-instance deployment needs a shared limiter or centralized worker.
- `backend/safeLogger.js` — structured event-code logging, secret/token redaction and correlation ID propagation; raw request/provider payloads are not logged.
- `backend/supabase.js` — Supabase URL required; service-role key required in production; anon fallback only in non-production; service client remains server-side.
- `backend/tariff.js` — entitlement resolution from database subscription state and persisted plan horizon; fail-closed on DB errors and invalid/expired entitlements.

## Follow-up guards verified

- `backend/startupConfig.js` now prevents API startup unless `JWT_SECRET` contains at least 32 UTF-8 bytes.
- `backend/tariffSelfSelect.js` permits paid-plan self-selection only with explicit `NODE_ENV=development|test` plus `ALLOW_TARIFF_SELF_SELECT=1`.
- `backend/mailInputValidation.js` bounds mailbox page size, validates numeric IMAP UID, recipient email, subject and body.
- `backend/fetchAllPages.js` provides bounded 500-row PostgREST pages with a 10,000-row cap and explicit 413 overflow response.
- `backend/billing.js:listAllSubscriptions` caps admin subscription inventory at 500 rows.

## Проверенные tests

- `db-errors.test.js`
- `email-locales.test.js`
- `fatal-process-handlers.test.js`
- `pinterest-rate-limit.test.js`
- `safe-logger.test.js`
- `supabase-config.test.js`
- `tariff.test.js`
- `startup-config.test.js`
- `app-boot.test.js`
- `tariff-self-select.test.js`
- `mail-input-validation.test.js`
- `fetch-all-pages.test.js`
- `admin-subscription-limit.test.js`

## Confirmed limitations / launch risks

1. Pinterest provider rate limiting is process-local. It is acceptable only while one API instance owns the rate budget; multiple API instances would each have their own counter. Keep one Pinterest worker or move the limiter to shared storage before horizontal scaling.
2. Entitlement logic has manual/admin plan horizons as well as paid subscription rows; the admin path is guarded and self-selection now fails closed outside explicit dev/test. Production Prodamus-to-entitlement integration still needs a real staging payment/fulfillment test.
3. JWT startup check is a hard gate. Production Render environment must contain a cryptographically random JWT_SECRET of at least 32 bytes; this value was not inspected.
4. GitHub Actions runs continue to fail before job steps are created. No test in this report is claimed as executed/passed.

## Verification status

Static code/test contract review only. No Node tests, SMTP/IMAP calls, Supabase connectivity, production env reads, provider API calls or production writes were performed.
