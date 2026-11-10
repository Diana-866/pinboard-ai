# AUD-380 — Calendar schedule lifecycle and mutation contract

**Date:** 2026-11-11  
**Status:** source audit complete; no production changes  
**Scope:** schedule list/history, create, cancel, retry, failed-board reassignment, worker claim races, schedule snapshots and calendar controls.

## Executive summary

The active publication lifecycle has strong safeguards: schedules are owner-scoped, creation freezes the creative and destination, cancellation uses a conditional status transition that races safely with worker claims, retry is gated by an exact safe-failure journal, and failed-board reassignment verifies the same Pinterest account and is finalized by a guarded SQL RPC.

Three product/API gaps remain:
1. The calendar offers a Cancelled status filter, but `GET /schedule` explicitly excludes cancelled rows. The filter therefore cannot show cancellation history.
2. There is no general reschedule endpoint/UI for changing date/time of an existing queued item. Current user-facing path is cancel then create a new schedule; this is not an atomic move.
3. Schedule snapshots are intentionally immutable. Editing the source pin after scheduling does not change the queued creative; this protects deterministic publication but needs clear UI disclosure or an explicit safe "update scheduled creative" workflow.

## Confirmed safeguards

### Create
- `POST /pins/:id/schedule` validates the source pin is approved and has a stored image, validates timestamp (not older than 10 minutes and no more than 366 days ahead), timezone and destination URL.
- It resolves an exact connected Pinterest account and verifies the requested Pinterest board against that account.
- It re-reads the pin after the remote board check, then freezes the approved creative and resolved destination into the schedule snapshot.
- A database uniqueness conflict becomes HTTP 409 instead of creating a second active/publication entry.
- Frontend reconciles an ambiguous create response using a read-only schedule list and exact pin/time/board/account matching; it does not blindly issue a second create.

### Cancel
- `POST /schedule/:id/cancel` uses conditional update scoped by schedule ID, owner and `status = scheduled`. This is the cancellation linearization point against worker claim.
- If worker already claimed (`publishing`) or the row is already published, cancellation is rejected with a conflict.
- Repeating cancellation after a lost response returns the persisted cancelled row and repeats only reference-aware image cleanup.
- Frontend read-after-error reconciliation treats absence from a structurally valid active schedule list as cancellation confirmation. It never sends a second cancellation request.

### Retry and board change
- Retry only accepts failed rows and calls a SQL RPC that locks account and schedule, checks exact attempt identity, checks no publication ledger entry and no other active schedule, and requires a still-available source pin or immutable snapshot image.
- Retry resets the scheduled time to now; it is a resume-now action, not a date/time edit.
- Failed-board change is limited to failed schedules with an exact connected account; backend verifies board access and calls guarded RPC. The SQL checks the prior publication attempt identity, retry safety, duplicate schedules and pin availability.
- Frontend reconciliation after a lost retry/board-change response accepts exact schedule identity and board/account plus either scheduled or worker-claimed publishing status.

### Snapshot and worker safety
- Schedule content and image are snapshotted at creation. Retry migration 096 explicitly preserves immutable snapshot image even if the live pin image changes.
- Worker claim fencing and completion fencing prevent stale workers from completing a row after ownership of the claim has changed.
- Ambiguous Pinterest outcomes are not blindly retried. The publication journal is authoritative; unknown outcomes require reconciliation.

## Findings / gaps

### AUD-380-01 — Cancelled filter is disconnected from the API
Calendar UI includes a `cancelled` status filter and status renderer. However, `GET /schedule` applies `.neq("status", "cancelled")`, so cancelled rows never reach the calendar's filter. This is a confirmed contract mismatch.

**Safe follow-up:** create a separate owner-scoped `GET /schedule/history` (or explicit query mode) for terminal rows. Keep the active-list endpoint unchanged because cancellation reconciliation depends on cancelled rows being absent. The history endpoint must use strict row validation and never be used as active cancellation evidence.

### AUD-380-02 — No atomic reschedule action
No `PATCH /schedule/:id` or date/time reschedule route is present in the inspected backend. Calendar detail offers cancel for scheduled rows; retry is for failed rows and resumes immediately. Moving a publication currently requires cancellation and creation of another schedule, with a gap where neither may be active if the second step fails.

**Recommendation:** design a dedicated owner-scoped reschedule RPC for `scheduled` rows only. It must atomically compare-and-swap status and timestamp, serialize against worker claim, validate the target timestamp/timezone and preserve the same schedule identity/snapshot/account/board. Reject `publishing`, `published`, `unknown`, `failed` and `cancelled` unless a separately reviewed workflow explicitly covers them. Add cancellation-vs-reschedule-vs-worker concurrency tests.

### AUD-380-03 — Source edits do not update the queued creative
Creation freezes title, description, image and resolved destination. Subsequent changes to the source pin do not mutate the schedule snapshot. This is intentional safety behavior, but the current calendar needs a clear "scheduled version" explanation and a deliberate update workflow if users expect edits to propagate.

### AUD-380-04 — Retry semantics may surprise users
A retry of a confirmed safe failed schedule resets `scheduled_at = now()`; it does not preserve the original target date/time. UI copy should explicitly say "retry now / put back in queue" rather than implying restoration to the original slot.

## Operational guidance

- For a date/time change, do not edit `pin_schedules` directly or change a row's timestamp while the worker may claim it.
- If cancelling then creating a replacement, verify cancellation is confirmed before relying on the new schedule; never assume a network error means the cancel failed.
- Do not alter a schedule snapshot or Storage object manually.
- For `publishing` or `unknown`, wait for/reconcile the publication outcome; do not cancel or create a replacement to "try again".
- Retry only when backend explicitly marks the failure safe.
- Board reassignment is only for the guarded failed-schedule workflow.

## Validation and safety

- Source inspection only; no tests, frontend build, TypeScript lint, CI or browser interaction executed.
- No SQL, DB, Storage, Pinterest, provider, payment or production operations performed.
