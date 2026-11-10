# AUD-191 — Protect scheduled Pinterest content and source-pin retention

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`  
Migration: `087_pinterest_schedule_snapshot_and_pin_retention.sql`

## What changed

- Added a PostgreSQL trigger that prevents changing any already-populated schedule snapshot field: title, description, image URL, or resolved destination URL.
- The trigger permits a one-time NULL-to-value backfill for legacy schedules, but an existing captured value cannot be rewritten.
- Replaced the `pin_schedules.pin_id` foreign key's `ON DELETE CASCADE` with `ON DELETE RESTRICT`. Deleting a local pin can no longer silently erase queued, in-flight, published, or failed schedule history.
- Extended `backend/test/pinterest-account-publication.integration.sql`:
  - live pin edits leave the saved creative unchanged;
  - attempts to rewrite a populated snapshot fail with SQLSTATE `55000`;
  - deleting a source pin with a queued schedule fails with a foreign-key violation and retains the schedule;
  - deleting a source pin while publication is in flight is also blocked, preserving both schedule and attempt journal.

## User impact

Changing a pin after scheduling still changes the local pin, but the already-approved scheduled Pinterest creative remains the version the user originally queued. A pin that still has schedule/history rows cannot be deleted at the database level; this deliberately avoids losing a publication or its audit trail. A future product flow can offer explicit history retention/cleanup rather than silently cascading it away.

## Verification and limitations

- Reviewed migration 051, image lifecycle migration 070, quarantine migration 083, schedule creation/cancellation routes, and the existing publication integration test.
- Confirmed the existing image lifecycle guard already treats non-cancelled schedule snapshot URLs as references, so replacing a pin image does not make an active schedule's image eligible for deletion.
- SQL integration tests were updated but not executed against PostgreSQL in this session.
- Migration 087 is committed to the feature branch only; it has not been applied to Supabase.
- No production data, deployment, or PR merge was touched.
