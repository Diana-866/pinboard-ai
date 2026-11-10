-- AUD-086: read-only inventory of legacy provider-refund / credit-reservation states.
-- Run in Supabase SQL Editor as a database owner after migrations 063-073.
-- This file contains SELECT statements only. It never changes balances, requests,
-- provider facts, reservations, or audit records.

with generation_task_rollup as (
  select
    t.generation_request_id,
    count(*)::integer as task_count,
    count(*) filter (where t.status = 'failed')::integer as failed_task_count,
    count(*) filter (
      where t.provider_outcome_status = 'failed'
        and t.provider_refunded is null
    )::integer as failed_unknown_refund_count,
    count(*) filter (
      where t.provider_outcome_status = 'failed'
        and t.provider_refunded is not null
        and t.provider_reconciled_at is null
    )::integer as failed_missing_reconciliation_timestamp_count,
    count(*) filter (
      where t.provider_task_id is not null
        and t.provider_outcome_status is null
    )::integer as provider_task_without_outcome_count
  from public.pin_generation_tasks t
  group by t.generation_request_id
),
request_inventory as (
  select
    'generation'::text as request_kind,
    r.user_id,
    r.idempotency_key,
    r.status::text as request_status,
    r.created_at as request_created_at,
    r.updated_at as request_updated_at,
    cr.status::text as reservation_status,
    cr.amount as reserved_credits,
    coalesce(gtr.task_count, 0) as provider_task_count,
    coalesce(gtr.failed_task_count, 0) as failed_task_count,
    coalesce(gtr.failed_unknown_refund_count, 0) as failed_unknown_refund_count,
    coalesce(gtr.failed_missing_reconciliation_timestamp_count, 0)
      as failed_missing_reconciliation_timestamp_count,
    coalesce(gtr.provider_task_without_outcome_count, 0)
      as provider_task_without_outcome_count,
    null::text as request_provider_task_id,
    null::text as request_provider_status,
    null::boolean as request_provider_refunded,
    null::timestamptz as request_provider_reconciled_at
  from public.pin_generation_requests r
  left join public.pin_generation_credit_reservations cr
    on cr.user_id = r.user_id and cr.idempotency_key = r.idempotency_key
  left join generation_task_rollup gtr on gtr.generation_request_id = r.id

  union all

  select
    'regeneration'::text,
    r.user_id,
    r.idempotency_key,
    r.status::text,
    r.created_at,
    r.updated_at,
    cr.status::text,
    cr.amount,
    case when r.provider_task_id is null then 0 else 1 end,
    case when r.provider_status = 'failed' then 1 else 0 end,
    case when r.provider_status = 'failed' and r.provider_refunded is null
      then 1 else 0 end,
    case when r.provider_status = 'failed'
      and r.provider_refunded is not null
      and r.provider_reconciled_at is null then 1 else 0 end,
    case when r.provider_task_id is not null and r.provider_status is null
      then 1 else 0 end,
    r.provider_task_id,
    r.provider_status,
    r.provider_refunded,
    r.provider_reconciled_at
  from public.pin_regeneration_requests r
  left join public.pin_generation_credit_reservations cr
    on cr.user_id = r.user_id and cr.idempotency_key = r.idempotency_key
),
classified as (
  select *,
    case
      when request_status in ('failed','completed')
        and reservation_status = 'reserved'
        then 'TERMINAL_REQUEST_WITH_ACTIVE_RESERVATION'
      when request_status = 'failed'
        and reservation_status = 'released'
        and failed_unknown_refund_count > 0
        then 'LEGACY_FAILED_RELEASED_UNKNOWN_PROVIDER_REFUND'
      when request_status = 'failed'
        and reservation_status = 'released'
        and failed_missing_reconciliation_timestamp_count > 0
        then 'FAILED_RELEASED_MISSING_RECONCILIATION_TIMESTAMP'
      when request_status = 'failed'
        and reservation_status = 'released'
        and provider_task_without_outcome_count > 0
        then 'FAILED_RELEASED_PROVIDER_OUTCOME_MISSING'
      when request_status = 'processing'
        and reservation_status = 'reserved'
        and (failed_unknown_refund_count > 0
          or failed_missing_reconciliation_timestamp_count > 0)
        then 'PROCESSING_AWAITING_PROVIDER_REFUND_RECONCILIATION'
      when request_status = 'processing'
        and reservation_status = 'reserved'
        then 'PROCESSING_WITH_ACTIVE_RESERVATION'
      when reservation_status is null
        then 'REQUEST_WITHOUT_RESERVATION'
      else 'REVIEW_OTHER_STATE'
    end as inventory_class
  from request_inventory
)
select
  inventory_class,
  request_kind,
  user_id,
  idempotency_key,
  request_status,
  reservation_status,
  reserved_credits,
  provider_task_count,
  failed_task_count,
  failed_unknown_refund_count,
  failed_missing_reconciliation_timestamp_count,
  provider_task_without_outcome_count,
  request_provider_task_id,
  request_provider_status,
  request_provider_refunded,
  request_provider_reconciled_at,
  request_created_at,
  request_updated_at
from classified
where inventory_class <> 'PROCESSING_WITH_ACTIVE_RESERVATION'
order by
  case inventory_class
    when 'TERMINAL_REQUEST_WITH_ACTIVE_RESERVATION' then 1
    when 'LEGACY_FAILED_RELEASED_UNKNOWN_PROVIDER_REFUND' then 2
    when 'FAILED_RELEASED_MISSING_RECONCILIATION_TIMESTAMP' then 3
    when 'FAILED_RELEASED_PROVIDER_OUTCOME_MISSING' then 4
    when 'PROCESSING_AWAITING_PROVIDER_REFUND_RECONCILIATION' then 5
    else 6
  end,
  request_updated_at desc;

-- Separate orphan-reservation inventory: active holds without a matching
-- generation OR regeneration request. These require manual investigation.
select
  cr.user_id,
  cr.idempotency_key,
  cr.amount as reserved_credits,
  cr.status as reservation_status,
  cr.created_at,
  cr.updated_at,
  case
    when exists (
      select 1 from public.pin_generation_requests gr
       where gr.user_id = cr.user_id
         and gr.idempotency_key = cr.idempotency_key
    ) then 'MATCHES_GENERATION_REQUEST'
    when exists (
      select 1 from public.pin_regeneration_requests rr
       where rr.user_id = cr.user_id
         and rr.idempotency_key = cr.idempotency_key
    ) then 'MATCHES_REGENERATION_REQUEST'
    else 'ORPHAN_ACTIVE_RESERVATION'
  end as relationship
from public.pin_generation_credit_reservations cr
where cr.status = 'reserved'
  and not exists (
    select 1 from public.pin_generation_requests gr
     where gr.user_id = cr.user_id
       and gr.idempotency_key = cr.idempotency_key
  )
  and not exists (
    select 1 from public.pin_regeneration_requests rr
     where rr.user_id = cr.user_id
       and rr.idempotency_key = cr.idempotency_key
  )
order by cr.created_at;
