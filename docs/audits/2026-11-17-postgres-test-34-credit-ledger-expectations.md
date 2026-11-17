# PostgreSQL integration test 34: stale credit-ledger expectations

## Incident and owner-provided evidence

Owner synchronized a clean checkout to `b8e8073bd81f510f7648ab9c584584a24f9d40cf`. The three Node contract/migration/replay-chain test files passed **45/45**. The PowerShell Parser API passed with **0 syntax errors**.

The guarded PostgreSQL runner verified the intended local PostgreSQL listener (PID 15220), data directory `X:\\PinPosy-verify-pg18`, and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. It created disposable database `pinposy_sqlint_fb3cc84d67ee46ab`, applied the CI legacy/upgrade fixture, all **147 migrations 010–156**, and both CI inline assertions. SQL integration tests **1–33 passed**, including the repaired test 29. Test **34/46** (`postgres-integration.sql`) failed at its generic credit adjustment assertion: expected balance 100, actual balance 140. Runner cleanup terminated 0 remaining sessions, dropped the disposable database, and confirmed removal. Tests 35–46 were not run.

## Diagnosis

This is a stale integration-test expectation, not evidence of a production credit-adjustment defect.

The test creates the user with 10 credits, then successfully fulfills three distinct purchases:
- first purchase: +100 (balance 110);
- late success after cancellation: +25 (balance 135);
- late success after denial: +15 (balance 150).

It then calls `adjust_credits_balance_and_log(..., -10, ...)`. The correct resulting balance is therefore **140**, not 100.

Each of the three successful purchase fulfillments inserts one `credit_transactions` row keyed by its purchase, and the generic adjustment inserts one additional ledger row. The correct total at that assertion is therefore **4**, not 2. The existing expected values (100 and 2) were left over from before the two late-success purchase cases were added.

Migration 074's `adjust_credits_balance_and_log` locks the user row, checks active reservations for debits, subtracts the requested amount, writes one ledger row and returns the new balance. The observed 140 matches the arithmetic and the function's intended behavior. No evidence from this run justifies changing production SQL.

## Changes published

Only `backend/test/postgres-integration.sql` changed:
- updated its header to identify the current ordered migration chain 010–156 (rather than stale 010–148);
- updated the post-purchase adjustment balance expectation from 100 to 140;
- updated the total ledger-entry expectation from 2 to 4.

Source commit: `c8ed7c5747829e1e78ba23fa6a81a36395a6657e`  
Final source blob: `0181cd42dbf41947ea1d3cc33cbd852c291870ee`

No production migration, application code, credit function, runner, CI workflow, or PostgreSQL server was changed. The correction has been published but is **not runtime-verified**. Assistant did not run Node, PowerShell, psql, PostgreSQL, Bash, or CI.

## Next verification

1. Synchronize the owner's local checkout to the latest clean `main`.
2. Run the three Node contract/migration/replay-chain test files; require all tests to pass.
3. Run the PowerShell Parser API check; require 0 syntax errors.
4. Only after both gates pass, run the guarded PostgreSQL integration script.
5. Require fixture success, 147 migrations 010–156, both CI inline assertions, all 46 ordered SQL tests, and confirmed disposable-database cleanup.

Preserve PostgreSQL listener PID 15220, port 55439, and data directory `X:\\PinPosy-verify-pg18`. Do not stop/reconfigure the server, bypass guards, or use production/`PIN_TRIAL`. Stop on the first failure. Nine Bash concurrency scripts remain a separate, unverified suite.
