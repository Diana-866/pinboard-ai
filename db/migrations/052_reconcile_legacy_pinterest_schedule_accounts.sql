-- 052_reconcile_legacy_pinterest_schedule_accounts.sql
-- Explicitly bind legacy schedules only after the backend verifies the selected
-- Pinterest board against an active account. Never infer from user-level data.
create or replace function public.reconcile_legacy_pinterest_schedule_account(
  p_user_id text,
  p_schedule_id uuid,
  p_pinterest_account_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_schedule public.pin_schedules%rowtype;
begin
  select * into v_schedule
    from public.pin_schedules
   where id = p_schedule_id
     and user_id = p_user_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'schedule_not_found');
  end if;

  if v_schedule.pinterest_account_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'account_already_assigned');
  end if;

  if v_schedule.status not in ('scheduled', 'failed') then
    return jsonb_build_object('ok', false, 'reason', 'schedule_not_reconcilable');
  end if;

  if v_schedule.pinterest_board_id is null then
    return jsonb_build_object('ok', false, 'reason', 'board_missing');
  end if;

  if not exists (
    select 1
      from public.pins p
      join public.boards b on b.id = p.board_id
      join public.projects pr on pr.id = b.project_id
     where p.id = v_schedule.pin_id
       and pr.user_id::text = p_user_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'pin_unavailable');
  end if;

  perform 1
    from public.pinterest_accounts a
   where a.id = p_pinterest_account_id
     and a.user_id = p_user_id
     and a.disconnected_at is null
     and a.access_token is not null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'account_unavailable');
  end if;

  -- Any existing publish journal or ledger entry means the remote outcome may
  -- already exist. Do not attach a new identity and risk a duplicate.
  if exists (
    select 1 from public.pinterest_publish_attempts
     where user_id = p_user_id and pin_id = v_schedule.pin_id
  ) or exists (
    select 1 from public.pinterest_publications
     where user_id = p_user_id and pin_id = v_schedule.pin_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'publication_history_exists');
  end if;

  if exists (
    select 1 from public.pin_schedules other
     where other.id <> v_schedule.id
       and other.pin_id = v_schedule.pin_id
       and other.pinterest_account_id = p_pinterest_account_id
       and other.status in ('scheduled', 'publishing', 'published', 'unknown')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'active_schedule_exists');
  end if;

  update public.pin_schedules
     set pinterest_account_id = p_pinterest_account_id,
         status = 'scheduled',
         claim_token = null,
         next_attempt_at = null,
         last_error = null,
         updated_at = clock_timestamp()
   where id = v_schedule.id
     and user_id = p_user_id
     and pinterest_account_id is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'schedule_changed');
  end if;

  return jsonb_build_object(
    'ok', true,
    'schedule_id', v_schedule.id,
    'pinterest_account_id', p_pinterest_account_id
  );
end;
$$;

revoke all on function public.reconcile_legacy_pinterest_schedule_account(text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_legacy_pinterest_schedule_account(text,uuid,uuid)
  to service_role;
