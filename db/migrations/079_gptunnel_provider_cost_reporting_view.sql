-- 079_gptunnel_provider_cost_reporting_view.sql
-- Read-only normalized reporting surface. Source journals remain authoritative.
-- Unknown costs/refund outcomes are NULL, never silently converted to zero.

create or replace view public.gptunnel_provider_cost_ledger as
select
  'generation_image'::text as operation_type,
  t.id::text as source_row_id,
  r.user_id,
  r.idempotency_key,
  t.task_index::integer as task_index,
  t.provider_task_id as provider_operation_id,
  t.model as provider_model,
  'RUB'::text as cost_currency,
  t.provider_quote_price as quoted_cost_rub,
  t.provider_price as gross_cost_rub,
  t.provider_refunded as provider_refunded,
  case
    when t.provider_outcome_status = 'succeeded' then t.provider_price
    when t.provider_outcome_status = 'failed' and t.provider_refunded is false then t.provider_price
    when t.provider_outcome_status = 'failed' and t.provider_refunded is true then 0::numeric
    else null::numeric
  end as net_known_cost_rub,
  case
    when t.provider_outcome_status = 'succeeded' and t.provider_price is not null then 'known'
    when t.provider_outcome_status = 'failed' and t.provider_refunded is false and t.provider_price is not null then 'known_unrefunded_failure'
    when t.provider_outcome_status = 'failed' and t.provider_refunded is true then 'known_refunded_failure'
    when t.provider_outcome_status = 'failed' and t.provider_refunded is null then 'refund_unknown'
    else 'outcome_pending'
  end::text as accounting_status,
  t.provider_reconciled_at as reconciled_at,
  t.created_at
from public.pin_generation_tasks t
join public.pin_generation_requests r on r.id = t.generation_request_id

union all

select
  'regeneration_image'::text as operation_type,
  q.id::text as source_row_id,
  q.user_id,
  q.idempotency_key,
  null::integer as task_index,
  q.provider_task_id as provider_operation_id,
  q.model as provider_model,
  'RUB'::text as cost_currency,
  q.provider_quote_price as quoted_cost_rub,
  q.provider_price as gross_cost_rub,
  q.provider_refunded as provider_refunded,
  case
    when q.provider_status = 'done' then q.provider_price
    when q.provider_status = 'failed' and q.provider_refunded is false then q.provider_price
    when q.provider_status = 'failed' and q.provider_refunded is true then 0::numeric
    else null::numeric
  end as net_known_cost_rub,
  case
    when q.provider_status = 'done' and q.provider_price is not null then 'known'
    when q.provider_status = 'failed' and q.provider_refunded is false and q.provider_price is not null then 'known_unrefunded_failure'
    when q.provider_status = 'failed' and q.provider_refunded is true then 'known_refunded_failure'
    when q.provider_status = 'failed' and q.provider_refunded is null then 'refund_unknown'
    else 'outcome_pending'
  end::text as accounting_status,
  q.provider_reconciled_at as reconciled_at,
  q.created_at
from public.pin_regeneration_requests q

union all

select
  'generation_text'::text as operation_type,
  u.id::text as source_row_id,
  u.user_id,
  u.idempotency_key,
  null::integer as task_index,
  u.provider_request_id as provider_operation_id,
  u.provider_model as provider_model,
  u.cost_currency,
  null::numeric as quoted_cost_rub,
  u.total_cost_rub as gross_cost_rub,
  null::boolean as provider_refunded,
  case when u.usage_status = 'recorded' then u.total_cost_rub else null::numeric end as net_known_cost_rub,
  case
    when u.usage_status = 'recorded' then 'known'
    when u.usage_status = 'cost_missing' then 'cost_missing'
    else 'usage_status_unknown'
  end::text as accounting_status,
  null::timestamptz as reconciled_at,
  u.created_at
from public.pin_generation_text_usage u;

comment on view public.gptunnel_provider_cost_ledger is
  'Read-only normalized GPTunnel cost reporting. NULL net cost means unresolved/unknown, not zero.';

revoke all on public.gptunnel_provider_cost_ledger from public, anon, authenticated;
grant select on public.gptunnel_provider_cost_ledger to service_role;
