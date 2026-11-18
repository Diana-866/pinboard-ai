# 2026-11-18 — Prodamus webhook audit currency selection and migration 159 local-runner alignment

## Scope and starting state

- Repository: `Diana-866/pinboard-ai`, branch `main`.
- Starting HEAD observed before this work: `f3690f4a99c40e7dc6224682793cad4125ab7332`.
- Reconciled current `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, `docs/DOCUMENTATION_REGISTER.md`, recent commit history, migration inventory, billing source/tests, CI workflow, and Windows disposable PostgreSQL runner before editing.
- Changes were made directly to `main` under the owner's standing instruction. No production database, PIN_TRIAL, live payment, provider account, external callback, or deployment was accessed.

## Defect 1 — webhook exception audit selected the wrong amount field

### Root cause

`backend/billingWebhookAudit.js:buildWebhookException` previously preferred `currency_sum` whenever that field existed. It did so even if the signed callback had no `currency` field or explicitly declared `rub`. The resulting audit record could associate an amount with no currency context, or record a foreign-currency amount as if it were the amount of a RUB callback. This did not itself authorize a payment, but it corrupted the durable exception evidence used for reconciliation.

### Fix

- Select `currency_sum` only when the callback explicitly supplies a non-empty currency other than RUB.
- Otherwise preserve `sum`; keep the existing normalized `received_currency` field unchanged.
- Added three regression cases: absent currency with conflicting `sum`/`currency_sum`; explicit RUB with conflicting values; explicit non-RUB uses `currency_sum`.

### Commits and blobs

- Source commit: `33b84fb7872c2739e1c2893f0917c1b398081c0b`; source blob: `4f5c63d83459731e6c4ced9cf04ed9718fab883a`.
- Regression commit: `40722066c0bcba996b6670299a14d490b6044d4d`; test blob: `c8e1a488c2a5effeffd0447011d3b5eb42aaa60e`.

## Defect 2 — guarded local PostgreSQL runner omitted migration 159's integration case

### Root cause

Migration 159 and `backend/test/payment-provider-receipt-fulfillment.integration.sql` had already been added to the CI workflow. The workflow's SQL manifest contract expected 49 tests, but the local Windows disposable runner still enforced 48 and its ordered manifest omitted the new receipt-bound fulfillment test. A developer following the local verification path could therefore receive an incomplete SQL replay/test result even though CI described the additional test.

### Fix

- Updated `scripts/verify-integration.ps1` to require 49 unique manifest entries (150 active migrations 010–159 were already selected by this runner).
- Added `payment-provider-receipt-fulfillment.integration.sql` to the ordered SQL manifest.
- Kept the existing isolated local-only target validation, clean-main synchronization checks, fail-fast behavior, and disposable database cleanup intact.
- Existing `backend/test/postgres-integration-runner-contract.test.js` already asserts the 49-test manifest and exact workflow ordering; no weakening or skipped test was introduced.

### Commits and blobs

- Runner commit: `724ec0088c8f2b68920a0413486e4158b2d944f7`; runner blob: `01c21f798062cee20790019a26bd6d581585cc3c`.
- Manifest commit: `84544dd7a48b31f4b9b894ccba1f50b008b968d1`; manifest blob: `dbba9ecacda55da7ea4b92e9928e075f7b5f1cf4`.
- Migration 159: `db/migrations/159_atomic_prodamus_receipt_entitlement_fulfillment.sql`, blob `29b2a8b7db98535f33b9eff72280f637e2f65480`.
- SQL regression: `backend/test/payment-provider-receipt-fulfillment.integration.sql`, blob `a9677076ff5cb27330125f3f911e7e918a61e7d6`.

## Intervening main commits reconciled

After the webhook fix, main advanced with:
- `28e36603c214412a432f1911f80859218587fc20`: subscription fulfillment now calls the receipt-bound atomic RPC `activate_paid_subscription_with_receipt`.
- `60c8f14bc7f1f1c2cf656f138edc60e58ac88e43`: credit fulfillment now calls `credit_paid_purchase_with_receipt`.

Both diffs were reviewed and retained. These changes bind receipt decision persistence and entitlement fulfillment in the same PostgreSQL transaction. The receipt-bound SQL test is explicitly present in `.github/workflows/atomic-payment-integration.yml`; the local manifest/runner was brought into parity.

## Verification and limitations

- Re-fetched source, regression tests, migration 159, integration SQL, workflow, runner and manifest from GitHub after writes.
- Static inspection confirms the source selects the correct amount field and three focused regressions assert the currency cases.
- Static inspection confirms runner count = 49, manifest includes the receipt-bound fulfillment SQL test, and migration sequence = 010–159 (150 files).
- GitHub Actions runs on commits `40722066`, `28e36603`, and `60c8f14` failed before runner allocation: `runner_id=0`, empty runner name, zero exposed steps. For `60c8f14`, Prodamus run `44312456380`, persisted-boards run `44312455966`, and atomic-payment run `44312455952` show this state. Exact failure cause is UNKNOWN; do not infer that test code ran or failed.
- No Node unit test, PostgreSQL migration replay, or SQL integration test was executed in this session. Runtime verification remains **NOT VERIFIED**.
- No production or live external resource was accessed.

## Owner verification still required

1. Run `node --test backend/test/billing-webhook-audit.test.js` and provide full output/exit code.
2. Run the current UA-042 Node preflight (51 expected tests) and, only if it passes, the guarded Windows PostgreSQL runner (150 migrations and 49 SQL tests). Stop on any preflight/identity/SQL/cleanup failure; do not use remote or production databases.
3. Inspect GitHub Actions annotations/logs for the pre-runner failures; do not blindly rerun or claim the workflows are green.

## Next engineering step

Review migration 159 and the webhook handler end-to-end for receipt-to-local-payment identity binding, duplicate/late callback behavior and account-deletion concurrency. Add a two-session disposable PostgreSQL race regression for deletion versus receipt-bound entitlement fulfillment. Keep live payments and first-user invitations blocked until runtime, SQL, CI, frontend/backend, deployment and operational gates are proven.


## Follow-up — terminal receipt identity fencing and SQL regression (2026-11-18)

Main advanced after the initial report. The following commits were reconciled and retained:

- `21b5e3b2bb6edfaab09163f9fefe28bb1d101e25` updates the duplicate credit webhook regression to expect the third receipt-bound fulfillment RPC call on a retry.
- `960098479cb1598bf3152556ab427585f0a7ad19` removes a duplicate copy of `payment-provider-receipt-fulfillment.integration.sql` from the SQL manifest. The final manifest is 49 unique entries; current blob `730cd86a5b3a0ce259fe1e2fb991fe4460b0079a`.
- `3eb25129c89c49230bf2147f692c27884c112054` hardens migration 159 so a terminal receipt decision cannot be rebound to a different local credit purchase or subscription. Before returning a prior terminal decision, both RPCs revalidate provider order ID, amount and currency; a conflicting terminal receipt raises an exception. Migration 159 current blob: `30519439d7423cbc84db1fbca2cc638b74c60723`.

### Added SQL regression

Extended `backend/test/payment-provider-receipt-fulfillment.integration.sql` to:
- attempt to reuse a previously granted credit receipt against a different local credit purchase and require the explicit terminal-identity conflict;
- assert the second user's credit balance and ledger remain unchanged;
- attempt to reuse a previously granted subscription receipt against a different local subscription and require the explicit terminal-identity conflict;
- assert the second subscription remains canceled and the second user's tariff remains `none`.

SQL test commit: `a6f10ab8ced8959a9bd008e782c6fd102de335df`; current blob `6c2bb6c9504c0c0f8ab0e6c940c92e19888b1500`. The test remains part of the existing 49-entry manifest and CI SQL workflow; no extra manifest entry is needed.

### Current CI evidence

On current test commit `a6f10ab8ced8959a9bd008e782c6fd102de335df`:
- Atomic payment workflow run `44313603402`, job `134833780856`: FAILURE, `runner_id=0`, empty runner name, no steps.
- Persisted boards workflow run `44313603407`, jobs `134833780522` and `134833780968`: FAILURE, `runner_id=0`, empty runner names, no steps.

The failure is still before runner allocation; there is no evidence that migration replay or tests executed. Exact platform/queue cause remains UNKNOWN. Do not interpret these failures as test assertions failing, and do not blindly rerun.

### Current verification boundary

Static inspection confirms the terminal-identity checks are present in both migration 159 RPCs and the SQL regression covers both payment kinds. The new SQL test, Node preflight, Node webhook audit suite and complete PostgreSQL replay were not executed by the assistant. Runtime remains **NOT VERIFIED**. No production database, live payment, provider account, or deployment was touched.

### Next steps

- Owner: follow UA-042 (51 Node preflight tests, then guarded local disposable PostgreSQL with 150 migrations and 49 SQL tests) and UA-043 (billing webhook audit Node test).
- Engineering: add a two-session concurrency regression for account deletion racing receipt-bound fulfillment; continue reviewing webhook identity and duplicate/late delivery handling.
- Keep live payments and first-user invitations blocked until the required runtime and operational gates are demonstrated.
