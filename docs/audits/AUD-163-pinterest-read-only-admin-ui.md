# AUD-163 — Pinterest admin read-only UI

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`  
Commit: `7225f46fc74a2f058202ade6168d786a45adaeef`

## Scope

Connect the read-only Pinterest schedule inventory API introduced in AUD-162 to the existing administrator interface.

## Implemented

- Added `frontend/src/components/admin/AdminPinterestSchedules.tsx`.
- Added the **Pinterest — очередь** tab to `AdminPanel.tsx`.
- The component calls `GET /admin/pinterest/schedules` through the shared `apiRequest` helper. The helper attaches the existing bearer token from local storage.
- The request is bounded to 50 rows and uses the backend's allowlisted status filter.
- Added loading, empty, error, and manual refresh states.
- Displays schedule state/category, identifiers, relevant timestamps, attempt status/count, claim presence, retry-safety metadata, and a bounded/scrubbed last-error string.
- Displays the backend's `actionable_reconciliation` value only as a non-authoritative informational hint.
- UI contains no POST/PUT/PATCH/DELETE calls and no controls to publish, retry, cancel, or reconcile.
- Existing `App.tsx` administrator route gate checks `isAdmin`; the backend route independently enforces `adminActionLimiter`, `requireAuth`, and `requireAdmin`.

## Safety boundaries

- This is an operational read-only view, not a control plane.
- The UI does not expose schedule claim tokens or stored pin content.
- The backend's positive reconciliation RPC remains the authority for any later operator workflow. A UI hint must never be treated as authorization or proof that a reconciliation will succeed.
- The page shows only the first bounded page (50 records); no pagination controls are implemented yet.

## Verification

Static source inspection confirmed:
- the admin tab import, state union, navigation button, and conditional render are present;
- the component calls the expected read-only endpoint and checks `read_only: true`;
- no mutating HTTP method is present in the component;
- the existing admin route gate and backend middleware are in place.

Not verified:
- frontend TypeScript/lint;
- frontend production build;
- backend unit tests or integration tests;
- live API response against Supabase;
- browser rendering or end-to-end administrator access.

GitHub Actions returned no workflow runs for commit `7225f46`. Vercel reported `failure` with target URL indicating `build-rate-limit`; this is a build quota restriction and does not establish whether the source compiles. No claim of passing CI/build is made.

## Production impact

No deployment, database migration, production environment change, Pinterest API call, publication, retry, cancellation, or reconciliation was performed. PR #4 remains Draft and open; it was not merged.
