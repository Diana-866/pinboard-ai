# AUD-381 — calendar interactions and daylight-saving-time edge cases

**Date:** 2026-11-11  
**Status:** source audit complete; no production changes  
**Scope:** month-grid interactions, timezone preference propagation, wall-clock conversion, DST gaps/folds, schedule display semantics.

## Confirmed behavior

- Calendar dates are generated in the selected IANA timezone, not the browser timezone.
- The timezone picker persists a validated IANA identifier in browser localStorage and dispatches a change event.
- PinGenerator reads the persisted timezone when it constructs a schedule, so changing the preference before scheduling affects the selected wall-clock date/time.
- Publish-now derives date and time from one instant and formats time as 24-hour `HH:mm`.
- `localDateTimeToDate` computes the offset for the target date rather than reusing today's offset. It rejects impossible local times in the spring-forward gap.
- Existing tests cover seasonal offsets, midnight/date-boundary formatting, invalid zones, and one spring-forward gap.

## Findings

### AUD-381-01 — repeated wall-clock time during autumn DST transition is not explicit

During the autumn clock rollback, a local time such as 01:30 can occur twice. The conversion helper returns one deterministic instant but has no disambiguation parameter and does not tell the user whether the earlier or later occurrence was selected.

**Risk:** a user scheduling near a DST fold may expect the other occurrence. The saved absolute instant is unambiguous after conversion, but the choice at input time is implicit.

**Safe follow-up:** add a fold-specific test and product decision. Prefer an explicit earlier/later choice when the UI supports it; otherwise reject ambiguous local wall-clock times with a clear message rather than silently selecting one. Do not change conversion semantics without checking all scheduling callers.

### AUD-381-02 — month-view schedule tiles are not interactive

The month cell itself handles click by opening the “generate for this date” dialog. Existing schedule tiles inside the cell are rendered as non-interactive `div` elements. Clicking a visible scheduled item therefore bubbles to the day cell and opens the generation dialog instead of opening that item's details.

**Safe follow-up:** make each schedule tile a keyboard-accessible button that stops propagation and opens the corresponding schedule detail. Keep clicking empty space in the day cell as the generate-for-date action.

### AUD-381-03 — timezone preference is browser-profile scoped

The timezone preference is stored under a single browser-local key, not keyed by authenticated user. Switching accounts in the same browser therefore carries the same display/scheduling timezone preference across accounts.

**Assessment:** acceptable if timezone is intentionally a device/browser preference. If it is intended to be a per-user profile setting, it needs server-side persistence and account-switch tests. Do not infer a user's timezone from language.

## Recommendations

1. Resolve DST-fold policy and add tests for both candidate instants in at least one IANA zone.
2. Fix month-view tile interaction and add a component-level regression test.
3. Decide explicitly whether timezone is device-level or account-level; document that contract.
4. Keep schedule storage as absolute instants. Changing the display timezone should change presentation, not move already-scheduled publications.

## Validation and safety

- Static source inspection only; no tests, frontend build, TypeScript lint, CI or browser interaction executed.
- No SQL, DB, Storage, Pinterest, provider, payment or production operations performed.
