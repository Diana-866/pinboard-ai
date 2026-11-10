# AUD-294 — fail-closed confirmation for manual Pinterest reconciliation

- Reviewed the existing admin-only `POST /admin/pinterest/reconcile-unknown-publication` path and its narrow database RPC. The authenticated operator identity is supplied by the verified request context; route middleware and the database RPC both enforce administrator access.
- Found a response-integrity gap in `backend/adminPinterestReconciliation.js`: any truthy RPC `data` value was returned as a successful `published` reconciliation, even if the value was not a valid persisted timestamp.
- Changed the backend to accept success only when the RPC returns a parseable timestamp string. The timestamp is normalized to ISO 8601. Null, object, numeric, or malformed responses now fail closed with HTTP 500 and do not tell the operator that reconciliation was saved.
- Added regression coverage for null and malformed RPC results while preserving the valid timestamp success case.
- No SQL semantics, Pinterest API behavior, or automatic retry behavior changed. No production database, deployment, or merge action was performed.
- Verification: files were read back after updates. Node tests, SQL integration tests, lint, and build were not run in this environment; CI status remains unverified.
