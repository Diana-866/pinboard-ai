# AUD-277 — reject unknown board and pin patch fields (2026-11-09)

## Problem
The board and pin PATCH validators used allow-listed fields to build database updates, which prevented mass assignment. However, when a request contained both a valid field and a misspelled/unsupported field, the valid part was silently applied and the unknown field ignored. This can make an edit appear successful while the user's intended change was lost.

## Changes
- `backend/boardPatch.js` now rejects any key other than `title` and `description` with HTTP 422 before constructing the update.
- `backend/pinPatch.js` now rejects any key other than `title`, `description`, and `aspect_ratio` with HTTP 422.
- Added regression cases for mixed valid + misspelled fields in `backend/test/board-patch.test.js` and `backend/test/pin-patch.test.js`.
- Existing validation semantics remain: omitted fields are untouched, empty descriptions can be cleared, empty titles are rejected, and aspect ratios remain allow-listed.

## Verification and safety
- All four modified files were read back from the branch after writing.
- Tests were added but not executed in this environment; do not treat source-level checks as a passing test run.
- No schema migration, production database operation, deployment, or merge was performed.
