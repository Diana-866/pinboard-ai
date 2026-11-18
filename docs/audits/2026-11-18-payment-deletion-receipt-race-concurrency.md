# 2026-11-18 — Receipt-bound payment versus account-deletion concurrency coverage

## Scope and starting state

- Repository: `Diana-866/pinboard-ai`, branch: `main`.
- Reconciled the live project passport, owner-action log, documentation register, recent commit history, migration 159, its SQL integration test, the atomic-payment workflow, shared disposable-PostgreSQL guard and concurrency-suite wiring before editing.
- Starting source head observed before the race-test commits: `960098479cb1598bf3152556ab427585f0a7ad19`; main subsequently advanced with terminal receipt identity and decision-owner validation changes, and was rechecked at `1e85641290ba3c360856aad734d858a3150aed13`.
- Current migration 159 blob after the terminal receipt identity correction: `30519439d7423cbc84db1fbca2cc638b74c60723`.
- No production database, PIN_TRIAL, staging, Prodamus account, real payment, Pinterest API, or deployment was accessed.

## Review findings

### Receipt-bound fulfillment lock ordering

The current credit fulfillment RPC in migration 159:
1. Reads the immutable successful provider receipt.
2. Resolves the purchase owner without taking a purchase-row lock.
3. Locks the `users` row first.
4. Locks and revalidates the `credit_purchases` row.
5. Locks the receipt decision row.
6. Checks provider order, amount and currency identity, including terminal receipt reuse.
7. Either records a terminal lifecycle/mismatch decision or calls the existing credit RPC and records `granted` in the same database transaction.

This follows migration 157's user-first lifecycle lock order. The migration-159 SQL integration test covers sequential idempotency, amount mismatch, a user already in `deletion_pending`, and cross-payment reuse of a terminal receipt. It does not by itself create two independently executing PostgreSQL sessions.

### New two-session race harness

Added `backend/test/payment-deletion-receipt-race-concurrency.sh`:

- Uses the existing shared `assert-disposable-postgres.sh` guard; it refuses non-loopback or non-`pinposy_verify_*` databases without explicit opt-in.
- Uses unique test users, purchases, immutable receipt fingerprints and distinct PostgreSQL `application_name` values.
- Waits until PostgreSQL reports the expected lock holder and lock waiter; it does not rely only on timing or assume a race occurred.
- Case A holds the user row lock in the payment session, starts the deletion-fence update in a second session, proves the deletion session is blocked, then verifies one credit ledger row, balance 105, a `granted` receipt decision and the subsequently committed `deletion_pending` status.
- Case B commits the `deletion_pending` lifecycle fence while holding the user row lock, starts receipt-bound payment fulfillment in a second session, proves the payment session is blocked, then verifies unchanged balance 5, zero credit ledger rows, unchanged canceled purchase and `withheld_account_lifecycle` decision.

**Scope limitation:** the test models the account-deletion acceptance linearization point by updating `users.account_status` while holding the same user-row lock. It does not invoke the full `request_account_deletion` queue RPC or the deletion worker. It currently exercises the credit-purchase path, not subscription fulfillment. It must not be described as full end-to-end deletion workflow coverage.

## Changes and commits

- New concurrency test: commit `19118c46429148b0b9c8e3fdb3a97b7d29dfa50f`; corrected psql invocation in `2ef950263a9e22bc684f640c7beb4ace0f082aba`; final blob `0e2da4a83e2b0bda1d9f729868fca3fba04819c5`.
- Added the test to the disposable concurrency runner (ten scripts): commit `b590373f687dadc5cb39ddb33c9b99805304b1e1`; final blob `827a2cd063d64668102bdf36e97e4a73dffba0af`.
- Extended the concurrency safety contract to require ten scripts and assert both payment/deletion lock-order outcomes: commits `4cfb2be7126110116c9da714722aa0781bd137a4` and `09b12d15d78cb07bab3d3ca95682f88488aed215`; current blob after subsequent mainline reconciliation `ab84f345305ee793a74e30cb4ad9ff871b62e69c`.
- The existing workflow already runs `bash -n backend/test/lib/assert-disposable-postgres.sh backend/test/*-concurrency.sh`, the concurrency safety Node contract test, and the disposable concurrency suite against a unique clone of the migrated PostgreSQL fixture. No workflow YAML change was required.
- Mainline concurrently received migration 159 terminal-receipt identity checks (migration blob `30519439d7423cbc84db1fbca2cc638b74c60723`), SQL regression coverage and a bounded decision-owner reference guard (commit `1e85641290ba3c360856aad734d858a3150aed13`). The race test was re-fetched against that current migration and remains compatible with the matching receipt/order path.

