# Account deletion worker claim fixture contract alignment

Date: 2026-11-18
Repository: `Diana-866/pinboard-ai`, branch: `main`

## Finding

The account-deletion worker now rejects a claimed job unless the full migration 130 table-return contract is present: `job_id`, `request_id`, `user_id`, `step_key`, `claim_token`, positive integer `attempts`, and parseable `lease_expires_at`. However, the existing worker test stubs still returned only partial rows (typically `job_id`, `user_id`, `claim_token`, and sometimes `step_key`). Those success-path fixtures contradicted the strict validator and would be rejected before the stage behavior under test could execute.

## Change

- Updated all 14 valid worker claim fixtures in `backend/test/account-deletion-worker.test.js` to include `request_id`, `attempts: 1`, and a parseable lease timestamp.
- Preserved the deliberately incomplete `job-incomplete` fixture in the malformed-response regression test.
- Preserved the canonical complete valid fixture used by the validator unit test.
- No production source, SQL migration, worker enablement, or production data was changed.

## Evidence

- Worker source blob: `2b937219c865352e6b3f4167e9568c732c377a67`.
- Updated test blob: `94c7683aba347fb98293a2bb63d2328a4d3404d6`.
- Test fixture commit: `33299508fcef9cab4141fec4a8974294e0f53a40`.
- Migration 130 claim return contract previously inspected: `db/migrations/130_account_deletion_durable_queue.sql`, blob `1dcf7844444b4a70be1be49946d5a4c4265ce40f`.

## Verification

- Re-fetched the committed test file from GitHub after the write.
- Static fixture scan found 15 claim-job IDs; all valid fixtures contain the three fields added by this correction. The intentionally incomplete `job-incomplete` fixture remains incomplete.
- Runtime `node --test backend/test/account-deletion-worker.test.js` was NOT run in this environment. PostgreSQL integration, full backend suite, CI, and deployment remain NOT VERIFIED.
- No production DB, account, Storage object, or external service was accessed.

## Next

Run the focused account-deletion worker test and disposable PostgreSQL queue integration tests from a clean checkout. Keep the worker disabled until those tests and staging acceptance pass.
