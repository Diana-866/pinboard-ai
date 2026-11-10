# AUD-219 — Localize Pinterest reauthorization recovery guidance

## Finding

The Pinterest reauthorization state and recovery action introduced in AUD-218 were visible in all interface languages, but the explanatory sentence was hard-coded in Russian inside `PinterestCard.tsx`. Users with English, German, Spanish, French, Portuguese, or Chinese UI would therefore see mixed-language settings during an account recovery flow.

## Changes

- Added `pinterestReauthDescription` to the shared settings translation type.
- Added translated values to all seven supported locale dictionaries: ru, en, de, es, fr, pt, zh.
- Replaced the hard-coded sentence in `PinterestCard.tsx` with `t.settings.pinterestReauthDescription`.

## User impact

When Pinterest access needs to be reauthorized, the warning and its explanation now follow the selected interface language. The reconnect action and account-safety behavior remain unchanged.

## Validation limits

- Re-fetched each changed locale, type, and component after the edits.
- Confirmed the new key exists in all seven locale dictionaries and the translation type.
- TypeScript compilation, frontend tests, and lint were not run in this environment.
- No Pinterest API calls, production database writes, deployment, or merge were performed.
