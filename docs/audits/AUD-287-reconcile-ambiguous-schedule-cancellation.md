# AUD-287 — Reconcile ambiguous schedule cancellation

## Finding

The backend cancellation endpoint is already idempotent for an owner retrying a cancellation: when the conditional scheduled-to-cancelled update affects no row, it reads the same owner-scoped schedule and returns the persisted row when its status is already `cancelled`. However, the calendar frontend treated every rejected cancellation POST as a failure.

If the database committed the cancellation and the HTTP response was lost, the schedule could remain visible in the client calendar until a manual refresh even though it was no longer active.

## Change

- The cancellation handler now performs a read-only `GET /schedule` after a failed POST.
- The schedule listing intentionally excludes rows with status `cancelled`; absence of the previously visible schedule therefore confirms the cancellation only when the response is a structurally valid array and every returned row has a non-empty string ID.
- A malformed response, a still-present schedule, or a failed reconciliation read remains inconclusive. The handler preserves and reports the original cancellation error.
- The client removes the schedule from local calendar state only after the POST succeeds or the strict absence check confirms that the server no longer lists it as active.

## Safety

- No second cancellation request is sent.
- No backend state transition, ownership check, worker guard, or Storage cleanup behavior was changed.
- A schedule still present as `publishing`, `published`, `scheduled`, or another active/listed state is never treated as cancelled.
- The reconciliation relies on the existing authenticated, owner-scoped `GET /schedule` endpoint and its explicit cancelled-row filter.

## Regression coverage

Extended `frontend/src/utils/scheduleMutationReconciliation.test.ts` to cover:
- valid empty/other-row lists confirming absence;
- the target schedule still present;
- malformed, incomplete, and non-array responses not confirming cancellation.

The existing test file also contained literal escaped newline sequences in two test sections; it was normalized into valid TypeScript test source while adding these cases.

## Verification status

GitHub read-back is required/recorded for the changed frontend files. Automated Node tests, lint, typecheck, and production build have not been executed in this environment. No production database changes, deployment, or merge were performed.
