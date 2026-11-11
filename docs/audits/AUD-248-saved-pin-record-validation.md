# AUD-248 — Validate persisted pin records before rendering

Date: 2026-11-09

## Finding

The saved-pins response helper only checked `Array.isArray`. The board restore flow then mapped each item into a card, coercing a missing ID to the string `"undefined"` and a missing image URL to an empty string. Duplicate IDs could also create ambiguous React/card identity. This allowed malformed API data to appear as broken saved pins rather than a recoverable load error.

## Change

`frontend/src/utils/savedPinsResponse.ts` now validates each record before the UI maps it:
- each entry must be a non-array object;
- `id` must be a non-empty string and unique within the response;
- `image_url` must be a non-empty absolute HTTPS URL.

An empty array remains valid and still represents a genuinely empty board. Invalid payloads throw into the existing saved-pins load-error state, preserving the distinction between an empty board and a failed/incomplete response.

## Regression coverage

Updated `frontend/src/utils/savedPinsResponse.test.ts` for:
- valid and empty arrays;
- null/object/string top-level payloads;
- null records and missing/blank IDs;
- duplicate IDs;
- missing, malformed, and non-HTTPS image URLs.

## User impact

A broken server response will no longer produce a card with a missing image or unstable identity. The user sees the existing load error and can retry, while a truly empty board continues to show the normal empty state.

## Verification status

- Source changes and test cases were written to `feat/persisted-boards-api`.
- Static GitHub readback and CI status are pending.
- Node tests, frontend build, and TypeScript checks were not run locally.
- No production database, live API, deployment, or merge was performed.

Status: FIXED_UNVERIFIED.

## Дополнительное исправление — AUD-249: pin-scoped description save status

The description save indicator was component-global. A delayed successful/failed PATCH for pin A could update the label while the user was viewing pin B, making the save indicator misleading.

The UI now tracks the pin ID associated with the save state. When another pin is selected, its own state is shown; if it has a local recovery draft, it is shown as unsaved with the retry action. Restored drafts are scoped the same way.

Verification: static readback pending; no local unit tests, TypeScript, or frontend build were run. Status: FIXED_UNVERIFIED.
