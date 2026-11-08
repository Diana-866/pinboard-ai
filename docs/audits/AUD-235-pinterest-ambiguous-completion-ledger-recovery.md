# AUD-235 — Recover an ambiguous Pinterest completion without downgrading success

Date: 2026-11-09

## Finding

Pinterest can return a successful remote pin ID while the subsequent `complete_pinterest_publish_v2` request returns a transport/PostgREST error. That response does not prove the SQL transaction rolled back. The transaction may already have committed the publication ledger, attempt status, and schedule status atomically.

The old error path immediately called `fail_pinterest_publish_v2` with an unknown outcome. If the completion had actually committed, that follow-up could downgrade the attempt journal from `published` to `unknown`, destroying positive evidence that the scheduled-success reconciliation expects.

## Change

- Added `matchesConfirmedPublicationLedger`, a pure helper that requires exact user, local pin, Pinterest account, Pinterest board, and remote Pinterest pin ID equality.
- After an ambiguous completion RPC error, the backend now reads the durable `pinterest_publications` ledger before writing an unknown failure.
- If the exact ledger row exists, the backend treats the operation as already published and does not call the failure-journal RPC. This preserves the committed attempt/schedule state and avoids another Pinterest POST.
- If the lookup fails, returns no row, or any identity field differs, the existing conservative unknown/failure path remains in force.
- Added unit regression coverage for exact match, each identity mismatch, and missing inputs.

## User impact

When Pinterest has already created the pin and the database transaction actually committed but its response was lost, PinPosy can recognize the saved publication instead of incorrectly downgrading it to unknown. It will not create a second pin. If the database cannot provide exact durable evidence, the operation remains blocked for reconciliation.

## Verification

- Changed files were written through GitHub and are being read back from the feature branch.
- Node unit tests, PostgreSQL integration tests, lint, and build were not executed in this environment.
- No production database migration, deployment, Pinterest API call, or PR merge was performed.

Status: FIX IMPLEMENTED / STATIC REVIEW PENDING / CI UNVERIFIED.
