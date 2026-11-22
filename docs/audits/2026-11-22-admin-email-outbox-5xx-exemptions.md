# Admin email-outbox health 5xx exemptions (2026-11-22)

## Finding

Owner-reported local test output on main commit `3d676a04eb32cbdeda11fe4548eb1cbf0386a66f` showed the payment-module bare-5xx inventory test failing on two `502` sites in `backend/billing.js`:

- `Источник статистики вернул некорректный ответ`
- `Источник статистики вернул некорректный счётчик`

The user's exact focused test output identifies these two strings as the only unclassified sites in that test.

## Route and data-flow verification

Static inspection of current `main` confirmed:

- Both errors originate in `readCountQueryResult()`.
- That helper is used by `getEmailOutboxHealth()`.
- The only route calling `getEmailOutboxHealth()` is `GET /admin/billing/email-outbox` in `backend/index.js`.
- The route is declared with `requireAuth` and `requireAdmin`.

These are malformed aggregate-result errors in an operator-only health view, not customer payment-state errors. Assigning a payment or customer analytics code would misrepresent the context. They are therefore explicitly exempted with reasons in `backend/test/payment-server-error-codes.test.js`.

## Regression guard

The existing inventory test now:

1. records a reason for each of the two operator-only errors;
2. asserts that the email-outbox health route still includes both authentication and admin authorization;
3. continues to reject any new unclassified bare 5xx and stale exemptions.

The test file still has two test declarations; the baseline inventory does not require a count change.

## Changes

- Regression update commit: `f500b172d7370dc50a57dd7609715003af6a82d9`
- Test file blob after change: `65c094536aff981887b203201df007b443ce40ea`

## Verification boundary

- Static route/call-site inspection: completed.
- The focused Node test after this change: NOT RUN by this GitHub-only session.
- Full backend suite: NOT RUN by this session.
- The owner previously reported a test-inventory discrepancy (computed 1,458 vs recorded expectation 1,461). Current GitHub `backend/test/test-inventory.json` at the inspected main commit records 1,458 declarations / 175 test files. Local inventory test must be rerun and its exact assertion output captured; do not edit the baseline without evidence.
- No production database, provider, payment, deployment, DNS or other external state was touched.
