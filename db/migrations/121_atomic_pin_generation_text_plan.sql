-- 121_atomic_pin_generation_text_plan.sql
-- Keep the billable text usage fact and normalized image-task plan in one
-- transaction. A successful provider response must not leave usage recorded
-- while its plan is absent (or vice versa).

create or replace function public.record_pin_generation_text_plan(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_provider_request_id text,
  p_provider_model text,
  p_usage jsonb,
  p_total_cost_rub numeric,
  p_tasks jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_tasks jsonb;
begin
  perform public.record_pin_generation_text_usage(
    p_user_id,
    p_idempotency_key,
    p_claim_token,
    p_provider_request_id,
    p_provider_model,
    p_usage,
    p_total_cost_rub
  );

  v_tasks := public.save_pin_generation_plan(
    p_user_id,
    p_idempotency_key,
    p_claim_token,
    p_tasks
  );

  return v_tasks;
end;
$$;

revoke all on function public.record_pin_generation_text_plan(text,text,uuid,text,text,jsonb,numeric,jsonb)
  from public,anon,authenticated;
grant execute on function public.record_pin_generation_text_plan(text,text,uuid,text,text,jsonb,numeric,jsonb)
  to service_role;
