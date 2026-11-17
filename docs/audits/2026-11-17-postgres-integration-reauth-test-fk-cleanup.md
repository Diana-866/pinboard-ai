# PostgreSQL SQL integration — re-authentication test cleanup violates durable queue foreign keys

## Owner runtime evidence (2026-11-17)

Owner synchronized local checkout to `8ebae45ed1dd141b8ca08a0104c8127041ea2a62`; `HEAD` and `origin/main` matched and `git status --short` was empty before pull.

Owner ran:

```powershell
node --test backend/test/postgres-integration-runner-contract.test.js
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

Node contract suite: **14/14 PASS**, 0 failures.

Guarded runner verified clean synchronized main, approved temporary listener PID 15220 / data directory `X:\PinPosy-verify-pg18`, hidden password entry, and exact server identity:

`127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`

Disposable database: `pinposy_sqlint_88f6d6f8b1654c23`.

The CI upgrade fixture, all **140 migrations 010–149**, and both inline CI SQL assertions passed. SQL tests 1–5 of 46 passed:
1. `pinterest-unknown-schedule-reconciliation.integration.sql`
2. `pinterest-stale-schedule-recovery.integration.sql`
3. `pinterest-schedule-cancellation-race.integration.sql`
4. `pinterest-schedule-claim-heartbeat.integration.sql`
5. `account-deletion-publication-fence.integration.sql`

Test 6/46, `account-deletion-reauth-version.integration.sql:65`, failed during its cleanup DELETE with PostgreSQL SQLSTATE 23503: deleting from `account_deletion_requests` violates RESTRICT foreign key `account_deletion_jobs_request_id_fkey`; the referenced job row remains. The SQL context identifies the statement `delete from public.account_deletion_requests where user_id in (v_ok,v_stale)`. Tests 7–46 did not run.

Cleanup was confirmed: runner terminated sessions (0 remaining), executed `DROP DATABASE`, and printed `Removed disposable database pinposy_sqlint_88f6d6f8b1654c23`. No production/PIN_TRIAL database or persistent verification cluster was removed or modified. Overall SQL integration remains **NOT PASSED**.

## Source investigation and root cause

Fetched current source from GitHub `main`:

- Failing test `backend/test/account-deletion-reauth-version.integration.sql`, pre-fix blob `e1da311e7e30c3db8887e3c3328652b65f017678`.
- Migration 130 `db/migrations/130_account_deletion_durable_queue.sql`, blob `1dcf7844444b4a70be1be49946d5a4c4265ce40f`.
- Migration 129 `db/migrations/129_account_deletion_reauth_version_fence.sql`, blob `546fc01858f695fdd9401cee198188140270fcda`.
- Existing durable queue integration test `backend/test/account-deletion-durable-queue.integration.sql`, blob `6e85b453df8395529043097db7ce5ea978d5b048`.

Migration 130 replaces `request_account_deletion(uuid,text,bigint)`. For a newly accepted request, the function inserts:
- one `account_deletion_requests` row;
- one `account_deletion_jobs` row referencing that request;
- one `account_deletion_events` row referencing that request.

Both `account_deletion_jobs.request_id` and `account_deletion_events.request_id` use foreign keys with `ON DELETE RESTRICT`. The events table is append-only: migration 130 installs a trigger that raises on UPDATE or DELETE. Therefore the old test's direct deletion of request rows is invalid, and deleting only the job first would still leave the immutable event reference. The old test also deletes users after deleting requests, which is unnecessary for an isolated disposable test.

The adjacent durable queue integration test already establishes the repository's intended isolation pattern: wrap the test body in `BEGIN; ... ROLLBACK;`. The re-authentication test should use the same transaction boundary so its test user, request, job and event are all rolled back together, without weakening production foreign keys or bypassing the append-only event guard.

## Changes published

1. Changed `backend/test/account-deletion-reauth-version.integration.sql`:
   - added a transaction wrapper before the DO block;
   - removed explicit DELETE cleanup against durable request/user records;
   - added `ROLLBACK;` after the DO block.
   This preserves the assertions and verifies behavior within one isolated transaction. New blob `90486cf3499f54f36a4bda50f88f326f52e5bf0a`, commit `61e508df37ed1a3ff6c0c6c57622dfa65b6c1b26`.

2. Added a Node source-contract test requiring the transaction wrapper and rollback and rejecting direct cleanup DELETEs against account deletion requests/jobs/events/users. Final contract blob `4681aa4ab8155a0c5c8b649e35bfdd3085fd8d2f`, latest correction commit `ace9c270f8ad789a0135cdbe4c0b1bceac768e4e` (initial draft blob `3801da4c55a12aa7668eb940f3ab1cbd753bab2c`, commit `2860d0df79c2eb0d7bef7a727171a45b79202402`; intermediate regex correction blob `cdd4f2ccdb5590e381964460f1180a4f7a747dd3`, commit `ec7f410a80f5ea4fec27781c3280b15aceac4618`).

## Assistant actions and verification limits

Assistant fetched and inspected the current failing test, migrations 129–131, the durable queue test, the Node contract suite, and current project journals. The root cause is directly supported by migration 130's function body, table foreign keys, immutable-event trigger, and the failing test's cleanup statements.

Assistant changed only the SQL integration test and its Node source-contract test. No production migration, application runtime, permissions, foreign keys, or append-only protections were changed. Assistant did not execute Node, PowerShell, psql, PostgreSQL, or the SQL integration suite; the two new source changes remain runtime-unverified. During source re-read, assistant caught over-escaped regexes in the first contract assertion draft; replaced them with literal string/index checks and re-fetched the final source. This correction is documented rather than treating the intermediate draft as final.

## Next step and safety

After all documentation updates are published, owner should:
1. run `git status --short`, then `git pull --ff-only origin main`;
2. verify `git rev-parse HEAD` equals `git rev-parse origin/main`;
3. run `node --test backend/test/postgres-integration-runner-contract.test.js`;
4. only if all contract tests pass, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`.

Password only at the hidden prompt. Do not stop listener PID 15220, delete `X:\PinPosy-verify-pg18`, touch production/PIN_TRIAL, weaken runner guards, or expose credentials. SQL integration can be marked PASS only after both inline assertions, all 46 SQL tests, and confirmed disposable database cleanup succeed.
