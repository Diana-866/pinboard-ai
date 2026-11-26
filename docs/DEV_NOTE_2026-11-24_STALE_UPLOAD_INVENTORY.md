# Development note — 2026-11-24

## Repository snapshot
- Repository: `Diana-866/pinboard-ai`
- Base branch: `main`
- Base commit observed before branch creation: `d1b9231ea172901ea87b92288b367a5526b1bd64`
- Working branch: `fix/stale-upload-inventory-mainline-20261124`
- Previous PR #98 is still open but its branch is 81 commits behind `main`; this change is re-applied on a fresh base rather than merging its stale history.

## Finding
Both `quarantineStalePinImageUploads` and `reconcileStalePinImageUploads` consumed `list_stale_pin_image_uploads` via destructuring and `staleUploads || []`. A successful PostgREST envelope with malformed `data` could be treated as an empty inventory. For quarantine this could skip work while incorrectly reporting a clean/empty queue; reconciliation could hide unresolved uploads.

## Change
- Use shared `readArrayQueryResult` to validate both RPC envelopes.
- Remove fallback-to-empty handling.
- Add two regression tests asserting malformed inventory rejects with HTTP 502 before quarantine RPC or Storage inspection.
- Refresh backend test inventory: total 1559; lifecycle test declarations 54.

## Verification
- Static transformation assertions passed in this authoring session.
- GitHub file writes returned commit SHAs.
- Node runtime tests and GitHub Actions have not yet been run for this branch.
- No database, Storage, production, deployment, DNS, or payment settings were touched.

## Next
Run `node --test backend/test/pin-image-lifecycle.test.js backend/test/test-inventory.test.js` on Windows against this branch. Do not merge until runtime and CI results are confirmed.

## CI follow-up — 2026-11-26

The first real CI attempt exposed unrelated release-gate defects as well as the new inventory tests:

- Backend inventory was stale: recorded 1,559, actual declaration count 1,561. Updated the total to 1,561.
- Documentation-integrity checks cite valid historical commits, but the two backend workflows used shallow checkout. Set `fetch-depth: 0` on the backend checkout in Persisted Boards and Prodamus webhook workflows.
- The atomic-payment workflow uses a vanilla PostgreSQL service, while its disposable schema fixture assumes Supabase roles. Added a separate role-bootstrap step creating only `NOLOGIN` `anon`, `authenticated`, and `service_role` roles. Kept the schema heredoc byte-for-byte aligned with the shared upgrade fixture.
- One authenticated-reads test failed because its backend subprocess did not start. The test selected a random port from a fixed 2,000-port range, which can collide with concurrent test processes. Replaced that selection with an OS-assigned loopback port obtained from a temporary listener.

## CI evidence and status

- Previous PR #99 runs: backend inventory failed (1,559 vs 1,561), commit-citation checks failed under shallow checkout, and PostgreSQL schema setup failed with missing role `anon`.
- After the corrections, new checks were triggered for head `afd3b28d094e6052bce23b229a50bb019429a23a`; at the time of this note, backend and PostgreSQL jobs were still running. No PASS is claimed for the rerun.
- No production database, Supabase, Storage, DNS, payments, or deployment settings changed.

## Follow-up — port collision regression test

- The authenticated-reads startup failure was consistent with the old test selecting a random port from a fixed 2,000-port range while multiple test files run concurrently. The backend test now asks the OS for an available loopback port via a temporary listener.
- Added a focused test for the port allocator.
- Final expected backend inventory after this addition: **1,562 declarations**; `api-authenticated-reads.test.js`: **117`.
- The test-file change retriggers CI on the latest PR head. Await those results; no runtime PASS is claimed yet.

## PostgreSQL gate correction — 2026-11-26

The atomicity workflow reached the SQL integration suite after the role-bootstrap fix and exposed a real workflow drift: it replayed migrations only through 161, while `backend/test/postgres-integration.sql` expects the subscription-activation outbox behavior restored by migration 162. The full current chain is 010–167.

- Added migrations 162–167 to the disposable atomic-payment workflow.
- Updated `scripts/verify-integration.ps1` from 010–161 (152 migrations) to 010–167 (158 migrations), matching `scripts/verify.sh`.
- Updated `postgres-integration-runner-contract.test.js` to require the complete 010–167 chain in both CI and the Windows runner.
- This corrects a false failure caused by testing an obsolete schema snapshot; the SQL suite must still pass on the new full-chain rerun.

Current CI for the latest code is pending/running; no full PostgreSQL or backend PASS is claimed.

## Disposable concurrency harness fix — 2026-11-26

The first full-chain PostgreSQL rerun reached the ten-script concurrency suite, but the harness failed before creating its disposable clone: PostgreSQL 18's `createdb` rejects the psql-style `-d postgres` option. Replaced it with the documented `--maintenance-db=postgres` for both `createdb` and `dropdb`, and strengthened the existing harness contract test to reject the unsupported option.

The failing run did not create or modify the concurrency database; it exited before clone creation. A new CI run is required to verify the corrected harness and the complete SQL suite.

## CI disposable PostgreSQL address boundary — 2026-11-26

After the full 010–167 chain and SQL integration passed, the concurrency suite correctly stopped at its safety preflight: the GitHub service container reports its server address as `172.18.0.2/32`, even though the client connects through loopback `127.0.0.1`.

The shared guard now permits a private 172.16/12 bridge address only when all of these hold: GitHub Actions is active, the client host is loopback, explicit disposable opt-in is set, run ID/attempt are numeric, and the database name exactly matches `pinposy_verify_<run>_<attempt>`. Arbitrary remote addresses remain rejected. Added contract assertions for this exception.

The rerun must confirm this constrained CI exception and the corrected `createdb --maintenance-db=postgres` harness. No production or user database was involved.
