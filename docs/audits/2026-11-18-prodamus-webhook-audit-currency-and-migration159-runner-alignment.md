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


## Follow-up — migration 160 terminal receipt-decision binding (2026-11-18)

### Root cause and correction

Migration 159 revalidated provider order ID, amount and currency before returning a terminal decision, but the decision row's own local-payment reference was not independently compared with the payment row supplied to the RPC. Migration 160 now locks and reads the full decision row and requires terminal decisions to remain bound to the same `local_payment_kind`, `local_payment_id` and `user_id`. This prevents a receipt decision from being reused against another local purchase/subscription even if provider facts are otherwise similar. Repeated `rejected_mismatch` callbacks for the same bound payment now return an idempotent rejection instead of raising a terminal-conflict error.

### Changes published

- Migration `db/migrations/160_prodamus_receipt_local_payment_binding_guard.sql`: commit `3e3706eb06819967c1b85079b861d28084e538f8`; follow-up error-contract alignment `d17914fcf4e2a357de2b0b62c486baaeeeaacd9e`; current blob `7005ec7ce7a802312bb1376284892309a67fa226`.
- SQL regression `backend/test/payment-provider-receipt-fulfillment.integration.sql`: commit `24eccab7d451586b9ae0a6c05a4b3f722ba3ab6f`; current blob `f7fdc7a05bba1bc45f2b4f78652a7365422b4778`. It asserts cross-payment reuse is rejected for both credit purchases and subscriptions, and a repeated same-payment mismatch is idempotent.
- CI applies migration 160: `.github/workflows/atomic-payment-integration.yml`, commit `973bcc582cd60e14537a6c9cfdee5b677cd795e0`, blob `11de973ebc95fba682b53b61ac787dc1a5ab1ca1`.
- Linux replay: commit `1b4a2b59f137eb1fe13749d3c54d6ed27f6734a2`, blob `19420342cd79d952a9fff1890896bd3fd3d3412e`.
- Windows replay: commit `551fc64a2c0b9681db0469176ba4040fbe61bdb5`, blob `d40d007c8aaf2ff9c51c97aa898bab28b3bc2e32`.
- Guarded local runner: commit `e79e7bc8d7d5ce64a55d738d2db9a392453fbded`, blob `a1af92050d64db66f5081c1425e49247ef074173`.
- Migration-chain contracts: commits `013b976de62e12cf9ab4f7ee0539927c86842fc5`, `09336c3f6eaedbf466e25a845259af97c65e3c2b`, `4e4de323841516093cffec1ae32a74b6b6d30d73`; current blobs `2e8fb064dc90e75e76bcece275781363f62f8883`, `aa880e809d1555c00bb0d96355868f3fd4b78744`, `bd2f6066eb6ca3f920d6f48f44facac25ae65cb4`.

### Current static inventory and verification boundary

- Canonical migrations: 001 baseline plus **151 active migrations 010–160**.
- SQL integration manifest: **49 unique entries**, exactly matching the workflow order.
- Node preflight: **51** top-level tests across the three documented preflight files.
- Disposable concurrency suite: **10 scripts**, including payment-first and deletion-first receipt-bound credit races. That race currently models the account-status row-lock fence; it does not call the full account-deletion acceptance queue/worker and does not cover subscription fulfillment.
- Static re-fetch confirms the migration, SQL regression, workflow migration application, runner counts and migration-chain contracts. **No runtime PASS is claimed.** The Node suites, Bash syntax/race tests, 151-migration PostgreSQL replay and 49 SQL tests remain NOT VERIFIED.
- Current main HEAD observed for this reconciliation: `b38434d6e5f891db76ba4c6b7e163bf277a894e1`. Combined status reports Vercel `failure / build-rate-limit`; no deployment is confirmed. The available workflow-run lookup returned no PR-triggered run for this push HEAD; prior observed Actions failures before runner allocation remain UNKNOWN, not test failures.
- Open PR #91 remains a draft on `fix/migration-156-contract-regex`, behind main and not mergeable; no merge was attempted.

### Next engineering step

Extend the existing two-session race to call the actual account-deletion acceptance RPC/queue contract and add the subscription receipt-bound path, while preserving both lock orders and isolated cleanup. Then obtain an executed CI run with runner allocation and run the documented local disposable replay. Keep live payments and first-user invitations blocked until runtime, SQL, application, deployment and operational gates are green.
