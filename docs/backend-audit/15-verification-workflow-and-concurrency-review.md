# Verification workflow and concurrency harness review

**Date:** 2026-11-16  
**Branch:** `main`  
**Source HEAD:** `5f289d1cbf214db4dd85f0f5b2be1d1175ef0712`

## Scope

Reviewed all five workflow files under `.github/workflows/`, the three top-level verification scripts, backend package scripts, and all nine Bash concurrency scripts. This is a static configuration/safety review. No local PostgreSQL, Bash, Node test suite, frontend build, or production service was executed from this review.

## Workflow map

| Workflow | Trigger coverage | Main job content | Notes |
|---|---|---|---|
| `atomic-payment-integration.yml` | push/PR to main and legacy fix branch; manual; docs/README ignored | Node 22, backend install/tests, PowerShell parser, disposable PostgreSQL fixture, migrations 010–148, inline assertions, 46 SQL tests | Broadest SQL/backend CI; GitHub runner pre-step failures currently prevent steps from running. |
| `persisted-boards-checks.yml` | push to main/selected feature/fix/chore patterns; PR branch list narrower; manual | frontend lint/test/build and backend syntax/tests/e2e | PR branch filter does not mirror push branch patterns; direct push main is covered. |
| `pinterest-scheduler-cron.yml` | PR to main with scheduler path filters; manual | scheduler response/cron/worker/route tests | No push trigger on main; direct pushes to main skip this workflow. |
| `prodamus-checkout-tests.yml` | push/PR main with billing-related path filters; manual | webhook validation and checkout settlement tests | Main push is covered. |
| `prodamus-webhook-tests.yml` | push to two legacy fix branches; PR to main and one legacy fix branch | full backend test suite | Push to main is not configured; overlaps checkout workflow in part. |

### Supply-chain pinning

- The primary atomic-payment and persisted-boards workflows already pinned checkout/setup-node actions to immutable commit SHAs.
- Scheduler and Prodamus checkout workflows used floating `@v4` tags. Those two workflows are now pinned to the same immutable v4 SHAs already used by the primary workflow.
- Prodamus webhook workflow already used pinned SHAs.
- No third-party action beyond checkout/setup-node was introduced by these changes.

### Trigger/coverage items retained for follow-up

- Scheduler checks run for PRs and manual dispatch, but not for direct pushes to main. This is a deliberate review item; do not silently change branch protection or assume all changes arrive through PRs.
- Prodamus webhook workflow push branches omit main, while PRs to main are covered; checkout workflow separately runs on main for its narrower path set.
- Persisted-boards PR branch patterns are narrower than its push patterns. Review whether feature/fix/chore PRs should be aligned.
- These trigger differences are not test PASS/FAIL results and have not been changed in this pass.

## Verification scripts and package scripts

- `backend/package.json`: `npm test` runs Node's built-in test runner; separate worker and cron entry points are defined. There is no package-level lint/typecheck script in this manifest.
- `scripts/verify.sh`: backend and frontend check orchestration plus optional migration replay. Migration replay forces local Unix socket `/var/run/postgresql`, ignores remote `PGHOST`, checks the exact contiguous 010–148 chain, and cleans its own generated database in an EXIT trap.
- `scripts/verify.ps1`: Windows verification orchestration and migration-only path; creates a unique disposable DB and has cleanup in `finally`. The generic migration path accepts a caller-supplied local port and must not be pointed at production.
- `scripts/verify-integration.ps1`: separately hardened Windows upgrade-fixture SQL runner; fixed loopback port 55439, fixed PostgreSQL 18.6 data directory/client/role, unique `pinposy_sqlint_*` database, ordered fixture/migrations/assertions/46 SQL tests and cleanup verification. It explicitly does not run Bash concurrency scripts.

## Critical Bash concurrency harness finding and fix

All nine scripts previously defaulted to `PGHOST=localhost`, `PGPORT=5432`, `PGUSER=postgres`, and `PGDATABASE=pinposy_test`. They create fixture rows and their EXIT cleanup deletes rows. A casual invocation could therefore mutate a shared database. Several also wrote to fixed `/tmp` filenames; two removed wildcard-matched files, and simultaneous runs could collide.

Fixed in commit `1b985b4fbf17299e4a35a68a2f320a37c951bb8e`:

- Added `backend/test/lib/assert-disposable-postgres.sh`, sourced by all nine scripts.
- Requires explicit `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, and `PINPOSY_ALLOW_DISPOSABLE_DB_TESTS=1`; no implicit database defaults remain.
- Allows only loopback hosts, requires a database name matching `pinposy_verify_<suffix>`, and verifies the connected `current_database()` and server `inet_server_addr()` before fixture writes.
- Replaces fixed shared log paths with a unique per-run temporary directory.
- Cleanup stops and waits for background child jobs before deleting fixtures and the temporary directory.

Added in commit `5f289d1cbf214db4dd85f0f5b2be1d1175ef0712`:

- `backend/test/postgres-concurrency-safety-contract.test.js` verifies the shared guard is included in all nine scripts and that the unsafe defaults/shared paths do not return.
- `atomic-payment-integration.yml` now includes a `bash -n` check for the shared helper and all nine scripts, followed by the Node contract test.

The post-commit structural check fetched all nine files and confirmed helper inclusion, explicit cleanup hooks, and absence of old defaults/shared paths. This was not an execution of Bash parser or Node test.

## Current CI/deploy evidence

- GitHub Actions run `43953074211` for source HEAD `5f289d1...` ended before any step: `runner_id=0`, `steps=[]`. Thus the new parser and contract checks were not run.
- Vercel commit status reported `Deployment rate limited — retry in 24 hours`; no build result is available.
- These statuses are infrastructure blockers, not evidence of a source test failure or success.

## Remaining work

1. Complete assertion-level review of the broader test/config inventory and reconcile workflow coverage.
2. Resolve owner UA-004: execute the isolated PostgreSQL 18.6 SQL integration runner and provide its output.
3. After UA-004 PASS, prepare a separate disposable database setup for the nine Bash concurrency scripts. Do not run them against `pinposy_test`, production, PIN_TRIAL, or any shared database.
4. Execute backend and frontend suites only in the sequence specified by `docs/PROJECT_STATE.md`.
