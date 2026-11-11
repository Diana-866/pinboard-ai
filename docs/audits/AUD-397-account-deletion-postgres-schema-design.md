# AUD-397 — PostgreSQL schema proposal for account deletion

**Date:** 2026-11-11  
**Status:** schema proposal; not a numbered migration and not approved for production.

## Design decision

Use four private workflow tables plus three additive lifecycle columns on `users`. Keep the user row as a tombstone and use `ON DELETE RESTRICT` for workflow references. Do not introduce hard-delete cascades. All operations will be mediated by narrow SECURITY DEFINER RPCs in a later implementation stage; no direct client or service-role table access is granted by the proposal.

## Proposed objects

| Object | Purpose | Important invariants |
|---|---|---|
| users.account_status | Global access/work fence | Default active; finite state allowlist |
| users.lifecycle_version | Fence stale workers and callbacks | Monotonically incremented, non-negative |
| users.deletion_requested_at | Operational timestamp | Nullable; set at acceptance |
| account_deletion_requests | One durable request per user | Unique user_id; FK RESTRICT; captures lifecycle version |
| account_deletion_events | Append-only transition receipts | Unique event key per request; no free-form PII payload |
| account_deletion_jobs | Retryable phase/step queue | Unique step per request; claim token/lease consistency |
| account_deletion_manifest | Versioned record/object disposition | Unique resource per manifest version; explicit retention |

### Why UUID for workflow ownership

Canonical baseline defines users.id as UUID. Workflow requests therefore reference UUID directly, unlike legacy domain tables whose user_id is TEXT. Do not silently convert legacy columns. Owner resolution for those tables belongs in a verified inventory query and manifest builder.

### State boundaries

Account state is separate from workflow request state and per-job status:
- Account: active → deletion_pending → reconciling → cleanup_pending → anonymized / retained_financial_only.
- Request: accepted → reconciling → cleanup_pending → completed / completed_with_retention, with blocked as an operational pause.
- Job: pending → running → succeeded / retry_wait / blocked / skipped.

A blocked job does not imply account reactivation. Request state can remain blocked while individual safe steps are inspected and resumed.

## SQL proposal

The companion file `docs/proposals/account-deletion-schema-aud-397.sql` contains additive DDL, checks, indexes and RLS/grant restrictions. It is explicitly **not** numbered as migration 124: the actual deployed schema, current migration ledger and feature rollout have not been verified. Do not paste it into the live Supabase SQL Editor.

## Critical implementation details still required

1. **Atomic acceptance RPC:** lock users first, validate recent re-auth/confirmation, increment token_version and lifecycle_version, update status, insert request/event/jobs in one transaction. Duplicate acceptance returns existing request receipt.
2. **Worker RPCs:** candidate scan advisory; claim locks user → request → job; finalization repeats lock order and verifies lifecycle_version + claim token. No DB locks across network calls.
3. **Manifest builder:** explicit allowlisted table/column mapping, not dynamic SQL from user input. TEXT user_id comparisons use exact canonical UUID text representation; malformed/ambiguous rows go to manual_review.
4. **Event immutability:** worker role cannot update/delete events; append-only event RPC. Retention/purge of tombstones is a separate approved policy.
5. **Manifest immutability:** freeze manifest_version before cleanup. Later discoveries create a new version; completed items remain immutable in their historical version.
6. **RLS and ownership:** no user SELECT policy; no client table grants. SECURITY DEFINER functions use fixed search_path, fully qualified names, explicit actor checks and narrow execute grants. Function owner must be a trusted migration role.
7. **PII minimization:** request stores no email, IP, prompts, tokens or provider payload. Resource keys are internal primary keys / trusted Storage paths only; redact from general logs.
8. **Retention:** retention_until is a policy output, not an arbitrary user-editable timestamp. Financial retention approval and provider backup expiry are prerequisites.
9. **Indexes:** due jobs and running leases are partial indexes; validate query plans and concurrent worker behavior on staging.
10. **Schema drift:** compare actual pg_catalog FK, policies, grants, functions and migration ledger before implementation. Baseline says TEXT user_id is intentional; archived 009 is not canonical.

## Review notes / open decisions

- One request per user for the lifetime of the tombstone is intentional; a unique user_id prevents accidental parallel workflows. If restoration is ever introduced, request identity must remain immutable and restoration must be a separate audited workflow.
- The SQL uses identity sequence for event IDs. Revoke sequence access too; only the owner-executed event RPC should append.
- The DDL uses `CREATE TABLE IF NOT EXISTS` for rerun tolerance, but this does not validate an existing table's shape. A preflight schema assertion is mandatory; IF NOT EXISTS is not a schema migration verifier.
- CHECK constraints added conditionally by name do not prove an existing same-named constraint has the expected expression. Compare pg_get_constraintdef during preflight.
- No SECURITY DEFINER functions are included yet. This intentionally avoids publishing an incomplete request/worker API.

## Verification required before migration

- [ ] Confirm production migration ledger and actual users columns.
- [ ] Confirm actual role names and ownership in Supabase; test function owner and RLS bypass semantics.
- [ ] Apply proposal to disposable PostgreSQL with Supabase-like roles.
- [ ] Test rerun and deliberate schema drift (wrong existing constraint/table shape must fail preflight).
- [ ] Verify no direct table/sequence privileges for anon, authenticated or service_role.
- [ ] Verify owner FK RESTRICT and all job/manifest unique/check constraints.
- [ ] Exercise concurrent acceptance and user-first lock order after RPCs exist.
- [ ] Run pgTAP or SQL assertions plus backend integration tests.
- [ ] Only then split into numbered additive migrations and stage rollout.

## Safety

No SQL was executed. No migration number was reserved, no live Supabase catalog was read, and no production data, policies, keys or settings were changed.
