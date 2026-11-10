# AUD-178 — Prevent duplicate calendar scheduling requests

## Finding

The calendar action awaited description and pin updates before calling the schedule callback, but the button remained enabled during that asynchronous work. Repeated clicks could start multiple scheduling flows for the same pin and create duplicate calendar entries if the callback accepted both requests.

## Implementation

- Added a synchronous ref lock so duplicate clicks are rejected immediately, before React has a chance to render a disabled button.
- Added a visible scheduling state and disabled the calendar action while the request is in progress.
- Wrapped the full scheduling flow in `try/finally`, so the lock is released after success, validation failures, save failures, or thrown errors.
- Kept the existing prerequisite that pending description, title, and format saves must finish before scheduling.

## User-visible effect

After clicking “Add to calendar”, the button changes to “Сохраняем в календарь…” and becomes temporarily unavailable. Rapid repeated taps no longer start parallel scheduling requests. If saving or scheduling fails, the button becomes available again so the user can retry.

## Verification and scope

- Verified the synchronous lock, disabled state, progress label, and `finally` release are present in the feature branch.
- No automated UI test or frontend build was run; the existing scheduling callback and backend idempotency behavior were not changed.
- No production data, database, deployment, or PR merge was changed.
