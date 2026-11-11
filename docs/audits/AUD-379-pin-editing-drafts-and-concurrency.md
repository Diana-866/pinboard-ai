# AUD-379 — Pin editing, draft persistence and concurrent updates

**Date:** 2026-11-11  
**Status:** source audit complete; no production changes  
**Scope:** PinGenerator saved-pin hydration, description drafts, per-pin PATCH queue, title/aspect-ratio edits, board/account transitions, image replacement and delete lifecycle.

## Executive summary

The editor has meaningful safeguards: description drafts are stored locally, per-pin PATCH requests are serialized in enqueue order, old completions cannot clear newer drafts, and the latest description is flushed before scheduling. Saved-pin loading is cancelled when its effect is replaced, so stale reads do not overwrite a newer board selection. Image replacement uses compare-and-swap and reference-aware cleanup.

The principal unresolved correctness gap is cross-client concurrency: backend PATCH operations do not compare an expected row version. The frontend queue only serializes requests inside one mounted PinGenerator instance; another tab/device can still overwrite an edit. Pin deletion is also not implemented as a dedicated API operation, so a safe end-to-end pin/image deletion lifecycle is absent.

## Confirmed safeguards

### Draft and edit flow
- Description draft key is scoped to board ID and pin ID; the stored payload also validates the pin ID, string description and timestamp.
- Browser storage access/parse/quota errors are caught. A failed write does not block the server-save path.
- Description PATCH calls are serialized per pin in the component's pending-save map. A failed request does not poison later queued requests.
- Draft removal checks exact saved description, so a late older response cannot delete a newer local draft.
- Revision + board identity checks prevent stale completion from changing the currently displayed save status.
- Switching pins flushes the prior pin's pending description; leaving/changing board clears the debounce timer and enqueues the final pending draft.
- Scheduling flushes the current description and waits for the per-pin save queue before creating the schedule.
- Saved pins are reloaded from the selected board API. A malformed response is not interpreted as an empty pin list.
- Saved-pin fetch effect cancellation prevents an earlier board response from replacing a newer board's pins.

### Title and aspect ratio
- Title choice is optimistic in the canvas but only confirmed after PATCH succeeds; rollback uses the last server-confirmed title and guards against overwriting a newer selection.
- Aspect ratio edits use the same per-pin PATCH queue, track confirmed values, and rollback only if the optimistic value has not been superseded.
- Scheduling waits for pending writes for the current pin.

### Image replacement
- Upload route verifies pin ownership before linking the new Storage object.
- The update compares the currently stored image URL with the value observed before upload. If another upload wins, the stale upload is cleaned up only if unreferenced and a 409 is returned.
- Previous image cleanup is reference-aware; no unconditional delete is performed after replacement.

### Account boundary
- PinGenerator's Pinterest accounts, boards and generation-recovery rows are cleared/reloaded on user identity change.
- Parent app clears boards and schedule state on account switch; saved-pin loading is bound to the selected board and cancelled when that selection changes.
- Description drafts use board/pin UUIDs rather than a global "current draft" slot. Server ownership checks remain authoritative if a stale save is attempted after an account switch.

## Findings / gaps

### AUD-379-01 — Cross-tab/device lost update risk
Backend `PATCH /pins/:id` reads the owned pin, then updates by pin ID and board ID only. It does not include an expected `updated_at`, revision number or content hash in the update predicate. The frontend queue protects one component instance only. Two tabs/devices can both read version A, submit different edits, and the later write silently wins.

**Recommendation:** introduce explicit optimistic concurrency (e.g. expected `updated_at`/revision with compare-and-swap), return 409 with the current safe pin projection on conflict, and add integration coverage for concurrent edits. First confirm the deployed schema's timestamp semantics and every writer (regeneration, admin, workers) before choosing the version field.

### AUD-379-02 — No pin deletion API found
The inspected backend exposes PATCH, status, image upload, regeneration and board pin listing, but no dedicated `DELETE /pins/:id`. Consequently there is no complete user-facing pin deletion contract that coordinates scheduled publication cancellation, generation replay references, review queue rows, image references and Storage cleanup.

**Recommendation:** design deletion as a lifecycle operation with exact ownership, active schedule reconciliation, replay-reference retirement and reference-aware image retention. Do not add a bare SQL DELETE or direct Storage removal.

### AUD-379-03 — Drafts are browser-local, not server drafts
A local description draft survives reload only in the same browser profile/storage. If storage is blocked/cleared or the user moves to another device, unsaved text is unavailable. Server save remains primary; local draft is recovery support, not cross-device autosave.

### AUD-379-04 — Unmount flush is best-effort
Effect cleanup enqueues a pending description PATCH and logs rejection, but component unmount does not await it. A browser close, navigation termination or process kill can interrupt that network request. The local draft is deliberately retained unless the exact save succeeds, so the text can be recovered on the next visit.

### AUD-379-05 — Image deletion is reference-aware, but pin deletion lifecycle is incomplete
The upload replacement path safely checks references. This does not establish a general delete-pin workflow or prove that all schedule/replay/review references are reconciled before a pin or image is retired.

## Operational rules

- Do not interpret an unsaved-draft indicator as a server-confirmed save.
- If the description save fails, keep the local draft and retry; do not clear it manually.
- Do not treat a component unmount as proof that its final PATCH reached the server.
- Avoid editing the same pin in multiple tabs/devices until optimistic concurrency is implemented.
- Do not delete pin rows or Storage objects manually; first reconcile schedules, generation replay references, review queue and image references.
- For image replacement conflicts (409), reload the pin and let the user choose/reapply the desired image.

## Validation and safety

- Source inspection only; no tests, frontend build, TypeScript lint, CI or browser concurrency simulation executed.
- No SQL, DB, Storage, Pinterest, payment, provider or production operations performed.
