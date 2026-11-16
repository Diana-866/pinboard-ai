# Frontend audit 03 — generation recovery, pin editing and canvas actions

- Date: 2026-11-16
- Branch: `main`
- Scope: PinGenerator generation/recovery flow, saved-pin response validation, idempotency storage, optimistic pin editing and save queue, PinCanvas export/clipboard actions; related backend generation route, journal/recovery serializer, credit reservation/completion boundary and pin patch/status guards.
- Nature: source-level review and targeted defensive fix. No runtime/browser/provider/DB certification.

## FE-03 — canvas export and clipboard actions could fail without UI feedback

**Evidence before fix:**
- `PinCanvas.handleDownload()` assumed that the remote image would load and that the browser would permit drawing/exporting it. A cross-origin image without compatible CORS headers can taint the canvas; `canvas.toDataURL()` then throws a browser `SecurityError`. Image load failures and missing 2D context were also not surfaced.
- `copyMetadata()` called `navigator.clipboard.writeText()` without checking Clipboard API availability or handling its rejected promise. On unsupported/insecure contexts or denied permissions this produced an unhandled rejection and no user-facing explanation.

**Fix on main:**
- Canvas export now reports a localized error if the 2D context is unavailable, the image fails to load, drawing/export throws (including CORS taint), or download preparation fails.
- Clipboard action now checks API availability, awaits the write, and handles rejection with a localized message.
- Errors render in an accessible `role=status` / `aria-live=polite` region.
- Added `exportFailed` and `copyFailed` to the translation schema and all seven supported UI locales (en, ru, es, pt, de, fr, zh).

**Commits:**
- `39cb8735dd3e98a28d8f425201ff44837270c66f` — translation schema.
- `a5f8482da26ad3f959e8be175372d4b4d1b0059e` — en.
- `eabfcebe4836cbe40efce43da25a97966a53a693` — ru.
- `25557ea5f74b9e91dc5db24a269d69d509dfea5d` — es.
- `698f7e4789c91fe64f1418b72f2503abdba4c422` — pt.
- `af15a572fdb06fda04f7ffe36452f56041c6fed4` — de.
- `d5f3af5333f4b91ecfe88d9684bb2bd8f8b1eb3e` — fr.
- `03c6826c1cad0c5ca76a9c2a117e1ea9cbd34f1f` — zh.
- `3abb4ca821d54f62c3b446b9145360b488adbf01` — PinCanvas defensive error handling.

## Generation and pin-editing contracts reviewed

Frontend:
- `frontend/src/components/pins/PinGenerator.tsx`
- `frontend/src/components/pins/PinCanvas.tsx`
- `frontend/src/utils/pendingGenerationRequest.ts` and tests
- `generatedPinsResponse.ts` and tests
- `savedPinsResponse.ts` and tests
- `generationRetry.ts` and tests
- `generationRecovery.ts` and tests
- `pendingPinSaveQueue.ts` and tests
- `pendingPinDescription.ts` and tests
- `pinDescriptionSaveGuard.ts` and tests
- `pendingPinDescriptionSwitch.ts` and tests
- `pinAspectRatio.ts` and tests
- `pinTitleSelection.ts` and tests
- `generationTopic.ts` and tests
- `frontend/src/types/pinGeneration.ts`
- `frontend/src/components/pins/PublishPinButton.tsx` (initial source read; dedicated publishing audit still pending).

Backend:
- `backend/index.js` generation recovery and `POST /boards/:id/pins/generate` route.
- `backend/pins.js` provider orchestration.
- `backend/generationRecovery.js` safe recovery serialization.
- `backend/generationPricing.js` reservation/quote calculations.
- `backend/pinPatch.js`, `backend/pinStatusGuard.js`.
- Related tests: `generation-recovery.test.js`, `pins-provider-boundary.test.js`, `pin-patch.test.js`, `pin-status-guard.test.js`, generation completion and credit-reservation SQL integration scripts.

**Contract observations:**
1. Frontend persists an idempotency identity before POST, fingerprints the exact board/settings payload, and keeps the key on uncertain/in-progress or malformed-success outcomes. It only rotates after explicit definitive failure / explicit replay expiry. Successful response is validated before clearing the recovery key.
2. Pending generation identities are stored without raw topic/settings; malformed identities are rejected; persistent storage falls back to session storage and then in-memory state; clearing one request does not remove other pending requests.
3. Recovery lookup is read-only and authenticated/user-scoped. Backend serializer exposes only completed pin display fields and does not expose provider prompt/task IDs/raw provider details. In-progress/unknown/failed states return no partial pins.
4. Backend generation path uses a durable request journal, provider-submission outcome tracking, quote-based credit reservations and atomic completion RPC. SQL test sources cover partial provider success, nonterminal task rejection, exact task/result matching, reservation settlement, overcharge rejection, definitive failure release and ambiguous-outcome reservation retention.
5. Pin edits are queued per pin to preserve write order. Failed writes do not poison later writes; description recovery drafts are board+pin scoped and are removed only when the saved value still matches; stale async completion guards use revision and board identity. Optimistic title/ratio rollback avoids overwriting newer choices.
6. Pin PATCH rejects unknown fields and validates title/description/aspect ratio. Rejection guard blocks pins that have active, published or unknown schedules or any publication history, and fails closed when those checks fail.
7. No additional generation journal, credit reservation, recovery or pin-editing contract defect was identified in this static pass. This does not establish that SQL routines or provider calls work in production.

## Static readback and verification

After code changes, fetched all changed source and translation files again from GitHub `main`. Seventeen targeted static assertions passed:
- seven checks for canvas context/load/export/clipboard failure handling, accessible feedback, schema fields and all seven locale definitions;
- ten checks for generation key persistence before POST, malformed-response recovery retention, no key rotation on ambiguous outcomes, user-scoped recovery, private-field exclusion, serialized pin writes, compare-before-clear drafts, strict backend patch allow-list, publication-state rejection and credit reservation/completion calls.

The relevant test files and workflow configuration were inspected but **no test command was executed**. No TypeScript check, production build, browser canvas/CORS test, clipboard permission test, backend runtime test, SQL integration test, provider call or live database test was performed. Latest Vercel status checked for commit `3abb4ca821d54f62c3b446b9145360b488adbf01` is `failure` with target `build-rate-limit`; this is a rate-limit status, not a build log or code failure.

## Remaining risks / boundaries

- Canvas export depends on image host CORS headers. The UI now fails visibly and safely, but the hosting/storage CORS policy and actual download behavior still need browser testing.
- JWT remains in localStorage; no auth transport redesign was attempted.
- `PublishPinButton` received only an initial source read; multi-account/user-switch and ambiguous publish reconciliation require a separate dedicated audit.
- Calendar/scheduling, Pinterest OAuth/account lifecycle, billing, admin and legal/consent UI remain to be audited.
- The complete frontend audit and all runtime gates remain open.
- Mandatory NEXT from `docs/PROJECT_STATE.md` is still a clean disposable PostgreSQL replay of `001_baseline.sql` + active migrations `010–148`, SQL integration suite and backend runtime suite. UA-001 (PostgreSQL binaries/disk check) and UA-002 (GitHub Actions runner/billing/settings check) remain pending in `docs/USER_ACTIONS.md`.

No production data, production database, payment provider, Pinterest account or deployed configuration was changed.
