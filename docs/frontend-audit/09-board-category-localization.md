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


## Additional pass — onboarding accessibility and localized fallback states

A second focused review of `OnboardingWizard` found two user-visible issues:

- The website URL input and product description textarea had placeholders but no programmatic accessible names or associated descriptions.
- The selected plan card was visually highlighted without exposing its selected state to assistive technology.
- Inline onboarding errors were not announced in the main wizard state.
- Three fallback messages were hard-coded as Russian for RU and English for every other language: profile-refresh failure, unavailable plan price and loading state. This left ES/PT/DE/FR/ZH untranslated.

**Fix on main:**
- Associated the website field and product textarea with their translated step headings and explanatory text using `aria-labelledby` and `aria-describedby`.
- Added `role="alert"` to the main wizard error feedback.
- Added `aria-pressed` to each selectable plan card.
- Added `profileRefreshError`, `priceUnavailable` and `priceLoading` to all seven onboarding locale dictionaries and replaced the hard-coded RU/EN conditionals.
- Added `frontend/src/utils/onboardingCopy.test.ts` to verify all three messages exist for EN/RU/ES/PT/DE/FR/ZH and EN, and that non-English price fallback strings are not silently English.
- The existing frontend test command already includes `src/utils/*.test.ts`; no test script change was required.

**Commits:** locale copy `ea43db939ac33b84b56501e39d910b9285557109`; onboarding component `949f87cebcc29d20d2bc53c1453820a892ba64d0`; regression test `3fea0bfb3b9dc8b0ff24380344aef310136e2cc2`.

The component, copy module and test were re-fetched from `main`; ten targeted static assertions passed, including all seven locale dictionaries, accessible labels/descriptions, alert semantics, plan pressed state and test discovery. The test source was inspected but **not executed**. No typecheck, frontend test suite, build, browser or screen-reader test was run. Package 09 and the full frontend audit remain open.


## Supplemental email verification localization and notification owner isolation (FE-11 / FE-12)

### FE-11 — verification banner contained a Russian-only email label

A readback of the owner-fenced email verification banner found one remaining hardcoded Russian fragment beside the account email address. Added `emailVerifySentTo` to the translation schema and all seven locale dictionaries, and replaced the literal with the localized template. The banner continues to fence resend responses by authenticated owner/request generation.

Commits: schema `af74e1721da58d1228edd6ca7fb79661160edab7`; EN `ed5d8e15798d9f3272b8ad67761f9896300c0f27`; RU `8ee54e9d838757f4f828fb00e10f3b71603da1a1`; ES `069a79f43a68b19d5b492f49b1fcba17a7dedbc1`; PT `1fafd010c7fb6114b9ca353b4168e53db5fa4b4c`; DE `1560b64805a65672ed8d1e6f257e5d9e53bd5e9b`; FR `37f5c5f4c6c7d4eb1a21c11be909c25ef7c6f4b0`; ZH `300636b94d96396da4687415e6a15f8fa985fa17`; component `63b1758fef698bcda2efe722fba73984d606f10a`.

### FE-12 — notification history owner isolation verified on current main

The notification storage helper and context were re-read together. `NotificationContext` loads and saves under `pinposy_notifications:<encoded-owner-id>`, tags in-memory notifications/toasts with the owner, clears stale state when the account changes, and retires the old global `pinposy_notifications` key instead of attributing old history to the next account. The helper rejects missing owner IDs and tests cover separate keys for separate owners.

Existing implementation/test commits: `14e9b46518bfcb7582e4b04ab590df77f4f94b67` (helper), `614b08149ec4c3afa763a0d17de33770b9d625af` (tests), and `b9582025d1830bb2424bb0b381c12bedfbe0f2f7` (owner-fenced/localized email verification banner base).

All 12 related files were fetched again from current `main`; nine targeted static assertions passed for locale key coverage, removal of the hardcoded Russian fragment, owner-fenced resend, owner-scoped notification load/save, legacy-key retirement and owner-key tests. Regression test sources were inspected but not executed. No typecheck, frontend suite, browser locale/account-switch test or live resend request was run.

Package 09 remains open: these fixes cover confirmed cross-locale and account-isolation findings, not the full set of user-facing flows or accessibility requirements.
