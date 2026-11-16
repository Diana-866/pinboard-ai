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


## Additional pass — accessible authentication error feedback

A focused review of the public authentication lifecycle found that error messages on registration, login, forgot-password, reset-password, verification-email resend and email verification were rendered visually but not consistently announced to assistive technology.

**Fix on main:** added `role="alert"` to the error message containers in:
- `frontend/src/pages/Register.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/ForgotPassword.tsx`
- `frontend/src/pages/ResetPassword.tsx`
- `frontend/src/pages/CheckEmail.tsx`
- `frontend/src/pages/VerifyEmail.tsx`

**Commits:** `41dca2b53243c782879bfecc7347d1374ea8ce79`, `760513e8527ca6dac652cd636b16b2c269504f23`, `4ee0aa1954a54b08497d9b038ea94e15099bdc0b`, `8ce691456ec0661f80b03ff018f3f4c17df3e3f7`, `3457433123fd0c9462f2becf19a391552f60129c`, `e7ef6fb0e56671a286ba74988d26410161161ed7`.

All six files were fetched again from `main`; six targeted static assertions confirmed alert semantics. No automated test, typecheck, browser or screen-reader run was executed. This improves announcement semantics only; it does not establish complete WCAG conformance or runtime correctness. Package 09 remains open.


## Supplemental authentication form localization (FE-13)

A focused pass over the login and registration forms found that the email field label was hard-coded as English `Email`, even though the shared translation schema already provides `t.email` and the password/reset forms use translated labels. Replaced both labels with `t.email` so the existing seven locale dictionaries supply the visible label. Existing login, registration, forgot-password and reset-password error blocks expose `role=alert`; their email/password inputs are associated with labels.

Commits: Login `c59619ecf9eeb9efbae1a6e6ef41f9be38ef1e65`; Register `34599433cc6faed3c978325a62f56d68a34661b8`.

Both changed pages were re-fetched from `main`; static assertions confirmed each email input uses `t.email` and neither page retains the hard-coded English label. No browser, keyboard-only or screen-reader test was run. Package 09 remains open.


## Supplemental authentication keyboard accessibility (FE-14)

A focused keyboard-accessibility review of the login and registration pages found that both password visibility controls set `tabIndex={-1}`. This removed a useful form control from normal keyboard navigation, so keyboard-only users could not toggle password visibility.

**Fix on main:**
- Removed the negative tab index from both controls so they participate in normal tab order.
- Added a localized `aria-label` using the existing show/hide copy, `aria-controls="password"` to associate the control with its input, and `aria-pressed` to expose the current visibility state.
- Added `frontend/src/utils/authPasswordToggleAccessibility.test.ts`, a source-contract regression test for both pages. The existing `frontend/package.json` test glob already includes `src/utils/*.test.ts`.

**Commits:** Login `dedd6a5e3b89aedca279d025a5a918627434212a`; Register `a5e457083cbd47b2d89dc2eaefb7be746641efd3`; regression test `f81ba4f165c74db1e4a2b792783234b53e6f340f`, corrected selector `133e67741c92000364ddde6ba83f24e319e47b71`.

The two pages, regression test and package script were re-fetched from current `main`. Five targeted static assertions passed for keyboard tab order, accessible label, control association, pressed state and inclusion in the existing test glob. The regression test source was inspected but **not executed**; no typecheck, full frontend test suite, browser keyboard test or screen-reader test was run. Package 09 and the full frontend audit remain open. No backend, database, production data, payment, Pinterest account or deployment configuration changed.


## Supplemental notification isolation, email verification and review keyboard accessibility

### FE-14 — persisted notifications were shared between authenticated users

`NotificationContext` previously read/wrote one browser-local `pinposy_notifications` key without an owner identity. The notification provider was also outside `AuthProvider`, so it could not scope history to the signed-in account. A second user signing in in the same browser could see the previous user's notification titles/messages.

