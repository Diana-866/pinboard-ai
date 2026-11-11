# AUD-397 — schema review and staging checklist

**Proposal only. Never run the companion SQL against production.**

## Preflight

- [ ] Confirm deployed migration ledger and compare actual pg_catalog with canonical migrations 001 and 010–123.
- [ ] Confirm users.id is UUID and inspect current users columns/checks.
- [ ] Inspect existing tables with account_deletion_* names; stop on any collision or shape mismatch.
- [ ] Confirm Supabase roles, function owner, RLS and sequence privilege behavior.
- [ ] Inspect all FKs that can block eventual user cleanup; do not alter them in this phase.

## Disposable database

- [ ] Create a clean PostgreSQL 16 database with anon/authenticated/service_role stubs and auth.uid() stub.
- [ ] Apply canonical baseline and migrations in documented order, excluding archived migrations.
- [ ] Apply proposed DDL once, inspect constraints/indexes/policies/grants.
- [ ] Apply DDL a second time; confirm safe rerun.
- [ ] Deliberately create wrong same-name constraint/table shape and verify preflight rejects drift rather than assuming IF NOT EXISTS is sufficient.
- [ ] Verify FK RESTRICT prevents premature user hard-delete.
- [ ] Verify direct SELECT/INSERT/UPDATE/DELETE and sequence access denied to anon/authenticated/service_role.
- [ ] Verify the trusted function owner can operate through narrowly scoped SECURITY DEFINER functions once those are implemented.
- [ ] Verify identity/event append-only behavior and unique idempotency keys.
- [ ] Test job state/claim constraints, lease indexes and manifest version uniqueness.

## Before a numbered migration is created

- [ ] Complete atomic acceptance and worker RPC design.
- [ ] Complete manifest allowlist and owner-resolution SQL.
- [ ] Decide event and tombstone retention.
- [ ] Validate query plans and lock order with concurrent workers.
- [ ] Review SQL with schema diff against deployed database.
- [ ] Obtain explicit approval before any production SQL or endpoint exposure.

## Safety

This checklist does not authorize running SQL in Supabase, adding migrations to the live database, deploying endpoints or accepting real deletion requests.
