# AUD-138 — Pinterest publishing action semantics

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`

## Scope

Reviewed the frontend publishing-mode flow in `frontend/src/components/pins/PinGenerator.tsx`, the schedule handoff in `frontend/src/App.tsx`, and the protected background worker in `backend/pinterest.js`.

## Finding

The generator option labelled “Publish now” previously described sending a pin to Pinterest immediately. The actual frontend handler creates a `ScheduledPinItem` with status `scheduled`, uses the current local date/time, and hands it to `onSchedulePin`. It does not call the direct `POST /pins/:id/publish` endpoint.

The background worker is a separate endpoint, `POST /internal/pinterest/schedule/run`, protected by `PINPOSY_SCHEDULER_SECRET` and intended to be invoked by an external cron. Therefore the UI cannot promise immediate publication at the moment the user clicks the option; publication depends on the next worker invocation and normal eligibility checks.

## Change

Updated `publishNowLabel` and `publishNowDescription` in all seven supported UI locales (ru, en, es, pt, de, fr, zh) to describe queuing for the next publisher run rather than immediate Pinterest publication.

No scheduling API, worker behavior, cron configuration, database state, or production environment was changed.

## Verification

- Re-read all seven locale files from `feat/persisted-boards-api` after the writes and confirmed the new strings are present.
- Source inspection confirms the frontend option creates a `scheduled` record and the backend worker is invoked through a separate internal endpoint.
- Tests, build, lint, CI, external cron configuration, and live Pinterest publication were not run or verified.
- No merge or deployment performed.
