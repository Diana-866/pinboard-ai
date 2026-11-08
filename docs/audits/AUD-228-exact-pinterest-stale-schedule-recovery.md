# AUD-228 — Require exact publication evidence for stale schedule recovery

## Finding

The stale-claim recovery embedded in `claim_due_pin_schedules` previously promoted an old `publishing` schedule to `published` when it found a `published` attempt for the same user, pin, and Pinterest account. It did not require the schedule board to match the attempt board and did not require a matching row in `pinterest_publications`.

This could display a successful calendar status for a different destination, or when the attempt journal and durable publication ledger disagreed.

## Change

- Add migration `092_pinterest_stale_schedule_recovery_requires_exact_publication_evidence.sql` overriding the worker claim RPC.
- Promote a stale `publishing` schedule only when attempt and publication rows agree on user, pin, account, board, and remote Pinterest pin ID, and the schedule matches that same identity.
- If an attempt exists but exact evidence is absent or mismatched, keep the schedule fenced as `unknown`; do not auto-retry it.
- A `failed/retry_safe` journal can requeue only when its recorded board matches the schedule board.
- Add a disposable-PostgreSQL integration test for exact success, board mismatch, and missing publication ledger.
- Add migration and integration test to the PostgreSQL CI workflow.

## Safety and verification

No production database was changed, no migration was applied to Supabase, and no deployment or merge was performed. The SQL integration test is added but has not been executed locally. CI availability must confirm the migration and test.
