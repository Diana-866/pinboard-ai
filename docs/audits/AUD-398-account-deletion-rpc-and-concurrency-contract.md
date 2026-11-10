# AUD-398 — Account-deletion RPC and transaction contract

**Date:** 2026-11-11  
**Status:** design only; no migration, RPC, backend route or production operation created.

## Scope and source review

Reviewed:
- `backend/index.js`: `requireAuth` currently reads only `token_version`; it does not read account lifecycle state.
- `backend/auth.js`: login fetches a user and signs a JWT after password/email checks; registration inserts a user; neither currently has a lifecycle-state predicate.
- `backend/sessionToken.js`: JWT contains `userId` and `tokenVersion`, HS256, seven-day expiry.
- migrations 020–025: password-reset and email-verification issue/consume RPCs use SECURITY DEFINER, service_role execute grants, and user-before-token row locking.
- migration 055: token_version is non-null, default 0, non-negative.
- AUD-397 schema proposal: request/event/job/manifest tables and lifecycle columns.

The baseline `auth_tokens.user_id` is TEXT; `users.id` is UUID. The reset/verification functions already compare canonical text forms. Do not convert this column as part of deletion.

## Critical finding

The existing token-version mechanism is necessary but insufficient. A request accepted after a middleware read can race a concurrent write, and backend login/registration/recovery paths do not currently enforce a lifecycle state. Therefore:
- middleware is an early reject, not the final authorization boundary;
- every mutating SECURITY DEFINER RPC must lock the user first and require `account_status = 'active'` (or a narrowly specified worker state);
- external side effects must be fenced immediately before dispatch and reconciled separately after dispatch.

## RPC contracts (proposed signatures; not executable SQL)

### 1. `accept_account_deletion(p_user_id uuid, p_expected_token_version integer, p_confirmation_method text)`

**Caller:** authenticated backend route only, execute granted to service_role.  
**Precondition in backend:** derive user ID exclusively from verified JWT; require a fresh password re-authentication for normal user deletion; never accept user_id from request body; apply rate limit; never log password or bearer token.  
**Transaction:**
1. Lock `users` row `FOR UPDATE` (first lock in global order).
2. Require row exists, `account_status='active'`, and current `token_version = p_expected_token_version`. The version check closes the gap between password verification and transaction acceptance if a password reset raced.
3. Validate confirmation method against a strict allowlist. A boolean from the browser is not proof of re-authentication.
4. Increment `token_version` and `lifecycle_version`; set `account_status='deletion_pending'` and `deletion_requested_at=clock_timestamp()`.
5. Invalidate all unused password-reset and email-verification tokens for canonical `users.id::text`.
6. Insert one request row and its initial event plus a fixed, versioned set of phase-0 jobs. All writes commit atomically.
7. Return only request ID, state, accepted timestamp and lifecycle version. Do not return account PII or credentials.

**Idempotency:** user row lock serializes duplicate requests. If a request already exists, return its existing receipt without incrementing either version again. A terminal tombstone does not create a second request.

**Failure:** any insert/constraint error rolls back the lifecycle fence and all associated workflow rows. Never partially lock an account without a durable request.

### 2. `claim_account_deletion_job(p_worker_id text, p_lease_seconds integer)`

**Caller:** worker service_role only. Worker ID is bounded diagnostic metadata, not authorization. Clamp lease duration server-side (suggest 30–300 seconds); never trust arbitrary caller duration.

**Transaction and lock order:**
1. Find candidate request IDs as an advisory scan only.
2. For one candidate at a time, lock `users` row first using `FOR UPDATE SKIP LOCKED`.
3. Lock the request row, then eligible job row with `FOR UPDATE SKIP LOCKED`.
4. Require account state is `reconciling` or `cleanup_pending`; job lifecycle_version equals request and current user lifecycle_version.
5. Require every dependency key to exist in the fixed server-side phase registry and to be `succeeded` or explicitly `skipped` by a permitted rule. Unknown dependency keys fail closed.
6. Set `status='running'`, a fresh random claim_token, lease expiry, increment attempts, and set started_at if first claim.
7. Return only the minimum task payload needed by the worker.

Never lock request/job before user. Never keep a DB transaction open during network calls.

### 3. `finish_account_deletion_job(p_job_id uuid, p_claim_token uuid, p_lifecycle_version bigint, p_outcome text, p_safe_error_code text)`

**Caller:** worker service_role only.

1. Resolve the job/request identity without taking locks (read-only lookup).
2. Lock user → request → job in that order.
3. Require current claim token, running status, lease still valid, and lifecycle version match.
4. Accept only a closed outcome allowlist: succeeded, retry_wait, blocked, skipped.
5. Clear claim token and lease on every non-running transition.
6. Append an idempotent event and update the request/account phase only when all required jobs in that phase are terminal and successful under the phase policy.
7. Retry is allowed only for a proven safe/retryable outcome. Unknown external outcome becomes blocked/manual reconciliation, never blind retry.

A stale worker cannot overwrite a newer claim. If a remote side effect succeeded after its lease expired, its provider receipt must still be recorded through a separate reconciliation path; rejecting stale job completion must not discard the external fact.

### 4. `record_account_deletion_external_receipt(...)` (separate contract required)

Existing Prodamus, Pinterest and generation journals are the source of truth for external outcomes. Do not invent a generic "provider succeeded" bit in the deletion job. Add provider-specific reconciliation adapters that:
- persist immutable receipt/remote identifiers in the existing domain journal;
- record the account lifecycle version and local operation identity;
- withhold new entitlements/publication activation for non-active accounts;
- preserve late payment, publication and generation facts even when the original worker claim is stale;
- never repeat an ambiguous external POST or payment action.

