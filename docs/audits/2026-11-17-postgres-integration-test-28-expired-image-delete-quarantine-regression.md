# PostgreSQL integration test 28/46 — expired image deletion claim was reacquired

Date: 2026-11-17  
Repository: `Diana-866/pinboard-ai`, branch `main`  
Source baseline observed from owner output: `b9ff75ba8342417a93386a01a09e569b9266a4f5`

## 1. Owner-provided evidence

The owner supplied the complete Node gate output, PowerShell Parser result, and guarded PostgreSQL runner transcript.

- Node contract/migration/replay suite: **40 PASS / 1 FAIL / 41 total**. The failing test was `upgrade fixture preserves every canonical baseline column except fields introduced by later migrations`; helper `columns()` raised `table users must exist`.
- PowerShell Parser API: **PASS, 0 syntax errors**.
- Guarded runner verified clean synchronized `main` at `b9ff75ba8342417a93386a01a09e569b9266a4f5`, listener PID 15220, temporary data directory `X:\PinPosy-verify-pg18`, and expected loopback PostgreSQL identity. No password was included in the transcript.
- Upgrade fixture, all 143 migrations 010–152, and both CI inline assertions passed.
- SQL tests 1–27/46 passed. Test 28/46 `pin-image-deletion-claims.integration.sql` failed with `expired deletion claim was not permanently quarantined`; returned JSON showed `claimed: true` and a fresh expiry approximately 60 seconds in the future.
- Tests 29–46 did not run.
- Cleanup succeeded: zero remaining sessions, disposable database dropped, and explicit absence confirmed. Runner exited nonzero because psql returned exit 3.

The owner proceeded to the guarded runner despite the Node gate reporting one failure. This is recorded as a gate-order deviation; the runner's own repository/target guards passed, and no safety guard bypass is indicated.

## 2. Source diagnosis

### 2.1 Node contract test defect

In `backend/test/postgres-integration-runner-contract.test.js`, the baseline-column helper builds a dynamic `RegExp` from a JavaScript string. The pattern's `\s`, `\S`, and newline escapes must themselves be escaped in the string literal. The published source had only one backslash in the string, so JavaScript consumed the escapes and the helper did not match the existing `CREATE TABLE public.users` definition. This is a test-helper defect, not evidence that the fixture lacks the table.

The helper was corrected to preserve the regex escapes in the JavaScript string. The migration-153 contract matcher was also checked for correct regex-literal escaping.

### 2.2 Production SQL regression in image deletion lifecycle

- Migration 083 introduced permanent quarantine for an expired external Storage deletion: an old remote delete request may still finish after its lease expires, and issuing a second delete or reusing the same object path is unsafe.
- Migration 104 retained that quarantine behavior while expanding replay-image reference checks.
- Migration 145 expanded upload/deletion reference inventory to include generation replay payloads, board cover URLs, and manual-review queue payloads. However, its replacement of `claim_pin_image_deletion` restored the older retry/reclaim path for expired `deleting` rows.
- The failing integration test correctly demonstrated the regression: after the test deliberately expired the claim, the function created a new 60-second deletion claim rather than changing the lifecycle row to `quarantined`.

This is a production-function regression introduced by a later replacement, not a test-only mismatch.

## 3. Changes published

Historical migrations 083, 104, and 145 were not rewritten. A new additive migration 153 was created:

`db/migrations/153_restore_permanent_quarantine_for_expired_pin_image_deletions.sql`

It preserves migration 145's complete reference inventory and path validation, but for an expired `deleting` claim it atomically sets `state='quarantined'`, clears the claim token/expiry, records `stale_delete_quarantined`, and returns `path_quarantined`. It does not issue a second Storage delete. Existing privilege policy is retained: direct execution revoked from PUBLIC/anon/authenticated and granted to service_role.

Related source updates:
- Node contract helper regex corrected; contract added for migration 153's permanent quarantine and retained reference inventory.
- Canonical migration-chain test extended to 010–153.
- Linux and Windows replay contract tests updated to 144 migrations.
- Guarded Windows PostgreSQL runner and Linux/Windows local replay scripts updated to require contiguous migrations 010–153 (144 files).
- CI workflow updated to apply migration 153 after 152.

## 4. Published source SHAs

| Path | Final blob SHA | Commit |
|---|---|---|
| `db/migrations/153_restore_permanent_quarantine_for_expired_pin_image_deletions.sql` | `92977973a8aaae53aef4767c938db2ed1ba9019e` | `35008b37a40da18153fdc4339abce392c56a8b4e` |
| `backend/test/postgres-integration-runner-contract.test.js` | `b35b99d239d3e30edb4ff07cb081fbf5198aac90` | `1e3dc3fe4e79d2ea1db5530bd0c3eef3d0f497f5` |
| `backend/test/db-migration-chain.test.js` | `78af1b6e5fa23f808c62a3d363e487e39d963584` | `9f6cee8a9eb5d7fa870cc452f2132f80f0bd48df` |
| `backend/test/verify-script-migration-chain.test.js` | `379e28b7e32fb28cd81a9802e4a1e867b44dac49` | `543d5c672d4925bcc1b2131b72c995fe80c0907e` |
| `scripts/verify-integration.ps1` | `30fd054311526e367109fc413a52b01f6c150291` | `9cd9edff30b2274df98e000347d9fcc025dcee4d` |
| `scripts/verify.sh` | `08d6c2ecd30b8427c93c65356f940b6c9737429a` | `75e60fb445d7abe4ed6b794de985e3b5ca650586` |
| `scripts/verify.ps1` | `eead6e04356171e6d0e3544baa0b76f502b48ba2` | `92efe57561e4ae176cf75adb5c08387a0482b32e` |
| `.github/workflows/atomic-payment-integration.yml` | `37d91fcb409a295237e7adba6782dc9ac57c7863` | `7a64d7255bbe90836d9aa28115612889bb220145` |

## 5. Verification status and limitations

- Assistant re-fetched the changed source files from GitHub after publication and checked the migration 153 body, Node dynamic-RegExp escaping, migration range/count, and CI inclusion.
- Assistant did **not** execute Node, PowerShell Parser, psql, PostgreSQL, GitHub Actions, or any local command. Source inspection is not runtime verification.
- Migration 153 and the updated test/replay chain are **NOT runtime-verified**.
- PostgreSQL integration remains **NOT PASSED**. The owner run covered migrations 010–152 and tests 1–27 only; test 28 failed; tests 29–46 remain unexecuted.
- The owner-reported temporary DB cleanup succeeded. No evidence indicates that PID 15220, `X:\PinPosy-verify-pg18`, persistent cluster data, production, or PIN_TRIAL was changed.
- No secrets were requested or exposed.

## 6. Next owner gates

1. Pull the latest clean `main`; confirm HEAD equals origin/main.
2. Run the three Node contract/migration/replay test files. Stop on any failure.
3. Run PowerShell Parser API against `scripts/verify-integration.ps1`. Stop on any syntax error.
4. Only after both gates pass, run the guarded PostgreSQL integration runner.
5. SQL PASS requires the upgrade fixture, all 144 migrations 010–153, both CI inline assertions, all 46 ordered SQL integration tests, and successful disposable DB cleanup. Stop on the first failure; do not bypass runner guards or use production/PIN_TRIAL.
