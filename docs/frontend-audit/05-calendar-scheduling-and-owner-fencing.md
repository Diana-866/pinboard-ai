# Frontend audit 05 — calendar scheduling, timezone and owner fencing

- Date: 2026-11-16
- Branch: `main`
- Scope: calendar UI, schedule loading/creation/reconciliation/retry/cancel/account reassignment/board reassignment, timezone conversion and backend schedule route contracts.
- Nature: source-level review and targeted frontend owner-fencing fix. No runtime, browser, worker or database certification.

## FE-05 — in-flight schedule mutations could update the calendar after account switching

**Evidence before fix:** `MainApp` cleared the visible schedule on authenticated-user change and the schedule GET effect cancelled stale reads, but the five async mutation handlers (create schedule, reconcile legacy account, change failed schedule board, retry failed schedule, cancel schedule) did not verify that the authenticated owner was still the same after awaiting API calls. A request started for user A could resolve after switching to user B and write user A's schedule row into the new calendar state or display an old user's error. The calendar's local modal/action lock state also survived because the component had no user identity key.

**Fix on main:**
- Added pure `isScheduleOwnerCurrent(currentOwnerId, requestOwnerId)`, which returns true only for the same non-empty identity, with three regression tests.
- `MainApp` captures the initiating user ID in each of the five schedule mutation handlers and checks the owner after every API await, before reconciliation GETs, before state mutation and before showing errors.
- Stale responses/errors from a previous owner are ignored; no old-user schedule is inserted into the new user's React state.
- `PublishingCalendar` is keyed by authenticated user ID so its open detail modal, selection, replacement-board request state and rapid-action lock are reset when the account changes.

**Commits:**
- `b23942f52bb66627ce15ee08246aed39116c02ad` — owner fence around schedule creation.
- `9ead7017998cce86033ed8bd2163a51316bb8deb` — owner fence around reconcile/change-board/retry/cancel and calendar remount.
- `354de281e5bc19bbcc2e373768d78e3ce63d7208` — pure owner fence helper.
- `002ed2d8718ca03d5291855d4bb96dc5da47ba51` — owner fence tests.
- `2a61bc317b2c8384aea20f572462076bcb655f61` — App uses tested helper.

## Calendar and schedule contracts reviewed

Frontend:
- `frontend/src/components/calendar/PublishingCalendar.tsx`
- `frontend/src/App.tsx` schedule load/mutation handlers and component wiring
- `frontend/src/utils/timezone.ts` + tests
- `frontend/src/utils/persistedSchedule.ts` + tests
- `frontend/src/utils/scheduleMutationReconciliation.ts` + tests
- `frontend/src/utils/scheduleStatus.ts` + tests
- `frontend/src/utils/scheduleRetryReason.ts` + tests
- `frontend/src/utils/resolveLatestSelectedSchedulePin.ts` + tests
- `frontend/src/utils/scheduleOwnerFence.ts` + tests
- calendar quick-add, timezone selector, status filters, account filters, failed-row actions and detail modal.

Backend:
- `backend/index.js`: authenticated GET schedule, create schedule, legacy account reconciliation, failed schedule board change, retry and cancellation routes.
- `backend/pinterest.js`: scheduler claim, worker lease heartbeat, remote publish and completion reconciliation.
- Schedule helpers/migrations/test sources inspected in packages 03/04; no production database was accessed.

**Contract observations:**
1. Schedule list endpoint filters by `req.userId`, uses bounded paging (10,000-row ceiling), stable `scheduled_at + id` ordering, chunked retry-metadata queries and sanitized client projection.
2. Schedule creation requires authenticated pin ownership, approved state, saved image, bounded future time (not older than 10 minutes and not more than one year ahead), valid IANA timezone, valid HTTP(S) destination, selected user's Pinterest account and verified remote board. It re-reads the pin before freezing the immutable creative/destination snapshot.
3. Legacy account reconciliation checks schedule ownership, requires no pre-existing account, verifies the existing board against the selected account, and delegates atomic state transition to a dedicated SQL RPC with conflict reasons.
4. Failed-board reassignment and retry are restricted to failed schedules, revalidate the exact connected account/board, and delegate safety checks to SQL RPCs. Retry rejects existing publication attempts, identity mismatch and active duplicate schedules.
5. Cancellation is a conditional update from `scheduled` only. If a worker has already claimed the row, cancellation returns a conflict rather than overwriting the publishing claim. Repeated cancellation is reconciled by exact owner-scoped row lookup. Snapshot image cleanup checks references and does not delete an image still in use.
6. Frontend does not treat a 2xx alone as proof of mutation. It validates exact schedule ID, status, board/account and required persisted fields; on lost/malformed responses it reconciles against a valid authenticated schedule list. Cancellation accepts absence only after validating the complete active list.
7. Timezone utilities validate IANA identifiers, use target-date offsets for DST, reject nonexistent spring-forward local times, advance quick-add slots past already elapsed times, and test month/year/leap-day boundaries. User timezone is a browser preference, separate from stored UTC schedule instants.
8. No additional schedule persistence or backend route contract defect was found statically.

