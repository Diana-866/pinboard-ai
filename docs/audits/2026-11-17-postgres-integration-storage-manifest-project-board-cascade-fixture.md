# PostgreSQL SQL integration — upgrade fixture lost project/board cascade foreign keys

## Owner runtime evidence (2026-11-17)

Owner synchronized the checkout at `758eba5efdceb4f76c99b9d0077301e7c3fe58d8`; `HEAD` and `origin/main` matched and `git status --short` was empty.

Owner ran:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
node --test backend/test/postgres-integration-runner-contract.test.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

The Node contract suite reported **16 passed, 1 failed (17 total)**. The sole failure was the new `boards.cover_url` assertion: the fixture actually contained `cover_url   text`, while the assertion required exactly one space with `/cover_url text/i`. This was a brittle test regex, not a missing column. The runner was then run despite the failed contract gate; that execution is recorded as owner evidence, not as an approved gate sequence.

The guarded runner verified the synchronized checkout, approved temporary PostgreSQL listener PID 15220 and data directory `X:\PinPosy-verify-pg18`, hidden password prompt and exact server identity:

`127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`

Disposable database: `pinposy_sqlint_a28d8185bc44448f`.

The CI upgrade fixture applied; all **140 migrations 010–149** applied; both inline assertions passed. SQL integration tests 1–7 of 46 passed. Test 8/46, `account-deletion-storage-manifest.integration.sql`, failed while executing `erase_account_deletion_content(uuid,uuid)`:

`DELETE FROM public.projects WHERE user_id = v_user_id` violated FK `boards_project_id_fkey`; a matching board row still referenced the project. Tests 9–46 did not run.

Cleanup was confirmed: runner terminated sessions (0 remaining), executed `DROP DATABASE`, and printed `Removed disposable database pinposy_sqlint_a28d8185bc44448f`. No production/PIN_TRIAL database or persistent verification cluster was removed or modified. Overall SQL integration remains **NOT PASSED**.

## Source investigation and root cause

Assistant fetched current source from GitHub:

- `db/migrations/137_account_deletion_content_erasure_stage.sql`, blob `dab57a684b6a105f7d0d40b0796e61b498c0365b`;
- `db/migrations/001_baseline.sql`, blob `105a13cfba4746206191dcf2bd68d5514912f08c`;
- `backend/test/postgres-integration-upgrade-fixture.sql`, pre-fix blob `e57795b598e16939952f180ac36bc942336d0444`;
- `.github/workflows/atomic-payment-integration.yml`, pre-fix blob `959399fc34989298ac060bd42a605312d7c86073`;
- `backend/test/account-deletion-storage-manifest.integration.sql`, blob `ea271e77c8bf18986b996bee09ec99751abc73f0`;
- `backend/test/postgres-integration-runner-contract.test.js`, pre-fix blob `fe2a1ce4cfb0ca7e06ff0c2b4d087d40943db66a`.

Migration 137 removes account-owned operational content and then deletes the user's projects. It relies on the baseline foreign-key cascade chain to remove boards belonging to those projects and pins belonging to those boards. The canonical baseline defines:

- `boards.project_id REFERENCES public.projects(id) ON DELETE CASCADE`;
- `pins.board_id REFERENCES public.boards(id) ON DELETE CASCADE`.

The standalone upgrade fixture and the SQL embedded in the CI workflow omitted both `ON DELETE CASCADE` clauses. Thus the disposable upgrade schema did not reproduce the canonical baseline's dependency behavior. The observed FK error is a fixture/schema mismatch; it is not evidence that the production erasure function should manually bypass referential integrity or that the FK should be weakened.

The same owner run also exposed a contract assertion formatting bug: PostgreSQL fixture alignment uses multiple spaces between `cover_url` and `text`; the assertion assumed one. It must accept SQL whitespace with `\\s+`.

## Changes published

1. Corrected both upgrade fixture sources to preserve the canonical cascade relationships:
   - standalone fixture: added `ON DELETE CASCADE` to `boards.project_id` and `pins.board_id`; blob `bf9aad94a6b4381777586a97a88f3dc6eab373a6`, commit `b22ed9e255fe799fd3be91caf36b5c71f03a1387`;
   - CI workflow fixture: same two FK corrections; blob `ad8d456eed5829c7aba0c8b9bfea314516b3e9d4`, commit `0724225a5ad324ba2eb9107ddaf202745d8761a4`.

2. Added a Node contract test requiring the fixture's project-to-board and board-to-pin cascade behavior, so this mismatch is caught before the database suite:
   - blob `cb9af9c67b1b1bbbc2073279a9fc7e3d0aa2491d`, commit `07e5a4a87350ba80f49adb4f3ba8bc1fbbf9c4cc`.

3. Corrected the `cover_url` contract regex from a single literal space to `\\s+`:
   - final contract blob `4584ef39860d443284cdb3e10f4534ffcc18b761`, commit `2a350c1f63cd481834ac7f5f0db50fcb271a640e`.
   - The contract source has **18 top-level tests** by source inspection.

No production migration, FK, application code, grants, RLS policy, account-deletion safety guard or live database was changed.

## Assistant actions and verification limits

Assistant reviewed the owner's transcript; fetched and compared migration 137, canonical baseline, standalone fixture, CI workflow, failing SQL test, contract test and current documentation; traced the failing DELETE to the missing fixture cascade declarations; corrected both fixture definitions; added a contract test for both cascades; corrected the whitespace-sensitive `cover_url` regex; and is recording the owner run, diagnosis, exact source blobs, changes, verification limits and next steps in the project state, owner action log, this audit and documentation register.

Assistant used GitHub source reads/writes only. Assistant did not execute Node, PowerShell, psql or PostgreSQL. The owner's 16/17 result belongs to the pre-fix commit `758eba5efdceb4f76c99b9d0077301e7c3fe58d8`; the corrected **18-test** contract suite has not yet been executed. Fixture edits and SQL integration remain runtime-unverified.

## Next verification gate and safety

After all documentation commits are published, owner should:

1. Run `git status --short`; if clean, run `git pull --ff-only origin main`.
2. Verify `git rev-parse HEAD` equals `git rev-parse origin/main`.
3. Run `node --test backend/test/postgres-integration-runner-contract.test.js`.
4. Run the guarded SQL runner **only if all 18 Node contract tests pass**:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`.

Enter the temporary role password only at the hidden prompt. Do not stop listener PID 15220, delete `X:\PinPosy-verify-pg18`, touch production/PIN_TRIAL, weaken runner guards or expose credentials. SQL integration can be marked PASS only after fixture, all 140 migrations, both inline assertions, all 46 SQL tests and confirmed disposable database cleanup succeed.
