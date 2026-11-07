# AUD-099 — Admin UI for transactional email outbox health

**Status:** UI wired to existing read-only endpoint; source read-back completed  
**Scope:** operational visibility, authorization boundary, privacy, refresh behavior.

## Finding

Before this audit, the backend already exposed `GET /admin/billing/email-outbox`, protected by `requireAuth` and `requireAdmin`, but the admin frontend had no tab consuming it. The existing «Почта поддержки» tab is an IMAP inbox/reply interface and is not the transactional email outbox.

## Changes

- Added `frontend/src/components/admin/AdminEmailOutbox.tsx`.
- Added a separate «Очередь писем» tab in `AdminPanel.tsx`; the support inbox remains unchanged.
- The page reads `/admin/billing/email-outbox?limit=50`.
- Shows counts for pending, sending, stale sending, and dead rows.
- Shows the oldest pending timestamp and age.
- Shows up to 50 dead-row technical IDs, attempt counts, error codes, and update timestamps.
- Refreshes on entry, manually, and every 60 seconds while the tab is mounted.
- The UI exposes no retry/delete/edit controls.
- The component does not request or render recipient addresses or email payloads.

## Safety and operational notes

- The endpoint remains the authorization boundary; frontend tab visibility is not relied on for access control.
- The UI reports `dead` rows for investigation only. It does not trigger delivery because SMTP acceptance can be ambiguous and a manual retry may create a duplicate.
- `stale_sending` indicates an expired lease, not proof that delivery failed.
- Counts and row details are a point-in-time read; no real-time delivery guarantee is implied.
- The existing backend test verifies that health output omits recipient email and payload. It was inspected but not executed in this audit.

## Verification boundaries

- Read back the changed `AdminPanel.tsx` and new component through GitHub API.
- Confirmed `apiRequest` returns parsed JSON and attaches the current bearer token.
- Confirmed the backend endpoint applies both authentication and administrator authorization.
- Frontend TypeScript/build and backend tests were not executed; no local checkout was available.
- No live Supabase query, SMTP action, deployment, or production data mutation was performed.