**Fix on main:** moved `NotificationProvider` inside `AuthProvider`; it now reads/writes `pinposy_notifications:<encoded-owner-id>`, validates persisted notification records before rendering, hides state whose owner differs from the current user, and retires the old unscoped key. Delayed task timers and review-queue error events are fenced by owner ID and an owner-generation counter, so an A→B→A switch cannot apply an old timer to the new session. Notification error copy and task timestamps now use locale dictionaries.

Added `notificationStorageKey.ts` and tests for stable per-owner keys, isolation between users and rejection of empty owners.

### FE-15 — email verification banner was partially Russian-only and success was not announced

The banner's heading, resend control, destination label and errors now use localized settings copy across all seven locales. It owner/request-fences resend responses, announces success through `role=status`/`aria-live`, announces errors with `role=alert`, and marks both controls as buttons with explicit type.

### FE-16 — review keyboard shortcuts could steal arrows from interactive controls

The review desk's global arrow shortcuts previously ignored only input/textarea/select. They could intercept arrows while a button/link/contenteditable control was focused and repeated keydown could trigger multiple decisions. The desk now ignores repeated and modified key events and skips editable/interactive targets. The review area exposes a labeled region, visible keyboard focus and `aria-keyshortcuts="ArrowLeft ArrowRight"`.

### Commits from this supplemental pass

- `7978223558d02ae9b554c0e3bde59e4c406b8975` — email verification and notification i18n schema.
- `22ded8f4cb615efdf607f52b2c7a89c33acc632b`, `710cbd8f7bb3cf8c6f2c67505e27ab04c86f1d57`, `2e7e21f037054f852e924e50f23abbe79f5be3b5`, `461f840446e6c360f79ff39f0a23a4a7852734f4`, `1716a1e981241a1344b5d18e8c2736348da7b670`, `31161f41a15589ebd0960a1c25f6f40f2b28dd4d`, `894e11411294a21fc644ab2932c530da575fb975` — seven locale dictionaries.
- `b9582025d1830bb2424bb0b381c12bedfbe0f2f7` — email verification resend owner fence and localized messages; `d785f2a1aabbc4d73de8c26f3741064d7f1a875d` — accessible success/dismiss behavior.
- `14e9b46518bfcb7582e4b04ab590df77f4f94b67` — owner-scoped notification key helper; `614b08149ec4c3afa763a0d17de33770b9d625af` — helper tests; `dad3aaa2da4f2c05fd70fda0cde41402d3dc90ba` — notification provider owner isolation/localized messages; `0f364e07a724296bac8d381d5788e7afab9d1658` — provider nesting under AuthProvider.
- `119587c602bba7fb5b322e5378cb40d0c30ca74e` — review keyboard shortcut focus guard and accessible region.

### Supplemental readback

After changes, 16 static assertions passed across NotificationContext, owner key helper/tests, App provider order, EmailVerifyBanner, ManualApprovalDesk and translation schema. Seven locale files were re-fetched; all seven contain every new email-verification and notification key. No frontend test, typecheck, build, browser multi-user notification test, keyboard-only test or screen-reader test was executed.

**Still open:** active `ManualApprovalDesk` contains numerous hard-coded Russian control labels and fallback alerts/status messages. Demo pin text is sample content; actual action/error UI should be localized in a later focused pass. Legacy `AuthModal.tsx` and `SwipeReviewModal.tsx` were not changed because current `App.tsx` does not render them. Package 09 and the complete frontend audit remain open.

## Additional pass — localized mobile navigation accessibility label

The mobile navigation toggle in `Header.tsx` used the hard-coded English accessible name `Open navigation menu`. Added `nav.openNavigationMenu` to the typed translation schema and all seven locale dictionaries (EN/RU/ES/PT/DE/FR/ZH), then switched the button to `t.nav.openNavigationMenu`.

