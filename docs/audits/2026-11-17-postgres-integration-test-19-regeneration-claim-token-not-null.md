# PostgreSQL integration test 19/46 — regeneration claim token violates NOT NULL

Date: 2026-11-17

## Owner runtime evidence

The owner synchronized a clean `main` checkout to `4df18de1fbc8ae98b3d316d945cce7f973b244de` (HEAD = origin/main; worktree clean) and ran:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Safety checks passed: PostgreSQL listener PID `15220`, data directory `X:\PinPosy-verify-pg18`, and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. The password was entered in the hidden prompt and was not disclosed.

The disposable database `pinposy_sqlint_e44cc1cd1e6d4d57` was created. The legacy/upgrade fixture, all 140 migrations 010–149, and both CI inline assertions passed. SQL tests 1–18/46 passed, including the previously corrected test 18. Test 19/46, `provider-refund-reconciliation-workflow.integration.sql`, failed. Tests 20–46 did not run.

Failure:
- NOT NULL violation on `pin_regeneration_requests.claim_token`.
- Failing function: `public.finalize_reconciled_pin_regeneration_failure(text,text)`.
- The function attempted to set `claim_token=null` while transitioning the request to `failed`.
- Runner cleanup showed 0 remaining sessions, executed `DROP DATABASE`, and explicitly confirmed removal of the disposable database.
- PostgreSQL integration remains **NOT PASSED**.

## Root cause established by source inspection

- Migration 053, `db/migrations/053_pin_regeneration_journal.sql`, defines `pin_regeneration_requests.claim_token uuid not null default gen_random_uuid()`.
- Migration 077, `db/migrations/077_finalize_reconciled_provider_failures.sql`, contains two analogous finalizers. Clearing the generation request's claim token is permitted by that table's contract. The regeneration finalizer copied the same `claim_token=null` assignment even though the regeneration column is NOT NULL.
- The SQL failure is therefore a production migration/function defect, not an invalid test fixture.
- The terminal `failed` status prevents processing-only operations; preserving the existing non-null token is consistent with the regeneration journal's schema and does not require weakening the constraint.

## Changes published

Historical migration files must remain immutable after publication. An initial in-progress edit to migration 077 was therefore reverted before finalizing the correction; GitHub verification confirms migration 077 is restored to its original blob SHA.

The durable correction is a new additive migration 150, not a rewrite of migration 077. The SQL integration test now asserts that the terminal regeneration claim token remains unchanged. The guarded runner, CI workflow, migration-chain tests and local Linux/Windows migration replay contracts were advanced to the contiguous 010–150 chain (141 migrations).

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `db/migrations/077_finalize_reconciled_provider_failures.sql` | `d5163b696157e73da1b09a4a98f6cf23da59ab66` | `74e0120e160617ea335795d8570d8f938196c9e5`; restored historical migration unchanged |
| `db/migrations/150_preserve_regeneration_claim_token_on_refund_finalization.sql` | `316510e0a4172c986a8b74559b25c03be140e945` | `d68bc21d185e7df957af65b63556033e5214d4f9`; replace regeneration finalizer without clearing required claim token |
| `backend/test/provider-refund-reconciliation-workflow.integration.sql` | `7f10ecebec93f8d6267cfcdb084f34bdcb17dc42` | `c4d39a15478128976dd8d5199df6de26c1703ae6`; assert final status and exact claim-token preservation |
| `backend/test/postgres-integration-runner-contract.test.js` | `4818d080871185306a757e5f89410570bfded391` | `f63807d92524842c1d813a70bb732493808813e2`; assert migration-150 contract and CI chain 010–150 |
| `scripts/verify-integration.ps1` | `68e2540c4ac61768d46cc16f717137705a8c0bd6` | `ef4bdb71ff8dc0fc3da05984bb806fa52332c2da`; guarded runner discovers and applies 141 migrations 010–150 |
| `.github/workflows/atomic-payment-integration.yml` | `6f26cce5ebf55d183ee9a36f2fc52bd9c4570aaa` | `804484e7357cc464ec3f52c20a151bc18214330c`; CI applies migration 150 after 149 |
| `backend/test/db-migration-chain.test.js` | `ca3fb5c69395fa9094bea0e48dea1bab3b6fe433` | `5f3d16229d1c723d431ec571f0888d5b29bbb2f2`; require canonical chain through 150 |
| `scripts/verify.sh` | `1495fb011ca7941abf643f26c9bdd673d133d87a` | `2aed03e9db134f04438180d0829a5a671a350440`; Linux replay validates 141 migrations 010–150 |
| `scripts/verify.ps1` | `1a1b4aff9978b91ac7732303543789fda73ee6c8` | `91068ce57a9fb5646a33a7fbff67a61460c55e8c`; Windows replay validates 141 migrations 010–150 |
| `backend/test/verify-script-migration-chain.test.js` | `641b41d918016e0892233340f5c22104a34c907b` | `13578ceea7956e4212b21403debd6a269d4884a9`; update replay contract to 010–150 |

## Assistant actions and verification boundaries

1. Accepted and parsed the complete owner runner transcript; distinguished SQL test 19 from the earlier test-18 input issue.
2. Fetched the SQL test, migrations 053, 063, 066, 071, 077, 073, runner, CI workflow, migration-chain tests and local verification scripts from GitHub.
3. Compared the NOT NULL table definition with the exact failing UPDATE in migration 077 and identified the copied assignment as the cause.
4. Briefly authored an in-progress change to 077, then recognized that historical migrations must not be rewritten; restored 077 to its original blob and implemented the correction as additive migration 150.
5. Added a regression assertion that the final regeneration status is `failed` and its claim token equals the token created at request start.
6. Updated runner, CI, canonical migration-chain tests and Linux/Windows replay contracts to require the contiguous 010–150 sequence.
7. Re-fetched all ten source files from GitHub and verified the final blob SHAs, that migration 077 is restored, migration 150 does not clear the token, the SQL test checks token preservation, CI includes migration 150, and all replay-chain counts/ranges are 141 / 010–150.

These are GitHub source inspections only. The assistant did not run Node, PowerShell, psql or PostgreSQL. The new migration, modified SQL test, runner and CI have **not** been runtime-verified. No production database, persistent verification cluster, PostgreSQL service PID or data directory was changed. No password, token or `.env` content was requested or exposed.

## Next owner gate

1. Pull the latest `main`, verify a clean synchronized checkout.
2. Run the Node contract, migration-chain and local replay-contract tests.
3. Run the PowerShell Parser API check for the changed guarded runner.
4. Only if both gates pass, rerun the guarded PostgreSQL integration runner. It must report 141 migrations 010–150, both inline assertions, all 46 ordered SQL tests, and successful disposable-database cleanup for SQL integration PASS.
5. Stop at the first failure, preserve the complete output and cleanup evidence, and do not claim PASS.
