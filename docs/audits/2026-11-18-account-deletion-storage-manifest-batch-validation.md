# Account deletion Storage manifest batch validation (2026-11-18)

## Finding

The account-deletion worker consumed `list_account_deletion_storage_manifest` results as soon as they were arrays, validating each path immediately before deleting that object. The SQL contract in migration 137 bounds a call to at most 100 rows, and the manifest table is intended to hold unique object paths. A malformed successful RPC response containing duplicate, invalid, or oversized entries could therefore reach partial Storage deletion before the worker discovered a later invalid entry; duplicates could also cause repeated deletion attempts. This was a response-contract gap, not evidence that the SQL function currently emits malformed data.

## Change

- Added `isValidStorageManifestBatch(objects, limit)` to validate the entire batch before the first Storage side effect.
- Require an array bounded to the SQL limit (100), exact managed bucket `pin-images`, supported managed path format, and unique (bucket, path) pairs.
- Reject malformed/duplicate entries before calling `deleteImageObject`; the worker records a retry with `invalid_storage_manifest_entry`.
- The one-row follow-up query now rejects responses larger than its requested limit instead of treating them as an ordinary non-empty batch.
- Added pure validator coverage for empty/valid batches, oversized arrays, duplicate paths, invalid paths and wrong buckets; added worker regression asserting a duplicate batch causes zero Storage delete calls.

## Files and commits

| File | Current blob SHA | Purpose |
|---|---|---|
| `backend/accountDeletionWorker.js` | `92ea2372231ea87988548776b5f4208d050b807a` | Whole-batch validation before Storage deletion |
| `backend/test/account-deletion-worker.test.js` | `5539dbdb79daed9e325ded45610b9a29d4680dc1` | Validator and no-side-effect duplicate-batch regression |
| `db/migrations/137_account_deletion_content_erasure_stage.sql` | `dab57a684b6a105f7d0d40b0796e61b498c0365b` | Source contract: `p_limit` must be 1..100 and result ordered by object path |

Implementation commits:
- `0d558ec99aea53cb8ccc3b01f62cf7ef12da301d` — initial whole-batch validation.
- `98a65d8669baf7349946063e5dcfd9d34859557f` — regression tests.
- `b068f9db69a114dd51f6bef7963c01c4bb3a807e` — path validator hardening.
- `d41c16d4caee20d5cd5ed01ecebb45123e255102` — guard correction after static re-fetch.

## Verification boundary

- GitHub source and test files were re-fetched after publication; the helper, call ordering, tests and blob SHAs were inspected.
- No Node test command was executed in this environment. No test PASS is claimed.
- PostgreSQL integration, full backend/frontend suites, CI and deployment remain NOT VERIFIED.
- Account-deletion worker remains disabled. No production database, account, Storage object, SMTP, payment or Pinterest action was accessed.

## Owner acceptance

Run the focused test from a clean local checkout:

```powershell
git pull --ff-only origin main
cd backend
node --test test/account-deletion-worker.test.js
```

Preserve complete output and exit code. Follow with the disposable PostgreSQL account-deletion queue and Storage-manifest integration tests only. Never use production; do not enable the worker as part of this test.
