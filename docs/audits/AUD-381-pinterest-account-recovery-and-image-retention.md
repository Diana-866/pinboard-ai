# AUD-381 — Pinterest account recovery, schedule identity and image retention

**Date:** 2026-11-11  
**Status:** source audit + regression-test additions; no production operations  
**Scope:** Pinterest disconnect/reconnect, schedule/account/board identity, immutable publication snapshots, late remote success, generated image references and Storage retention.

## Executive summary

The core lifecycle is intentionally conservative:
- disconnect fences refresh and publication-start operations using a stable lock order, marks future queued schedules failed, and leaves already-claimed `publishing` work available for late-result reconciliation;
- a confirmed Pinterest success after disconnect is still committed to the publication ledger and schedule, while credentials remain disconnected;
- reconnecting the same Pinterest identity does not silently resume old schedules; a user must explicitly retry a schedule whose attempt is proven safe;
- schedule snapshots are immutable and source-pin deletion is restricted while schedule history exists;
- worker and retry paths revalidate the exact account and remote board; uncertain publish outcomes are not blindly retried;
- Storage deletion uses lifecycle claims and durable reference checks. Expired external deletion leases are blocked/quarantined, not reassigned to another worker.

Migration 104 already makes both the deletion-claim RPC and retention inventory account for regeneration replay images stored only in `pin_regeneration_requests.result_pin.image_url`. The gap was regression coverage: existing tests did not explicitly prove the replay-only path is retained and cannot be claimed for deletion. This audit adds those checks without changing production SQL.

## Confirmed safeguards

### Account disconnect and reconnect
- Disconnect RPC uses the tested lock order: refresh lease → Pinterest account → schedule rows. Scheduled publication reservation uses account → schedule and validates the account is still connected with an access token.
- Future queued schedules are failed on disconnect. An already claimed `publishing` row is not rewritten as failed because an external Pinterest request may already be in flight.
- Completion does not require credentials to remain connected. A confirmed late Pinterest response is persisted to the exact publication ledger and schedule, preventing a later duplicate publish; the account remains disconnected.
- Reconnect reuses the stable account identity but does not automatically revive failed schedules. Explicit retry is required and is permitted only when the publication journal proves no remote attempt occurred or the attempt is explicitly retry-safe.

### Board and schedule identity
- Schedule creation resolves the exact connected Pinterest account and verifies the requested board before persisting.
- The schedule stores exact account/board IDs and an immutable snapshot of title, description, image and destination.
- Worker preflight revalidates the exact remote board at publication time; retry and failed-board reassignment also verify the selected board against the same account before guarded SQL transitions.
- Board reassignment is limited to eligible failed schedules and checks prior attempt identity, retry safety, publication ledger absence and active-schedule uniqueness. A missing/invalid board is not a reason to blindly publish to a guessed destination.

### Snapshot and source pin retention
- Migration 087 makes schedule content snapshots immutable and changes the source-pin FK to RESTRICT, preventing local pin deletion from cascading away queued/history rows.
- Cancelled schedules no longer count as active image references; their snapshot can be cleaned only through the reference-aware lifecycle protocol.
- Editing a source pin after scheduling does not silently mutate the queued creative.

### Storage image retention
- Migration 104 extends `claim_pin_image_deletion` reference checks to both `storage_url` and `result_pin.image_url` on regeneration requests.
- Migration 104 also extends retention candidate inventory with a `regeneration_replay` source and suppresses candidates while a recent/in-progress replay payload references the object.
- Migration 109 uses fenced queue claims. An expired processing lease is marked blocked, not reissued, because the old remote Storage DELETE may still be in flight.
- Migration 110 provides bounded operator diagnostics for blocked items, including whether a reference still exists.
- Image lifecycle RPCs are service-role-only; the SQL tests assert untrusted roles cannot execute them.

## Regression coverage added

1. `backend/test/pin-image-retention-inventory.integration.sql`
   - Covers an old completed regeneration whose only image reference is `result_pin.image_url` and `storage_url IS NULL`.
   - Confirms it appears in retention inventory as `regeneration_replay`.
   - Adds a recent/in-progress replay-only reference and confirms it suppresses retention candidacy.
2. `backend/test/pin-image-deletion-claims.integration.sql`
   - Adds a replay-only completed regeneration row and confirms `claim_pin_image_deletion` returns `referenced`, without granting a Storage deletion claim.

These are disposable PostgreSQL integration tests; they were added to source but not executed in this session.

## Operational guidance

- After disconnect, do not assume scheduled items will resume after OAuth reconnect. Review failed items and use explicit retry only when the UI/API confirms the attempt is safe.
- If status is `publishing` or `unknown`, do not retry, cancel, or create a replacement until exact remote publication evidence is reconciled.
- If a board disappears or access is revoked, reconnect/restore access or choose a verified replacement only through the failed-schedule workflow. Never substitute another board automatically.
- Never edit schedule snapshots or delete their source pin directly in SQL.
- Do not manually remove Storage objects or reset blocked retention leases. Reconcile the exact object path, lifecycle state, and all reference families first.

## Validation and safety

- Read back both modified integration test files from the feature branch.
- No PostgreSQL tests, Node tests, frontend build, lint, CI or browser checks were run.
- No migration was added or applied; migration 104 already contains the replay-reference fix.
- No Supabase DB, Storage, Pinterest API, Prodamus, deployment or production data was accessed or modified.