**Commits:** translation schema `b2431ac04d144c52392854591166ec5ab3fc6ceb`; EN locale `a3dd8939282c3dccc41d4a6c3fa723fe64383c0d`; RU `f61e9a2177721aabe6aa7cef3462af1d2acf6732`; ES `a3e72f7138a477eb03d5a927999723374bf54757`; PT `17ff73840ae4802cfb96c21f046b67ad0c582d2a`; DE `b7c7986b6c9cbcd8272b6a0003c975b9b9481d2d`; FR `a295b3d2c0542b578a56abba9bca471de024a8d4`; ZH `baa124172b8dff04271d89e52d56de8376947a3c`; component `6d17e4208f46ae4fbc56f33f26018326bb18d1cd`.

The schema, all seven locale files and `Header.tsx` were re-fetched from `main`; all eight declarations and the component binding were confirmed. No test, typecheck, build or browser/screen-reader run was executed. Package 09 remains open.


## Supplemental password visibility accessibility and translation typing (FE-14)

The login password visibility toggle was removed from the tab order with `tabIndex={-1}`, so keyboard-only users could not reach it. A concurrent accessibility patch added `aria-label`, `aria-controls` and `aria-pressed`, but referenced `t.hide` / `t.show` even though the typed translation schema exposes no top-level keys with those names.

**Fix on main:** the toggle is now keyboard reachable, exposes its controlled password field and pressed state, and uses `t.common.show` / `t.common.hide`. Added typed `common.show` / `common.hide` keys to the schema and all seven locales.

Commits: accessibility control `dedd6a5e3b89aedca279d025a5a918627434212a`; schema `a8ef1bd12f51e4144b1fcd63e45183b3682190da`; EN `1cbc44b75a659b98ab046ca1020187977dbc8edb`; RU `876d4cecb5c227eec5d44b69f7421123a8e23e0e`; ES `1e03027c70d897b8bc7f7c48373cfe89e95e5f0e`; PT `0dd4a0e2e75a998831344837a50d5a369599fc68`; DE `3c90a14873916cb562270d751039f883cb04922e`; FR `a8772ae0ff0f78156119c56fda525d302c820324`; ZH `3fd399924cacba5523fc2beb032bf60c05db79f7`; Login typed-label correction `d30768512b154a002b35d179734faded81c6b62f`.

All eight changed files were re-fetched from `main`; four targeted assertions passed for schema, all locales, typed label usage, keyboard reachability and pressed/controls semantics. No typecheck or keyboard/screen-reader runtime test was run. Package 09 remains open.


## Additional authentication form accessibility corrections

### FE-17 — password visibility controls were removed from keyboard navigation

The Login and Register password visibility buttons had `tabIndex={-1}`, preventing keyboard-only users from reaching them. Both controls are now in the normal tab order and expose a localized accessible name, `aria-controls="password"`, and `aria-pressed`. Added `frontend/src/utils/authPasswordToggleAccessibility.test.ts`; its assertion accepts the shared or page-level localized show/hide copy used by the respective pages.

Commits: Login `dedd6a5e3b89aedca279d025a5a918627434212a` (subsequent localization refactor on main retains the accessibility attributes); Register `a5e457083cbd47b2d89dc2eaefb7be746641efd3`; test `f81ba4f165c74db1e4a2b792783234b53e6f340f`; selector correction `133e67741c92000364ddde6ba83f24e319e47b71`; shared-copy assertion update `0c542bbd53c319738b67ede5b6b1d742340f20d7`.

### FE-18 — registration password mismatch was not programmatically associated with its field

When the confirmation password differed from the original, the page displayed a visual message but did not expose invalid state or associate the message with the input. The confirmation input now sets conditional `aria-invalid` and `aria-describedby`; the localized mismatch message has a stable ID and `role="alert"`. Added `frontend/src/utils/registrationPasswordValidationAccessibility.test.ts`.

Commits: Register `8a17b7b7a21d2ce2d2829da469d6d0cfeadefb2a`; regression test `16efca6a07295f70d82e506ade18041433b0afdd`.

