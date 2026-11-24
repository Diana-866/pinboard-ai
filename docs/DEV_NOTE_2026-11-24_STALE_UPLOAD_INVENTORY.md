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
