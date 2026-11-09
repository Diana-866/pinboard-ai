# AUD-286 — reconcile schedule mutations after the worker claims the row

- Found a narrow race in AUD-284 recovery: retry/change-board can commit the failed-to-scheduled transition, then the background worker can immediately claim the same row before the client performs its read-after-error reconciliation.
- The schedule listing then legitimately returns `publishing`, but the old matcher accepted only `scheduled`, incorrectly surfacing the original transport error.
- The reconciliation helper now accepts either `scheduled` or `publishing`, while still requiring exactly one row with the same schedule ID, Pinterest board, and Pinterest account. Failed, unknown, mismatched, missing, malformed, and duplicate matches remain rejected.
- Calendar state now adopts the persisted status via `parsePersistedScheduleStatus`; it no longer visually resets a worker-owned `publishing` schedule to `scheduled`.
- Added regression coverage for a matching worker-claimed row and rejection of unrelated states.
- This is a frontend-only correction; no SQL/RPC/worker behavior was changed. Tests, lint, typecheck, and build have not been executed in this environment. No production DB changes, deployment, or merge.
