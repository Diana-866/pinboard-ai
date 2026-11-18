# Account deletion worker malformed-claim fail-closed review

Date: 2026-11-18
Repository: `Diana-866/pinboard-ai`, branch `main`

## Finding

`createAccountDeletionWorker().tick()` called `claim_account_deletion_jobs`, checked only the RPC error, then iterated `jobs || []` and returned `(jobs || []).length`. The SQL function in migration 130 returns a table with `job_id`, `request_id`, `user_id`, `step_key`, `claim_token`, `attempts`, and `lease_expires_at`. A successful null/non-array response was silently reported as an idle batch. A malformed row could also reach processing, including destructive account-erasure stages, without validating its lease identity and allowed stage.

## Changes

- Added `isValidDeletionJobBatch(jobs, limit)`: bounded array (the worker claims one job), complete nonblank job/request/user/claim identity, allowed stage (`preflight`, `erase_content`, `finalize`), positive safe-integer attempts, valid lease expiry timestamp, and unique job IDs.
- `tick()` now rejects malformed claim data before invoking any stage RPC; no `jobs || []` fallback remains.
- Added unit tests for valid empty/one-job responses, null/non-array/incomplete/unknown-stage/invalid-lease/duplicate/oversized batches, and proof that malformed claim data invokes only the claim RPC and no destructive stage RPC.

## Evidence

- Source: `backend/accountDeletionWorker.js`, blob `2b937219c865352e6b3f4167e9568c732c377a67`, commit `2cdf0c9fceca0f80d061de24c8a477daf0cd3cf1`.
- Regression: `backend/test/account-deletion-worker.test.js`, blob `351c77a749abed04b59aef3684568670ace9d802`, commit `ffad0d99dace0119afeb0b29d7c20844b675f315`.
- SQL contract: `db/migrations/130_account_deletion_durable_queue.sql`, blob `1dcf7844444b4a70be1be49946d5a4c4265ce40f`; claim RPC returns the seven named columns in a table result.

## Verification boundary

Source, SQL return contract and tests were re-fetched and statically inspected. Node and disposable PostgreSQL runtime tests were not run. The account deletion worker remains disabled pending owner/staging acceptance. No production account, user data, Storage object or production DB was accessed.

## Owner acceptance

Run `node --test backend/test/account-deletion-worker.test.js` on a clean checkout, then the account deletion durable queue and worker SQL integration tests in disposable PostgreSQL. Confirm malformed claim results trigger no stage RPC. Do not enable the worker or test on production.