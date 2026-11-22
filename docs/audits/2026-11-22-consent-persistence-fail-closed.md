# AUD-402 — fail-closed persistence of registration consent

**Date:** 2026-11-22  
**Base:** `main` at `5486a264f61acf5ec0dc26a74266201279325fea`  
**Code commit:** `91e6edf09ca5eefe611556bb0bb70f176d3fc0ab`  
**Regression-test commit:** `f4ddd2508a3d3ddb8e0bc60ae66b19a321daeabd`

## Root cause

Registration required `termsAccepted === true`, and the first user insert included the server-generated `terms_accepted_at`. However, the compatibility fallback treated `terms_accepted_at` as an optional profile column. If PostgREST reported that migration 166 was missing, the code logged a warning and retried an insert without the consent timestamp. A successful registration could therefore create an account while losing the legal record the server had just required.

A second related path existed: when any optional profile field (for example `name`) was missing, the fallback omitted every profile field, including the consent timestamp. That meant even a deployment where the consent column existed could lose the record after a missing-name error.

## Changes

- `backend/auth.js`: missing `terms_accepted_at` now fails closed with HTTP 503 before any fallback insert. The server does not create an account or issue an email-verification token without persisting consent.
- `backend/auth.js`: compatibility retry for a missing non-legal profile field now preserves the server-generated `terms_accepted_at`.
- `backend/test/auth.test.js`: the existing optional-profile retry test asserts the consent timestamp is preserved and parseable.
- `backend/test/auth.test.js`: new regression test simulates the missing consent column and asserts one insert attempt, zero accounts, and zero verification-token issuance.

## Verification

- GitHub file re-fetch after writes confirmed the code and test content and current blob SHAs:
  - `backend/auth.js`: `27df9536e2fda081fc6812f22147ff6cab70c712`
  - `backend/test/auth.test.js`: `93e7554f0aa1151905e0e9aa0e00b4227e1f8b24`
- **Node test execution: NOT RUN in this session.** The available GitHub file-edit connector can publish repository files but does not provide a local checkout/runtime. The repository's recent Actions runs have been failing before steps start (`runner_id=0`, `steps=0`); no claim of a passing CI run is made.
- No production database, production data, payment provider, Pinterest API, DNS, or production deployment was accessed or changed.

## Owner action / release gate

Before relying on live registration, verify that migration `db/migrations/166_user_terms_consent.sql` has been applied to the intended database and that `public.users.terms_accepted_at` exists. The migration is additive; this report does not apply it. If absent, registration will now return a controlled 503 rather than silently create an account without a consent record.

## Status

Code and regression test published to `main`; runtime verification remains **NOT VERIFIED**. This is a security/correctness fix, not evidence that registration, email delivery, or production readiness has passed end-to-end.


## Adjacent release review — PR #96 (same work period)

- PR #96 remains open at head `bc3271dcf49b9a093974f03705eeb8a04149abc8`, based on the pre-fix main `5486a264f61acf5ec0dc26a74266201279325fea`; it was not merged.
- The PR branch's auth fallback still drops `terms_accepted_at`; a review comment was added to PR #96 (comment ID `7080191005`) requesting reconciliation with the main fix.
- The PR's proposed `PIN_IMAGE_PUBLIC_BASE_URL` only rewrites returned image URLs. Upload and deletion still call Supabase Storage, so enabling a target S3/CDN base before implementing the actual target provider would create broken URLs and leave deletion on the old provider. The review comment requests keeping this cutover disabled until upload, list/reconcile, delete, retention and restore are provider-consistent.
- Actions run `45030088767` for test commit `f4ddd2508a3d3ddb8e0bc60ae66b19a321daeabd` failed before steps: job `137231548164`, `runner_id=0`, empty `steps`. This is not evidence that the test failed or passed; runtime remains NOT VERIFIED.
- Vercel status was `success` for the source and test commits and for the then-current documentation HEAD `1093a34c4fd599bcc4584e99458527af2b555684`. This is a provider status, not proof of production deployment.
