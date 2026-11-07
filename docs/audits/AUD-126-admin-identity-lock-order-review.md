# AUD-126 — Admin identity and lock-order review

## Scope

Review all currently tracked backend and migration paths that can mutate or delete `public.users` rows, especially `users.is_admin`, and determine whether the operator-first lock order proposed in AUD-125 conflicts with existing financial workflows.

This is a source review only. No SQL migration was created or applied, no database was queried, and no tests or deployment were run.

## Findings

### 1. No application path currently changes administrator status

- `backend/admin.js` implements `requireAdmin` by selecting `is_admin` for `req.userId`. It does not update the flag.
- The admin route inventory in `backend/index.js` uses `requireAuth` and `requireAdmin`; the financial-operations endpoint is read-only.
- `PATCH /me` constructs an explicit allowlist containing only `name`, `surname`, and `preferred_language`. It cannot write `is_admin`.
- `PATCH /me/onboarding` writes only `onboarded` on the user row.
- `PATCH /me/tariff` writes only `tariff_plan`; in production the route checks admin status before allowing this tariff change.
- Registration inserts a new user with the database default `is_admin = false`. No client-controlled admin field is accepted.
- Reviewed auth, billing, credits, email verification, and password-reset modules contain user reads/inserts or narrowly scoped profile/financial updates, but no administrator flag update or user deletion route.

Conclusion: no in-repository application route currently promotes/demotes administrators or deletes user accounts. Administrator provisioning/demotion and account deletion, if performed, are currently out-of-band database/operator actions.

### 2. Existing user-row lock order

- Migration 074 documents and implements the financial lock convention: lock the target `users` row before active credit reservation rows.
- Migration 077 finalizers use target user → request → generation tasks → reservation.
- Migration 046 establishes generation parent request → task ordering for generation lifecycle operations.
- Migration 073 reconciliation functions lock request/task state and do not acquire an operator row lock.
- Existing financial functions do not acquire an operator identity row after locking the target user.

The operator journal wrapper can therefore add an operator identity lock as a prefix, then preserve the existing financial suffix:

`operator users row → target users row → request row → task rows in ascending task_index → active reservation row`.

When the operator and target are the same user, PostgreSQL's transaction-level row lock is re-entrant for the same transaction; the wrapper should avoid needless duplicate lookup/lock work where practical.

### 3. Authorization linearization

The wrapper should lock the operator's `users` row with `FOR UPDATE` and verify `is_admin = true` while holding that lock.

This creates a clear serialization point with an out-of-band demotion:
- If demotion commits first, the RPC sees `is_admin = false` and rejects.
- If the RPC obtains the operator row lock first, a concurrent demotion waits; the authorized action commits or rolls back before the demotion proceeds.

This is preferable to an unlocked authorization read, which could race with a demotion and allow a transaction to continue after its admin status was revoked.

The RPC must perform this check before returning an idempotent replay receipt. Replays do not bypass current authorization.

### 4. Account deletion and foreign-key cascades

Migration 001 defines `projects.user_id → users.id ON DELETE CASCADE`; migration 009 adds or normalizes user foreign keys for related user-owned data. The reviewed repository contains no user-deletion HTTP route or explicit `DELETE FROM public.users` workflow.

Out-of-band deletion is still possible and must be included in disposable-PostgreSQL concurrency tests. The operator journal's `operator_user_id REFERENCES users(id) ON DELETE RESTRICT` intentionally prevents deleting an operator while retained audit records reference them. This is an audit-retention choice and should be documented for operators before rollout.

Do not introduce `ON DELETE CASCADE` on `operator_user_id`: deleting an administrator must not erase the accountability record.

## Approved lock-order design for migration 078

Subject to the concurrency tests below, use:

1. Lock operator `users` row and verify `is_admin = true`.
2. Resolve target owner from the request row using a non-locking lookup only to discover the target user ID; do not trust any browser-supplied owner.
3. Lock target `users` row.
4. Lock target request row and revalidate that its owner still matches the discovered owner.
5. Lock generation tasks in ascending `task_index` where applicable.
6. Lock the active reservation row.
7. Invoke the existing reconciliation/finalization RPC within the same transaction.
8. Insert the immutable operator journal record before transaction commit.

The preliminary request lookup in step 2 is not an authorization or eligibility decision. All facts must be revalidated after the target user and request locks are held. If the owner changed (it should be immutable in the current schema), abort and retry safely rather than continuing.

Do not add a reverse-order path that locks target user/request and then attempts to lock operator identity. Any future admin-management or account-deletion endpoint must be reviewed against this convention before merge.

## Required concurrency tests

1. Admin demotion commits before an action obtains the operator lock: action is rejected.
2. Action obtains operator lock before concurrent demotion: demotion waits; action and journal either both commit or both roll back.
3. Two actions by different operators target the same request/task: target user/request/task locks serialize them; only one logical action succeeds.
4. User deletion races with a target action: the outcome is serialized or rejected by FK/row-lock behavior; no orphan journal or partial financial mutation.
5. Operator deletion races with an action: the journal FK restriction and operator lock prevent loss of the operator identity record.
6. Operator equals target user: no deadlock or duplicate journal effect.
7. Replayed action after operator demotion: denied before replay receipt is returned.
8. Verify all existing financial paths continue to use target user → request/task → reservation, with no later operator-row acquisition.

## AUD-125 correction / clarification

AUD-125's proposed operator-first prefix is now supported by the repository review. The unresolved implementation gate is narrowed: no in-repository admin-demotion path currently creates the reverse lock order. The remaining external risk is out-of-band SQL/admin tooling and future code changes. Migration 078 must include concurrency tests and the lock-order rule in comments.

## Verification status

- Reviewed `backend/admin.js`, relevant admin routes in `backend/index.js`, `backend/auth.js`, billing/credits, email verification and password reset paths.
- Reviewed migrations 001, 009, 046, 054, 066, 073, 074, and 077 for user-row and financial lock conventions.
- No tracked application path found that updates `users.is_admin` or deletes `users`.
- No SQL migration created or applied.
- No database, staging environment, provider API, tests, build, lint, CI, or deployment accessed/executed.
