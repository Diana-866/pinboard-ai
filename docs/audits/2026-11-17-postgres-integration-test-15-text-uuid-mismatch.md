# PostgreSQL integration test 15/46 — text/UUID assertion mismatch

**Date:** 2026-11-17  
**Repository:** `Diana-866/pinboard-ai`  
**Branch:** `main`

## 1. Owner-provided runtime evidence

The owner synchronized a clean checkout from `3f554999` to documentation commit `d736814d78aa9cefbc9c6367104a98d236123c1b`; after pull, `HEAD` and `origin/main` matched and `git status --short` was empty.

The owner then ran:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

The runner independently confirmed clean synchronized `main`, listener PID `15220`, data directory `X:\PinPosy-verify-pg18`, and exact server identity:

```
127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006
```

The password was entered through the hidden prompt and is intentionally not recorded.

Observed successful stages:
- CI legacy/upgrade fixture applied.
- All 140 active migrations `010–149` applied.
- Both CI inline assertions passed.
- SQL integration tests `1/46` through `14/46` completed without a reported error.
- Test `15/46`, `legacy-regeneration-reservation-guard.integration.sql`, failed with PostgreSQL error `operator does not exist: text = uuid`.
- Tests `16/46` through `46/46` did not run because the runner stops at the first failure.
- Cleanup terminated zero remaining sessions, dropped only disposable database `pinposy_sqlint_99741a5f1e5a47e6`, and explicitly confirmed its removal.

Therefore PostgreSQL SQL integration is **NOT PASSED**. This run is not evidence that all 46 tests pass.

## 2. Source review and root cause

Before editing, the assistant fetched the current versions of:
- `backend/test/legacy-regeneration-reservation-guard.integration.sql` — blob `af9eaeff1a682ed5c234370192f840a2d60cbf89`;
- `backend/test/postgres-integration-upgrade-fixture.sql` — blob `0d1236b722193fb18e4bbd2d0bd258c018d4cd77`;
- `db/migrations/001_baseline.sql` — blob `105a13cfba4746206191dcf2bd68d5514912f08c`;
- `db/migrations/010_atomic_credit_ledger.sql` — blob `1c062fe5192e4a22b5b2efb639d470c077cb2125`;
- `db/migrations/066_pin_regeneration_credit_reservations.sql` — blob `fb75cf87a9cf8a6457d830a23b4887b2779d07da`;
- `db/migrations/075_guard_legacy_single_pin_regeneration_debit.sql` — blob `66aa3dbc882bbf3b2a028a0ed64d1676116138d4`;
- the current runner, project state, owner action log and documentation register.

The canonical baseline explicitly defines `public.credit_transactions.user_id` as `text`. Migration 010 preserves this contract and inserts the text parameter `p_user_id` into that column. Migration 075 likewise accepts `p_user_id text` and writes that value to `credit_transactions.user_id`.

The failing SQL test correctly declares `v_user uuid` because it is the primary key type in `public.users`. However, its two ledger-count assertions compared `credit_transactions.user_id` (TEXT) directly to `v_user` (UUID). PostgreSQL has no implicit `text = uuid` equality operator. This is a test assertion type mismatch, not evidence of a broken migration or production schema. Other predicates in this test already convert the UUID to text when interacting with text user-id columns.

## 3. Exact correction published

Only the SQL integration test was changed. Both ledger-count predicates now compare text to text:

```sql
select count(*) into v_ledger_count
from public.credit_transactions
where user_id=v_user::text;
```

The same correction is applied to the post-debit ledger-count assertion. No production application code, migration, canonical baseline, CI workflow, runner, fixture, or database was changed.

| Path | Previous blob | New blob | Commit |
|---|---|---|---|
| `backend/test/legacy-regeneration-reservation-guard.integration.sql` | `af9eaeff1a682ed5c234370192f840a2d60cbf89` | `198a1714ce805e77a39c6e8a4334122b6a5fe09f` | `9f2648d0ac18f1b3e40c59accb68e5274df6985a` |

## 4. Verification and limits

- Verified from the owner's transcript: the guarded runner reached test 15 after the fixture, 140 migrations, two inline assertions and tests 1–14.
- Verified from the owner's transcript: failure was `text = uuid`; disposable DB cleanup succeeded and database absence was confirmed.
- Verified by source inspection: canonical baseline, migrations 010/075 and the failing test establish the type contract and the two incorrect predicates.
- Verified by the GitHub write response: the targeted test-only correction was committed as `9f2648d0ac18f1b3e40c59accb68e5274df6985a`, blob `198a1714ce805e77a39c6e8a4334122b6a5fe09f`.
- Not yet verified: execution of the corrected test; SQL tests 16–46; a complete 46/46 run; any Bash concurrency suite.
- The earlier Node contract gate (20/20) and PowerShell Parser API gate (0 syntax errors) were owner-reported on their respective prior commits. This SQL-only edit does not change either JavaScript contract source or PowerShell runner source.
- The assistant did not execute PowerShell, psql or PostgreSQL and did not access the owner's Windows machine. Runtime evidence above is from the owner-provided transcript.

## 5. Safety and next step

Do not reuse or connect to production/PIN_TRIAL. Do not stop PID 15220 or modify/delete `X:\PinPosy-verify-pg18`. The disposable database from this failed run is already confirmed removed.

The owner must first pull the new documentation and test commit on a clean `main`, verify `HEAD = origin/main`, then rerun the unchanged guarded runner. Stop and report the first failure with full output and cleanup result. SQL integration becomes PASS only after all 46 tests, fixture, 140 migrations, both inline assertions, and confirmed disposable database cleanup succeed.
