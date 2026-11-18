# Transactional email outbox malformed-claim fail-closed review

Date: 2026-11-18
Repository: `Diana-866/pinboard-ai`, branch `main`

## Finding

`dispatchPendingSubscriptionEmails()` called the `claim_email_outbox` PostgreSQL RPC, checked only the transport error, then iterated `rows || []` and reported `(rows || []).length` as processed. The SQL function returns `SETOF public.email_outbox`; a successful empty result is `[]`. A null, non-array or malformed response was silently interpreted as an idle queue. This can hide a broken claim contract and leave notification work unprocessed while the caller observes a successful zero-item dispatch.

Claimed rows also carry a lease (`id`, `claim_token`) and mail identity (`subscription_id`, `recipient_email`, `template_key`, `payload`). Processing any row before validating the full batch risks partial sends or retry attempts with incomplete fencing data.

## Changes

- Added `isValidEmailOutboxClaimRows(rows, limit)` to `backend/billing.js`. It requires a bounded array (1–50), complete nonblank claim/mail identity, object payloads, and unique outbox IDs. A valid empty array remains accepted.
- `dispatchPendingSubscriptionEmails()` now normalizes the requested limit to an integer, validates the entire RPC batch before sending any email, and iterates/counts the validated array without null coercion.
- Added regressions to `backend/test/email-outbox.test.js` for valid empty/single-row batches, null/non-array/malformed/oversized/duplicate/incomplete rows, and a dispatch-level assertion that invalid claims cause no SMTP send and no mark/retry RPC.

Commits and blobs:
- `backend/billing.js`: commit `4bd9145198a643a5878652054cd41ae77cb529a1`, blob `3818dedcfbbbac0fa6a1f36b9009328a07d97d67`.
- `backend/test/email-outbox.test.js`: commit `c1fc19af5d217a58c29dcbda0d0bdf64ac761f0c`, blob `da9438ed59e9d3c3e791a1feee8ffb5ff25f12ad`.
- SQL contract inspected: `db/migrations/030_transactional_email_outbox.sql`, blob `75a4d24e85327384f6089e2d340c9841a857e8eb`; `claim_email_outbox` returns `SETOF public.email_outbox`.

## Verification boundary

Re-fetched and inspected source, tests and migration after the change. Runtime Node tests were not executed in this environment. No SMTP provider, production database, customer email or external payment was accessed. GitHub Actions/Vercel status remains a separate platform blocker; do not claim tests passed.

## Owner acceptance

Run `node --test backend/test/email-outbox.test.js` and then the billing webhook/idempotency focused tests from the project acceptance manifest. Verify with disposable PostgreSQL that `claim_email_outbox` returns an empty array for no work and a complete fenced row for claimed work. Do not use production.

## Next

Continue reviewing other RPC claim/queue consumers for the same null-to-empty coercion and validate payment settlement/webhook concurrency only where the current source shows a concrete contract gap.