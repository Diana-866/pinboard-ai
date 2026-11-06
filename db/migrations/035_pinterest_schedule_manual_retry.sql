-- 035_pinterest_schedule_manual_retry.sql
-- Explicitly requeue a failed schedule only when the durable journal proves
-- that no Pinterest create attempt was ever reserved for this pin/account.
create or replace function public.retry_failed_pin_schedule(
  p_user_id text,
  p_schedule_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid;
  v_account public.pinterest_accounts%rowtype;
  v_schedule public.pin_schedules%rowtype;
begin
  -- Read the account ID first so locks follow disconnect's account -> schedule order.
  select pinterest_account_id into v_account_id
    from public.pin_schedules
   where id = p_schedule_id
     and user_id = p_user_id;
  if not found or v_account_id is null then
    return jsonb_build_object('ok', false, 'reason', 'schedule_not_found');
  end if;

  select * into v_account
    from public.pinterest_accounts
   where id = v_account_id
     and user_id = p_user_id
   for update;
  if not found or v_account.disconnected_at is not null or v_account.access_token is null then
    return jsonb_build_object('ok', false, 'reason', 'account_unavailable');
  end if;

  select * into v_schedule
    from public.pin_schedules
   where id = p_schedule_id
     and user_id = p_user_id
   for update;
  if not found or v_schedule.status <> 'failed'
     or v_schedule.pinterest_account_id <> v_account_id then
    return jsonb_build_object('ok', false, 'reason', 'schedule_not_retryable');
  end if;

  if v_schedule.pinterest_board_id is null or btrim(v_schedule.pinterest_board_id) = '' then
    return jsonb_build_object('ok', false, 'reason', 'board_missing');
  end if;

  -- Any journal row means a create attempt may have reached Pinterest. Even a
  -- "failed" attempt is not sufficient proof that the remote side did nothing.
  if exists (
    select 1 from public.pinterest_publish_attempts
     where pin_id = v_schedule.pin_id
       and pinterest_account_id = v_account_id
  ) or exists (
    select 1 from public.pinterest_publications
     where pin_id = v_schedule.pin_id
       and pinterest_account_id = v_account_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'publication_attempt_exists');
  end if;

  if not exists (
    select 1
      from public.pins p
      join public.boards b on b.id = p.board_id
      join public.projects pr on pr.id = b.project_id
     where p.id = v_schedule.pin_id
       and pr.user_id::text = p_user_id
       and p.image_url is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'pin_unavailable');
  end if;

  update public.pin_schedules
     set status = 'scheduled',
         scheduled_at = now(),
         next_attempt_at = null,
         last_error = null,
         updated_at = now()
   where id = v_schedule.id;

  return jsonb_build_object('ok', true, 'schedule_id', v_schedule.id);
end;
$$;

revoke all on function public.retry_failed_pin_schedule(text,uuid)
  from public, anon, authenticated;
grant execute on function public.retry_failed_pin_schedule(text,uuid)
  to service_role;
