# AUD-391 — authentication and recovery gates runbook

**Historical design checklist (superseded 2026-11-16).** Authentication/deletion gates have since been implemented in the mainline migrations and backend auth/account lifecycle code. The unchecked items below describe the earlier design snapshot, not current implementation status. Use docs/PROJECT_STATE.md and current source/tests for status; production rollout still requires separate verification and approval.


**Purpose:** implementation and validation checklist for the account lifecycle design in AUD-390.  
**Status:** design only. Do not execute against production.

## Before implementation

- [ ] Confirm actual production schema and applied canonical migration set using read-only catalog queries.
- [ ] Confirm the deployed definitions and grants for issue/consume password-reset and email-verification RPCs.
- [ ] Decide email reservation/reuse policy and obtain privacy/legal review.
- [ ] Confirm deletion state names and terminal/tombstone semantics with AUD-390.

## Required code and SQL changes

- [ ] Add authoritative active-state predicate; unknown/null lifecycle state must not be treated as active once migration is mandatory.
- [ ] Login: reject non-active user before JWT issuance.
- [ ] requireAuth: load lifecycle status and token_version together; fail closed on DB errors.
- [ ] Authenticated resend-verification: enforce status and token-version checks exactly as protected routes.
- [ ] Anonymous resend and forgot-password: do not issue tokens or send email for non-active users; keep generic response.
- [ ] Password reset issue RPC: lock user first, require active, then apply cooldown and insert token.
- [ ] Password reset consume RPC: identify candidate token without locking it, lock user first, re-read/lock token, require active, update password + token_version + used_at atomically.
- [ ] Email verification issue/consume RPCs: use user-first lock order and active-state gate.
- [ ] Deletion request RPC: transition state + increment token_version + revoke unused auth_tokens + append event and durable job in one transaction.
- [ ] Preserve SECURITY DEFINER fixed search_path and service_role-only execute grants.

## Email identity policy

Choose and document one:
- [ ] Reserve normalized email throughout pending deletion and a defined tombstone period.
- [ ] Release email only after anonymization; retained financial/support evidence must use a non-email pseudonymous reference.

Also specify pending/unverified accounts, duplicate deletion requests, normalization, support exceptions and unique-index behavior. Do not infer policy from current 409 response.

## Concurrency and regression tests

Run only against disposable PostgreSQL and staging:
- [ ] Login vs deletion transition.
- [ ] Old JWT vs deletion token_version increment.
- [ ] Reset issue/consume vs deletion.
- [ ] Verification issue/consume vs deletion.
- [ ] Duplicate registration vs tombstone anonymization/email release.
- [ ] Generic reset/resend responses for unknown and non-active accounts.
- [ ] Database outage fails closed.
- [ ] Verify no email dispatch for a non-active account.
- [ ] Browser tests for old links, expired links and recovery UX.

## Stop conditions

Stop rollout if any auth route issues a JWT, reset token or verification token for a non-active account; if a SQL RPC can mutate a non-active user; if email reuse is ambiguous; or if any race test produces a credential mutation after deletion commits.

## Operational boundary

This runbook is not permission to change production. Do not manually edit user rows, delete auth_tokens, rotate JWT secrets, send test mail to real users, or apply migrations to the live database as part of this audit.
