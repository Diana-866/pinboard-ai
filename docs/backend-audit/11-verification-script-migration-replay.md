# Verification script and canonical migration replay audit

**Дата:** 2026-11-16  
**Проверенная ветка:** main  
**Объём:** scripts/verify.sh, scripts/verify.ps1, backend/frontend package scripts, migration directory layout, Supabase test stubs and migration replay contract.

## Подтверждённый дефект

Before the fix, `scripts/verify.sh --migrations` replayed every `db/migrations/*.sql` file lexicographically. That included:
- `000_check_schema.sql` — diagnostic-only file, not an install migration.
- `002–008` — historical pre-baseline migrations, not part of the canonical fresh-install chain.
- `001_baseline.sql` — the canonical baseline.
- `010–148` — current numbered incremental migration chain.
- `009_hardening.sql` is archived outside `db/migrations` and is not part of automatic replay.

The old wildcard therefore attempted to replay legacy schema changes after the baseline and could produce a false migration failure or an incorrect test schema.

## Исправление в main

- `scripts/verify.sh` now applies Supabase test stubs, then exactly `001_baseline.sql`, then only three-digit migrations with prefix >=010.
- It skips `000_check_schema.sql` and historical `002–009`; it does not scan `db/archive` or `db/preflight`.
- It uses `runuser -u postgres` or `sudo -u postgres` when invoked as root/non-postgres user, instead of accidentally connecting as a non-existent PostgreSQL role matching the OS user.
- The scratch database name retains the unique process ID (`pinposy_verify_$$)).
- Removed an unsupported statement that GitHub Actions was blocked specifically by a billing/spending limit. The only verified fact is that jobs fail before their first step.
- Added `backend/test/verify-script-migration-chain.test.js` to guard canonical baseline selection, skipping historical migrations, no archive replay, and unique scratch DB naming.
- Added this regression test to `.github/workflows/atomic-payment-integration.yml`.

## Проверенные package scripts

- Backend: `node --check index.js && npm test`.
- Frontend: `npm run lint && npm test && npm run build`.
- Local `verify.sh` runs backend and frontend checks; `--migrations` additionally replays the canonical migration chain on a uniquely named scratch PostgreSQL database.
- `verify.ps1` runs backend/frontend checks on Windows; it does not run the optional local PostgreSQL migration replay.

## Проверка исполнения

- GitHub Actions run `43900146921` (postgres-atomicity) failed before job steps; `steps: null`.
- The paired backend/frontend run also failed before steps. No Node tests, frontend build or PostgreSQL migration replay ran in CI.
- Local `scripts/verify.sh --migrations` was not executed in this session; no local PostgreSQL instance was available to this agent.
- No Supabase PIN_TRIAL or production database was modified.

## Следующий шаг

Run the corrected local verification on a machine with Node/npm and PostgreSQL, or restore GitHub Actions runner availability. Confirm a clean replay from `001_baseline.sql` through migration `148`, then run the full backend/frontend suites. Do not mark migration validation passed until actual output is recorded.


## Additional local static verification

A scratch copy of the current script and regression test was checked locally:
- `bash -n scripts/verify.sh`: PASS.
- `node --test backend/test/verify-script-migration-chain.test.js`: 4/4 PASS.
- This does **not** execute PostgreSQL. Full migration replay remains NOT RUN because `psql` is unavailable in the environment.
- Latest GitHub Actions runs `43900630253` (postgres-atomicity) and `43900630322` (backend/frontend) both failed with `steps: null`; no CI commands ran.
