# AUD-144 — Pinterest publication destination integrity

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`

## Finding

The existing `complete_pinterest_publish_v2` implementation verifies the owner, pin, and Pinterest account, but does not verify that the board ID supplied at completion matches the board ID durably reserved in `pinterest_publish_attempts`. It also does not verify that every active/uncertain schedule being reconciled still names that same board. The completion path writes the supplied board ID into the attempt/publication ledger and marks matching schedules published.

The normal Express publish path currently passes the same locally verified board ID into reservation, Pinterest POST body, and completion. This makes the mismatch primarily a database integrity boundary: a service-role caller or inconsistent stored schedule metadata could otherwise rewrite the recorded destination during completion. The DB RPC should enforce the invariant independently.

## Change

Migration `081_pinterest_publish_completion_board_integrity.sql` replaces the completion RPC while preserving the existing account → all active/uncertain schedules in stable ID order → attempt lock order.

It now:
- rejects null/empty remote pin or board IDs;
- requires the supplied board ID to match the durable attempt's reserved board;
- requires every matching `publishing`/`unknown` schedule to match that reserved board;
- rejects an existing publication unless both remote pin ID and board ID match;
- only then records the publication, marks the attempt published, and reconciles matching active/uncertain schedules;
- preserves disconnected-account late-success reconciliation and leaves failed/cancelled schedules unchanged;
- keeps execution restricted to `service_role`.

A disposable-PostgreSQL integration fixture covers a wrong board at direct completion, schedule metadata drift, rollback/no state mutation on both rejected completions, and successful completion after exact board metadata is restored.

## Verification limits

- Source and test files were re-read from GitHub after commit.
- PostgreSQL migration and integration fixture were not executed in this environment.
- CI workflow is updated to apply migration 081 and run the new integration fixture. The latest PR-head runs (commit `f41cfb16eb821a9028416f77ca85b6fa66606f47`) reported failure in all three workflows: Prodamus run `42438917325`, atomic-payment run `42438917407`, and persisted-boards run `42438917329`. All four job-log downloads returned `BlobNotFound`; step details are unavailable, so it is unknown whether the new SQL fixture was reached. Do not count the migration or fixture as CI-passed.
- No Supabase/Production migration was applied; no Pinterest API call, retry, cron run, or deployment was performed.
- This does not yet add the administrator-facing unknown-publication reconciliation API or append-only operator journal. Those remain a separate follow-up after the destination-integrity guard is validated.
