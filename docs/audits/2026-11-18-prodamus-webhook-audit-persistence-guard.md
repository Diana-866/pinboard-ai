# Prodamus webhook audit persistence: narrow duplicate handling and CI coverage

**Date:** 2026-11-18 (UTC+03:00)  
**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`  
**Final observed HEAD:** `b99e158f73c2aa34537f9402d2870ce9973f0c1c`

## 1. Starting reconciliation

Re-fetched the current `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `docs/DOCUMENTATION_REGISTER.md`, recent commit history, current Prodamus code, billing tests, workflow files and migration `029_billing_webhook_exceptions.sql`. The observed starting HEAD was `e433085d4f192de52b8b41aab158e041ede2b311`.

The controlling project passport still records the PostgreSQL SQL integration blocker (last owner evidence: tests 1–37 PASS, test 38 FAIL, tests 39–46 NOT RUN, disposable DB cleanup PASS) and a separate Prodamus Actions blocker. No newer owner-local PostgreSQL transcript was present.

## 2. Confirmed issue

`backend/billingWebhookAudit.js` previously treated every Postgres error code `23505` as a harmless duplicate webhook delivery. Migration 029 defines both:
- `id uuid primary key`;
- `event_hash text not null unique`.

Only a conflict on `event_hash` proves the same webhook audit event was already stored. A primary-key or future unrelated unique-constraint conflict means the insert did not persist the intended audit row and must not be silently reported as a duplicate. The previous broad condition could hide such a failure from the webhook reconciliation path.

## 3. Source correction and tests

Changed `backend/billingWebhookAudit.js`:
- added `isDuplicateWebhookEventHash(error)`;
- accepts only PostgREST/Postgres unique violations (`23505`) identified by the named `billing_webhook_exceptions_event_hash_key` constraint, its constraint name in the message, or the PostgreSQL detail prefix `Key (event_hash)=`;
- propagates unrelated unique conflicts and all other DB errors.

Added three persistence tests in `backend/test/billing-webhook-audit.test.js`:
1. duplicate event_hash conflict is idempotently accepted;
2. unrelated primary-key unique violation is propagated;
3. non-unique DB failure is propagated.

Added a fourth test for the Postgres `details`-only event_hash duplicate representation. Existing fingerprint/privacy tests remain unchanged.

## 4. CI wiring

The focused Prodamus checkout workflow originally did not execute `billing-webhook-audit.test.js` and did not watch `billingWebhookAudit.js` / the test in both path filters. Updated `.github/workflows/prodamus-checkout-tests.yml` so:
- both push and pull_request path filters include the source module and its test;
- the Node command explicitly executes `prodamus-webhook.test.js`, `payment-creation-settlement.test.js`, `prodamus-ambiguous-checkout.test.js`, `billing-webhook-audit.test.js` and `billing-security-contract.test.js`.

Extended `billing-security-contract.test.js` to assert both filters contain the two paths and the test command includes the new test file.

## 5. Commit chronology and authoring corrections

| Commit | Change |
|---|---|
| `9356582342a4f0563f7bfc97485acb7fe6c8c143` | Narrow unique-violation handling in webhook audit persistence |
| `b4dc0adc24a76a2cb97cf7d39f8714d8ecf6eec8` | Initial persistence regression tests |
| `fefeff45d176d84a7a612b6dffeb2373057f0b7e` | Corrected assistant-authored regex escaping in duplicate-detail matching to a literal string check |
| `92451866e9640271972f32b8741f634d3a6caf67` | Added detail-only event_hash duplicate regression |
| `7f34f05b180bb2f7aac4da50cc04b912834741c5` | Added webhook audit module/test to Prodamus workflow push filter and command |
| `7cc4a2230dcb52bff1cd3f81a38e5ef91ca33a96` | Added source-contract assertions for new CI paths and invocation |
| `86d252baaa5569d8d3ebacff599e73792ab5de87` | Corrected PR path filter to include both webhook audit files |
| `b99e158f73c2aa34537f9402d2870ce9973f0c1c` | Updated source-contract expected command to include the audit test |

Two assistant-authored intermediate mistakes were caught by source/diff inspection before claiming completion: (1) the first duplicate-detail regex was over-escaped and did not match the intended PostgreSQL text; it was replaced with `String.includes`; (2) the initial workflow edit updated only the push path filter, and the contract assertion still expected the previous command after the new test was inserted. The PR filter and expected command were corrected in subsequent commits. These are recorded explicitly rather than hidden.

## 6. Verification boundary

After the source/workflow commits, GitHub Actions runs were observed for the Prodamus checkout workflow and other workflows. The latest Prodamus run observed was `44304664637`, conclusion FAILURE; its job `134802973700` returned `steps: null` and `logs_url: null`. The job-step endpoint returned an empty list. Earlier runs in this sequence also failed. This does not establish that the new Node tests ran or failed; the precise Actions failure cause is unknown. No blind rerun was initiated.

Combined commit status for final HEAD `b99e158f73c2aa34537f9402d2870ce9973f0c1c` reports Vercel SUCCESS. This is a status check only, not evidence that the frontend was deployed or production is ready.

No local `node --test`, `npm test`, frontend build/typecheck, PowerShell, psql, PostgreSQL or Bash test was executed by the assistant. GitHub source files and diffs were re-fetched and inspected. Runtime test status is **NOT VERIFIED**. No production database, real payment, Prodamus account, live webhook, Pinterest API or external service was accessed.

## 7. Next gates

1. The source fix and regression tests are published. Require the Prodamus Actions job to run and pass all five listed test files before marking this gate green.
2. Owner UA-036 remains the only necessary owner action if GitHub continues to provide no job logs: inspect the latest Actions run in the browser and provide the failing step/log with secrets redacted. No secret is required for the code fix itself.
3. PostgreSQL UA-035 remains separate and blocked on the owner's local guarded runner. SQL integration is not passed until all 46/46 SQL tests and disposable DB cleanup are evidenced.
4. Do not enable live payments or invite first users based only on these source changes or the Vercel status.

## 8. Assistant action chronology

1. Checked current HEAD, project passport, owner action log, documentation register and recent commits.
2. Re-fetched webhook audit module/test and migration 029; compared unique constraints with error handling.
3. Updated module and added focused tests.
4. Inspected exact diffs and corrected over-escaped detail matching.
5. Found the focused Prodamus workflow omitted the new test; updated push/PR filters and Node command.
6. Inspected source-contract test and workflow; corrected the PR path filter and command assertion.
7. Re-fetched final module, tests, workflow and commit diff; checked Actions runs and combined status.
8. Created this report and updated the project passport, owner action log and documentation register.