**Readback:** both current page files, both regression tests and `frontend/package.json` were fetched again from `main`. Seven targeted static assertions passed, covering keyboard reachability, accessible name/state/control association, invalid-state/description semantics, alert announcement, localized message and inclusion in the existing test glob. Neither regression test was executed. No typecheck, full frontend suite, browser keyboard or screen-reader run was performed. These are source-level corrections only; package 09 and release readiness remain open.


## Supplemental review-queue error and regeneration localization (FE-19)

The active `ManualApprovalDesk.tsx` still displayed hard-coded Russian guard messages, approval/rejection failures, bulk scheduling outcomes and AI regeneration status to users in other interface languages. The component already had typed review-copy entries for these messages in EN/RU/ES/PT/DE/FR, but the Chinese locale's `review` object lacked the corresponding entries.

**Fix on main:**
- Replaced the targeted hard-coded Russian guard, persistence, bulk outcome, image-replacement and regeneration error/status messages with existing `t.review.*` translations.
- Added the 18 required review messages to the Chinese locale so no supported locale renders `undefined`.
- Extended `reviewQueueCopy.test.ts` to require every used review message in all seven locales and to validate the `{count}`, `{saved}` and `{total}` placeholders. Corrected the placeholder regexes so they match literal braces rather than escaped backslashes.

**Commits:** component `c176890ba5f2db2eb39ebb26b4ad55f7b5e8fa40`, remaining Pinterest guard `50a74e7e426e28cf83d1d96fb381ed7be9f3f7db`, Chinese locale `e9bd1d2ee8f6e63bc7685223f2024a7fe69c28a6`, test expansion `a1d461a9d244e56b732aef0f2f72f06742123513`, placeholder assertion correction `0fe1c50a57b112e48bd4e1d4f22bd434e0fe6181`.

**Readback:** active review component, regression test and all seven locale files were fetched again from `main`. Eleven targeted static assertions passed: all 18 keys are referenced in the component, present in each locale and covered by the test; the three dynamic placeholders are checked; targeted Russian error/status literals are removed. The test source was inspected but **not executed**. No typecheck, full frontend suite, browser, keyboard or screen-reader test was run. Other Russian hard-coded review-screen labels and explanatory text remain a separate follow-up; this pass covers action guards, errors and regeneration status only. Package 09 and release readiness remain open.


## Supplemental account isolation and dashboard keyboard access (FE-20 / FE-21)

Two additional active-frontend changes were found on `main` and verified against their current source files:

- **FE-20 — review desk account isolation:** `App.tsx` now keys the active `ManualApprovalDesk` by `user?.id || 'anonymous'`. Switching authenticated owners therefore remounts the review desk and resets its component-local decision/edit/selection state rather than carrying it into the next account. Commit: `173eb0dc607eacd5369dbb7836b66339610caf16`.
- **FE-21 — dashboard board-card keyboard access:** clickable board summary cards in `DashboardView.tsx` are native `button type="button"` elements, retain the board navigation action, and expose a visible `focus-visible` ring. A source regression test asserts native button semantics, keyboard focus styling and absence of the former clickable-div pattern. Commits: implementation `f08d53d1c4eb55037de70c173e9cb8111406b49a`; test `08469db66364690928ac2cfc36e1f0678ff2aa3f`.

**Readback / checks:** re-fetched the active `App.tsx`, `DashboardView.tsx` and `dashboardAccessibility.test.ts` from `main`. Targeted source assertions confirmed the owner key, native button, retained navigation callback, focus-visible style and regression-test coverage. The frontend test command, TypeScript check, build, browser keyboard test and screen-reader test were **not executed**. These source-level checks do not close the DB/runtime gate or certify full WCAG conformance. No production data, backend, DB, payment, Pinterest account or deployment settings were changed.

## Supplemental cross-account safety, review queue copy and dashboard accessibility (2026-11-16)

### FE-19 — stale profile refresh could overwrite a different authenticated session

