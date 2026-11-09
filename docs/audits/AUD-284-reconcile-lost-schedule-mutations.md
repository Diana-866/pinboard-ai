# AUD-284 — reconcile lost schedule retry and board-change responses

- The calendar's retry and failed-schedule board-change actions previously surfaced a network error even when the database transition had already committed and only the HTTP response was lost.
- Both handlers now perform a read-only reconciliation against the authenticated `GET /schedule` result after a failed POST.
- A mutation is treated as successful only when exactly one persisted row matches the same schedule ID, the expected queued status, the target Pinterest board, and the original Pinterest account. Malformed, absent, duplicate, or mismatched rows preserve the original POST error.
- Extracted the strict matcher to `frontend/src/utils/scheduleMutationReconciliation.ts` and added Node test coverage for exact match, mismatched identity/state, malformed data, absence, and ambiguity.
- This does not issue another retry, change the board, or weaken the backend RPC guards. Cancellation is intentionally not reconciled this way because `GET /schedule` excludes cancelled rows; absence cannot prove cancellation.
- Read-back verification is required after the commit. Tests, typecheck, and build have not been executed in this environment; no production migration, deployment, or merge was performed.
