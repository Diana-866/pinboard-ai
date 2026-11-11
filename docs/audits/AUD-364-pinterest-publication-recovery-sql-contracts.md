# AUD-364 — Pinterest publication recovery and scheduler SQL contracts

**Date:** 2026-11-11  
**Status:** source audit complete; disposable PostgreSQL regression script added

## Findings

Reviewed the latest definitions across migrations 033, 034, 049, 050, 056–060, 091–096, 112, 114–115, 119, and 122–123, plus the worker route and claim heartbeat helper.

- Claim acquisition uses `FOR UPDATE SKIP LOCKED`, generates a fresh UUID fencing token, and moves one due schedule to `publishing`.
- Scheduled publication reservation checks the exact schedule ID, owner, pin, account, board, status, and claim token before creating/continuing the durable attempt.
- Account reservation and disconnect serialize through account-first locking; completion and late-success reconciliation use account → all reconcilable schedules in stable order → attempt.
- The claim heartbeat refreshes `updated_at` every 60 seconds, prevents overlapping renewals, waits for an in-flight renewal on stop, and treats a definitive false result as lease loss. Transient RPC errors are logged but are not treated as proof that another worker owns the claim.
- A Pinterest remote success with missing local confirmation stores the remote pin ID in a non-retryable `unknown` attempt. Automatic recovery only marks a schedule published when owner, pin, account, board and remote ID agree across the attempt and publication ledger.
- Stale claim recovery requeues only when there is no publication attempt, or when the exact destination has a confirmed retry-safe failure. Ambiguous attempts remain `unknown`; they are not auto-retried.
- Failed manual retry checks exact attempt identity, immutable creative snapshot availability, absence of an existing publication, and absence of another active schedule.

## Additional regression test

Added `backend/test/pinterest-scheduler-completion-fencing.integration.sql`. On a disposable database after migrations 122–123, it verifies:
1. the first run can begin and complete;
2. a duplicate completion cannot replace terminal `succeeded` with `failed`;
3. an old run UUID cannot complete a newer run;
4. the current run can complete and remains the monitor's latest run.

## Operational boundaries

This SQL script was not executed. No staging or production database was accessed. No migration was applied. No Pinterest API, payment, email, deployment, or worker activation occurred. Node tests, lint, build and CI were not run.

## Follow-up

Before rollout, run this script and `backend/test/pinterest-schedule-claim-heartbeat.integration.sql` against a disposable PostgreSQL instance after applying the complete ordered migration chain. Then run the Node suite and a controlled staging publication with a dedicated Pinterest test account. Production activation still requires owner approval.