AuthContext.refreshUser() now captures both a monotonically increasing request ID and the token used for that request. It applies /me and preferred-language responses only while both still match; logout invalidates in-flight refreshes. The authenticated app shell is keyed by user.id, clearing all view-local state when a different account signs in. OnboardingWizard also fences completion/error/finish callbacks by the owner ID captured when the action began.

Commits: AuthContext 6af7f1941eb0c9b7bce361ed08934a3a77f6b991; helper 5d76384c48a3f26f3964f137ea6e6a9383fa219f; helper tests ca3c13c878634daa23769655e83b7a8e155e901b; app shell 760da8ef138151eb7ad7f8f20c0df319dca14aa7; onboarding owner fence a0cf45638d8013101e13ee926fb9f6b009a12e7c.

### FE-20 — review queue exposed a fictional account and a dead reset action

Removed the unused 15-pin demo queue containing the fictional @botanica_nordic account and removed the “restore 15 pins” action whose handler only cleared the local queue. The review header now uses a neutral localized description and localized queue count. Saved-pin loading/error/retry copy and the manual-review submission button idle/saving/success states in PinGenerator.tsx now use the typed locale dictionary.

Commits: review queue cleanup 81b414b0460c7c6bd43cc163bccc341dd92c66f1; locale commits EN 2d0197be25d8467618bb51c51348074033eb3e9b, RU 746038f2ce59054b84b89e1c96103a7e5334d7df, ES dc6a1e0f3f58199a23069a43588c19b4bd25d42d, PT df993b59c4dd27bd07c8c31218f979d4141b1881, DE 3c89697a2b31a812dd5cf125b3833ecb2d0979b9, FR 4880446bb041a190b2503db0bf7cbe647a97ca1f, ZH 0554f273ff03658674d4ccbbaf7e1c2c0324d8cd; generator component a9f6a4629a06458a02f91cca1f9ddb4e8cfef2f2; locale regression test f480510f80d31a5735369e188114b4b53f01aedf.

### FE-21 — dashboard board cards were mouse-only click targets

Converted dashboard board rows from clickable div elements to native button type=button controls, with visible keyboard focus styling and phrasing-only child elements. Added a static accessibility regression test.

Commits: component f08d53d1c4eb55037de70c173e9cb8111406b49a; test 08469db66364690928ac2cfc36e1f0678ff2aa3f.

### Readback and remaining work

