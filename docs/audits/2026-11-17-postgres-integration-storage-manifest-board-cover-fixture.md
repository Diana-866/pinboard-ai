# PostgreSQL SQL integration — upgrade fixture omitted boards.cover_url

## Owner runtime evidence (2026-11-17)

Owner synchronized the checkout at `546492915c1861b834098a1dace2e5c585e847d9`; `HEAD` and `origin/main` matched.

Owner ran:

```powershell
git status --short
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
node --test backend/test/postgres-integration-runner-contract.test.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Node contract suite: **16/16 PASS**, 0 failures.

The guarded runner verified clean synchronized main, approved temporary PostgreSQL listener PID 15220 and data directory `X:\PinPosy-verify-pg18`, hidden password entry, and server identity:

`127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`

Disposable database: `pinposy_sqlint_452f781659d544cd`.

The upgrade fixture applied; all **140 migrations 010–149** applied; both CI inline SQL assertions passed. SQL integration tests 1–7 of 46 passed. Test 8/46, `account-deletion-storage-manifest.integration.sql`, failed at line 380:

`column "cover_url" of relation "boards" does not exist`

The failing test inserts board rows with `cover_url` to verify that owned and foreign-user board cover images are correctly represented in the account-deletion Storage manifest. Tests 9–46 did not run.

Cleanup was confirmed: runner terminated sessions (0 remaining), executed `DROP DATABASE`, and printed `Removed disposable database pinposy_sqlint_452f781659d544cd`. No production/PIN_TRIAL database or persistent verification cluster was removed or modified. Overall SQL integration remains **NOT PASSED**.

## Source investigation and root cause

Assistant fetched and compared current `main` versions of:

- `db/migrations/001_baseline.sql`, blob `105a13cfba4746206191dcf2bd68d5514912f08c`;
- `backend/test/postgres-integration-upgrade-fixture.sql`, pre-fix blob `3cc57549972b13d2d83bd2ec58330eae1d8c527f`;
- `.github/workflows/atomic-payment-integration.yml`, pre-fix blob `b1e054a50fc7a8ad3c742a2fecc94a41e0d5bf9c`;
- `db/migrations/141_account_deletion_board_cover_manifest.sql`, blob `5726de6afb213dc1757d22bea19f7862efca7579`;
- `backend/test/account-deletion-storage-manifest.integration.sql`, blob `ea271e77c8bf18986b996bee09ec99751abc73f0`.

Canonical baseline `001_baseline.sql` defines `public.boards.cover_url text` (alongside id, project_id, title, description, status and created_at). Both upgrade-compatibility fixtures omitted `cover_url`: the standalone SQL fixture and the equivalent SQL embedded in the GitHub Actions workflow. This is why the integration-only disposable schema diverged from the canonical baseline.

Migration 141's Storage-manifest function reads `b.cover_url` when collecting board cover image paths. PostgreSQL accepted creation of the PL/pgSQL function during migration replay; the missing relation column surfaced when test 8 inserted into `boards` and the manifest function's SQL was exercised. The migration's intended board-cover handling is consistent with the canonical schema and test purpose; the defect is the incomplete test fixture, not a reason to remove board-cover coverage or alter production migrations.

## Changes published

1. Added `cover_url text` to the `public.boards` definition in both test fixture sources, matching the canonical baseline:
   - `.github/workflows/atomic-payment-integration.yml`: blob `959399fc34989298ac060bd42a605312d7c86073`, commit `5b91890019f8a2758686946fcf85ce9de9f2eb5e`.
   - `backend/test/postgres-integration-upgrade-fixture.sql`: blob `e57795b598e16939952f180ac36bc942336d0444`, commit `1783ba84a3d30454445c909459dfc559510128bb`.

2. Added a Node contract assertion that extracts the `boards` table definitions from the standalone fixture and canonical baseline and requires `cover_url text` in both. During source review, the first draft used over-escaped regexes; before asking the owner to run it, assistant replaced those expressions with literal `split` extraction and re-fetched the corrected source:
   - Final contract-test blob `d65c73d1ccc992e968e70030d79e32b05768a578`, final correction commit `40ec7a2aa9b5106b6c4a20a96d07eb6aa27e43b9`.
   - The contract test file has **17** top-level test declarations by source inspection. The updated suite has **not** been executed by assistant.

No production migration, application runtime, role, grant, RLS policy, FK, or Storage-deletion safeguard was changed.

## Assistant actions and verification limits

Assistant inspected the owner's transcript, fetched the current baseline, standalone fixture, CI workflow, failing SQL test and migration 141, compared the relevant table definitions and function use, then updated the two fixture definitions and added the contract assertion. Assistant caught and corrected the over-escaped assertion before requesting owner verification. Assistant then created this audit and updated the project state, owner action log and documentation register.

Assistant used GitHub source reads/writes only. Assistant did not run Node, PowerShell, psql or PostgreSQL. The 16/16 Node PASS belongs to the owner's pre-change commit `546492915c1861b834098a1dace2e5c585e847d9`; it does not verify the new 17-test suite or fixture changes.

## Next verification gate and safety

After all documentation updates are published, owner should:

1. Run `git status --short`; if clean, run `git pull --ff-only origin main`.
2. Verify `git rev-parse HEAD` equals `git rev-parse origin/main`.
3. Run `node --test backend/test/postgres-integration-runner-contract.test.js`.
4. Only if all **17** contract tests pass, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`.

Enter the temporary role password only at the hidden prompt. Do not stop listener PID 15220, delete `X:\PinPosy-verify-pg18`, touch production/PIN_TRIAL, weaken runner guards, or expose credentials. SQL integration can be marked PASS only after fixture, migrations, both inline assertions, all 46 SQL tests and confirmed disposable database cleanup succeed.

## Follow-up source review — contract extraction correction

Before owner verification, assistant re-fetched the newly added contract assertion and found that its first split delimiter encoded a literal backslash-n rather than the table terminator. The assertion was corrected to split at the literal SQL table terminator `);`, which safely isolates the boards definition without regex escaping. Final contract blob: `fe2a1ce4cfb0ca7e06ff0c2b4d087d40943db66a`, correction commit: `91d787eb945d2065a89a98e38ac51679f2461ed4`. The file still contains 17 top-level tests by source inspection; no test execution was performed by assistant.
