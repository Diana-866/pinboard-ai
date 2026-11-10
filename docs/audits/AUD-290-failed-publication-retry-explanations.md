# AUD-290 — explain safe-retry blockers for failed Pinterest publications

## Problem

The backend already computes safe retryability and a machine-readable reason for failed schedules. The API deliberately strips raw provider diagnostics and worker claim tokens, but the calendar only showed a generic “safe retry not confirmed” message. Users could not understand whether they needed to reconnect Pinterest, choose a board, inspect an existing publication, or wait for journal verification.

## Changes

- Added a frontend reason-to-message mapper for the backend's known retryability reason codes: account unavailable, missing board, unavailable Pin, existing publication, attempt identity mismatch, non-retryable/ambiguous attempt, active duplicate schedule, unavailable metadata, and changed status.
- Added complete RU/EN/ES/PT/DE/FR/ZH messages.
- The failed-publication details panel now shows the mapped explanation whenever retry is blocked, including schedules without an account ID.
- Unknown or missing reason codes use a safe generic explanation. Raw server/provider strings are never rendered.
- Added unit tests for known mappings, unknown secret-like input, missing reason, and unsupported locale fallback.

## Safety

- No retry eligibility was relaxed.
- No automatic retry was introduced.
- Unknown/ambiguous Pinterest outcomes remain blocked unless the existing server policy explicitly marks an attempt safe.
- Backend diagnostic redaction and worker fencing remain unchanged.

## Verification

- Changed frontend files and tests were read back from the PR branch.
- Tests, typecheck, and production build were not executed locally.
- No production migration, deployment, merge, or worker action was performed.
