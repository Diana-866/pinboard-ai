# AUD-295 — prevent stale Pinterest admin inventory responses

- Reviewed the manual Pinterest unknown-publication recovery UI and the admin inventory refresh flow.
- Found a request race: quickly changing the status filter (or refreshing while a prior request is still pending) allowed the older response to overwrite the newer list. A stale request could also clear the loading/error state belonging to the latest request.
- Added a monotonically increasing request identity in `AdminPinterestSchedules.tsx`. Only the latest request may update inventory data, errors, or loading flags. Requests are invalidated when the filter changes or the component unmounts.
- Existing manual reconciliation action identity and retry behavior are unchanged; no database or API contract changes.
- Verification: source was read back after update. Frontend tests, lint, and build were not run in this environment; CI status is not considered passing.
- No production data, deployment, or merge action was performed.
