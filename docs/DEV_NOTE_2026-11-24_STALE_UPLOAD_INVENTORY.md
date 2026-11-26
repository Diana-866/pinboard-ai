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
