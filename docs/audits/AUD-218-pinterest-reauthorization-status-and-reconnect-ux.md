# AUD-218 — Consistent Pinterest reauthorization status and reconnect UX

## Finding

After the malformed-expiry fix in AUD-217, the account list used the shared `isPinterestReauthRequired` helper, but the backward-compatible top-level `needs_reauth` field in `GET /integrations/pinterest/status` still used the old inline date comparison. The same account could therefore have contradictory status depending on which response field a client consumed.

The settings card also displayed a reauthorization label but continued requesting Pinterest boards for that account. This produced an avoidable failed request and left the user with an empty-board message instead of a recovery action.

## Changes

- Reused `isPinterestReauthRequired` for the legacy top-level status field so both response shapes agree for uncertain refresh state, expired expiry, and malformed non-empty expiry.
- The settings card now skips board loading for an account marked `needs_reauth`.
- The selected account shows an explicit reauthorization warning and a button that starts the existing secure OAuth flow.
- The manual board-refresh control is hidden while reauthorization is required.

## User impact

A Pinterest account that needs reconnecting is no longer presented inconsistently or treated like a normal account with an empty board list. The settings screen explains the problem and exposes the next action. No credentials are exposed to the browser.

## Validation limits

- Backend and frontend files were re-fetched from `feat/persisted-boards-api` after the changes.
- Existing `backend/test/pinterest-public-account.test.js` covers malformed, missing, expired, and future expiry values through the shared helper. Tests were not executed in this environment.
- Frontend lint/build and integration tests were not executed.
- No live Pinterest API request, production database write, deployment, or merge was performed.
