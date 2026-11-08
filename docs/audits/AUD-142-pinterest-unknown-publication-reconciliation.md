# AUD-142 — Pinterest unknown publication reconciliation and operator workflow

Date: 2026-11-08  
Branch reviewed: `feat/persisted-boards-api`

## Scope

Reviewed the Pinterest publishing worker and schedule API in `backend/pinterest.js` and `backend/index.js`, schedule policy helpers and tests, calendar UI, scheduler runbook, and migrations 047–060 (including publication completion, claim fencing, safe retry, and lock-order corrections).

## Confirmed protections

1. A scheduled worker creates a durable attempt journal before sending the Pinterest create request. A claim token fences stale workers.
2. If the journal cannot be read, the attempt remains ambiguous and is not retried.
3. Attempt states `unknown` and `processing` are never considered safe to retry. The manual retry RPC and API only accept schedule rows in `failed`, and the SQL policy additionally requires either no journal or an explicitly `failed AND retry_safe=true` attempt.
4. `complete_pinterest_publish_v2` can persist a late confirmed Pinterest response and reconcile matching `publishing`/`unknown` schedules. Migrations 057–059 align its locks with the account → schedule → attempt order and lock all reconcilable schedules before the attempt.
5. Migration 048 repairs historical `unknown` schedules only when the attempt journal and publication ledger already agree on owner, pin, account, and exact remote Pinterest ID.
6. The calendar offers manual retry only for `failed` rows whose API-provided `retryable` flag is true. It does not expose a retry action for `unknown`.

## Gap: no manual confirmation workflow for a known remote pin

The current user-facing API has:
- `GET /schedule` — lists schedule rows and computes retryability only for failed rows;
- `POST /schedule/:id/retry` — retry of a safe failed schedule;
- `POST /schedule/:id/reconcile-account` — assigns an account to eligible legacy rows with no publication history.

There is no endpoint or operator UI to record a Pinterest pin ID discovered manually after an ambiguous publish. The existing `reconcile-account` endpoint is specifically for legacy schedules with a missing account ID; it is not a publication reconciliation endpoint. The late-success RPC is callable by the backend only when the original worker still has the actual Pinterest response.

The calendar originally rendered only the `unknown` status label. This audit added a localized warning to the selected-item detail panel in all seven supported interface languages. It explicitly says the publish outcome is unconfirmed, warns against retrying or scheduling the same pin again, and recommends checking the selected account and board or contacting support.

## Safe operating rule until a dedicated workflow exists

- Never change `unknown` to `scheduled` or `failed` merely because the pin is not immediately visible.
- Never call the retry endpoint for an `unknown` row or insert a second schedule for the same local pin/account to work around it.
- Check the exact connected Pinterest account and destination board. Search the board for the expected pin using the content snapshot, approximate publish time, and image. A matching remote pin is evidence of publication; retain its Pinterest pin URL/ID and escalate for controlled reconciliation.
- If no matching pin is found, absence from a search is not proof that the POST never succeeded. Keep the row `unknown`; do not replay it automatically.
- Do not directly edit `pinterest_publish_attempts` or `pinterest_publications` in production SQL to force a status.

## Recommended follow-up implementation

Design a separate privileged, audited reconciliation action rather than broadening the existing retry route. Minimum contract:

1. Require an authenticated administrator/operator identity and enforce role authorization server-side.
2. Require schedule ID, exact Pinterest account ID, exact remote Pinterest pin ID (and board ID), operator reason, and an explicit confirmation that the remote pin was found in that account.
3. Atomically lock account → all matching schedule rows → attempt, matching migrations 057–059; verify owner, pin, account, board, existing journal, and any existing publication row.
4. Permit only an idempotent transition to `published` when the remote ID is consistent. If an existing remote ID conflicts, reject and leave the row blocked for investigation.
5. Write an append-only operator audit event containing actor, schedule/pin/account IDs, remote ID, reason, previous/new states, and timestamp. Do not permit an operator to declare an ambiguous attempt absent and requeue it without a separate, much stronger evidence protocol.
6. Add integration tests for same-ID idempotency, conflicting remote ID, wrong owner/account, duplicate schedules, missing attempt, cancelled/failed rows, concurrent worker completion, and audit-event creation.
7. **Completed in this audit:** the calendar now displays a localized `unknown` explanation: publication may have happened; do not retry or create a duplicate; check the selected account/board and contact support for reconciliation.

## Outcome

No unsafe retry or direct SQL repair was introduced. Existing backend safeguards are strong. The user-facing warning is now implemented; manual operator reconciliation of a discovered remote pin remains missing. No production database, Pinterest account, cron, or deployment was touched.

## Follow-up implementation in this audit

- Added `unknownPublishHelpTitle` and `unknownPublishHelpBody` to all seven locale dictionaries (`en`, `ru`, `es`, `pt`, `de`, `fr`, `zh`) and to `TranslationSchema`.
- Added an accessible `role="alert"` warning to the selected schedule detail in `PublishingCalendar.tsx`, shown only for `status === 'unknown'`. No retry action was added; existing retry remains restricted to server-approved `failed` rows.
- Changed files: `frontend/src/components/calendar/PublishingCalendar.tsx`, `frontend/src/i18n/types.ts`, and `frontend/src/i18n/locales/{en,ru,es,pt,de,fr,zh}.ts`.

## Verification limits

Repository source files were read from the working branch. No local Node tests, frontend build, PostgreSQL integration suite, live Pinterest API request, or CI workflow was executed as part of this audit.


## CI status observed after frontend changes

GitHub reported failing workflow runs associated with the audited branch commit: `Prodamus webhook tests`, `Atomic payment fulfillment integration`, and `Persisted boards integration checks` (frontend and backend jobs). The workflow-log download endpoint returned `BlobNotFound`, so the failure causes could not be diagnosed from this session. These are reported as failures, not as passing checks; no claim is made that this localized UI change caused them.
