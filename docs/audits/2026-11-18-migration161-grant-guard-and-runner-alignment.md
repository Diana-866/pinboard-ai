# Migration 161 — atomic-only Prodamus grant decisions and migration-chain alignment

Date: 2026-11-18  
Repository: `Diana-866/pinboard-ai`, branch `main`  
Scope: migration 161, Prodamus entitlement decision security, canonical migration runners, SQL integration regression, CI migration replay.

## Finding

The latest mainline contained `db/migrations/161_restrict_granted_decisions_to_atomic_fulfillment.sql`, which changes the security contract for payment decisions: `service_role` can record non-grant review/withheld outcomes but cannot set `granted` directly; only receipt-bound credit/subscription fulfillment wrappers can invoke the private grant helper after entitlement mutation. However, the canonical Node migration-chain test and the local Linux/Windows migration runners still required exactly 010–160 (151 files), and the SQL integration workflow had not consistently included migration 161. This creates a split-brain repository: a migration exists but standard verification and local replay can reject or omit it.

## Changes published

- `backend/test/db-migration-chain.test.js`: canonical contiguous sequence extended through 161.
- `scripts/verify.sh`: Linux replay expects exactly 152 migrations, 010–161.
- `scripts/verify.ps1`: Windows replay expects exactly 152 migrations, 010–161; summary text aligned.
- `scripts/verify-integration.ps1`: disposable SQL integration runner discovers and validates 152 migrations 010–161; diagnostics aligned. SQL manifest remains 49 unique tests.
- `backend/test/verify-script-migration-chain.test.js`: regression contract updated for 010–161 and 152 files.
- `backend/test/postgres-integration-runner-contract.test.js`: workflow and Windows runner contract now requires all 152 migration prefixes 010–161.
- `.github/workflows/atomic-payment-integration.yml`: current mainline migration list includes migration 161 after migration 160.
- `backend/test/payment-provider-receipt-fulfillment.integration.sql`: expanded existing payment integration test to verify service_role retains only non-grant decision execution, authenticated cannot execute it, the private grant helper is unavailable to service_role/authenticated, direct `set_prodamus_payment_decision(..., 'granted', ...)` is rejected, and the previous rejected-mismatch decision remains unchanged.
- `backend/test/postgres-integration-runner-contract.test.js`: extended static contract to inspect migration 161's allowlist, private grant helper, revoke/grant statements and wrapper-only calls.

## Source references and commits

- Migration 161: blob `1565937b13a668af8f894a6e3ee5a8d471c384b4`; original commit `520bd43630ad81f052b8d1a53e517d1c7fe010ef`.
- Canonical chain test: blob `d2957ada44467ce1aecdef9147140ac4ab48aa4f`; commit `541b0cae9ea7ac284305cc9cec62c7ff33a80127`.
- Linux replay: blob `5f3d64a9e772d2246276dc83a619d23ea6ee9d68`; commit `1c3cf89b827427945ecb62ca265188af509885ca`.
- Windows replay: blob `23bb3f9f0059b8459b662700ff79e64b6e53b058`; commit `c51ba5d931b59d02fd2d3d7c18294979bc271dd0`.
- SQL integration replay runner: blob `d7bc53a65409ea5e2dbc9a4b658768616f52ce8a`; current migration range and counts were re-fetched as 152/010–161.
- Migration script contract test: blob `3b7e75e070204262895cae42e36af38b83cca36c`; commit `1f623607e7b02fe3c68bcecd24c7e6bf175aa414`.
- PostgreSQL integration runner contract: blob `3195cc594e97e03a34bb1303a2e275e199da6dfa`; commit `25d3dc99b71b026131431fa74b6bfa83f27bd0e3`.
- SQL regression: blob `00fbe5af225daa0c9c81429a608b8e8240f2b5af`; commit `31882a973dd72d7ed3cedb8bf3f2d45c9b495a2f`.
- Node regression: blob `00ca9a40add8d3f21497d0bb5c5d649620b0b294`; commit `417cec592382f88b8aaf1f05bb1a36ed2c501b54`.

## Static verification performed

- Re-fetched migration 161 and confirmed its non-grant allowlist, internal grant helper, helper revocation from client/service roles, and service_role grant only on the non-grant decision RPC.
- Re-fetched current canonical migration test, Linux and Windows replay scripts, SQL integration runner, atomic Actions workflow, and regression tests.
- Updated runner expectations to 152 active migrations (010–161). The SQL integration manifest remains 49 unique tests; no new SQL manifest entry was added because the grant-guard assertions extend the existing payment receipt integration test.
- Re-fetched updated source after commits and confirmed the SQL regression includes role privilege checks and a direct forbidden-grant attempt.

## Not verified

No Bash, Node, PowerShell, PostgreSQL migration replay, SQL integration suite, GitHub Actions job steps or Vercel build were executed successfully in this session. The previous Actions runs were failing before runner allocation; the latest new workflow status must be inspected separately. Static contract assertions are not a runtime PASS. No production database, real payment or external service was accessed.

## Release impact / next step

The migration-chain omission is corrected in source and in the CI command list. Before first-user invitations or live payments, run the full 152-migration disposable replay, 49 SQL integration tests (including the new grant-guard assertions), 52 Node preflight tests, ten concurrency scripts and frontend/backend builds. Keep live payments and first-user launch blocked until those actual results and external billing configuration are confirmed.


## Follow-up — grant helper also binds exact amount and currency (2026-11-18)

A subsequent source review tightened migration 161 further. The private `mark_prodamus_entitlement_granted` helper now rejects missing local payment amounts and validates receipt amount against the committed local payment amount (tolerance 0.01) and normalized currency for **both** credit purchases and subscriptions. It also rejects a receipt decision already bound to a different payment kind, local payment ID or user before attempting a grant. This is defense-in-depth inside the private helper, in addition to the outer fulfillment wrappers' checks.

- Latest migration 161 blob: `039b778b89f8d592eda92a7f199176030a1eeb49`; hardening commit `6360f302eb5ef6a93c8c624523f1d5ea07eef852`.
- Latest SQL receipt-journal privilege test blob: `8007fbfc84ade10d7dbe1b6fc4cdda3b5a7e872d`; commit `48495387d933fc93000ce0cbce9a5abca0aeb850`. It explicitly checks authenticated cannot execute the private helper or non-grant decision RPC, and checks direct grant rejection.
- Latest Node runner contract blob: `252ab03a5146605a28cb01f465c17d7bf8947f97`; commit `bcc9e1fe68ee715dd8a244e06f95aedd0e7de1e4`. It now requires two missing-amount guards plus exact amount/currency and payment-identity checks in the private helper.

Re-fetched the migration, both payment SQL integration files and the Node contract from main. Static checks confirm both credit/subscription branches validate local amount presence, amount equality, currency equality, receipt payment-kind/order identity, and existing decision binding. No runtime test was executed. Latest atomic Actions run `44317800999` / job `134848439716` failed before runner allocation; job steps were empty. Runtime remains NOT VERIFIED.
