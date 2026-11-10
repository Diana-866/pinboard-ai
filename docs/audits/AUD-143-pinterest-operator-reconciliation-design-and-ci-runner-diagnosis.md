# AUD-143 — CI runner diagnosis and Pinterest operator-reconciliation design

Date: 2026-11-08  
Branch reviewed: `feat/persisted-boards-api`  
PR: #4 (Draft, open; base `fix/atomic-payment-fulfillment`)

## 1. CI failure investigation

Rechecked the latest PR-head commit `a76a04146a133c018809135e9d2de11cfef37fea` and its associated GitHub Actions runs:

| Workflow | Run | Job(s) | Result |
| --- | ---: | --- | --- |
| Persisted boards integration checks | 42438137302 | backend, frontend | failure |
| Atomic payment fulfillment integration | 42438137423 | postgres-atomicity | failure |
| Prodamus webhook tests | 42438137365 | backend-tests | failure |

The previous runs on commit `24154fdcd6fbfa3d18208eb07fededad4d5af8fe` also failed (runs 42438110067, 42438110020, 42438110059).

For both generations of runs:
- GitHub's job-step endpoint returned an empty step list.
- Downloading job logs returned HTTP 404 with storage error `BlobNotFound`.
- The workflow definitions are present and declare ordinary GitHub-hosted `ubuntu-latest` jobs. The persisted-boards workflow runs npm install, lint/test/build and backend checks; the atomicity workflow provisions PostgreSQL 16 and applies migrations 010–080; the Prodamus workflow runs backend npm tests.
- The source definitions alone do not identify why the jobs concluded `failure`. There is no evidence in the available job metadata that a test command ran, nor enough evidence to distinguish runner provisioning, GitHub Actions infrastructure, checkout, dependency installation, or a test failure.

**Conclusion:** CI remains red and unverified. Do not mark any of these test suites as passed or diagnose a code defect from the current metadata. The next useful diagnostic is a fresh manual workflow dispatch / rerun after GitHub log storage becomes available, followed by collecting the first failing step. No rerun was initiated during this audit.

Vercel's latest PR comment reports the Preview deployment as **Ready** (updated 2026-11-08 02:20 UTC). This is a successful Preview deployment signal only; it does not override or validate the failed GitHub Actions checks. The earlier Vercel free daily deployment quota failure is no longer the latest Preview status.

## 2. Existing admin authorization contract

- Express `requireAuth` verifies the JWT and checks the current `users.token_version` against the token, rejecting revoked sessions.
- `requireAdmin` reads `users.is_admin` for the authenticated `req.userId` and fails closed on lookup errors. It does not trust request-body role fields.
- Admin routes generally use `requireAuth` followed by `requireAdmin`; sensitive write routes also use `adminActionLimiter`.
- Migration 078 and the existing provider-refund operator workflow establish a stronger precedent: database-side admin recheck under a locked user row, append-only action journal, action UUID idempotency, logical uniqueness, evidence fields, and narrow SECURITY DEFINER RPCs.
- Do not substitute `ADMIN_EMAIL` or a browser-supplied `is_admin` value for the database role.

## 3. Pinterest publication state and concurrency contract

Reviewed migrations 016, 031, 033, 047, 056–060 and the current scheduler/reconciliation implementation.

- Publication attempts and publication rows are account-scoped after migration 033: the natural idempotency scope is `(pin_id, pinterest_account_id)`, not merely the PinPosy user or pin.
- `pinterest_publish_attempts` records the remote Pinterest pin ID and board ID, state, and retry safety. `pinterest_publications` is the durable confirmed-publication ledger.
- A schedule is tied to the same owner, pin, Pinterest account, and board. The schedule's `unknown` state is deliberately not retryable.
- The current confirmed-success RPC is `complete_pinterest_publish_v2`. Migrations 057–059 progressively enforce lock order: account row → every matching reconcilable schedule row (stable ID order) → publication-attempt row. It records the publication and marks only matching `publishing`/`unknown` schedules as published; cancelled/failed schedules are not revived.
- The RPC is a backend service-role operation. It is not an administrator-facing reconciliation endpoint and does not provide a durable human-operator evidence journal.
- A pre-existing publication row with a different Pinterest ID is a hard conflict. An operator tool must preserve that conflict rather than overwrite it.

## 4. Safe operator-reconciliation contract (design only; no route or migration added)

A future operator action may record a confirmed remote success only when an operator has independently verified the exact Pinterest pin ID and its association with the exact connected/disconnected account and board. The operator must not be able to assert “not published” based only on absence from a UI/search result; that must never clear `unknown` or authorize a retry.

Recommended narrow request:
- `schedule_id`
- `pinterest_pin_id` (remote ID, not a URL)
- `pinterest_board_id`
- allowlisted `evidence_type` and bounded opaque `evidence_reference`
- client-generated `action_id` UUID for exact replay

The server derives operator identity from `req.userId`; the SQL function derives owner, pin, account, board, and current states from database rows. No user ID, attempt ID, prior state, or operator ID is accepted from the client.

Required database transaction behavior:
1. Recheck administrator status while holding the operator user row lock. If the target user is distinct, lock both user rows in ascending UUID order, following migration 078's demotion-race/deadlock pattern.
2. Lock the exact Pinterest account, then all matching `publishing`/`unknown` schedule rows in stable ID order, then the exact account-scoped attempt row. Preserve the existing account → schedules → attempt ordering used by migrations 056–059.
3. Validate every owner/pin/account/board relationship and require the supplied remote ID to agree with any already-recorded attempt/publication. Reject any different remote ID or cross-account conflict.
4. Insert an append-only Pinterest operator-action receipt in the same transaction as the state transition. Store actor, schedule/pin/account IDs, remote pin/board IDs, evidence type/reference, before/after states, action UUID, and timestamp. Add both action-ID replay validation and logical uniqueness to prevent duplicate logical resolution under a fresh UUID.
5. Mark only matching `publishing`/`unknown` schedule rows and the matching attempt as confirmed published; write the publication ledger atomically. Never mutate unrelated schedules or another account's records.
6. Revoke direct table writes and block UPDATE/DELETE/TRUNCATE on the journal. Expose only one narrow service-role RPC; Express must require verified authentication, database-backed admin role, and a rate limit.

Open design checks before implementation:
- Confirm exact current schema and uniqueness constraints after all migrations, including whether historical NULL-account attempts/publications can coexist with account-scoped records.
- Decide how the operator obtains verifiable evidence and what references are acceptable without storing credentials, private data, or arbitrary URLs.
- Add disposable-PostgreSQL integration coverage for same-ID replay, changed-payload replay, conflicting remote IDs, wrong account/board/owner, demotion race, operator==target, cross-target deadlock, two operators resolving the same schedule, rollback when journal insertion fails, and proof that no API path can clear `unknown` to `scheduled`.
- Add API unit tests for caller identity, validation, rate limiting, and safe error mapping.
- Do not add any “mark not published” action in this workflow. A separate safe retry protocol would require authoritative evidence of a definitive remote rejection and must not be inferred from the absence of a found pin.

## 5. Actions and verification status

- No code or SQL migration was changed in this audit.
- No migration was applied to Supabase or another database.
- No Pinterest API call, publication, retry, cron execution, or deployment was performed.
- No local backend/frontend tests, lint, build, or PostgreSQL integration tests were run.
- GitHub Actions remain failed with inaccessible step/log details; Vercel Preview is Ready.
- PR #4 remains Draft and open; it was not merged and its base was not changed.