## Static readback and verification

After all changes, fetched `App.tsx`, owner-fence helper/test, timezone source/tests, persisted-schedule validator, mutation reconciliation helper and backend `index.js` again from GitHub `main`. Seventeen targeted static assertions passed:
- owner helper import/use;
- all five mutation handlers capture initiating owner;
- every awaited API call in those handlers is followed by an owner check;
- stale errors are suppressed;
- calendar component remounts on owner change;
- owner helper tests cover same owner, changed owner and empty identities;
- persisted schedule rejects duplicate IDs;
- mutation reconciliation requires a unique exact match;
- timezone IANA validation and DST tests exist;
- backend schedule listing is user-scoped;
- cancellation is conditional on scheduled state;
- retry and board reassignment require failed state;
- schedule creation verifies pin owner and approved state.

Existing timezone/persisted schedule/mutation reconciliation tests and backend route/SQL test sources were inspected but **not executed**. No frontend test, TypeScript check, build, browser account-switch race, DST browser test, backend runtime suite, PostgreSQL replay, SQL integration or worker run was executed.

## CI / blockers

Latest GitHub Actions runs after this work:
- `43931336693` — frontend/backend jobs failed before runner execution. Jobs `133524232523` and `133524233122` both reported `runner_id: 0`, `steps: []`.
- `43931336611` — postgres-atomicity job `133524233003` reported `runner_id: 0`, `steps: []`.
- Vercel status for code commit `2a61bc317b2c8384aea20f572462076bcb655f61` remains `failure` with target `build-rate-limit`, not a build log/result.

Added this new evidence to UA-002 in `docs/USER_ACTIONS.md` (commit `ed42d6aff101f81e12b086e88a2b359a49052f0f`). Account billing and Actions settings remain inaccessible to the assistant and require the owner to inspect the UI.

## Remaining risks / boundaries

- Owner fencing is statically verified but still needs a browser integration test with delayed requests and two test users.
- UI still uses some browser `alert()` messages for schedule errors; a later UX/localization pass can replace these with consistent notifications.
- Full frontend audit and all runtime gates remain open.
- Mandatory NEXT in `docs/PROJECT_STATE.md`: clean disposable PostgreSQL replay of `001_baseline.sql` + active migrations `010–148`, SQL integration suite and backend runtime suite. UA-001 (PostgreSQL binaries/disk check) and UA-002 (GitHub Actions runner/billing/settings check) remain pending in `docs/USER_ACTIONS.md`.

No production data, live schedule, Pinterest account, payment provider or deployed configuration was changed.


## Follow-up: localized schedule recovery copy (2026-11-16)

A supplemental review after the package was already recorded complete found several user-facing Russian-only strings in the legacy schedule-account recovery and manual retry guidance. This did not change scheduling state or server contracts, but it made the recovery UI inconsistent for the other supported interface languages.

**Fix on main:** moved the legacy-account title, account selector placeholder, single-account explanation, no-account guidance, reconcile action labels, and manual retry explanation into `TranslationSchema` and all seven supported locales (en, ru, es, pt, de, fr, zh). The single-account message interpolates the actual connected account handle/name. No scheduling mutation behavior changed.

**Files changed:** `frontend/src/components/calendar/PublishingCalendar.tsx`, `frontend/src/i18n/types.ts`, and `frontend/src/i18n/locales/{en,ru,es,pt,de,fr,zh}.ts`.

**Commits:**
- en `524d01dbdf3cc37d77e788b5e8b8fa7d09f37a27`; ru `80c44dac5cb904bf7682ecb1013af7171f51574e`; es `0bc94edd4f495c482e6f9c04752b6f5a3f5137e6`; pt `1663aa2ce0d99840e8ed6e63d22a47161a5ba5c6`; de `1351a10e770304cc4d44bc28f0275678339e70e6`; fr `1b36c2c30094fdcff5b29eff35b518b37088a4f2`; zh `f6bec75e8df22fbe056a75bbf792d4f9c0f9c75c`; schema `b01f2cc5644a71c621eb6290491fff26096f01bb`; calendar component `83932ff0376174659a5c46ad8dfaf8f46bdf283c`.

All nine changed files were fetched again from `main`; all seven keys were present in the schema, each locale and the component. Eight targeted static assertions passed. No frontend test, typecheck or build was run. The Vercel check for the component commit reports `failure` with target `build-rate-limit`, not a build result.
