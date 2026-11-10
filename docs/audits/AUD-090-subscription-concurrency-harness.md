# AUD-090 — Subscription concurrency test harness ordering

## Finding
The PostgreSQL subscription concurrency test started a lock-holder transaction and
then waited for two webhook sessions to appear in `pg_stat_activity` as lock
waiters. However, it launched those webhook sessions only after the waiter loop.
The condition could therefore never become true: the test waited for sessions
that did not yet exist, then exited with a false failure.

This was a test-harness ordering defect, not evidence of a production billing
failure. It could make the atomic-payment CI job fail before exercising the
concurrent activation path.

## Change
Updated `backend/test/subscription-concurrency.sh` to:
1. acquire and confirm the user-row lock;
2. launch both independent subscription activation sessions;
3. wait until PostgreSQL reports both sessions blocked on a lock;
4. allow the lock holder to finish, then assert both payments were activated,
   entitlement periods do not overlap, and the newest-created successful order
   determines the current plan.

The timeout cleanup now also terminates both webhook client processes.

## Verification limits
The script was reviewed from the PR branch, but it was not executed against
PostgreSQL in this session. GitHub Actions must run the integration workflow to
confirm the concurrency assertions. No production database or payment was
touched.
