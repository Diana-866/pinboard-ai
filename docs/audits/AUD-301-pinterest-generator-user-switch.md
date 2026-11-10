# AUD-301 — reset Pinterest generator state on user switch

## Finding
The generator loaded connected Pinterest accounts only once on mount (`useEffect([])`). The app can keep the generator mounted while the authenticated user changes. In that case the component could retain the previous user's Pinterest account and board selections. The board-loading effect also retained the previous board list while a new account's board request was in flight.

## Change
- Subscribe to the authenticated user ID through `useAuth`.
- On user identity changes, clear account, board, and selected-ID state before loading the new user's connections.
- Ignore late responses from the previous identity using the existing effect cleanup guard.
- Clear the previous account's board list immediately whenever the account changes.
- Validate account and board identifiers/names before exposing rows to selectors.
- No API, database, or scheduling semantics changed.

## Verification
- Updated component source read back from GitHub.
- Automated frontend tests, lint, typecheck, and build were not run in this environment.
- No production database changes, deployment, or merge.
