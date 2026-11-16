# CI concurrency harness isolation fix

Date: 2026-11-16
Parent main: 31b94158b4687227fe483908c222e66abe92fd25

## Defect

The nine Bash concurrency scripts require explicit `PINPOSY_ALLOW_DISPOSABLE_DB_TESTS=1`, loopback-only PostgreSQL, a `pinposy_verify_<suffix>` database name, and verification of the actual connected database/server address. The workflow still invoked them directly in the shared `pinposy_test` fixture without the opt-in or database-name override, so they would refuse to run. No runtime execution occurred because the hosted runner was not allocated.

## Fix

- Added `backend/test/run-disposable-concurrency-suite.sh`.
- The runner derives a unique database name from GitHub run ID + attempt, refuses to adopt a pre-existing name, clones the fully migrated `pinposy_test` fixture, sets explicit opt-in, runs all nine scripts sequentially, and drops only the clone it created in an EXIT trap.
- Removed direct invocations from the shared SQL fixture and added one isolated runner step after the ordered SQL integration suite.
- Added a Node static contract test binding the workflow, nine script names, loopback target, unique database, opt-in, template clone and cleanup.
- Corrected AUD-401 to distinguish current checkout idempotency (migrations 116–118) from the proposed immutable receipt/entitlement-decision design (AUD-400). Migrations 072–073 are GPTunnel generation refund reconciliation, not Prodamus customer refunds.

## Verification

Source files were re-read from the same main HEAD before patching. The static contract test was added but NOT executed. Bash syntax, Node tests, PostgreSQL concurrency tests and GitHub Actions were NOT run. No production database, Prodamus account, payment or Pinterest resource was touched.
