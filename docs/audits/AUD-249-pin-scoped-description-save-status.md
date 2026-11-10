# AUD-249 — Scope description save feedback to the active pin

Date: 2026-11-09

## Finding

The description save indicator used one component-wide state without recording which pin it belonged to. A delayed PATCH for pin A could finish after the user switched to pin B and update the shared label, causing the UI to claim B was saved (or failed) based on A's request.

## Fix

- Track the pin ID associated with the current description save state.
- Derive the visible status for the active pin only.
- If the active pin has a local recovery draft but no active status entry, show it as unsaved and expose the existing retry action.
- During saved-pin restoration, associate the initial unsaved status with the first pin containing a recovery draft; other pins' drafts are still detected independently when opened.
- Reset status identity when a different board starts loading.

## User impact

Switching between saved pins no longer transfers another pin's “Saved” or “Not saved” label to the currently visible description. A locally recovered draft continues to be visibly marked as unsaved for its own pin.

## Verification

Static GitHub readback pending. No local unit tests, TypeScript check, frontend build, browser test, deployment, or production database operation was performed.

Status: FIXED_UNVERIFIED.
