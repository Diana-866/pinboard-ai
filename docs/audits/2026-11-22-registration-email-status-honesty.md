# AUD-403 — registration must not claim an undelivered verification email

**Date:** 2026-11-22  
**Repository / branch:** Diana-866/pinboard-ai / main  
**Code base:** `b32597409054ce2b2fedc7732369a81b2edb21d5`  
**Documentation-only main HEAD before publication:** `d9ad180640636783c2591909ba63540c0aaea1f9`

## Root cause

`register()` already returns the truthful boolean `verificationEmailSent: sent`, but its `message` was unconditional and always said that a verification email had been sent. When SMTP is not configured or the transactional email delivery attempt fails, the account is created but the user receives a false instruction to check their inbox. The UI can use the boolean, but the message itself is still misleading and can strand a first-time user.

## Fix

- `backend/auth.js`: make the message conditional on the actual `sent` result. The successful wording remains unchanged. The failure wording states that sending failed and directs the user to request a new email from the sign-in page.
- `backend/test/auth.test.js`: strengthen the existing `a missing verification email does not fail the registration` regression test to require failure wording and forbid the successful-delivery claim.

This does not change registration success semantics, account creation, token generation, HTTP status, or the `verificationEmailSent` field.

## Verification boundary

- Current source and test were re-fetched from GitHub `main` before editing.
- Exact source/test diff is limited to the conditional message and its assertions.
- Source, test, required state/action/register docs and this audit are published in one atomic Git commit.
- Node tests were **not executed** in this connector-only environment. GitHub Actions has repeatedly failed before any step starts (`runner_id=0`, `steps=[]`); this is not a test pass or a test assertion failure.
- No production database, real SMTP, payment provider, Pinterest API, DNS, or production deployment was accessed or changed.

## PR #96 reconciliation

PR #96 (`spark/audit-2026-11-22`, head `bc3271dcf49b9a093974f03705eeb8a04149abc8)) remains open and unmerged.

Current reviewed risks:
1. The PR branch is based on a main revision predating the fail-closed consent fix. Its auth compatibility fallback must be reconciled so no retry can omit `terms_accepted_at`.
2. The PR introduces `PIN_IMAGE_PUBLIC_BASE_URL`, but its own `backend/storage.js` and `backend/pinImageLifecycle.js` still upload and delete through Supabase Storage. The variable changes the URL returned to clients only; it is not a provider migration. Enabling it before upload, lookup/reconciliation, deletion, retention and restore are switched/tested consistently can publish dead URLs and strand objects. Keep this cutover disabled.
3. PR author comments report local backend 1439/1439 after fixing a flaky port allocation, plus frontend/SQL checks; this session did not reproduce those runs. GitHub Actions still reported zero-step runner failures, and Vercel blocked the PR deployment because it could not verify the commit author's account.

## Owner / release gates

- UA-075 remains open: confirm migration 166 / `users.terms_accepted_at` in the intended project.
- UA-076 asks the owner to run backend tests locally if no usable CI runner is available; do not report runtime PASS until output is observed.
- Live SMTP, Prodamus, GPTunnel and Pinterest integrations remain unverified.

## Status

Source/test patch prepared for publication. Runtime verification is **NOT VERIFIED**. PR #96 is not merged; no storage cutover or production action was performed.
