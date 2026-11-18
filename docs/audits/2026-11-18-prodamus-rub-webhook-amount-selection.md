# Prodamus RUB webhook amount-field selection regression

**Date:** 2026-11-18 (UTC+03:00)  
**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`  
**Starting HEAD:** `77cf63740f6c68c1efe778527fccbce34130938a`

## Confirmed defect

`backend/prodamus.js:getWebhookPaymentAmount` selected `currency_sum` whenever that field was present, even for a RUB payment. If `currency` was omitted (a supported legacy RUB callback shape), a non-RUB `currency_sum` could be interpreted as RUB. If both `sum` and `currency_sum` were present but differed, the handler could compare the wrong amount and potentially fulfill a payment against the wrong currency-denominated value.

The function already requires an explicit `currency` and `currency_sum` for non-RUB orders and rejects a currency mismatch. The defect was the RUB branch's amount-field precedence, not the foreign-currency guard.

## Corrective change

- RUB orders now read only `sum`.
- Non-RUB orders continue to require the explicit matching currency and read `currency_sum`.
- No database migration or production configuration change is needed.
- No payment, webhook, database or external provider was contacted.

Source commit: `d35733a03c2370971d3b41ea603c52186f6e2143`  
Source blob: `c57ff05dcb6c28436c226d4d69f3891b86873ee2`

## Regression coverage

Extended `backend/test/prodamus-webhook.test.js` with a case where `sum=3100.00` and `currency_sum=24.00` but `currency` is absent; the RUB result must use 3100.00 from `sum`. Also asserts that a RUB callback with only `currency_sum` is rejected as `amount_missing`, and that an explicit USD currency is rejected for a RUB order.

Test commit: `2cb3bc60a52f23a96c5fdca7c3cc4e54dd7c5240`  
Test blob: `37374cbf496d4521cc088dfc32f30f62d75f2fb6`

The existing Prodamus checkout workflow already watches both `backend/prodamus.js` and `backend/test/prodamus-webhook.test.js` on push and pull_request and runs the test file, so no workflow edit was necessary.

## Additional verification performed

- Re-fetched the live `main` head, project state, owner actions, documentation register, source, tests, workflow and migrations.
- Verified migration inventory contains 156 numbered SQL files.
- Initially suspected `received_currency` was missing from migration 029; this hypothesis was disproved by migration 037 (`f532a94bb04e1a826b9363ab27e48999115f3e11`), which adds the column. No change was made for that false lead.
- Re-fetched the modified source and test and inspected the edited test block after writing.

## Verification boundary

The regression test was **NOT EXECUTED** in this session: no local Node runtime or repository worktree is exposed through the GitHub file-edit connection. No claim of test pass is made. GitHub Actions execution for this new source commit must be inspected; the earlier Prodamus Actions run `44304664637` had failed without job steps/logs, so it is not evidence for this new change. No test has been skipped or weakened.

No production DB, PIN_TRIAL, real payment, Prodamus account, live webhook, Pinterest API, deployment or external service was accessed.

## Next step

Require the Prodamus checkout workflow to execute all five configured test files successfully, including `prodamus-webhook.test.js`. Independently, owner PostgreSQL gate UA-035 remains open: the last supplied run passed SQL tests 1–37, failed at test 38, did not run tests 39–46, and did clean up its disposable DB. Do not enable live payments or invite first users until runtime and integration gates are green.
