# AUD-215 — Prevent publishing to a board from the previously selected Pinterest account

Date: 2026-11-09  
Scope: Direct pin publishing control in `frontend/src/components/pins/PublishPinButton.tsx`.  
Repository: `Diana-866/pinboard-ai`  
Branch: `feat/persisted-boards-api`

## Finding

When a user switched Pinterest accounts, the component kept the previous account's `selectedBoard` value until the new account's boards request completed. During that interval, the publish button could remain enabled. A quick click could therefore submit the new account ID together with a board ID belonging to the previous account.

There were two related reliability issues:
- the button did not become disabled while account/board data was loading;
- rapid clicks could invoke the publish handler more than once before React committed the `busy` state update.

A caller-provided `boardId` also silently fell back to the first board if it was not present in the selected account. That could publish to a different destination than the caller explicitly requested.

## Changes

1. Account switching clears the board list and selected board synchronously in the change handler.
2. Board loading state disables the publish button until the selected account's board list has resolved.
3. Board fetches use an active-request guard so a late response for a previously selected account cannot overwrite the current account's board list.
4. Added a synchronous `useRef` lock around publication to close the rapid double-click gap before React updates state.
5. Extracted `resolvePublishBoardId()` into `frontend/src/utils/publishBoardSelection.ts`:
   - an explicit requested board is selected only if it belongs to the loaded account board list;
   - an unavailable explicit board returns an empty selection and an error instead of silently selecting another board; the user is shown a board selector and can explicitly choose a replacement;
   - the first board is selected only when no explicit board was requested.
6. Added a no-account hint and disabled publish until a Pinterest account and a valid board are available.
7. Added `frontend/src/utils/publishBoardSelection.test.ts` for matching, mismatching, default, and empty board lists.

## User impact

If a user changes from Pinterest account A to account B, PinPosy no longer leaves account A's board selected while B's boards load. The publish button remains disabled until a valid board for B is selected. If the caller asked to publish to a specific board that does not belong to B, the component stops, explains the mismatch, and reveals a selector so the user can explicitly choose a replacement instead of quietly publishing somewhere else. Rapid repeated clicks are blocked in the UI.

## Validation

- Re-fetched the component, selection helper, and tests from the feature branch after the changes.
- Confirmed account changes clear the selected board; stale board requests are ignored; loading disables publishing; a synchronous ref lock prevents duplicate handler entry; explicit board IDs are validated against the selected account's list.
- Frontend tests, TypeScript lint, and Vite build were not run in this environment. The new tests are committed but are not claimed as passing.
- This UI guard complements backend account/board ownership validation; it is not a replacement for server-side authorization.
- No Pinterest publish requests, production changes, deployment, or PR merge were performed.

## Commits

- `1f69202a8125131afdc5ae14b7033b54423d954d` — account-switch, loading, stale-request, and double-click guards
- `26aa0014f39b1b4700c0f3b533d77d0de2965858` — board selection helper
- `e11059659a6c9bb6757706a168cf9cc0b4794452` — board selection tests
- `1be720309a041d87fac4b37886b1e5b88e522d1e` — explicit board ownership validation, replacement selector, and no-account hint