This may require a dedicated append-only external-receipt table only after the existing journals have been mapped; no such table is added in AUD-398.

### 5. `append_account_deletion_event(...)`

Not exposed as a general-purpose free-form RPC. Event insertion occurs inside acceptance, claim/finish and operator-review transactions. `event_key` is deterministic per operation; event rows are append-only. No prompt, email, access token, password hash, payment payload or arbitrary provider response may be stored in event reason_code.

## Required global lock order

`users → account_deletion_requests → account_deletion_jobs / account_deletion_manifest → domain rows → auth_tokens`

This order is the target for deletion RPCs, but legacy flows must be reconciled before rollout:
- password reset / email verification currently perform a non-locking token lookup, then lock user, then token. Keep user-before-token; add lifecycle predicate after user lock.
- Prodamus currently has purchase/subscription-first lock paths (AUD-392); must be refactored to user-first or use a receipt-only path that does not wait on the user while holding payment locks.
- Pinterest OAuth currently locks OAuth state before user (AUD-394); refactor to user-first commit or avoid nested lock inversion.
- GPTunnel completion has request-before-user paths (AUD-393); refactor to user-first.
- worker claim/complete paths must follow the same order.

Do not claim a global lock order is achieved until each named path and every nested RPC has been verified.

## Required lifecycle gates

| Entry point | Gate |
|---|---|
| `requireAuth` | Read token_version + account_status; reject non-active |
| login | After password compare, require active before JWT issue; generic response for non-active account |
| registration | Default active; unique email collision with tombstone handled by explicit email-reuse policy |
| reset-token issue/consume | Lock user, require active; consume after deletion acceptance returns false |
| email-verification issue/consume | Lock user, require active; no new token after fence |
| all user mutation RPCs | Lock user first and require active in same transaction |
| worker RPCs | Explicit lifecycle state + matching lifecycle_version + claim token |
| Prodamus webhook | Always preserve validated provider receipt; grant no entitlement to non-active user |
| Pinterest OAuth callback | Do not commit credentials if owner is non-active; preserve/record provider result safely |
| Pinterest scheduler | No new reservation/dispatch for non-active owner; ambiguous in-flight outcome reconciled |
| GPTunnel generation | No new reservation; preserve provider outcome and uncertain credit reservation |

## Security-definer and grants

- Keep `SECURITY DEFINER`, fixed `search_path = pg_catalog, public`, and fully qualified object names, matching existing migration conventions.
- Function owner must be a trusted migration owner; verify in staging. Do not make service_role the function owner.
- Revoke execute from PUBLIC, anon and authenticated; grant only exact signatures to service_role.
- RLS alone is not a service_role boundary because service_role can bypass RLS. Revoke direct table and sequence grants; access through RPC only.
- Avoid dynamic SQL, caller-supplied table/column names, caller-supplied phase lists or caller-supplied dependency expressions.
- Check UUIDs, text lengths, integer bounds and allowlists before writes.
- Do not expose a generic operator override that can reactivate accounts or mark arbitrary manifest rows complete.

## Gaps in AUD-397 DDL to resolve before implementation

1. `depends_on text[]` is not a foreign key and cannot enforce graph integrity. Use a fixed, versioned server-side dependency registry and verify every key, or add a normalized dependency table in a separately reviewed schema revision.
2. Manifest `claim_token` currently has no paired lease field/check. Add lease semantics before implementing manifest workers.
3. Event table has no database-level UPDATE/DELETE prohibition. Add immutable trigger and grants/ownership proof; grants alone do not protect against owner-level accidental edits.
4. `account_deletion_jobs` lease check should require claim_token and lease only while running and clear both for every terminal/retry state; current check enforces only the running half.
5. The proposed DDL revokes table rights from service_role, but verify default privileges and SECURITY DEFINER owner behavior on the actual Supabase project.
6. `CREATE TABLE IF NOT EXISTS` does not validate drift. A catalog preflight must compare exact columns, constraint definitions, indexes, RLS and grants before any apply.

## Test matrix before rollout

- Two simultaneous accept calls: exactly one request, one lifecycle increment, one initial event/job set.
- Accept vs password reset / verification consume / issuance: no deadlock; one serial order; no token survives accepted deletion.
- Re-auth vs concurrent password reset: expected token_version mismatch rejects acceptance.
- Accept vs profile, credits, checkout, generation, OAuth, schedule, publish reservation: operation either commits before acceptance or is rejected after it; never a partial race.
- Two workers claim same user: at most one live claim per step.
- Expired lease + new claim + late old completion: old completion rejected; external receipt still preserved through reconciliation.
- Duplicate finish call: idempotent; cannot turn success into failure.
- Dependency missing, unknown or cyclic: fail closed / blocked; no downstream cleanup.
- RPC grants: anon/authenticated denied; service_role only exact execute; direct DML denied; function owner verified.
- RLS enabled; no user-facing policy on workflow tables.
- Event update/delete rejected; sensitive fields absent from event payloads.
- Worker retry after provider timeout never blindly repeats payment or Pinterest publication.

## Decision

AUD-398 remains design-only. Implement lifecycle gates and RPCs only after schema drift preflight, dependency registry design, manifest lease correction and payment/Pinterest/GPTunnel lock-order remediation. No production migration or endpoint is authorized by this document.