## Verification performed

- Re-fetched all three changed source/test files from `main` after publication and inspected their contents.
- Confirmed the concurrency runner lists the new script and reports ten tests.
- Confirmed the safety contract enumerates ten scripts and asserts the new test's receipt-bound RPC, both lock waiters, both terminal decisions and both balance/ledger outcomes.
- Confirmed the workflow's shell syntax gate uses a wildcard that includes the new `*-concurrency.sh` file and its Node contract step executes `postgres-concurrency-safety-contract.test.js`.
- Confirmed the existing workflow runs the suite against a separately cloned disposable database and drops that clone on exit.
- Re-queried combined status for the then-current main head `1e85641290ba3c360856aad734d858a3150aed13`: Vercel reports `failure` with target `build-rate-limit`. This is not a build log or a production deployment result. The available workflow-run lookup is limited to pull-request-triggered runs and returned none for this push commit.
- **Not run:** Bash syntax check, Node contract test, PostgreSQL race harness, full Node suite, migration replay and all 49 SQL integration tests. No runtime pass is claimed.

## Remaining gates

1. Obtain an executed CI result for the new ten-script concurrency suite; if a runner fails before steps start, classify runtime as unknown and diagnose runner allocation separately.
2. Owner runs the guarded local Node/SQL sequence from the current `docs/USER_ACTIONS.md`; never point it at production, staging, Supabase or PIN_TRIAL.
3. Extend race coverage to the full account-deletion acceptance RPC and subscription fulfillment path after inspecting the exact acceptance function contract.
4. Update the documentation register with the current migration-159 blob and this report.
5. Keep live payments and first-user invitations blocked until payment, database, application, deployment and operational release gates are all verified.


## Follow-up — migration 160, concurrency-suite deduplication and runner alignment (2026-11-18)

### Mainline migration 160

Mainline added `db/migrations/160_prodamus_receipt_local_payment_binding_guard.sql` (blob `7005ec7ce7a802312bb1376284892309a67fa226`). It stores and validates the full terminal decision row (decision, local payment kind, local payment ID and user ID) before treating a receipt as terminal; repeated `rejected_mismatch` callbacks for the same payment are idempotent, while cross-payment reuse remains rejected. It also bounds the supplied user reference to 200 characters in the decision RPC (commit `1e85641290ba3c360856aad734d858a3150aed13`).
- The receipt fulfillment integration SQL now covers the migration-160 rejected-mismatch retry and subscription lifecycle cases; current blob `f7fdc7a05bba1bc45f2b4f78652a7365422b4778`.
- The active canonical migration chain is now **151 migrations, 010–160**. The SQL manifest remains **49 unique tests**.

### Concurrency suite correction

- The receipt/deletion race script was wired into the disposable suite, but reconciliation exposed that a concurrent edit had inserted it twice. The runner and safety-contract list were corrected to contain **10 unique scripts**, not 11 entries with a duplicate. Runner blob `827a2cd063d64668102bdf36e97e4a73dffba0af`; safety-contract blob `ab84f345305ee793a74e30cb4ad9ff871b62e69c`. The contract now explicitly asserts uniqueness.
- The Windows disposable runner was advanced to 151 migrations, 010–160, and its stale error message was corrected from 150 to 151. The Node runner contract now checks the migration and SQL counts. Windows runner blob `a1af92050d64db66f5081c1425e49247ef074173`; Node contract blob `0f4f79af08145f19f64c76541be3de5fd5b88198`.
- Static re-fetch checks confirmed: 10 runner entries / 10 unique names; 49 manifest entries / 49 unique names; runner checks 151 migrations, 49 SQL tests and ten Bash concurrency scripts.

### Latest CI evidence

- Atomic workflow run `44314411889`, job `134836635174`: FAILURE, `runner_id=0`, empty runner name, zero steps.
- Persisted-boards workflow run `44314412188`, jobs `134836636827` and `134836637267`: FAILURE, `runner_id=0`, empty runner names, zero steps.
- Exact cause remains UNKNOWN; these results do not show that migration replay, Node tests, SQL tests or concurrency scripts ran.

### Verification boundary and next work

Bash syntax, Node concurrency-safety contract, Node migration-runner contract, PostgreSQL race harness, 151-migration replay, 49 SQL tests and the ten-script concurrency suite were not executed by the assistant. Runtime remains **NOT VERIFIED**. The race harness still covers the credit receipt path and models the account-deletion fence by updating `users.account_status`; it does not yet invoke the full deletion acceptance queue RPC/worker or test subscription races. Continue by extending the race to the exact deletion acceptance RPC and subscription fulfillment, then obtain an executed isolated CI run. No production database or live payment was touched.
