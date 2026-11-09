# AUD-271 — read-only diagnostics for blocked image-retention queue

Date: 2026-11-09  
Branch: `feat/persisted-boards-api`

## Finding

Migration 109 and its worker correctly stop automatic retries when a Storage DELETE outcome is ambiguous. However, blocked queue rows had no dedicated operator inventory. The existing quarantined-object endpoint reads `pin_image_object_lifecycle`, not `pin_image_retention_queue`, so it could not explain queue-specific errors, attempts, or the relationship between the queue and lifecycle record.

## Changes

- Added migration 110 and bounded service-role-only RPC `list_blocked_pin_image_retention_queue(1..100)`.
- The RPC reports source types, queue attempts/error/timestamps, matching lifecycle state/error/attempts, and current database-reference visibility across live pins, non-cancelled schedule snapshots, generation tasks, generation replay JSON, regeneration storage URLs, and regeneration replay JSON.
- Added a read-only backend inspection helper and admin-only, rate-limited endpoint `GET /admin/storage/retention-queue/blocked?limit=50`.
- The helper lists the object in Supabase Storage and reports present/absent/inventory-failed. This is observational only.
- Added SQL integration coverage, route middleware coverage, and Node tests proving the diagnostic performs only read-only Storage listing (never remove) and rejects invalid paths before Storage access; wired migration and SQL test into atomic-payment CI.
- Updated storage lifecycle operations documentation and handoff.

## Safety boundary

No blocked row is reset to pending. No Storage DELETE is issued. Storage listing cannot prove that an older timed-out DELETE is no longer in flight, and a missing object alone does not prove all database/lifecycle state is consistent. Every item remains blocked until independently reconciled by an operator.

## Verification

Repository changes are written on the feature branch. Local Node/PostgreSQL execution is unavailable in this environment; CI is configured but has not yet confirmed the migration/test. No production migration, Storage operation, deployment, or merge was performed.


## Latest CI observation

The new branch HEAD triggered all three PR workflows; all concluded `failure`. GitHub returned jobs with no step summaries or log URLs, and log download returned `BlobNotFound`. The separate Vercel status remains `build-rate-limit`. The test results are therefore unconfirmed, not passing; the available evidence does not identify a code-level failure.


## Classification refinement

The diagnostic now labels each row according to database-reference presence, Storage visibility, and lifecycle state. It highlights inconsistent combinations (for example, a live DB reference with no visible object, or a lifecycle row marked deleted while the object remains visible) and returns an operator action hint. These are diagnostic classifications only: no state mutation, queue reopening, or Storage deletion is performed. Added Node tests for referenced, quarantined, and deleted lifecycle cases.


## Post-change verification and corrections

A read-back pass caught literal backslash-n sequences accidentally inserted into the lifecycle export, CI YAML command separators, and test source. These were corrected and the affected files were read back; the changed source/test/workflow files now contain no such literal sequences. The diagnostic was further enhanced with classifications for reference presence, Storage visibility, and lifecycle states; Node tests cover representative inconsistent combinations.

Latest HEAD: `7af1064c82f73696bf06eb7fabea2e6019df95b1`.

The three latest PR workflows still conclude `failure`, but the raw GitHub Jobs API shows `runner_id=0`, empty `steps`, and a runtime of roughly two seconds. No runner was allocated, so no test command ran and this is not evidence of a code-level test failure. Vercel independently reports `build-rate-limit`.