All relevant changed files were fetched again from main. Twenty-two targeted static assertions passed across auth refresh fencing, app remount, onboarding owner checks, review/demo removal, all seven locale dictionaries, generator statuses and dashboard button semantics. The new tests are included by the existing src/utils/*.test.ts frontend test glob but were not executed. No TypeScript check, frontend suite, production build, browser multi-account test, keyboard-only run or screen-reader test was performed.

Still open: the active manual-review desk's controls and fallback messages have since been localized in all seven locales (see supplemental FE-22 below); the generator still contains other Russian-only errors/statuses outside the saved-pin/review subset. Continue the cross-locale pass before closing package 09. No backend, database, production data, payments, Pinterest account or deployment setting changed.


### FE-22 — notification history isolation, verification banner and review desk localization

- `NotificationContext` was moved inside `AuthProvider` and now stores notification history under an owner-specific key (`pinposy_notifications:<encoded-user-id>`). Persisted rows are validated before use; state from another owner is hidden; old global key is retired; delayed task timers and review-queue error events are fenced by owner generation. Notification messages use typed locale copy.
- `EmailVerifyBanner` now localizes heading, destination, resend state and errors across all seven locales; resend response is fenced by owner/request generation. Success/error announcements use status/alert semantics.
- `ManualApprovalDesk` remaining controls, field labels, loading/empty states, image regeneration prompts and action fallbacks are now localized across all seven locales. Current source scan found no remaining Russian user-visible strings (only one Russian code comment). The component is keyed by `user.id`, resetting selected Pinterest account/board and local review state on account switch. Keyboard shortcuts ignore repeat/modifier keys and interactive/editable targets; the review area exposes a labeled region, visible focus and `aria-keyshortcuts`.
- Added notification storage key helper/tests and the typed locale keys. All 42 review desk keys were checked in EN/RU/ES/PT/DE/FR/ZH.

Commits: i18n schema `7978223558d02ae9b554c0e3bde59e4c406b8975`; locale commits `22ded8f4cb615efdf607f52b2c7a89c33acc632b`, `710cbd8f7bb3cf8c6f2c67505e27ab04c86f1d57`, `2e7e21f037054f852e924e50f23abbe79f5be3b5`, `461f840446e6c360f79ff39f0a23a4a7852734f4`, `1716a1e981241a1344b5d18e8c2736348da7b670`, `31161f41a15589ebd0960a1c25f6f40f2b28dd4d`, `894e11411294a21fc644ab2932c530da575fb975`; email banner `b9582025d1830bb2424bb0b381c12bedfbe0f2f7`, accessible success `d785f2a1aabbc4d73de8c26f3741064d7f1a875d`; notification key helper/test `14e9b46518bfcb7582e4b04ab590df77f4f94b67` / `614b08149ec4c3afa763a0d17de33770b9d625af`; NotificationContext `dad3aaa2da4f2c05fd70fda0cde41402d3dc90ba`; provider order `0f364e07a724296bac8d381d5788e7afab9d1658`; review desk localization `04d97dddec3294e007ac663f593f18beb5264c66`; user-keyed remount `173eb0dc607eacd5369dbb7836b66339610caf16`; Chinese review locale completion `abce40fa9a0fb682e4a4efe8e822085138d980a7`.

Readback: 13 static assertions passed across review desk, provider order, NotificationContext, owner-key helper/tests, EmailVerifyBanner and accessibility semantics; 42 review keys are present in each of seven locales. No test, typecheck, build, browser multi-user notification test, keyboard-only or screen-reader test was executed.

### FE-23 — complete review component locale-key regression coverage

The active `ManualApprovalDesk.tsx` uses 53 distinct `t.review.*` keys. The existing locale contract test previously covered only a subset, so future missing labels could pass unnoticed. Expanded `reviewQueueCopy.test.ts` to assert every one of the 53 keys used by the component across EN/RU/ES/PT/DE/FR/ZH, while retaining explicit placeholder checks for queue count and bulk progress.

The underlying full review-control localization is present in commit `04d97dddec3294e007ac663f593f18beb5264c66`; Chinese review copy was completed in `abce40fa9a0fb682e4a4efe8e822085138d980a7`. Test coverage expansion: `7088c31c21ff194176bb7d5cecab5147bc6e4c9d`.

Readback confirmed all 53 component keys are present in all seven locale dictionaries and all 53 are covered by the test. Ten targeted static assertions passed. The test source was inspected but **not executed**; no typecheck, full suite, browser or screen-reader verification was run. Package 09 remains open.

### FE-22 — generation recovery statuses were not localized consistently

The generation recovery panel previously used mixed inline language branches and RU/EN-only status labels, so users of ES/PT/DE/FR/ZH saw partial English copy. Added 14 typed recovery-copy keys for the section title/accessible label, loading/check actions, explanatory no-credit statement, completion count, five request states, saved-pin navigation, unavailable-board state and dismissal. All seven locale dictionaries now provide the keys. The component uses the typed strings instead of inline language conditions.

Commits: typed schema + PinGenerator + regression test 85624470e798f7d5f0454b555dbb767ce5d3959c; EN 6aab0d0b217830baa181445fa708985123957dde; RU 097fde57271d1720974b30ed71af0923e46b565e; ES d0a7712e322d92c039160301c53c9da5abf1f4e0; PT da5bb32ce17a80bf6cb79f98736ff5faee70f492; DE b0b093385558697c0dcaac5a50e37abc2e89807a; FR 5c2b43d91edcfd619a207a3180636167f87832d9; ZH 00dcfbb6d85064064715570549b0f530a9d1652e.

Readback: 11 files (schema, PinGenerator, test, package script, seven locale dictionaries) were fetched from main. Eighteen targeted static assertions passed, including no inline RU-only conditional in the recovery panel and non-empty translations for every recovery key in all seven locales. The test was not executed; no frontend typecheck/build/browser test was run.

The generator scheduling/aspect-ratio/error copy was subsequently resolved in FE-24; the dashboard board navigation card was made keyboard accessible in FE-21. Package 09 remains open for broader remaining user-facing flow and accessibility review; no runtime gate is implied.

### FE-24 — generator validation, scheduling and review fallbacks are now localized

Replaced the remaining user-facing Russian/English fallback literals in PinGenerator with typed generator copy: required topic, untitled pin, aspect-format save failure, description-save guards before scheduling/review, destination-account mismatch, missing internal board, unavailable/adjusted schedule time (with {time} interpolation), review-queue reason/failure and calendar-saving state. Added values to EN/RU/ES/PT/DE/FR/ZH. The 14 recovery-state keys from FE-22 and the saved-pin/review action keys remain present in every locale. Removed an unused Russian desc property from the aspect-ratio metadata; it was not rendered. Current source scan finds only Russian keyword-matching literals and code comments, not user-visible Russian UI copy in PinGenerator.

Commits: generator type keys ba1461d43c6bccbab389e671cd8b2a23addf9e4b; PinGenerator action-copy binding b44243d9fe1718cc61e36e6be3eef454d7f4946b; locale contract test 2857efa84b89c2c597a9da3f4fa711521ce421d1; EN 48a714e1f9adab7602a7bd1399d0a3742245380c; RU da95077578e3851e432e43387dc31cedefba5552; ES 722220bb7b4caa36ab18a011cb82597ea4f44f84; PT 1aede6550a852d082cebd1f278cdc5c72998fc8b; DE b9ab933444d7b223011ea4caa2092dcf4e86e232; FR 6a465cee0cfd3c7c2dffeccb8fcb90d04a5af0ad; ZH aaf84b452eb4e09844a90040ba6c267c8d9df5bf; unused metadata cleanup c82a64e1f265378a9c78d70c4df0fbf59cc11dc8.

Readback: PinGenerator, TranslationSchema, reviewQueueCopy.test.ts and all seven locale files were fetched from main. Fourteen targeted static assertions passed: all 15 generator fields exist in the schema and each locale; all 12 action bindings exist in PinGenerator; no Russian scheduling/validation fallback literals remain; the locale test checks all keys and the {time} placeholder. Test source was inspected but not executed; no TypeScript check, full test suite, build, browser or screen-reader run was performed.

**Correction to earlier open notes:** the active ManualApprovalDesk is now fully localized across seven locales (FE-19/FE-23), and PinGenerator's saved-pin, recovery, validation, scheduling and review action copy is now localized (FE-22/FE-24). These two cross-locale subitems are resolved at source level. Package 09 remains open for broader remaining user-facing flow and accessibility review; no runtime gate is implied.

## FE-25 — plan-locked section overlay was Russian-only

The active LockedSection wrapper is rendered around the authenticated app's main content. Its lock title, explanation and pricing CTA were hard-coded in Russian, so users in EN/ES/PT/DE/FR/ZH received Russian copy despite the app's seven supported locales. The overlay also lacked a programmatically labelled region/live announcement.

**Fix on main:**
- Added a typed lockedSection translation group with title, description and viewPlans.
- Added complete copy in EN/RU/ES/PT/DE/FR/ZH. The explanation distinguishes plan-gated areas from Analytics, which remains available under the current plan.
- Replaced the three Russian literals in LockedSection.tsx with the typed dictionary.
- Added a labelled section with aria-labelledby and aria-live=polite; retained the native pricing button and existing navigation callback.
- Added frontend/src/utils/lockedSectionLocalization.test.ts to enforce the schema contract, non-empty values in all seven locales, typed component bindings and accessible region semantics.

**Commits:** schema 87fb24e55e062b693fcc4927ec5154a4d398f7fa; locale commits EN e9e991d0ee5ced93349e66d25281b1efea797fd8, RU 23d3927c250db981be470cffcb7806574272f58d, ES 1e2d8ce20b233bc1453be4ef8ccc26328c1d1c4a, PT 0ebae927e22fa7da3ed090cb8fdb68b6261ce8e6, DE b47fd8cb2b81a6b25445448312b4340eebaa688c, FR 1076123542a096fb3ad1d108515a28c989309ecf, ZH b0e503087c98acd00ae7518a6db23770a16b6545; component a65a7f459f692f1c8ae239588fdebad2b60a9293; regression test cebbe9ca537dd51349876f4e757db1f0efbc12fe.

**Readback / checks:** all ten changed source/test files were fetched again from current main. Twelve targeted source assertions passed: typed schema, three component bindings, labelled live region, absence of former Russian UI strings, all three non-empty translation values in each of seven locales, and regression-test coverage. The regression test source was inspected but NOT executed. Latest Actions runs for the test commit, 43940229730 (postgres-atomicity job 133555483026) and 43940229160 (backend 133555481123, frontend 133555481704), failed before runner allocation: all jobs report runner_id=0, empty runner name and zero steps. No frontend test, typecheck, build, SQL replay or backend test started. No browser, keyboard-only or screen-reader run was performed.

This closes only the source-level localization/accessibility issue in the plan-locked overlay. Package 09 remains open for the remaining active screens and full frontend/runtime checks. No backend, database, production data, payment, Pinterest account or deployment setting changed.
## FE-26 — strategist status falsely implied a live AI connection

FloatingStrategistBot's active UI displayed an Online/En línea/На связи status badge, but source inspection shows it is a local demo assistant: messages are canned, navigation is selected by getDemoNavigationTarget, and account summary values are read from props. The component does not call the AI/backend API. The amber indicator comment already described this as a demo, so the badge contradicted the implementation and could mislead a new user.

**Fix on main:** changed the existing typed bot.statusBadge value in all seven locales to an explicit demo label (EN Demo, RU Демо-режим, ES Modo demo, PT Modo de demonstração, DE Demo-Modus, FR Mode démo, ZH 演示模式). Added frontend/src/utils/botDemoDisclosure.test.ts to check that the component uses the typed badge, retains its demo navigation/account-summary behavior, does not add a live API request, and all seven locales disclose demo mode.

**Commits:** EN 7f15ab2a1eaea439522d13f93b4f567a661f08cc; RU ed4a6bd6cdcdda83c852af56925fefc902902668; ES 76a9c737ee5090e8c4e3234e91115f30947eac3d; PT 42b639b264e75ef1982693bf4f1bfa9b7da91c74; DE 0b423020d6ff20391069bced7d88234356f68b14; FR 4fc690cb5d42e6b83fd66a89939b9458975b070a; ZH 6f5cb02c3a68f41019d29112a28146eada241bd4; regression test 4556683c2540b5513ddc490d29d8de2d196ca2f5.

**Readback / checks:** re-fetched FloatingStrategistBot, the new test and all seven locale files from main. Eleven targeted source assertions passed: typed status binding, demo-only navigation/account-summary logic, absence of live API calls, test presence, and exact localized demo labels in all seven dictionaries. Test source inspected but NOT executed. Latest Actions runs 43940507484 (frontend job 133556452273, backend 133556452724) and 43940506056 (postgres-atomicity job 133556446415) failed before runner allocation; all jobs have runner_id=0, empty runner name and zero steps. No frontend/backend/SQL tests, typecheck or build started. No runtime browser/screen-reader verification was performed.

This corrects a user-trust disclosure only; it does not turn the demo helper into a live AI service. Package 09 remains open, and the mandatory DB/runtime gates remain open. No backend, database, production, payment, Pinterest or deployment settings changed.