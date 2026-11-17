# PostgreSQL integration test 28 — deleted image path tombstone regression

## Owner-provided verification evidence

The owner synchronized to `7c679f475ceaaf7cdd4d2eb953c97fd84f41c374` and supplied:

- Node contract gate: **42/42 PASS**.
- Guarded Windows runner verified a clean main checkout at that commit, the expected PostgreSQL listener PID 15220 and data directory `X:\\PinPosy-verify-pg18`, then verified server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- Disposable database `pinposy_sqlint_6260f284525d4b6b` created.
- CI legacy/upgrade fixture applied.
- All **144 migrations 010–153** applied.
- Both CI inline assertions passed.
- SQL tests **1–27/46** passed.
- Test **28/46**, `pin-image-deletion-claims.integration.sql`, failed at line 519:
  `upload reservation unexpectedly reused a deleted image path`.
- Cleanup succeeded: the runner terminated connections, executed `DROP DATABASE`, and confirmed `Removed disposable database pinposy_sqlint_6260f284525d4b6b.`

The SQL integration suite remains **FAIL (27/46)**. Tests 29–46 did not run.

## Diagnosis

The failing fixture iterates lifecycle states `deleting`, `deleted`, and `quarantined`. For each state it inserts a lifecycle row and calls `begin_pin_image_upload()`; a `deleted` object path must return `reserved=false` with reason `already_deleted`.

Migration 090 established this permanent tombstone behavior. Migration 098 retained the explicit `deleted` state guard while extending accepted object-path suffix lengths. Migration 145 later replaced `begin_pin_image_upload()` to expand durable reference inventory (generation-result payloads, board covers, and review-queue payloads), but its replacement omitted the `v_state = 'deleted'` branch. Consequently a row already marked `deleted` fell through the function, passed the reference scan, and was changed to `uploading`, allowing the same public URL/object key to be reused for different bytes.

This is a production SQL regression in the latest replacement function, exposed by an existing integration fixture. The earlier migration 153 correction addresses deletion-claim expiry and is independent; it does not repair upload reservation of a deleted path.

## Changes published

Added additive migration **154**; historical migrations 090, 098 and 145 were not rewritten.

Migration 154 replaces only `begin_pin_image_upload()`, carrying forward migration 145's full durable reference inventory and restoring the explicit terminal guard:

- `quarantined` returns `path_quarantined`;
- `deleted` returns `already_deleted`;
- neither state can transition back to `uploading`.

The migration retains the service-role-only EXECUTE grant and revokes direct execution from PUBLIC, anon, authenticated and service_role before granting the RPC to service_role.

Updated the migration-154 source contract, canonical migration-chain test, Linux/Windows replay contracts and scripts, guarded Windows integration runner, and PostgreSQL CI workflow. CI now applies migration 154 after 153; the canonical contiguous range is 010–154 (**145 migrations**). The existing SQL fixture already asserts the deleted-path behavior and was not weakened or changed.

| Path | Final blob SHA | Commit |
|---|---|---|
| `db/migrations/154_restore_permanent_tombstone_guard_for_deleted_pin_image_uploads.sql` | `23756878c71b015244d68c0d2113a4de01894245` | `f71be50f88067b0dfaeb32c7a6e46277e2ba0a22` |
| `backend/test/postgres-integration-runner-contract.test.js` | `ee864877b7e23a7bbb2df036650563516db2058d` | `0e07d7825e37534ef8c4baa8a0afdc251937cf1f` |
| `backend/test/db-migration-chain.test.js` | `11098dc78c2ebd7c344becb25fb8212e695f1ec0` | `44b7c91d21ff4a0f9902e01fa5db2ca3f5841c4f` |
| `backend/test/verify-script-migration-chain.test.js` | `2ad1899ed3b7cb036c14bc5e7370adbd9d0bf849` | `afa4de20f83827f816b1ede022c55d0ce27a16c1` |
| `scripts/verify.sh` | `64bece550c2238194ffb6cdec0ad716a9095c400` | `db3a4d7f3cf97ffc9f72818776cbd9a4ba5d9f7f` |
| `scripts/verify.ps1` | `58fa1439cd6cfda34e0e45b1d7bb4ecc396f851c` | `60c775e5dab91ee760710d3f9bd9d88616584dc7` |
| `scripts/verify-integration.ps1` | `23f35d18f16c3c92970d6e65f25a56d920700357` | `edabf7e7a4ee417d8d7f70b9bdb3b7c6ce4d3b71` |
| `.github/workflows/atomic-payment-integration.yml` | `2cd3e1aca4f82fc0fb9edbfe367957f5da31341a` | `ab40127f4398cc97f4b23b088e0988e2a9c2f688` |

No local PostgreSQL, production database, Supabase project, secrets, or existing PostgreSQL data directory was accessed or changed by the assistant.

## Source-level checks and limitations

After publication, the assistant re-fetched all eight source paths from GitHub and checked their final blob SHAs. Static inspection confirmed:
- migration 154 contains the explicit `deleted -> already_deleted` return;
- the migration-154 contract checks both the tombstone and migration-145 reference inventory;
- migration-chain and replay scripts now target exactly 145 migrations, 010–154;
- CI explicitly applies migration 154 after migration 153.

These are source inspections only. The assistant did not execute Node, PowerShell, psql, PostgreSQL or GitHub Actions. The owner's Node 42/42 result was on the previous source before migration 154 and must be rerun; the previous PowerShell Parser PASS predates the runner edit and must also be rerun. Migration 154 and the 010–154 replay chain have not been runtime-verified.

## Next owner steps

1. Pull latest main and verify a clean synchronized checkout.
2. Run the three-file Node gate; the added migration contract increases the expected count to **43 tests**, all passing.
3. Run the PowerShell Parser check for `scripts/verify-integration.ps1`; require 0 syntax errors.
4. Only if both gates pass, run the guarded PostgreSQL integration runner. Require the fixture, all 145 migrations 010–154, both inline assertions, all 46 SQL tests, and disposable-database cleanup to pass.
5. Stop at the first failure and send the complete output; do not rerun before review.

Safety constraints remain unchanged: do not alter listener PID 15220, port 55439, or `X:\\PinPosy-verify-pg18`; do not bypass guards; do not use production/PIN_TRIAL; do not send passwords, tokens, or `.env` contents.
