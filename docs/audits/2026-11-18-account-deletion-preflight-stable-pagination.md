# Account-deletion preflight — deterministic PostgREST pagination

Date: 2026-11-18  
Repository: `Diana-866/pinboard-ai`, branch `main`  
Scope: `backend/accountDeletionWorker.js`, account deletion preflight inventory and regression tests.

## Finding

`fetchAllRows(query, pageSize)` paginated with `.range(offset, offset + pageSize - 1)` but did not impose an `ORDER BY`, even though its comment claimed stable ordering. Its callers enumerate subscription IDs (used to count related email-outbox rows), project IDs and board IDs (used to count pins). PostgreSQL/PostgREST does not promise a stable row order without an explicit order clause. Across page boundaries, rows can be duplicated or omitted; the derived preflight inventory could therefore undercount related records and incorrectly claim the account inventory is complete before erasure.

## Fix

- `fetchAllRows` now orders every paged query by the selected primary-key `id` ascending before applying range offsets. All current callers select `id`, which is unique and therefore gives deterministic page boundaries.
- The existing pagination regression mock now records order calls and requires every paged query to use ascending `id`, explicitly including `subscriptions`, `projects` and `boards`. This covers the subscription-derived email-outbox count and the project/board/pin hierarchy.

## Source and commits

- Worker `backend/accountDeletionWorker.js`: blob `446961d5b9a75c1007d07e76cefef4a548b943b8`; commit `0e56a02de7839d61733c7e7389fcc7214a510361`.
- Worker regression test `backend/test/account-deletion-worker.test.js`: final blob `5882650d115a31b5b6d472db183d6771e142947e`; initial pagination regression commit `f9754ccb434852a2a2d474b353fdf9a4eacacf07`; explicit subscription-order assertion commit `36e2bec803c12aad0765116f7af266741e270587`.

## Verification boundary

Re-fetched current worker and test sources after publication; statically confirmed the query is ordered by ascending primary-key `id` before range pagination and that the regression requires ordered subscription/project/board pages. The Node worker test suite was **NOT RUN** in this session. No PostgreSQL, Storage, production database or live account deletion was executed. Runtime behavior remains NOT VERIFIED.

## Next step

Run `node --test backend/test/account-deletion-worker.test.js` in a clean local checkout. Before enabling the deletion worker in production, also require the isolated migration 010–161 replay, SQL integration suite and staging rehearsal to pass. The worker remains behind its explicit rollout gate.
