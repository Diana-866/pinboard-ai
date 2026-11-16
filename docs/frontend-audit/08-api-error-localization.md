# Frontend audit 08 — shared API fallback error localization

- Date: 2026-11-16
- Branch: `main`
- Scope: shared frontend API client's locally generated fallback errors and their relationship to the persisted interface locale.
- Nature: narrow shared-UX correction with a pure helper and regression test source. Server-provided error messages are not rewritten; only client-generated fallback messages are localized.

## Evidence

- `frontend/src/lib/api.ts` generated its own network, invalid-response and generic fallback errors in Russian.
- The interface locale is persisted by `frontend/src/i18n/i18nContext.tsx` under `pinposy_lang`, with supported locales `en`, `ru`, `es`, `pt`, `de`, `fr`, and `zh`.
- The API client is used across the app, so the Russian-only fallback could appear on any screen for a user who selected another supported interface language.

## Change

- Added `frontend/src/lib/apiErrorMessages.ts`, a pure locale-aware fallback-message resolver.
- Added English, Russian, Spanish, Portuguese, German, French and Chinese text for network-unavailable, invalid-response and generic-error cases.
- Unsupported/missing locale safely falls back to English.
- Updated `api.ts` to read the existing persisted `pinposy_lang` preference and use the resolver for the three locally generated fallback paths.
- API messages supplied by the backend remain unchanged; translating server messages requires a separate backend error-code contract and was not attempted here.

## Regression coverage added

`frontend/src/lib/apiErrorMessages.test.ts` covers all seven supported locales, missing/unsupported locale fallback and base-language normalization for locale tags.

## Commits

- `76e982d4675f38ce4aebe90ac0072e315b731814` — use locale-aware API fallback messages.
- `b4b2f8bff7803c79599e0fc1272702766e3b0f69` — add localized fallback resolver.
- `0f159a2897c1b503b0dce639d34b8df343725be7` — add resolver regression test.

## Readback and verification

All changed files plus the i18n locale-storage source were fetched again from `main`. Eight targeted static assertions passed: persisted locale key matches the i18n provider, all three API fallback paths use the helper, seven locale dictionaries exist, unsupported locales fall back to English, and tests cover supported locales.

The new test source was inspected but **not executed**. No frontend test suite, TypeScript check, production build, browser test or live API request was run. Existing GitHub Actions runner provisioning and Vercel build-rate-limit blockers remain unresolved.

## Boundaries

- Backend-provided error text may still be Russian because the backend does not yet expose a complete localized error-code contract.
- This package covers shared API fallback messages only; the full frontend audit remains incomplete.
- No backend, database, production data, payment or deployment configuration was changed.
