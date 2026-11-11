# AUD-102 — additional queues, journals and financial ledgers

Date: 2026-11-08
Branch: `feat/persisted-boards-api`

## Scope

Reviewed the durable tables introduced after the original core schema, with emphasis on direct client access, RLS, server-role grants, and SECURITY DEFINER RPC boundaries.

Tables reviewed:

- Pinterest scheduling/publication: `pin_schedules`, `pinterest_publish_attempts`.
- Pinterest OAuth state and refresh coordination: `pinterest_oauth_connection_state`, `pinterest_token_refresh_leases`, `pinterest_account_refresh_leases`.
- Billing and transactional email: `billing_webhook_exceptions`, `email_outbox`.
- Generation and regeneration: `pin_generation_requests`, `pin_generation_tasks`, `pin_regeneration_requests`, `pin_generation_credit_reservations`, `pin_generation_text_usage`.
- Provider refund reconciliation: `provider_refund_reconciliation_audit`.

## Findings

1. The reviewed tables enable RLS and revoke direct table access from `PUBLIC`, `anon`, and `authenticated`. This is essential because PinPosy uses its own JWT and does not use Supabase Auth's `auth.uid()` as its application identity.
2. Backend-managed queues and journals intentionally grant `service_role` the required direct operations. The sensitive operations are additionally constrained by SECURITY DEFINER RPCs that validate user ownership, idempotency keys, state transitions, claim tokens, or provider outcomes.
3. `billing_webhook_exceptions` is append-only for the service role: migration 029 grants INSERT, and migration 042 adds SELECT for protected admin audit reads. UPDATE and DELETE remain revoked.
4. `email_outbox` grants service-role SELECT/INSERT/UPDATE but not DELETE. Claim, acknowledgement and retry operations use dedicated RPCs with claim-token checks.
5. `pinterest_oauth_connection_state` and `provider_refund_reconciliation_audit` deliberately revoke even direct service-role table access. SECURITY DEFINER functions owned by the database migration owner perform the controlled writes. The refund audit sequence is also revoked from service_role.
6. Generation credit reservations are serialized with balance changes and generation completion; reservation amounts and request identity are checked before settlement. Generation task mutations use claim fencing, preventing an old worker from writing after a newer recovery claim.
7. Pinterest schedule and publication tables are backend-only. Ownership checks are performed in the relevant RPC/backend paths; RLS alone is not treated as the ownership boundary.

## Added regression test

`backend/test/extended-sensitive-table-privileges.integration.sql` checks:

- all 13 reviewed tables exist and have RLS enabled;
- neither `anon` nor `authenticated` can SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, or TRIGGER;
- expected CRUD privileges remain for backend-managed queues/journals;
- webhook exception audit remains append-only;
- email outbox cannot be deleted directly;
- OAuth state and provider-refund audit remain inaccessible even to direct service-role table operations.

Run this SQL only in disposable PostgreSQL CI after migrations 015–076. It has not been executed in this audit.

## Limitations / not verified

- No live Supabase catalog query or production SQL was executed.
- No cross-account runtime tests were run against a live backend.
- This audit does not prove every Express route enforces ownership; route-level checks remain a separate review.
- Storage bucket policies, signed URL expiration/revocation, and object deletion lifecycle are outside this audit.
- PostgreSQL integration tests and GitHub Actions must be run successfully before treating these controls as runtime-verified.

No migration was applied to the production Supabase project. No real Pinterest publication, generation, email delivery, or payment was initiated. PR #4 remains open and Draft; no merge or deployment was performed.
