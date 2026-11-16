# Frontend audit 09 — profile avatar upload safety and persistence

- Date: 2026-11-16
- Branch: `main`
- Scope: onboarding/dashboard/navigation sampling and the profile avatar upload/persistence path.
- Nature: source-level review, input validation, persistence error handling, accessible feedback and regression-test source. No user profile or browser storage was accessed.

## Reviewed sources

- `frontend/src/components/onboarding/OnboardingWizard.tsx`
- `frontend/src/components/dashboard/DashboardView.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/lib/userScopedStorage.ts`
- `frontend/src/i18n/types.ts` and all seven locale dictionaries.
- `frontend/src/utils/avatarUpload.ts` and `avatarUpload.test.ts`.

## Finding FE-10 — avatar uploads were unbounded and persistence failures were silent

**Evidence before fix:**
- The avatar file input used the advisory `image/*` filter but had no runtime MIME or file-size validation.
- `FileReader.readAsDataURL()` converted the selected file into a base64 data URL stored in localStorage. Large images could exceed browser storage quotas.
- `AuthContext.updateUserAvatar()` updated React state before attempting localStorage persistence and swallowed storage exceptions. The UI could show a new avatar that would disappear after reload.
- FileReader errors/aborts were not surfaced to the user.

**Fix on main:**
- Added `validateAvatarFile()`: allow only JPEG, PNG, WebP and GIF; reject empty/unsupported files; enforce a 1 MiB maximum before reading.
- Restricted the file picker `accept` list to the same raster formats (runtime validation remains authoritative).
- Added FileReader load/error/abort and synchronous exception handling.
- Changed `updateUserAvatar()` to persist first and return a boolean. React user state changes only after successful persistence.
- Preset avatar selection now also reports persistence failure instead of silently closing the dialog.
- Added accessible `role=alert` / `aria-live=polite` feedback.
- Added localized validation/persistence messages to all seven supported UI locales.

## Commits

- `4b65c84e8988849bc33f68d53491720bae4e7d6f` — translation schema.
- `64f8b9eac70f94ca8464919a40524db2806c28ab` — English messages.
- `93ee384d9c144aaa3139308a0fb3c35cd947f0e0` — Russian messages.
- `1bdebfd783b8833ed5cd963b8fcfa37b0b7d1362` — Spanish messages.
- `fe1dc116dd61728f7df382d437ff78e353bfa7cd` — Portuguese messages.
- `b5b6f236fff972057aad71667746afde3f67b5e8` — German messages.
- `629df2fa30011a022708ec9976570c613a0ff558` — French messages.
- `2b8e0da5f60a9fa3e3f7c7cdbe161efbec726a66` — Chinese messages.
- `16d4c1a9f0e786248551c36a695258ba9c56f33e` — report avatar persistence failure from AuthContext.
- `d1a794e196de2383e049abe96dade167bb915d2a` — validation helper.
- `a0c106d6f9357ddfbefcdcf08ea915823a0217f2` — helper tests.
- `608b27f5af33f25065b1708894252eed7faa4ab0` — Sidebar validation and accessible feedback.

## Readback and verification

All twelve relevant files were fetched again from the current `main`. Ten targeted static assertions passed:
- schema and all seven locales contain the three new messages;
- only the four intended raster MIME types are accepted;
- the 1 MiB limit is present;
- tests cover valid types, invalid/empty files and oversized files;
- AuthContext persists before updating React state and reports failure;
- Sidebar validates before FileReader, handles load/error/abort/storage failure, restricts the picker and renders accessible feedback.

The new `avatarUpload.test.ts` was inspected but **not executed**. No TypeScript check, frontend test suite, build or browser file-upload test was run because GitHub Actions runners remain unavailable and Vercel reports a build-rate-limit failure.

## Boundaries and remaining work

- The 1 MiB cap limits localStorage growth but does not replace browser runtime testing across storage quotas and image decoder behavior.
- This package is a focused review of avatar upload plus sampled onboarding/dashboard/navigation components; it does not complete the frontend file-by-file audit.
- No backend, database, user account, production storage, payment or deployment configuration was changed.
