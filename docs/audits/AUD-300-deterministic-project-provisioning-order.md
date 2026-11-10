# AUD-300 — deterministic default-project selection

## Finding
Board creation obtains a project through `GET /projects`, and the frontend reuses the first returned project. The endpoint previously returned rows without an explicit ordering. PostgreSQL/Supabase does not guarantee an implicit row order, so retries of the same board-create operation could select a different project. Since board idempotency is scoped by `(project_id, create_request_id)`, a changed project scope could bypass the existing idempotency key and create a duplicate board.

## Change
- Added `backend/projectProvisioningOrder.js` to sort projects by `created_at` ascending, then by ID as a deterministic tie-break.
- Applied the ordering to the authenticated `GET /projects` response before serialization.
- Added Node regression tests for stable ordering, tie-breaking, and malformed input.
- No schema or migration change; no project ownership or access behavior changed.

## Verification
- Source and test files read back after write.
- Node tests, lint, typecheck, and build were not run in this environment.
- No production database changes, deployment, or merge.
