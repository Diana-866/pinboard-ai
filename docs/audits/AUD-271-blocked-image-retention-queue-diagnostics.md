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
- Added SQL integration coverage and route middleware coverage; wired migration and SQL test into atomic-payment CI.
- Updated storage lifecycle operations documentation and handoff.

## Safety boundary

No blocked row is reset to pending. No Storage DELETE is issued. Storage listing cannot prove that an older timed-out DELETE is no longer in flight, and a missing object alone does not prove all database/lifecycle state is consistent. Every item remains blocked until independently reconciled by an operator.

## Verification

Repository changes are written on the feature branch. Local Node/PostgreSQL execution is unavailable in this environment; CI is configured but has not yet confirmed the migration/test. No production migration, Storage operation, deployment, or merge was performed.
