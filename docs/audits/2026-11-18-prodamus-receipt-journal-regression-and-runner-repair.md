# 2026-11-18 — Prodamus receipt journal regression and PostgreSQL runner repair

## Scope and safety boundary

Continued from the repository's live `main` state, not from a local checkout. Reconciled the latest commit history and fetched the current source, migration, workflow, test and runner files before editing. All writes were made directly to `main` using the fetched blob SHA as the update precondition. No production database, staging database, PIN_TRIAL, Prodamus account, real payment, webhook, deployment, Pinterest API or external service was accessed. No secrets or environment files were requested or read.

## Findings

### 1. Terminal receipt decision was overwritten in invalid-amount branches

The migration 158 decision RPC treats `rejected_mismatch` as terminal. Both subscription and credit webhook handlers first persisted that decision for an invalid signed amount/currency, then attempted a second `pending_review` decision. The RPC correctly rejected the second transition, turning an intentionally handled invalid payment into HTTP 500.

This source defect had already been fixed on the live branch before this continuation began:
- `backend/billing.js`: commit `33d7f13f3147ab961e8e91ac82c6d21ca88393fb`.
- `backend/creditsBilling.js`: commit `64bf9352c83a5c17402e3b760183e7f84a324a9f`.

The current handlers were re-fetched and confirmed to persist only the terminal `rejected_mismatch` decision in the invalid-amount branch. No duplicate source edit was made.

### 2. Webhook test database double did not implement the new receipt RPC contract

`backend/test/prodamus-webhook.test.js` still modeled only activation, credit fulfillment and checkout settlement RPCs. After receipt persistence was introduced, the existing handler tests would throw on the new `record_prodamus_payment_receipt` / `set_prodamus_payment_decision` calls instead of exercising webhook behavior.

Changes:
- Added deterministic receipt-RPC behavior to the in-memory test database double.
- Added decision-state behavior that rejects attempts to overwrite a terminal decision, mirroring migration 158's state guard.
- Added regression tests for invalid signed amount data in both subscription and credit webhooks. They assert HTTP 200 with review-required response, a single `rejected_mismatch` decision, no activation/credit, unchanged pending/uncredited local state, and a persisted exception record.

Commits:
- `9f01a0e35432b931c57c15a329081857bde9e785` — webhook test double and runtime-handler regressions; blob `dda429d96f6908e8af688e618da692016813c0b7`.
- `3926d6313322e21e9fd7fd672abc78ad1dc838b4` — source-contract guard against reopening terminal mismatch decisions; blob `5b0b7aed84426fd71e39d0f9f99220981c16761a`.

### 3. Guarded PostgreSQL runner did not include migration 158 in its actual selection

The runner had been updated to expect 149 migrations (010–158), but its `Get-ChildItem` filter still selected only through 157. It also expected 47 SQL manifest entries even though the current manifest contains 48.

Changes:
- Extended the active migration filter to 158.
- Updated the manifest count and uniqueness check to 48.
- Kept the fail-closed contiguous sequence check and exact local-cluster identity preflight intact.
- Corrected the Windows replay failure summary to report 010–158 consistently.

Commits:
- `1152417abe6b126409e80e2fa7c15da8449ad84c` — guarded runner; blob `be97f3c40a3f380fb31016fb9991e9fb713b9a9b`.
- `2773668fea8c9a4de4b435cb9017439db6d7fe76` — Windows replay failure summary; blob `1d526769c3fd2fc139fbb70e42ccc60578ae2036`.

### 4. Prodamus workflow and migration chain inventory

The current Prodamus workflow was re-fetched after its recent fixes. Its push and pull_request path filters both include `backend/paymentProviderReceipts.js` and `backend/test/payment-provider-receipts.test.js`; the test command includes the new receipt unit test. The earlier malformed path entry is no longer present in the current file. Current workflow blob: `8c83c851a49258b9c45f6827b3ce9decfb45984e`.

The active migration chain is now baseline 001 plus 149 numbered migrations 010–158. The SQL integration manifest contains 48 tests. The three Node preflight files contain 51 top-level tests by static count: runner contract 32, migration chain 2, verify-script contract 17.

## Verification performed

