# PostgreSQL integration test 28 — regeneration replay image reference guard regression

## Owner-provided verification evidence

The owner supplied a run from local checkout at commit `76593cc93d5251eb33020ef2a395dba2ceaa1c66`.

- Node contract/migration/replay gate: **43/43 PASS**.
- Guarded PostgreSQL runner verified a clean main checkout and the expected local PostgreSQL listener/server identity.
- Disposable database was created and later removed successfully.
- CI legacy/upgrade fixture applied.
- All **145 migrations 010–154** applied.
- Both CI inline assertions passed.
- SQL integration tests **1–27/46 passed**.
- Test **28/46**, `pin-image-deletion-claims.integration.sql`, failed at line 778:
  `deletion claim ignored regeneration replay payload image_url`.
- The deletion RPC returned `claimed: true` with a live claim token, although `pin_regeneration_requests.result_pin.image_url` still referenced the path.
- SQL tests 29–46 did not run. Overall PostgreSQL SQL integration remains **NOT PASSED**.
- Runner cleanup terminated zero remaining sessions, dropped the disposable database, and printed its removal confirmation.

The runner output also showed the server encoding `WIN1251`; some non-ASCII PostgreSQL notices were garbled in the console. This did not prevent the runner from reporting the SQL assertion or cleanup outcome.

## Investigation and root cause

Read-only inspection of the current GitHub `main` sources established:

1. Migration 104 explicitly added a `claim_pin_image_deletion()` reference check for `pin_regeneration_requests.result_pin ->> 'image_url'`, independent of `storage_url`.
2. Migration 145 later replaced the deletion-claim function to expand the reference inventory for generation task journals, generation response payloads, board covers, and review queue payloads. Its replacement retained the regeneration `storage_url` check but omitted the `result_pin.image_url` check.
3. Migration 153 subsequently restored permanent quarantine for expired external deletion claims, but its replacement function inherited the omission from migration 145.
4. Migration 154 changes upload reservation behavior and does not restore the missing deletion-claim reference check.
5. The existing SQL fixture block AUD-265 deliberately inserts a completed regeneration request with `storage_url = NULL` and a managed URL in `result_pin.image_url`. The observed `claimed: true` is therefore a real production-function regression, not a fixture path collision or malformed fixture.

The defect is an overwrite regression in the migration chain: a later `CREATE OR REPLACE FUNCTION` dropped a previously added safety condition.

## Corrective source changes

Added additive migration `155_restore_regeneration_replay_image_reference_to_deletion_claim.sql`.

- Starts from the latest quarantine-safe deletion-claim implementation in migration 153.
- Restores an `EXISTS` check against `pin_regeneration_requests.result_pin ->> 'image_url'`.
- Retains all reference checks present in migration 153, including pins, non-cancelled schedules, generation task storage URLs, regeneration storage URLs, generation result payloads, board covers and review queue image payloads.
- Preserves permanent quarantine for expired `deleting` claims, `already_deleted` tombstone behavior, `path_quarantined` behavior, token fencing and the service-role-only RPC grant.
- Does not edit historical migrations 104, 145, 153 or 154.

Updated the migration-155 static Node contract and extended the canonical migration/replay sequence from 145 migrations (010–154) to 146 migrations (010–155) in:
- `backend/test/postgres-integration-runner-contract.test.js`
- `backend/test/db-migration-chain.test.js`
- `backend/test/verify-script-migration-chain.test.js`
- `scripts/verify-integration.ps1`
- `scripts/verify.sh`
- `scripts/verify.ps1`
- `.github/workflows/atomic-payment-integration.yml`

The existing SQL test already reproduces the regression and asserts the expected `referenced` result plus retention-inventory classification; it was not weakened or rewritten.

## Publication and source verification

The following source files were fetched from GitHub after publication; blob SHAs are recorded in `docs/DOCUMENTATION_REGISTER.md`:

- Migration 155
- Node runner contract
- Migration chain contract
- Linux/Windows replay contract
- Guarded Windows integration runner
- Linux and Windows local replay scripts
- PostgreSQL CI workflow

Static source review confirmed migration 155 contains the replay payload guard and the migration-153 permanent-quarantine branch, and that runner/CI migration counts were advanced to 146 / 010–155.

## Verification boundaries and next gates

- The owner's 43/43 Node PASS and SQL failure belong to the pre-fix commit and do not verify migration 155.
- The assistant did not run Node, PowerShell, psql, PostgreSQL, or CI.
- The updated Node suite is expected to contain **44 tests** because one migration-155 contract test was added; owner must confirm 44/44 PASS.
- Because PowerShell and runner scripts changed, owner must rerun the PowerShell Parser check (0 syntax errors) after synchronizing.
- Only after both gates pass should the guarded PostgreSQL runner be run. Require fixture, 146 migrations 010–155, both inline assertions, all 46 ordered SQL tests, and confirmed disposable database cleanup.
- Preserve the existing local PostgreSQL instance (PID 15220, port 55439, data directory `X:\\PinPosy-verify-pg18`). Do not stop/reconfigure it, bypass runner guards, use production/`PIN_TRIAL`, or share passwords, tokens or `.env` contents.
- The nine Bash concurrency scripts remain outside this runner and are not verified by a successful SQL integration replay.

**Current status: SQL integration remains NOT PASSED (27/46; test 28 failed). Migration 155 and the updated replay chain are source-reviewed but not runtime-verified.**
