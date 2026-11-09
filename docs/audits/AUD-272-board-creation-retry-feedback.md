# AUD-272 — reliable, localized board creation feedback

Date: 2026-11-09  
Branch: `feat/persisted-boards-api`

## Finding

The Boards Manager closed its create dialog immediately after invoking the asynchronous save callback. The API request could still be in flight, and when it failed the form had already been dismissed. The parent callback displayed a browser alert but swallowed the error, so the form could not preserve the entered title or present an inline retry path. The form labels, placeholder, categories, and saving state were also hard-coded in English despite the application's seven supported interface locales.

## Changes

- The create form now awaits the persistence callback and closes only after it resolves successfully.
- While saving, duplicate submission and dismissal are disabled; the submit button communicates the saving state.
- A failed save remains in the dialog with an inline accessible alert and preserves the entered title/category for retry.
- Added dialog semantics (`role=dialog`, `aria-modal`, and an accessible title) and a 100-character title limit matching the backend API.
- The App callback now validates the projects response, verifies a project ID exists, verifies the board API returned a persisted ID, and propagates failures instead of swallowing them.
- Successful creation inserts/replaces by persisted server ID and clears the board-load error.
- Added typed localized copy for the title label/placeholder, category label/options, saving state, and fallback error in English, Russian, Spanish, Portuguese, German, French, and Chinese.

## Verification

- Read back all 10 changed frontend source/translation files after the updates.
- Verified each of the seven locale files contains every new key exactly once and the translation schema declares each key exactly once.
- Verified by source inspection that the UI awaits persistence, retains the modal on failure, disables submission while saving, and the parent validates API response IDs and rethrows failures.
- Frontend package scripts expose `lint` (TypeScript no-emit) and `test`; this environment has no local Node runtime/repository checkout to execute them.
- Latest PR HEAD: `8b112ff576b18846e83aa7e59b3778ebf88eacf2`. The latest GitHub Actions workflows report failure with `runner_id=0` and empty step arrays, meaning no runner executed the test commands. Vercel's existing status is `build-rate-limit`. CI is therefore unverified, not passing.
- No deployment, production database change, merge, or external service mutation was performed.
