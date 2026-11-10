# AUD-369 — crash recovery and image-storage retention

**Date:** 2026-11-11  
**Status:** source audit complete; migration privilege defect corrected

## Confirmed recovery and storage safeguards

- Generation recovery serializes only safe fields and preserves idempotency tombstones after replay expiry.
- Provider tasks are journaled before storage rehosting. Recovery polls the durable provider task or reuses its recorded result rather than submitting a replacement.
- Storage upload finalization retries only the DB finalization RPC after an ambiguous response; it does not blindly repeat a remote upload. A path with ambiguous outcome stays fenced.
- Stale upload reconciliation is read-only. Object presence/absence does not prove that the original in-flight upload has terminated. Quarantine retires the path permanently instead of reusing it.
- Storage deletion requires a DB claim that rechecks durable references. Ambiguous delete outcomes remain fenced; explicit 404 is treated as the desired deleted state.
- Retention keeps idempotency tombstones, retires replay payload references transactionally, and only then releases unreferenced object paths to a separately claimed queue. Queue leases use fencing tokens; expired worker leases are blocked, not automatically reissued.
- Shutdown drains briefly and leaves unfinished durable work to DB claim recovery. Scheduler worker requests have bounded timeout below the documented stale-claim recovery window.

## Defect found and corrected

Migration `109_pin_image_retention_queue_worker.sql` revoked execute on the correct finalization function, but its final GRANT targeted the nonexistent name `finalize_pin_image_retention_queue` (missing `_item`). PostgreSQL would reject that GRANT, potentially aborting the migration transaction and leaving the retention worker unavailable. Corrected the GRANT to target `finalize_pin_image_retention_queue_item(text,text,uuid,boolean,text)`, matching the function definition and revoke statement. Added a source contract test to prevent regression.

## Operational gaps

- Retention and cleanup are exposed as separate admin-only operations; this audit did not find an automatically scheduled retention/cleanup runner. Stale upload cleanup and queue processing therefore depend on an operator or an external scheduler invoking the protected routes.
- Do not automate destructive retention until the applied production migration ledger is checked and a dry-run candidate inventory reviewed. Retention operations delete stored images only after tombstones, reference retirement and final DB deletion claims.
- Migration 109's presence in the repository does not establish whether it was applied successfully in production. Compare Supabase migration history and inspect function privileges before enabling the worker.
- No production Storage inventory or deletion was performed.

## Verification limits

Only source inspection and GitHub file read-back performed. Node tests, lint, build, CI, SQL integration scripts, live Supabase, Storage, generation providers and deployment were not run. No user content, credits, balances, secrets or production objects were changed.
