# AUD-273 — resilient persisted-board loading and retry

Date: 2026-11-09  
Branch: `feat/persisted-boards-api`

## Finding

The boards screen treated every non-array API response as an empty array. A malformed or unexpected response could therefore look exactly like a user with no boards. The screen also had no loading state or in-product retry action, and its load effect cleared the current list on every request. The account-switch cleanup and stale-request cancellation needed to remain intact while improving retry behavior.

## Changes

- Added `mapPersistedBoards` as a focused API-to-view-model adapter. It accepts a valid empty array, handles the project relation as either an object or array, trims titles/categories, and rejects malformed response payloads/rows rather than silently presenting a partial or empty list.
- Added Node test coverage for valid mapping, project relation variants, valid empty results, non-array responses, and malformed rows.
- Added explicit loading state and an accessible live status to the boards screen.
- Added a localized retry action for load failures. Retrying does not discard the last successfully loaded list; the error banner and retry action remain visible until a successful load.
- Kept the account-isolation effect that clears prior-user boards immediately on account change and kept cancellation checks so a late response from a previous account cannot repopulate the new account's screen.
- Added loading, retry, and fallback error translations for all seven locales (en, ru, es, pt, de, fr, zh).

## Verification

- Read back all changed frontend files from the branch after updates.
- Confirmed each new translation key appears exactly once in each of the seven locale files.
- Source checks confirm the mapper is used by the API load path, malformed data is rejected, retries preserve existing boards, loading is accessible, and account-switch/stale-request protections remain.
- Frontend test command is `npm test` (runs `tsx --test src/utils/*.test.ts`); TypeScript check is `npm run lint`. Neither could be executed in this environment because there is no local checkout/Node runtime.
- GitHub Actions reports failure, but every job has `runner_id=0` and zero steps; no test command actually ran. CI is unverified, not passing. Vercel has separately reported `build-rate-limit`.
- No deployment, production database change, merge, or external service mutation was performed.

Latest branch HEAD at report creation: `133ceb0ebf195741f561dd18eaad1416b70b4ef7`.
