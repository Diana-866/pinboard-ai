# AUD-085 — Provider refund reconciliation workflow

## Scope

This review follows the unknown-refund state introduced by provider outcome journals and the settlement guard in migrations 063–064 and 072.

## Finding

The provider outcome RPCs intentionally treat `provider_refunded = NULL` as unreconciled. However, their replay protection rejects a later replay that changes only the refund field. Without a dedicated reconciliation operation, a correctly retained reservation could remain blocked indefinitely.

## Change

Migration 073 adds two service-role-only RPCs:

- `reconcile_pin_generation_provider_refund`
- `reconcile_pin_regeneration_provider_refund`

Each operation:
1. Locks the parent request before the task row, preserving the established lock order.
2. Accepts only a still-processing request with a matching failed provider task and an unknown refund fact.
3. Requires an explicit boolean refund result and a non-empty evidence reference.
4. Requires the associated credit reservation to remain `reserved`.
5. Changes only `provider_refunded` and `provider_reconciled_at`; the provider task ID, terminal status, price, and error details remain immutable.
6. Writes an append-only audit row in `provider_refund_reconciliation_audit`.

The existing migration 072 triggers remain responsible for allowing the parent request to become terminal and for releasing the reservation. Migration 073 does not settle or release credits directly.

## Operator procedure

Do not call either RPC based only on an application error message. First obtain authoritative provider evidence for the exact provider task ID (provider dashboard, API response, or support ticket). Preserve a non-secret ticket/reference identifier.

For a multi-pin generation, call the RPC from a trusted Supabase SQL Editor session:

```sql
select public.reconcile_pin_generation_provider_refund(
  '<user_id>',
  '<idempotency_key>',
  1, -- task_index
  '<provider_task_id>',
  false, -- exact provider-confirmed refunded value
  '<provider evidence/ticket reference>'
);
```

For a single-pin regeneration:

```sql
select public.reconcile_pin_regeneration_provider_refund(
  '<user_id>',
  '<idempotency_key>',
  '<provider_task_id>',
  true, -- exact provider-confirmed refunded value
  '<provider evidence/ticket reference>'
);
```

After reconciliation, retry the same idempotency key through the application so the existing terminal-state transition can release the reservation. Do not manually update request or reservation rows.

Audit records can be reviewed by a database owner:

```sql
select request_kind, user_id, idempotency_key, task_index,
       provider_task_id, provider_refunded, evidence_reference, reconciled_at
  from public.provider_refund_reconciliation_audit
 order by reconciled_at desc;
```

## Important limitation

Migration 073 intentionally accepts only requests still in `processing` with an active `reserved` credit reservation. It does not automatically repair historical requests that were already marked `failed` and had their reservations released before migration 072 was applied. Those rows require a separate read-only inventory and explicit accounting decision; do not reopen or debit them automatically.

## Verification status

An integration test covers both request types, the NULL-to-boolean transition, reservation release through existing triggers, audit insertion, and conflicting replay rejection. The test is wired into the atomic-payment GitHub Actions workflow. A successful CI run and application to the production Supabase project have not yet been confirmed.
