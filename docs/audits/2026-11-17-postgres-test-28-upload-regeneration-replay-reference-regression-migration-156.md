# PostgreSQL integration test 28: upload reservation regeneration replay-reference regression (migration 156)

Date: 2026-11-17

## Owner-provided execution evidence

The owner ran the guarded PostgreSQL integration runner from a clean checkout at GitHub main commit `484a7857e243ab8629b4056bb226b1dfea05806f`.

- The runner verified the dedicated PostgreSQL listener (PID 15220), port 55439, data directory `X:\\PinPosy-verify-pg18`, and temporary verification role.
- It created disposable database `pinposy_sqlint_d2afcaa5940843eb`.
- The CI upgrade fixture applied.
- All 146 migrations 010–155 applied.
- Both CI inline assertions passed.
- Ordered SQL integration tests 1–27 passed.
- Test 28, `pin-image-deletion-claims.integration.sql`, failed at the assertion that upload reservation must reject a URL retained in `pin_regeneration_requests.result_pin.image_url`. Actual result was `reserved: true`.
- The runner terminated sessions for and dropped only the disposable database; removal was confirmed.
- Tests 29–46 were not run. SQL integration is **not passed** (27/46 reached successfully; test 28 failed).

The owner also supplied the Node contract failure showing the Linux replay script still expected migration 154 while the current script contains 010–155. The PowerShell Parser check passed before the guarded runner, but the runner script itself was updated for migration 156 afterward and must be parsed again.

## Diagnosis

Migration 107 introduced a durable replay-reference check in `begin_pin_image_upload()` for `pin_regeneration_requests.result_pin ->> 'image_url'`. Migration 145 later replaced the function while expanding the image reference inventory and omitted that guard. Migration 154 restored the permanent deleted-path tombstone check and preserved the board-cover and review-queue references, but its replacement function still omitted the regeneration replay payload reference.

The failing SQL fixture already contains the correct regression case: it inserts a completed regeneration request with `storage_url = NULL` and a durable `result_pin.image_url`, then attempts to reserve the same managed object path. This is a production SQL regression, not a fixture-path collision or test setup defect.

## Changes published

Added additive migration 156, based on the complete `begin_pin_image_upload()` implementation in migration 154. It adds the missing check:

`public.managed_pin_image_object_path(r.result_pin ->> 'image_url') = p_object_path`

The migration preserves the rest of migration 154's inventory and behavior, including:
- active pin image references;
- non-cancelled schedule snapshots;
- generation task storage references;
- regeneration `storage_url` references;
- generation replay payload references;
- board cover references;
- manual review queue image references;
- permanent rejection of `quarantined` and `deleted` paths;
- the existing service-role-only execution boundary.

No historical migration was edited, and the SQL regression fixture was not weakened or changed.

Updated the migration-156 static contract, canonical migration-chain contract, Linux and Windows replay contracts/scripts, guarded Windows integration runner, and CI workflow. All replay paths now require 147 contiguous migrations 010–156; CI explicitly applies migration 156 after 155.

## Exact source blobs and commits

| Path | Blob SHA | Commit |
|---|---|---|
| `db/migrations/156_restore_regeneration_replay_image_reference_to_upload_reservation.sql` | `41c41afb34686b970695b2d9f0fc98c5af81af54` | `a7612da04c4b136a073be63f0b2d3ccc5905feaa` |
| `backend/test/postgres-integration-runner-contract.test.js` | `cf32991a9c59cdc8fb326e20811b3d58e3d57af0` | `42e176a8f834ca59185301893dd09a987172f3f1` |
| `backend/test/db-migration-chain.test.js` | `b9847a527d3be60c109d4c5ed68cfe699146cd55` | `9bec3818487d3242d9b45f6e3a9f0dc79f51a5cb` |
| `backend/test/verify-script-migration-chain.test.js` | `700883c900a941608bdcf93cee483505ea5b6936` | `82a26145a99797a437ff4b063f7e903f0ecc5134` |
| `scripts/verify-integration.ps1` | `483ef0211e23a50ea50d1c80b9d47ce4140c09b3` | `9c51c2c32875873e5fa387938d808b8f2d9510e2` |
| `scripts/verify.sh` | `97f30af9b7954f43e9b961e1e05dba6b33ec2bb4` | `86bf1a4c48dadfaae7ad8558fea9f86c4e058186` |
| `scripts/verify.ps1` | `2ce1a056702d712e82c50985cc3a4c1b1ebba3a1` | `04b6969ed7da3c980c6855bd19fd4e2a60e3912f` |
| `.github/workflows/atomic-payment-integration.yml` | `18732c036fd677cedbc5c35419e2f2aa110a84f3` | `9295b7bd9ec202cb723c396bf39f5d9f061946ad` |

The source updates are separate commits on `main`; this audit and the project state/user-action/register updates follow them.

## Assistant verification and limits

The assistant fetched the changed files back from GitHub and checked their exact blob SHAs, the migration-156 replay-reference predicate, preserved tombstone and inventory conditions, 147-migration chain counts/ranges, and CI's explicit migration-156 application. These are source-level checks only.

The assistant did **not** execute Node, PowerShell, psql, PostgreSQL, Bash, or GitHub Actions. Migration 156 has not yet been applied to the owner's disposable database. The new static test and runner updates are not runtime-verified. The owner-provided PowerShell Parser PASS predates the latest runner-script edits and must be repeated.

## Next owner gates

1. Synchronize cleanly to latest `origin/main`.
2. Run the three Node contract files; require all tests to pass (expected 45 tests).
3. Run the PowerShell Parser API against the updated `scripts/verify-integration.ps1`; require 0 syntax errors.
4. Only after both gates pass, run the guarded PostgreSQL integration runner.
5. Require the fixture, 147 migrations 010–156, both CI inline assertions, all 46 SQL tests, and confirmed disposable database cleanup.

Preserve PostgreSQL listener PID 15220, port 55439, and data directory `X:\\PinPosy-verify-pg18`. Do not bypass guards, use production/`PIN_TRIAL`, or share credentials. Stop at the first failure. Nine Bash concurrency scripts remain outside this runner and are not covered by a successful SQL integration result.
