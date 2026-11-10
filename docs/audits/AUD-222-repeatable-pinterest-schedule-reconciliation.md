# AUD-222 — Repeatable reconciliation of confirmed Pinterest schedules

## Finding

Migration 048 repaired historical `unknown` schedules once, but the live worker's recurring claim path did not repeat that positive-only repair. If an older worker/version or a partial legacy write left a schedule `unknown` while both the attempt journal and publication ledger already confirmed the same remote pin, the schedule could remain stuck indefinitely.

## Change

- Added migration 091 with service-role-only RPC `reconcile_confirmed_pinterest_schedule_successes()`.
- The RPC promotes only `unknown` schedules when owner, pin, Pinterest account, board, remote pin ID, successful attempt journal, and publication ledger all match exactly.
- It clears stale claim/error/retry fields and preserves the earliest known publication timestamp.
- It never changes `cancelled`, `failed`, `scheduled`, or `publishing` rows. It never treats missing or mismatched evidence as success and never authorizes a retry.
- The scheduled worker invokes this reconciliation before claiming due work. If reconciliation cannot be verified, the worker fails before claiming new rows.
- Added a disposable PostgreSQL integration test for positive reconciliation, idempotency, and mismatched remote-ID rejection; wired migration and test into the atomic-payment workflow.

## User impact

A schedule that was incorrectly left in `unknown` despite durable proof of successful publication can now recover automatically on the next worker tick. The calendar can show it as published instead of leaving it indefinitely uncertain. Cases without exact proof remain blocked, so this repair does not create duplicate Pinterest posts.

## Verification

Source files were re-read after commits. The SQL integration test is wired into GitHub Actions but has not yet been observed passing. No local PostgreSQL execution, production database change, Pinterest API call, deployment, or merge was performed.
