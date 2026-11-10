-- 061_pinterest_scheduled_publish_account_lock_order.sql
-- Migration 060 redefined begin_scheduled_pinterest_publish without the
-- account-first lock introduced in 056. Restore account -> schedule -> attempt
-- so publication reservation is serialized with disconnect and manual retry.

create or replace function public.begin_scheduled_pinterest_publish(
  p_user_id text,
  p_schedule_id uuid,
  p_claim_token uuid,
  p_pin_id uuid,
  p_pinterest_account_id uuid,
  p_pinterest_board_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule public.pin_schedules%rowtype;
begin
  if p_claim_token is null then
    raise exception 'schedule claim token is required' using errcode='40001';
  end if;

  -- Match disconnect_pinterest_account_v2 and retry_failed_pin_schedule:
  -- account lock first, then schedule. This prevents both a disconnect race
  -- and an account<->schedule deadlock.
  perform 1
    from public.pinterest_accounts a
   where a.id = p_pinterest_account_id
     and a.user_id = p_user_id
     and a.disconnected_at is null
     and a.access_token is not null
   for update;
  if not found then
    raise exception 'Pinterest account not found or disconnected' using errcode='42501';
  end if;

  select * into v_schedule
    from public.pin_schedules
   where id=p_schedule_id
     and user_id=p_user_id
   for update;

  if not found
     or v_schedule.status <> 'publishing'
     or v_schedule.claim_token is distinct from p_claim_token
     or v_schedule.pin_id <> p_pin_id
     or v_schedule.pinterest_account_id is distinct from p_pinterest_account_id
     or v_schedule.pinterest_board_id is distinct from p_pinterest_board_id then
    raise exception 'schedule claim is no longer current' using errcode='40001';
  end if;

  return public.begin_pinterest_publish_v2(
    p_user_id,p_pin_id,p_pinterest_account_id,p_pinterest_board_id
  );
end;
$$;


revoke all on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  to service_role;
