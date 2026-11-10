# AUD-139 — Pinterest account switching and board-list race

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`

## Scope

Reviewed `frontend/src/components/settings/PinterestCard.tsx`, which loads the connected Pinterest accounts and fetches the board list for the selected account.

## Finding

The component allowed overlapping `/integrations/pinterest/boards?account_id=...` requests. If a user switched from account A to account B while A's request was still in flight, the slower A response could arrive last and overwrite the visible board list for B. The same race was possible between a manual refresh and an account switch.

This was a UI consistency issue: the backend still scopes board access to the requested connected account and verifies board ownership before scheduling or publishing, but the UI could temporarily display the wrong account's board names and IDs.

## Change

Added a monotonically increasing request ID with `useRef`. Each board-list request invalidates older requests; only the latest request may update the visible list or clear it on error. Selecting a legacy/no account also invalidates in-flight responses.

No API contract, OAuth credentials, database, scheduling worker, or production configuration was changed.

## Verification

- Re-read `frontend/src/components/settings/PinterestCard.tsx` from the branch after the update and confirmed request ID guards are present.
- Static source inspection only. Tests, frontend build, lint, CI, real Pinterest account switching, and live API calls were not run.
- No merge or deployment performed.
