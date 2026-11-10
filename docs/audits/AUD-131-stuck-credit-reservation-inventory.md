# AUD-131 — Stuck credit-reservation inventory and safe recovery boundaries

**Branch:** `feat/persisted-boards-api`  
**Scope:** source-level review of migrations 045, 053–054, 063, 066, 072–073, and 077–078. This document adds read-only staging/operations inventory queries. No runtime, PostgreSQL, provider API, or production access was performed.

## Findings

### 1. Active reservations have no automatic time-to-live

Migration 054 defines reservation states `reserved`, `settling`, `settled`, and `released`, with timestamps `created_at` and `updated_at`; it does not define `expires_at`. The reviewed migrations do not add a scheduled reservation-expiry worker.

This is a deliberate safety trade-off for billable provider calls: a timeout can occur after GPTunnel accepted work. Releasing a reservation merely because it is old could let the user spend the same credits again while the provider task is still running or its refund outcome is unknown.

**Operational consequence:** an unresolved `processing`/`unknown` request can hold credits indefinitely until its provider outcome is recovered or explicitly reconciled. This is safer than an automatic release, but there is no evidence in the reviewed code of an age-based alert/queue that ensures an operator notices it.

### 2. The recovery path is intentionally explicit

- A known provider task ID is polled/recovered; it must not be replaced by a fresh task.
- Failed provider tasks with missing `refunded` metadata remain unreconciled.
- Migration 073 permits an evidence-backed `NULL → boolean` refund reconciliation only while the request is still `processing` and the reservation is still `reserved`.
- Migration 077 finalizes only fully reconciled provider failures. The request status transition invokes the existing reservation-release trigger in the same transaction.
- Migration 078 adds authenticated administrator actions and an append-only journal; it does not change the financial mutation functions.
- A failed provider task with `provider_refunded = false` is still a known provider outcome. It represents a provider expense not refunded by GPTunnel; it is not a reason to infer a refund or to silently debit the user. The existing workflow releases the reserved user credits after the failure has been explicitly finalized.

Do not manually update request or reservation rows, and do not release reservations by age alone.

## Read-only inventory queries

Run only against a disposable/staging database or an explicitly approved read-only production session. These queries do not mutate data.

### Multi-pin generation reservations

```sql
select
  r.user_id,
  r.idempotency_key,
  r.amount as reserved_credits,
  r.status as reservation_status,
  r.created_at as reservation_created_at,
  r.updated_at as reservation_updated_at,
  q.id as request_id,
  q.status as request_status,
  q.error_code,
  count(t.id) as task_count,
  count(*) filter (
    where t.provider_task_id is not null
      and t.provider_outcome_status = 'failed'
      and t.provider_refunded is null
  ) as failed_tasks_with_unknown_refund,
  count(*) filter (
    where t.provider_task_id is not null
      and t.provider_outcome_status = 'failed'
      and t.provider_refunded is not null
      and t.provider_reconciled_at is not null
  ) as failed_tasks_reconciled,
  count(*) filter (
    where t.status in ('prepared','submitting','queued','running','unknown')
  ) as nonterminal_or_uncertain_tasks,
  max(t.updated_at) as last_task_update
from public.pin_generation_credit_reservations r
join public.pin_generation_requests q
  on q.user_id = r.user_id
 and q.idempotency_key = r.idempotency_key
left join public.pin_generation_tasks t
  on t.generation_request_id = q.id
where r.status in ('reserved','settling')
group by r.user_id, r.idempotency_key, r.amount, r.status,
         r.created_at, r.updated_at, q.id, q.status, q.error_code
order by r.created_at asc;
```

### Single-pin regeneration reservations

```sql
select
  r.user_id,
  r.idempotency_key,
  r.amount as reserved_credits,
  r.status as reservation_status,
  r.created_at as reservation_created_at,
  r.updated_at as reservation_updated_at,
  q.id as request_id,
  q.status as request_status,
  q.error_code,
  q.provider_task_id,
  q.provider_status,
  q.provider_price,
  q.provider_refunded,
  q.provider_reconciled_at,
  q.updated_at as request_updated_at
from public.pin_generation_credit_reservations r
join public.pin_regeneration_requests q
  on q.user_id = r.user_id
 and q.idempotency_key = r.idempotency_key
where r.status in ('reserved','settling')
order by r.created_at asc;
```

### Orphaned reservation check

This identifies active reservation rows without a matching generation or regeneration request. It is a diagnostic only; do not delete or release the returned rows.

```sql
select r.*
from public.pin_generation_credit_reservations r
where r.status in ('reserved','settling')
  and not exists (
    select 1 from public.pin_generation_requests g
    where g.user_id = r.user_id
      and g.idempotency_key = r.idempotency_key
  )
  and not exists (
    select 1 from public.pin_regeneration_requests x
    where x.user_id = r.user_id
      and x.idempotency_key = r.idempotency_key
  )
order by r.created_at asc;
```

## Operator decision procedure

For every old active reservation:

1. Identify request kind and exact request/task/provider task IDs from the durable journal.
2. Query GPTunnel using the existing provider task ID. If no task ID was saved but submission may have reached GPTunnel, use only the same persisted provider idempotency key and immutable request payload through the existing recovery path.
3. If the provider task is still queued/running, keep the reservation active and retry polling later.
4. If the provider confirms success, resume permanent Storage rehosting and the existing atomic completion path; do not create a second provider task.
5. If the provider confirms failure and includes a boolean refund fact, persist/replay that exact outcome and use the guarded finalizer.
6. If the refund fact is missing, obtain provider evidence and use the authorized reconciliation workflow. Never guess `true` or `false`.
7. Record the request ID, provider task ID, evidence reference, action UUID, final request status, reservation status, and resulting user balance in the incident record.

## Follow-up release gates

- Add a read-only reservation-age dashboard or alert with thresholds (for example, warning at 15 minutes and escalation at 1 hour); alerts must never release credits.
- Add a tested operator queue linking each active reservation to request/task state and provider reconciliation status.
- Add an integration test for the inventory queries and explicit coverage for reservations whose request row is missing or has an unexpected terminal state.
- Execute the existing PostgreSQL concurrency and provider-refund integration scripts in a disposable database before production approval.

## Verification limits

- Source review only; no PostgreSQL query was executed.
- No live GPTunnel lookup, user balance inspection, Supabase access, or production mutation was performed.
- The absence of `expires_at` and of a reservation cleanup worker was assessed from the reviewed migration/code paths, not from a live database catalog.
