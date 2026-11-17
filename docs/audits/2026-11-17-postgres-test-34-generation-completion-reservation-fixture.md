# PostgreSQL test 34: generation completion must reserve credits first

## Owner-provided verification evidence

The owner synchronized a clean local checkout to `main` at `a256df3a8dc45be9e082a18fb3f1374341e4eb3c`; local HEAD matched `origin/main`, and the working tree was clean.

- Node contract/migration/replay-chain tests: **45/45 PASS**.
- PowerShell Parser for `scripts/verify-integration.ps1`: **0 syntax errors**.
- Guarded runner verified the intended local PostgreSQL listener (PID 15220, port 55439, data directory `X:\\PinPosy-verify-pg18`) and created disposable database `pinposy_sqlint_e7bae68c80ff4f2a`.
- Upgrade fixture applied; **147 migrations 010–156** applied; both CI inline assertions passed.
- Ordered SQL tests **1–33 passed**. Test **34/46** (`postgres-integration.sql`) failed at line 956 while calling `complete_pin_generation_request(...)`: `generation credit reservation is missing`.
- The runner successfully terminated sessions and dropped the disposable database. Tests 35–46 did not run.

## Diagnosis

This is a stale SQL test fixture, not a demonstrated production migration regression.

Migration 054 changed the generation completion contract. `begin_pin_generation_request()` creates/claims the idempotency record and claim token, but does not reserve credits. Before completion, the caller must separately invoke `reserve_pin_generation_credits(user_id, idempotency_key, amount)`. The current `complete_pin_generation_request()` locks and requires the matching reservation in `reserved` state, changes it to `settling`, then calls the atomic pin-save/debit function. The test's older idempotency scenario called begin and then complete directly, so the missing-reservation exception is the expected guard.

The same SQL test intentionally retained a 60-credit reservation while it checked that a competing 45-credit legacy debit was blocked. After that assertion, the reservation remained active and would incorrectly constrain later, unrelated generation scenarios. The fixture now transitions that test request from `unknown` to a definitive `failed` outcome after its retention/fencing assertions; the existing reservation status trigger releases the reservation. This keeps the important unknown-outcome protection assertion intact while closing the isolated scenario through the normal status-trigger path.

The atomic-retry scenario also used the obsolete contract: it expected completion itself to discover an insufficient balance. Under the reservation model, insufficient funds must be rejected when attempting to reserve. The corrected fixture tests that reservation rejection leaves the request, balance, pins, and reservation inventory unchanged; after a one-credit top-up, it reserves the full 76 credits and completes once.

## Changes published

Only `backend/test/postgres-integration.sql` changed. No production SQL, migrations, application code, runner, CI workflow, or persistent PostgreSQL data changed.

1. Added a five-credit reservation after starting `ci-generation-key-0001` and before the first completion call.
2. After proving the unknown-provider reservation blocks a 45-credit competing debit, marked that isolated request definitively failed and asserted the trigger released its reservation.
3. Reworked the atomic retry case to expect the 76-credit reservation to fail while the balance is 75; assert no partial reservation/pin/charge and that the request remains processing; add one credit; reserve 76; then complete and retain the existing exactly-once checks.

Publication history is recorded transparently:
- Initial fixture update commit: `c7a3097b43b0c3a426c683800bfadef1d0dad9a0`; this placed the reservation-release cleanup too early.
- Follow-up correction commit: `b709f258ce17716f2bbb0eabcb18880bbbaa3678`; moved cleanup after the competing-debit assertion so that the reservation remains active for the full fencing check.
- Final source blob: `dbdf95829a54cc160d0764f76075d2c92137d5d0`.

## Assistant actions and verification limits

1. Fetched the latest `main`, project state, owner-action log, documentation register, failing SQL test, and relevant migrations 012, 014, 045, 046, 054, 064, 067, 088, and 121.
2. Traced the exact failing call at the end of the SQL test to the reservation requirement introduced by migration 054; confirmed that the begin-request function does not create a reservation.
3. Reviewed the surrounding credit arithmetic and test ordering, including the still-active unknown-outcome reservation.
4. Published the test-only changes. Re-read the source after the first commit, caught the cleanup ordering issue before asking the owner to rerun, and published the follow-up correction.
5. Created this audit and updated `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, and this register. Final blob SHAs are to be recorded here after each document is re-fetched from GitHub.

The assistant did **not** execute Node, PowerShell, psql, PostgreSQL, Bash, or CI. The final SQL fixture is **NOT RUNTIME-VERIFIED**. The latest owner evidence remains Node 45/45 PASS, Parser 0 errors, SQL tests 1–33 PASS / test 34 FAIL before this correction; tests 35–46 did not run.

## Next owner gates

1. Synchronize cleanly to the latest `origin/main`.
2. Re-run the three Node contract/migration/replay-chain test files; require **45/45 PASS**.
3. Re-run the PowerShell Parser check; require **0 syntax errors**.
4. Only after both gates pass, run `scripts/verify-integration.ps1`. Require the upgrade fixture, 147 migrations 010–156, two CI inline assertions, **46/46 ordered SQL tests**, and confirmed disposable database cleanup.
5. Stop on the first failure and provide the complete output. Do not bypass guards or use production/`PIN_TRIAL`.

Preserve PostgreSQL listener PID 15220, port 55439, and data directory `X:\\PinPosy-verify-pg18`. Do not stop or reconfigure the server. Do not share passwords, tokens, or `.env` values. The nine Bash concurrency scripts remain a separate unverified stage.
