# Frontend audit 09 — localized board category labels

- Date: 2026-11-16
- Branch: `main`
- Scope: user-visible board category labels in `BoardsManager`, including existing persisted category values and all seven supported interface locales.
- Nature: focused cross-locale UX correction with a pure resolver and regression test source. This is a narrow package-09 finding, not completion of the remaining frontend audit.

## Evidence

- `BoardsManager.tsx` rendered `board.category` directly in every board card.
- The create/edit forms already stored canonical category values (Home Decor, Recipes, Wellness, Travel, Digital Products, Fashion) and already exposed translated labels through `t.boards.category*`.
- All seven locale dictionaries (en, ru, es, pt, de, fr, zh) contain translations for the six category labels, so the untranslated card display was an integration gap rather than missing translation content.
- Older persisted records may contain the former English display labels (for example, `Home Decor & Architecture`), so the resolver accepts both canonical and historical label variants.

## Change

- Added `frontend/src/utils/boardCategoryLabel.ts`, a pure resolver from persisted category values to the active locale's existing translation keys.
- Added case/whitespace normalization and aliases for the historical English display-name values.
- Unknown/custom category values are returned unchanged to avoid hiding user data.
- Updated `frontend/src/components/boards/BoardsManager.tsx` to render the resolved localized label rather than the raw stored value.
- Added `frontend/src/utils/boardCategoryLabel.test.ts` with coverage for all six canonical categories, six historical labels, case/whitespace normalization and preservation of custom/unknown values. The frontend test script already includes `src/utils/*.test.ts`; no test-script change was needed.

## Commits

- `de912512041726b7147421066bcc9f6edfff4bf5` — add category label resolver.
- `176ee85bb6bceb3cb8c8d2c441debe0e0861f90d` — add resolver regression tests.
- `306a5c2cf3cd1dbef615b9a045e689a4ba7e6c78` — use localized labels in board cards.

## Readback and verification

The helper, test, component and all seven locale files were fetched again from `main` after the changes. Nine targeted static assertions passed: helper import, removal of raw category rendering, resolver use, unknown-value preservation, six resolver keys, the three test coverage groups, and presence of all six category translation keys in every supported locale.

The regression test source was inspected but **not executed**. No TypeScript check, frontend test suite, production build, browser/accessibility test or live API request was run. At the latest observation, Actions runs `43934127735` and `43934127669` were queued for HEAD `16d4c1a9f0e786248551c36a695258ba9c56f33e`; the Vercel status on code commit `306a5c2cf3cd1dbef615b9a045e689a4ba7e6c78` was `failure` with target `build-rate-limit` (deployment rate limit), not a build log.

## Boundaries and next work

- This fixes one confirmed cross-locale defect in the Boards screen; it does not certify all frontend flows or all category values.
- Runtime verification remains blocked by the previously documented GitHub Actions runner provisioning issue and Vercel rate limit.
- Continue frontend audit package 09 across remaining user-facing flows and accessibility/cross-locale behavior; do not mark the full frontend audit or release readiness complete.
- No backend, database, production data, payment, Pinterest account or deployment configuration was changed.


## Supplemental profile avatar upload safety and persistence (FE-10)

A separate source pass across onboarding, dashboard, header, sidebar and profile persistence found that avatar upload accepted arbitrary `image/*` files without a runtime size/type limit. Files were converted to base64 data URLs and stored in localStorage; quota errors were swallowed after React state had already changed, and FileReader errors were not shown.

**Fix on main:**
- `validateAvatarFile()` accepts JPEG/PNG/WebP/GIF only and enforces a 1 MiB maximum before FileReader.
- File picker accept types match the validator; runtime validation remains authoritative.
- FileReader load/error/abort and synchronous failures are handled.
- `AuthContext.updateUserAvatar()` now persists first, returns success/failure, and updates React state only after persistence succeeds.
- Preset avatar selection also reports persistence failure; errors use accessible alert/live-region feedback.
- Added three localized feedback strings to all seven supported locales.

**Commits:** schema `4b65c84e8988849bc33f68d53491720bae4e7d6f`; locales `64f8b9eac70f94ca8464919a40524db2806c28ab`, `93ee384d9c144aaa3139308a0fb3c35cd947f0e0`, `1bdebfd783b8833ed5cd963b8fcfa37b0b7d1362`, `fe1dc116dd61728f7df382d437ff78e353bfa7cd`, `b5b6f236fff972057aad71667746afde3f67b5e8`, `629df2fa30011a022708ec9976570c613a0ff558`, `2b8e0da5f60a9fa3e3f7c7cdbe161efbec726a66`; AuthContext `16d4c1a9f0e786248551c36a695258ba9c56f33e`; helper `d1a794e196de2383e049abe96dade167bb915d2a`; tests `a0c106d6f9357ddfbefcdcf08ea915823a0217f2`; Sidebar `608b27f5af33f25065b1708894252eed7faa4ab0`.

All twelve relevant files were re-fetched from current `main`; ten targeted static assertions passed for locale coverage, MIME/size validation, FileReader error handling, persist-before-state behavior and accessible error feedback. The new avatar helper tests were inspected but **not executed**. No typecheck, frontend suite, build or browser file-upload test was run. The 1 MiB limit reduces localStorage pressure but does not replace runtime testing across browsers and storage quotas.

This is an additional package-09 finding; package 09 and the full frontend audit remain open.
