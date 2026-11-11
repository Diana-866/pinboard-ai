# Calendar timezone and interaction notes — AUD-381

## Scheduling across daylight-saving changes

- Schedule timestamps represent absolute instants after conversion from the selected IANA timezone.
- Spring-forward wall-clock times that do not exist are rejected by the current conversion helper.
- During autumn rollback, some wall-clock times occur twice. Current behavior picks one deterministically without asking the user. Treat this as a known UX limitation; do not manually adjust the saved timestamp.
- Changing the display timezone should not move an already-scheduled publication.

## Month view

- Clicking an empty day opens generation for that date.
- Current schedule tiles are display-only; clicking one bubbles to the day and opens generation rather than the schedule detail. Use the queue view to inspect a schedule until the month tile interaction is fixed.

## Timezone preference

- Current preference is browser-local, not stored in the user profile. A different account in the same browser inherits it.
- If a per-account preference is required, implement server-side profile persistence with explicit account-switch behavior; do not key it only by UI language.

## Safety

Do not change timezone conversion, schedule timestamps, or queued publication rows directly in production. Any future DST-fold behavior change needs regression tests and review of all scheduling callers.
