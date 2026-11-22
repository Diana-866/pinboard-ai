# AUD-422 — Expose account-deletion inventory in the admin panel

**Date:** 2026-11-22  
**Base:** `95ecb0611efc8e6a507add2ff24ee03a59aa24e3`  
**Scope:** read-only frontend admin panel; no production data or deletion action.

## Finding

The backend account-deletion inventory endpoint and truncation indicator existed, but `AdminPanel` had no account-deletion tab/component. Operators could not see the operational queue in the admin UI, and AUD-420's `requiring_attention_truncated` field had no frontend consumer.

## Change

- Added `AdminAccountDeletionInventory`, a read-only panel using `GET /admin/account-deletion/inventory?limit=50`.
- Added an admin tab and render path for the component.
- Displays pending requests, blocked/retry/running counts, bounded job details, safe error codes and age.
- Explicitly warns when `requiring_attention_truncated` is true; never renders a partial queue as complete.
- Validates the response shape, UUIDs, step keys, status, counts, timestamps and error-code format before rendering.
- Clears stale data if a refresh fails, so an earlier snapshot is not presented as current.
- Added a frontend contract regression to `adminPanelDataSafety.test.ts` (included in the frontend `npm test` glob) asserting route, tab, truncation warning and read-only behavior.

## Commits and final blobs

- Component creation `82986881a2a417795a7d786645bbf15995a58035`; final component blob `f975dee8970e959aefa247f0e95e5067407afe92`.
- Admin tab `5c77e59f8d26b6407ff1ba108d275cc332ba1a97` plus header `95ecb0611efc8e6a507add2ff24ee03a59aa24e3`; final AdminPanel blob `e4769e2719c96e1e3c3e3143eae77eebcbb0c1e9`.
- Contract test `b08f477126531fddab6c71a8bfb41c0cb43fac6c` plus assertion correction `7ec3871f90fc5fc45e7925ad5a4e830c33746cc7`; final test blob `b447525bf0c2cf28c75fb759819b87a2b8433590`.
- Payload validation/stale snapshot correction `5530f90207c0470c683edf324c78b4df71086053`.

## Verification

- Re-fetched component, AdminPanel, contract test and package manifest from `main`.
- Static checks confirmed endpoint, admin tab/render, payload validation, truncation warning, stale-data clearing and absence of POST.
- Confirmed frontend test script includes `src/lib/*.test.ts`, so the new contract test is in the configured test run.
- **Frontend tests and TypeScript/Vite build NOT RUN** in this connector environment. UA-090 records local acceptance; no build or test PASS is claimed.
- No production deletion, database, provider, payment, storage, DNS or deployment operation.

## Next

Run frontend tests and `npm.cmd run build` from UA-090. Backend deletion inventory tests remain under UA-088. Admin UI release is blocked until both suites and deployment are accepted.
