# AUD-371 — migration chain integrity and clean-install safety

**Date:** 2026-11-11  
**Status:** repository-level audit complete; no live database queried

## Canonical chain found

The active migration directory contains 123 numbered SQL files, but not all are part of the clean-install chain. The documented clean install is:

1. Optional read-only diagnostic `000_check_schema.sql`.
2. `001_baseline.sql` — creates the complete baseline schema, including objects historically introduced by 002–008.
3. `010_*.sql` through `123_*.sql`, in numeric order.
4. `009_hardening.sql` is archived and excluded because it converts TEXT user IDs to UUID and may delete incompatible historical rows.

## Defect / operator hazard

Historical files `002_auth_tokens.sql` through `008_pinterest_accounts.sql` remained in the active `db/migrations/` directory even though the baseline already creates their current objects and `docs/database.md` explicitly excludes them. This is hazardous for manual SQL Editor workflows: a user may mistake the files for the canonical sequence. In particular, 008 recreates the old unique index on `pinterest_accounts(user_id)`, which conflicts with the later multi-account design from migrations 031–033.

## Changes made

- Added an explicit legacy/not-for-canonical-install warning to each of 002–008. Files remain present for historical reference; they were not deleted or moved.
- Corrected `docs/database.md`: removed the blanket claim that every SQL file is safe to rerun and clarified the canonical-only rule.
- Corrected the diagnostic comment in `000_check_schema.sql` to reflect that 001_baseline creates all base tables.
- Added `backend/test/db-migration-chain.test.js` to enforce the legacy markers, baseline presence, absence of active 009 and exactly one numbered migration for each 010–123.
- Updated HANDOFF.

## Remaining validation / limitations

- This is a static repository audit. No production Supabase connection, migration ledger, schema dump, catalog, function signatures, or applied migration state was queried.
- File numbering and presence do not prove that the SQL chain executes cleanly on a blank PostgreSQL instance. A clean-room bootstrap against a disposable PostgreSQL/Supabase project is still required.
- SQL migrations 010–123 were not executed. No test, lint, build, CI, deploy, production data, credits, Storage objects, or payment/Pinterest side effects were touched.
