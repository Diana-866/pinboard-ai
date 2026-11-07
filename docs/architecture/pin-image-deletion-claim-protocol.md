# Storage object deletion-claim protocol — implementation and rollout notes

**Implementation status:** migration `070_pin_image_deletion_claim_protocol.sql` and the backend claim/finalize executor are committed on `feat/persisted-boards-api`. The migration uses database triggers on all three reference tables as the serialization gate, rather than requiring each current writer to call a separate registration RPC. It has not yet been applied to Supabase or exercised against a live PostgreSQL instance.

**Prepared:** 2026-11-07  
**Target branch:** `feat/persisted-boards-api`  
**Related audits:** AUD-082, AUD-083, AUD-084

## Goal and invariant

A managed Storage object may be deleted only if no committed durable reference exists and no concurrent transaction can commit a new reference until the Storage delete has completed or the deletion claim has been safely released.

The invariant must cover all three current reference families:
- `pins.image_url`
- `pin_schedules.snapshot_image_url`
- `pin_generation_tasks.storage_url`

A read-then-delete helper alone cannot enforce this invariant because Supabase Storage deletion is an external HTTP operation and cannot participate in a PostgreSQL transaction.

## Data model

Add `public.pin_image_object_lifecycle` with:
- `bucket_id text not null` (currently `pin-images`)
- `object_path text not null` (validated managed path, never arbitrary URL)
- `state text not null check (state in ('active','deleting','delete_failed','deleted'))`
- `claim_token uuid`
- `claim_expires_at timestamptz`
- `attempts integer not null default 0`
- `last_error_code text` (bounded, sanitized; no provider response body)
- `created_at/updated_at timestamptz`
- primary key `(bucket_id, object_path)`

Use a deterministic row as the serialization point for every managed object. Do not persist full public URLs or secrets. Existing objects can be registered lazily when they are first referenced or considered for cleanup.

## Database RPC and trigger contract

### 1. `register_pin_image_reference`

Called in the same transaction as a write that introduces a managed image reference. It must:
- validate the bucket/path shape against the service-managed allow-list;
- insert or lock the lifecycle row;
- reject if state is `deleting` or `deleted`;
- transition `delete_failed` back to `active` when a legitimate reference is being reintroduced;
- return success only when the caller can safely commit the referencing row.

Every reference writer must use it in the same DB transaction as the reference write. This includes upload replacement, schedule snapshot insertion, generation task storage URL persistence, and any reconciliation path that restores a URL.

### 2. `claim_pin_image_deletion`

Called before the external Storage API:
- lock the lifecycle row;
- reject if already claimed by a live claim token;
- query all three reference families using exact URL equality;
- reject if any reference exists, including terminal generation tasks if the stored URL remains a durable recovery/audit reference (policy must be explicit; initial safe default is to retain while any task row references it);
- set `state='deleting'`, random claim token and bounded expiry;
- return claim token only after transaction commits.

The claim expiry is for crash recovery, not permission to race. Migration 070 allows a later claim request to rotate an expired claim token and retry the idempotent Storage removal only after confirming that no durable references exist. A stale worker holding the old token cannot finalize the newer claim. If a durable reference is discovered under an expired claim, the row deliberately remains `deleting`; it is not reopened because the original Storage request may still be in flight. Such a row requires operator reconciliation rather than unsafe automatic release.

### 3. `finalize_pin_image_deletion`

Requires matching bucket/path/token:
- on confirmed Storage delete (including confirmed object-not-found), mark `deleted`, clear claim;
- on failure, mark `delete_failed`, clear claim, increment attempts, store sanitized error code;
- never mark deleted based only on timeout or unknown response.

### 4. `release_pin_image_deletion_claim`

Only for a request that can prove no delete request was sent. A timeout/connection reset after request dispatch is ambiguous and must use reconciliation, not release.

## Backend protocol

1. Convert public URL to a managed object path using the existing strict extractor.
2. Call claim RPC. If it reports referenced/claimed, return false without calling Storage.
3. Call Storage `remove([path])`.
4. On definite success or object-not-found, call finalize(success).
5. On definite Storage rejection, call finalize(failure).
6. On timeout/network ambiguity, retain `deleting` claim and let a reconciliation worker inspect Storage before reopening references.
7. Keep existing best-effort semantics at user-facing routes, but emit durable metrics/logs for `delete_failed` and stale claims.