- Re-fetched source and test files after publication and confirmed the current invalid-amount branches contain `rejected_mismatch` and no `pending_review` transition.
- Re-fetched the test file and confirmed receipt RPC mock support and both invalid-amount regression tests are present.
- Re-fetched the source-contract test and confirmed the terminal-decision regression assertion is present.
- Re-fetched the guarded runner and confirmed upper bound 158, 48 unique SQL test expectation, and summary for 010–158.
- Re-fetched the Prodamus workflow and confirmed both event filters include the receipt helper/test and the job command includes `test/payment-provider-receipts.test.js`.
- Counted the three Node preflight files statically: 32 + 2 + 17 = 51. Counted manifest and migration sequence from current source: 48 SQL tests; 149 active migrations (010–158).
- Queried combined status for HEAD `2773668fea8c9a4de4b435cb9017439db6d7fe76`: Vercel reports `failure` with target `build-rate-limit`. This is a hosting quota/status observation, not a source build log or deployment result.
- The available workflow-run lookup returned no pull-request-triggered runs for this push HEAD. No GitHub Actions pass is claimed.

## Not verified / remaining blockers

- The Node tests were not executed in this environment.
- The guarded disposable PostgreSQL replay and all 48 SQL tests were not executed.
- The nine Bash concurrency scripts remain a separate unverified suite.
- No Vercel deployment is confirmed; current Vercel status is `build-rate-limit`.
- Migration 158's receipt/decision SQL has static coverage, but its runtime behavior still requires the guarded disposable PostgreSQL run.
- The two-session race between payment receipt/entitlement processing and account deletion still requires explicit integration coverage and runtime verification.
- The decision table is a per-receipt decision state with terminal transition protection; this report does not claim a multi-row append-only history of every intermediate decision transition.

## Owner action and next engineering step

Updated owner action UA-042 supersedes the old migration/test counts in UA-041: synchronize clean `main`, run the three Node preflight files (expected 51/51), then run only `scripts/verify-integration.ps1` against the runner's explicitly verified disposable PostgreSQL 18.6 instance. Acceptance requires all 149 migrations 010–158, both inline assertions, 48/48 SQL tests and confirmed disposable DB/role cleanup. Never use production, staging, Supabase or PIN_TRIAL.

Next independent engineering task: design and add a two-session deletion-vs-payment receipt/decision race integration regression, then run the complete runtime suites. Do not enable live payments or invite first users until all payment, database, application, deployment and operational release gates are green.


## Follow-up reconciliation after the initial report snapshot

The live branch advanced while this report was being documented. The following independently published follow-ups were re-fetched and included in the final state reconciliation:

- `7f058e07bb1968eb4bcdc6c3f5c75e9f68dcddf2`: unknown explicit currencies no longer inherit the RUB `sum` as a foreign-currency receipt amount. Unsupported currency now records both amount and currency as null. Unit regression: `48c3b2c0a56dd73412d0a39720ca853416c7b49f`.
- `461d07d441db487e391b5d583e8c1e9e8d898a6a`: webhook test double can simulate receipt-storage failure; subscription and credit tests assert HTTP 500 and prove order lookup/fulfillment do not happen before the durable receipt exists.
- `3b82e1a3b87608aebca4a97e1782aadf4ee4d1a3` and `f194c08b44fe34ad137bafaba901be33af519601`: corrected the migration replay contract regex and aligned the Windows runner test expectations with 149 migrations through 158.

The current branch HEAD at the time of this addendum is `48c3b2c0a56dd73412d0a39720ca853416c7b49f`. Latest relevant blobs re-fetched: `backend/paymentProviderReceipts.js` = `af7d81560bb1b69ed0df79813fcc7c0e388aedee`; `backend/test/payment-provider-receipts.test.js` = `ca3d03d747b2c402a197b30bfb58782a50e13f49`; `backend/test/prodamus-webhook.test.js` = `01d347e7b2adbc2df4571451de29e933ab354a71`; `backend/test/verify-script-migration-chain.test.js` = `44c67e6c19a1bbe3d0a8a7d2c4505a1d95915448`.

These changes improve source-level and test-contract coverage; they do not change the verification boundary. No Node or PostgreSQL runtime suite was executed, and no deployment or real payment is confirmed.
