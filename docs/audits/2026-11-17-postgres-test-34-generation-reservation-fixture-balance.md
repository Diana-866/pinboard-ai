# PostgreSQL test 34: generation reservation fixture balance

## Owner-provided verification evidence

The owner synchronized a clean local checkout to `0868d0b3f87a45bf1c680c73efd6ca53ccb16eea` (same as `origin/main`). The Node contract/migration/replay-chain gate passed **45/45** and the PowerShell Parser API reported **0 syntax errors**.

The guarded PostgreSQL runner verified the intended local server (listener PID 15220, data directory `X:\\PinPosy-verify-pg18`, server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`). It created disposable database `pinposy_sqlint_9a31f4922b584047`, applied the CI upgrade fixture, all **147 migrations 010–156**, and both CI inline assertions. SQL tests **1–33 passed**. Test **34/46** (`postgres-integration.sql`) failed at the second distinct generation-credit reservation with:

`second generation reservation unexpectedly succeeded`

The runner terminated 0 remaining sessions, dropped the disposable database, and confirmed removal. Tests 35–46 were not run.

## Diagnosis

The previous test-34 correction properly fixed two stale ledger expectations:
- after starting at 10 credits, three successful purchase fulfillments (+100, +25, +15) and a generic -10 adjustment, the balance is **140**, not 100;
- the three purchases plus the adjustment produce **4** ledger entries, not 2.

However, the same SQL test contains a later generation-reservation scenario whose explicit invariant assumes exactly **100** credits: reserve 60 for one request, reject a second distinct 60-credit reservation, then mark the first request failed and verify the released amount can be reserved by the second request. The following test also assumes 60 reserved and 40 available, and expects a 45-credit competing debit to fail. The test's earlier purchase/ledger sequence left 140 credits, so the second 60-credit reservation correctly succeeded (80 total reserved is within 140). The previous audit diagnosed the stale balance/ledger assertions but did not carry the resulting 140 balance through the later reservation fixture; that diagnosis was incomplete.

This is a **test fixture setup inconsistency**, not evidence of a production reservation defect. Migration 054's reservation function locks the user row, totals active reservations, and rejects only when available balance is below the requested amount. With 140 credits, two 60-credit reservations are valid. No production SQL change is justified.

## Change published

Changed only `backend/test/postgres-integration.sql`. Immediately after verifying the 140-credit balance and four ledger rows, the fixture now performs an additional **-40** adjustment through the same `adjust_credits_balance_and_log` RPC, verifies the balance is exactly **100**, and verifies that the fifth ledger entry was written. This preserves the ledger/balance invariant and makes the subsequent 60 + 60 reservation and 60-reserved/40-free debit assertions internally consistent.

The later expected balances remain coherent: the 10-credit generation debit leaves 90, and the 10-credit regeneration debit leaves 80. No production migrations, application code, RPC definitions, runner, CI workflow, or persistent PostgreSQL server were changed.

Source commit: `1bf861a6116e2a6d487f0df3cca748a69a0daf6b`  
Final source blob: `1cc9638400d4c1a63960424fab500fbd94335e5b`

## Verification status and limitations

The owner-provided Node 45/45 and PowerShell Parser 0-error results apply to the pre-fix checkout `0868d0b3...`. The SQL runner reached test 34 and failed as described. The source correction has been published, but **has not yet been runtime-verified**. The assistant did not execute Node, PowerShell, psql, PostgreSQL, Bash, or CI.

## Next owner verification

1. Synchronize the local checkout to the latest clean `main`.
2. Run the three Node contract/migration/replay-chain test files; require **45/45 PASS**.
3. Run the PowerShell Parser check; require **0 syntax errors**.
4. Only after both gates pass, run `scripts/verify-integration.ps1`.
5. Require the fixture, 147 migrations 010–156, both CI inline assertions, all **46/46** ordered SQL tests, and confirmed disposable-database cleanup.

Preserve PostgreSQL listener PID 15220, port 55439, and data directory `X:\\PinPosy-verify-pg18`. Do not stop/reconfigure the server, bypass safety guards, use production/`PIN_TRIAL`, or share passwords, tokens, or `.env` contents. The nine Bash concurrency scripts remain a separate, unverified gate.
