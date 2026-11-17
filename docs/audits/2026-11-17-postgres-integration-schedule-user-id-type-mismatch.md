# PostgreSQL SQL integration — cancellation test compared text user_id with UUID

## Owner runtime evidence (2026-11-17)

Owner synchronized local `main` from `5d3548a5` to `5617a53095249ce45aafe4bdad17ad39781b668e`; `git rev-parse HEAD` and `git rev-parse origin/main` both returned that hash.

Owner ran:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

The Node contract suite passed **13/13** (0 failures). The guarded PostgreSQL runner verified the clean synchronized checkout, approved listener PID 15220 / data directory `X:\PinPosy-verify-pg18`, hidden password entry, and server identity:

`127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`

It created disposable database `pinposy_sqlint_004e2422a382484b`, applied the upgrade fixture, all **140 migrations 010–149**, and both CI inline SQL assertions. SQL tests 1/46 and 2/46 passed. Test 3/46, `pinterest-schedule-cancellation-race.integration.sql:93`, failed with PostgreSQL error `operator does not exist: text = uuid` in the predicate comparing `pin_schedules.user_id` to a UUID PL/pgSQL variable. Tests 4–46 did not run.

The runner terminated sessions, dropped the disposable database, and printed `Removed disposable database pinposy_sqlint_004e2422a382484b`. Cleanup is confirmed. SQL integration remains **NOT PASSED**.

The long migration output included numerous PostgreSQL NOTICE messages; they were non-fatal. Migration 018 completed successfully. The actual failure was the SQL type mismatch in test 3, not a migration failure.

## Source investigation

Assistant re-fetched the current files from GitHub `main` at `5617a53095249ce45aafe4bdad17ad39781b668e`:

- `db/migrations/015_persistent_pin_schedule.sql`, blob `f7c557cbcaa978d53e271a117f305527b499fddb`, declares `public.pin_schedules.user_id text not null`.
- `backend/test/pinterest-schedule-cancellation-race.integration.sql`, before fix blob `8d6f92fc6633d1530228ad0e6f1ddc63a81617b7`, declares `v_user_id uuid` and had two predicates comparing `user_id=v_user_id`.
- `db/migrations/001_baseline.sql`, blob `105a13cfba4746206191dcf2bd68d5514912f08c`, also documents that several account-related `user_id` columns are TEXT by design. This is an established schema contract, not a reason to alter the migration.

**Root cause:** the cancellation-race test inserted the UUID into a TEXT `user_id` column (the insert had completed), then used an invalid equality comparison between TEXT and UUID in two conditional updates. The test should compare text to text. No production schema or migration change is warranted.

## Source changes published

1. In `backend/test/pinterest-schedule-cancellation-race.integration.sql`, changed both conditional predicates from `user_id=v_user_id` to `user_id=v_user_id::text`. This preserves the test's intended conditional state transition and aligns the comparison with the declared column type. Commit `c0db3c5e5f4cc2ead97443693b78bdd79622be53`; blob `adb8b7669052021ce2537b5a2985786bab13a4d7`.
2. In `backend/test/postgres-integration-runner-contract.test.js`, added a contract test asserting that both predicates retain the explicit cast and that the uncast form is absent. Commit `de1d765e53e30e0617ec7994f1e22bdeaff4e025`; blob `ba228cbaef5ea83ff7d9c22221b3921f8087f4dd`.

## Assistant actions and verification limits

Assistant inspected the failing SQL, migration 015 and canonical baseline; identified the type mismatch; edited the two test predicates; added a source-contract regression test; and is recording the owner transcript and source rationale here and in the project journals/register.

Assistant used GitHub source read/update operations only. It did **not** run Node, PowerShell, psql, PostgreSQL, or the integration suite. The new contract test has not yet been executed. The source correction has not yet been runtime-verified.

## Safety and next step

Only the uniquely named disposable database from the owner's guarded run was touched; its removal was confirmed. Do not stop listener PID 15220, delete `X:\PinPosy-verify-pg18`, touch production/PIN_TRIAL, weaken runner guards, or expose credentials.

Owner must pull the documentation/source commits after they are all published, verify a clean checkout with equal `HEAD` and `origin/main`, run the Node contract suite, then rerun the guarded integration runner. A PASS requires all 46 SQL tests, both inline assertions, all migrations, and confirmed disposable database cleanup.