## Writer coverage matrix

| Writer | Required change |
| --- | --- |
| `POST /pins/:id/image` | Upload object; register object before pin update; perform pin update through one SQL RPC/transaction that registers the new reference; old image cleanup uses claim RPC. |
| Generation task persistence | Register `storage_url` in same transaction as task success update. |
| `POST /pins/:id/schedule` | Replace direct insert with SQL RPC that registers snapshot reference and inserts schedule atomically. |
| Schedule retry/reconciliation | Any operation restoring snapshot URL must register reference before status transition. |
| Cancellation | Mark cancelled first; cleanup attempts claim; if other references remain it safely does nothing. |
| Future import/clone/share endpoints | Must call the same registration primitive. |

## Important implementation decisions

- Do not use a client-side sequence of `SELECT` then `INSERT` as a substitute for the RPC. The lifecycle row must serialize competing writers and deleters.
- Do not rely solely on a pin-row lock. Schedule snapshots can outlive the pin's current image, and generation task references are independent.
- Do not delete objects directly from any route except through the claim/finalize helper.
- Avoid reusing deterministic generation object paths with `upsert: true` while a deletion claim may be active. The upload path must register/claim safely before overwriting, or use unique immutable object paths per upload attempt.
- Preserve unknown/legacy objects: the existing strict managed-path extractor remains the gate.
- Keep the bucket public for the current Pinterest publication URL design unless the product moves to signed URL delivery; this is a separate product/security decision.

## Test plan before rollout

PostgreSQL concurrency tests (two independent sessions):
1. Schedule insert wins lifecycle lock; deletion claim observes the schedule and refuses.
2. Deletion claim wins; schedule reference registration is rejected until deletion finalizes, then schedule cannot point at the deleted object.
3. Pin image replacement and old-image cleanup race.
4. Generation task URL persistence races with cleanup.
5. Two concurrent cleanup requests produce one active claim.
6. Definite Storage failure becomes retryable `delete_failed`.
7. Ambiguous Storage timeout remains claimed until reconciliation.
8. Reintroduced object path cannot silently reuse a `deleted` row.
9. Unauthorized roles cannot call lifecycle RPCs; service-role only.
10. Legacy and foreign URLs never reach deletion RPC.

PostgreSQL integration coverage (`backend/test/pin-image-deletion-claims.integration.sql`):
- URL allow-list, traversal rejection, RPC/table privileges and all three trigger registrations;
- live-claim exclusivity, expired-claim token rotation, stale-token finalization rejection;
- pin and active schedule references block deletion; cancelled schedules release their reference;
- terminal generation journal rows continue to retain their stored image until the journal row is pruned.

Backend tests:
- claim false -> Storage remove not called;
- success -> finalize success;
- definite error -> finalize failure;
- timeout -> no unsafe release;
- RPC failure -> no Storage deletion;
- path traversal/encoded separators/foreign origin -> no lifecycle call.

## Rollout sequence

1. Add migration and SQL concurrency tests.
2. Add backend lifecycle helper and unit tests.
3. Convert all three reference writers and all deletion call sites.
4. Add stale-claim reconciliation endpoint/job, initially disabled.
5. Apply migration manually in Supabase SQL Editor after backup.
6. Deploy backend only after migration and staging verification.
7. Enable periodic reconciliation after observing metrics.

## Current rollout blockers\n\n- Apply migration 070 manually in Supabase SQL Editor after a backup. Until then, the updated backend cleanup path will fail closed because the claim RPC does not exist.\n- Run the Node test suite and PostgreSQL integration/concurrency tests against a disposable database. These have not been run from this session.\n- Add an operator-facing stale-claim inspection/reconciliation path for expired claims that still have a durable reference. Claims with no references can now be safely retried with a rotated fencing token; TTL alone never reopens writes.\n- Decide when generation task journals may be pruned and add a safe orphan-cleanup policy.\n\n## Non-goals

This protocol does not change public/private bucket visibility, existing RLS policy state, retention policy for terminal generation journals, or storage-provider redundancy. Those require separate decisions.
