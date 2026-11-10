# AUD-332 — Frontend compatibility review for legacy GPTunnel text routes

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** REVIEW COMPLETE — no source changes  
**Related:** AUD-329, AUD-330, AUD-331

## Scope checked

Reviewed frontend API helper, application shell and routing/state orchestration, board manager, onboarding wizard, dashboard, and relevant project/board UI:
- `frontend/src/lib/api.ts`
- `frontend/src/App.tsx`
- `frontend/src/components/boards/BoardsManager.tsx`
- `frontend/src/components/dashboard/DashboardView.tsx`
- `frontend/src/components/onboarding/OnboardingWizard.tsx`
- `frontend/src/components/pins/PinGenerator.tsx`
- `frontend/src/utils/persistedBoards.ts`

This is a targeted source review, not a formal whole-repository proof that no dynamically constructed request exists.

## Findings

### F1 — No frontend caller found for `POST /projects/:id/analyze`

The checked application shell and onboarding flow do not issue this request. Onboarding persists `websiteUrl` and `productComment` via `PATCH /me/onboarding`; saving a website URL does not itself invoke site analysis in the inspected code.

**Impact:** making this route require a new idempotency header now would not break any caller found in the inspected frontend paths, but the route appears to be an unconnected backend capability rather than an active user journey. Product intent needs confirmation before adding UI or removing the endpoint.

### F2 — No frontend caller found for `POST /projects/:id/boards/generate`

The inspected board manager renders persisted boards and handles manual board creation. `App.tsx` provisions/loads a project and calls `POST /boards` with `project_id`, `title`, `description`, and the existing `create_request_id`. It does not call the AI board-ideas endpoint.

**Impact:** AI board-idea generation currently has no discovered frontend entry point. Do not retrofit a new required key or spend-control flow on the assumption that the UI already depends on this endpoint.

### F3 — Manual board creation already has its own idempotency mechanism

`BoardsManager` creates a UUID request ID and passes it to `handleAddBoard`; the app sends it as `create_request_id` to `POST /boards`. This is a distinct persistence operation and should not be conflated with the GPTunnel board-ideas endpoint.

### F4 — API helper supports caller-supplied headers

`apiRequest` merges `options.headers` into its standard JSON/auth headers. Therefore a future frontend can supply `Idempotency-Key` without changing the helper's fundamental header behavior. No automatic retry mechanism for these two legacy endpoints was found in the reviewed paths.

## Recommended product/engineering decision

Before AUD-333 implementation, decide one of these paths:

**Option A — Keep the endpoints as internal/backend capabilities.**
- Do not add frontend UI.
- Keep compatibility for any external/administrative callers.
- Add durable operation accounting only if these endpoints are intentionally used by trusted backend workflows or future integrations.
- Do not enforce a breaking mandatory header until callers are inventoried.

**Option B — Make AI project analysis and board suggestions real user-facing features.**
- Design explicit UI entry points and loading/error/retry states.
- Add durable idempotency keys at the user action boundary.
- For unknown provider outcomes, show a clear pending/reconciliation state; never imply that retry is safe.
- Preserve existing manual board creation behavior and its `create_request_id`.

**Option C — Retire unused endpoints.**
- Only after confirming there are no external callers, scheduled jobs, or other integrations.
- Remove route and supporting code in a separately reviewed change; do not silently remove them as part of spend-control work.

## Decision / next step

No frontend changes are warranted yet. The source review found no active frontend caller for either endpoint, so the safe next step is to inspect backend route history/external integration references and choose whether these are supported product features or dormant endpoints. Until that decision, keep AUD-331 as a design and do not add mandatory request headers or alter product behavior.

## Validation

- No source code or database migration changed.
- No provider requests, production writes, or deployments performed.
- No tests/build run.
