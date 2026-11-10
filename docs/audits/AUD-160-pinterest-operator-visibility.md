# AUD-160 — Pinterest operator visibility and safe reconciliation workflow

**Scope:** source-level review of the Pinterest scheduler recovery, operator reconciliation API, admin frontend, and scheduler runbook on `feat/persisted-boards-api` (HEAD `e61a3f19ba1e73befe930302419d7e1893ae9915`).

## Confirmed safe behavior

- `POST /admin/pinterest/reconcile-unknown-publication` is registered behind `adminActionLimiter`, `requireAuth`, and `requireAdmin`.
- The operator identity passed to the reconciliation module comes from verified `req.userId`; body-supplied `user_id`, `operator_user_id`, `attempt_id`, or `status` do not override it.
- Migration 082 independently rechecks administrator status under database locks and follows the established account → schedule → attempt lock order.
- The RPC accepts only a stale `unknown` schedule with no active claim and a matching stale `unknown`/`processing` attempt whose `retry_safe=false`. It validates owner, pin, account, reserved board, and consistency with any existing remote identity.
- Successful reconciliation writes the publication ledger, updates the selected schedule/attempt to `published`, and appends an immutable operator receipt in one transaction. Exact action replay is idempotent; changed replay payloads and a second action for the same schedule are rejected.
- The endpoint does not accept a “not published” assertion and does not enable retry. The existing scheduler runbook explicitly says not to automatically requeue `unknown` schedules.

## Finding AUD-160-A — reconciliation exists as an API action, but there is no operator discovery/read UI

**Severity: operational gap (not a confirmed publication-integrity vulnerability).**

The backend exposes the narrow positive-only reconciliation POST, but the inspected admin frontend `frontend/src/components/admin/AdminPanel.tsx` has no Pinterest tab or reconciliation component. The repository tree contains no separate Pinterest admin UI component. The route set contains no read-only admin endpoint to list stale `publishing`, `unknown`, or overdue `scheduled` records and their attempt/journal diagnostics.

Consequences:
- An operator cannot discover unresolved Pinterest publications from the admin panel.
- The operator cannot inspect attempt state, `retry_safe`, timestamps, last error, or reserved account/board from a purpose-built admin view.
- The safe reconciliation action is difficult to use operationally because its required schedule ID and exact remote pin/board IDs must be obtained elsewhere.
- The API action is not itself a retry path, but the absence of an integrated workflow increases the chance of manual mistakes or unsupported direct database inspection.

### Recommended narrow follow-up

Add a read-only, paginated admin inventory endpoint and a small admin panel section. It should expose only the minimum operational fields needed to triage:
- schedule ID, owner identifier (or privacy-safe account reference), pin ID, account ID, reserved board ID;
- schedule status, scheduled/updated timestamps, claim presence (never the claim token), last error, and next-attempt timestamp;
- matching attempt status, `retry_safe`, attempt updated timestamp, and already-recorded Pinterest remote IDs;
- a derived reason/category such as `overdue_scheduled`, `stale_publishing`, `unknown`, `missing_attempt`, or `identity_conflict`.

Guardrails:
1. Read-only endpoint only; no status mutation, retry, publish, cancel, or “mark not published” control.
2. Require `requireAuth` + `requireAdmin`; apply bounded query parameters, pagination, and `adminActionLimiter` (or a dedicated admin-read limiter).
3. Never return OAuth tokens, claim tokens, encryption material, or full user-private content snapshots.
4. Treat `unknown` and stale `publishing` as unresolved, not as retry candidates. Show `retry_safe=false` explicitly.
5. Keep the positive-only reconciliation action separate and require external evidence of the exact remote pin and board. Never infer non-publication from absence in Pinterest search.
6. Add tests for authorization, pagination/limits, redaction, state classification, and proof that the read route has no writes or calls to Pinterest.
7. Do not enable the external scheduler until the migration/key/access/monitoring prerequisites in `docs/pinterest/scheduler-setup.md` have been verified.

## Operational readiness reminder

The scheduler runbook still states that the external cron is not configured in production and migrations 015–017 have not been applied to the working database. It also lists the later Pinterest migration prerequisites and requires the token-encryption key and Pinterest access verification. These are documented prerequisites, not a live production-state verification in this audit.

## Verification limits

- Reviewed source and existing tests; did not execute Node tests or PostgreSQL integration SQL.
- Did not query or modify production Supabase, Pinterest, cron, hosting, or deployment.
- Did not publish, retry, or reconcile any real pin.
- PR #4 remains open and Draft; no merge or deployment was performed.
