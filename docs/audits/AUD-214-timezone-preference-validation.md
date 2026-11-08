# AUD-214 — Validate persisted timezone preferences before scheduling

Date: 2026-11-09  
Scope: Frontend IANA timezone preference and scheduled publication conversion.  
Repository: `Diana-866/pinboard-ai`  
Branch: `feat/persisted-boards-api`

## Finding

The browser timezone preference was trusted without validation. `getDefaultTimezone()` returned any non-empty value from `localStorage`, and `saveUserTimezone()` persisted arbitrary strings. A stale value, browser extension, manual storage edit, or malformed preference could therefore reach `Intl.DateTimeFormat` in the calendar and schedule conversion. Invalid IANA identifiers throw `RangeError`, potentially preventing calendar rendering or scheduling.

The scheduling flow already converts a local date/time using `localDateTimeToDate(date, time, timezone)`, which calculates the offset for the target date. That date-aware behavior is important around daylight-saving transitions and is preserved.

## Changes

1. Added `isValidIanaTimezone(value)` in `frontend/src/utils/timezone.ts`. It validates a non-empty string with the runtime's IANA timezone support.
2. `getDefaultTimezone()` now:
   - returns a saved timezone only if it is valid;
   - removes an invalid saved preference;
   - accepts the browser-detected timezone only if valid;
   - otherwise falls back to Moscow for Russian language or UTC for other languages.
3. `saveUserTimezone()` now ignores invalid identifiers and stores a trimmed valid value.
4. Added `frontend/src/utils/timezone.test.ts` covering valid/invalid zones, corrupted localStorage recovery, safe persistence, winter/summer DST conversion for London, and rejection of a nonexistent spring-forward wall-clock time.

## User impact

If a broken timezone value is stored in the browser, PinPosy recovers to the browser's valid timezone instead of leaving the calendar in a broken state. Invalid values cannot be written back through the preference helper. Scheduling still interprets the chosen local date/time using the timezone offset on the actual publication date, not today's offset.

## Validation

- Source and test files were re-fetched from the branch after the changes.
- The test suite, TypeScript lint, and Vite build were not run because this environment has no local checkout or installed dependencies. The tests are added but not claimed as passing.
- No production database, Pinterest API, deployment, or merge operation was performed.

## Commits

- `9b6971d9a39f2ff09847fd045719dbed33b3887c` — validate persisted timezone preference
- `801ef7d161a11542aa575f9e1bc68ad12879cda4` — timezone regression tests
