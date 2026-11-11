# AUD-385 — end-to-end recovery of ambiguous Pinterest publications

**Date:** 2026-11-11  
**Status:** source audit completed; no unsafe retry or identity bypass found in reviewed paths.

## Scope

Reviewed the operator inventory RPC and UI, manual reconciliation service and SQL transaction, positive-only worker reconciliation, remote Pin ID fencing, and failed-schedule retry authorization.

## Confirmed safeguards

1. The operator inventory is read-only, paginated (maximum 100 rows per request), admin-gated in the database, and returns only allowlisted operational fields. The latest attempt is selected in PostgreSQL with a bounded lateral query.
2. Manual reconciliation is offered only for an old `unknown` schedule with no active claim and a matching old `unknown/processing` attempt whose `retry_safe` is explicitly false.
3. The reconciliation transaction rechecks administrator status and target ownership, locks rows in the established account → schedule → attempt order, and validates exact schedule/attempt/board identity.
4. A schedule's already-recorded Pinterest Pin ID cannot be overwritten with a different ID. Existing publication ledger identity must either match exactly or the transaction fails.
5. The transaction writes the publication ledger, marks the attempt and schedule published, and appends an immutable operator receipt. The receipt table denies direct table grants and rejects UPDATE/DELETE/TRUNCATE.
6. Exact action-ID replay with the same actor and payload returns the original receipt timestamp. Reuse with changed payload and duplicate schedule actions are rejected.
7. Automatic worker reconciliation is positive-only: attempt and publication ledger must agree on owner, pin, account, board and remote Pin ID. A mismatch remains fenced.
8. Failed schedule retry requires an active account, exact attempt identity, an explicit `retry_safe=true` journal, no publication ledger row, no active duplicate schedule, and an available live image or immutable schedule snapshot.
9. The operator UI clearly distinguishes confirmation of an already-existing remote pin from retrying publication. It warns that absence of a pin is not proof of non-publication and asks the operator to verify the exact profile and board.

## No code changes

The reviewed implementation already enforces the required positive-evidence model. Relaxing it to make unknown publications easier to retry would create duplicate-publication risk. No source or migration change was justified by this audit.

## Validation limits

- Reviewed source and SQL migrations/tests through GitHub file reads.
- Disposable-PostgreSQL integration SQL exists for operator reconciliation, positive-only worker recovery, and failed-schedule retry identity.
- Those SQL integration scripts were **not executed** in this environment. The migrations were not applied to Supabase.
- Node tests, lint, frontend build, CI and browser tests were not run.
- No Pinterest API, production database, user publication, payment or deployment operation was performed.

## Operational rule

When Pinterest may have accepted POST /pins but PinPosy did not persist the response, do not retry blindly. Search the exact Pinterest profile and destination board using the saved creative context. If the pin is found, record its actual Pin ID and Board ID through the positive-only reconciliation flow with a traceable evidence reference. If it cannot be found, keep the result unknown until reliable evidence establishes that the previous request did not create it.
