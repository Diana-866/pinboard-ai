-- Allow a failed schedule to move to another verified Pinterest board.
-- This is a recovery operation, not a retry: it is fenced by the same
-- publication-attempt and publication journal checks as safe retry.
create or replace function public.change_failed_pin_schedule_board(
  p_user_id text,
  p_schedule_id uuid,
  p_new_board_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid;
  v_account public.pinterest_accounts%rowtype;
  v_schedule public.pin_schedules%rowtype;
  v_attempt public.pinterest_publish_attempts%rowtype;
begin
  if p_new_board_id is null or btrim(p_new_board_id) = '' or length(btrim(p_new_board_id)) > 128 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_board');
  end if;

  -- Match the account -> schedule lock order used by disconnect/retry paths.
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

  -- Only repair the specific terminal preflight failure this action is designed for.
  -- Never let a generic/ambiguous publication failure be re-routed to another board.
  if coalesce(v_schedule.last_error, '') !~* '(Выбранная доска не найдена или недоступна|Pinterest не подтвердил принадлежность выбранной доски аккаунту)' then
    return jsonb_build_object('ok', false, 'reason', 'board_change_not_applicable');
  end if;

  -- A publication attempt is acceptable only when its terminal journal
  -- explicitly proves that the remote POST did not have an ambiguous outcome.
  select * into v_attempt
    from public.pinterest_publish_attempts
   where pin_id = v_schedule.pin_id
     and pinterest_account_id = v_account_id
   for update;
  if found and (v_attempt.status <> 'failed' or not v_attempt.retry_safe) then
    return jsonb_build_object('ok', false, 'reason', 'publication_attempt_exists');
  end if;

  if exists (
    select 1 from public.pinterest_publications
     where pin_id = v_schedule.pin_id
       and pinterest_account_id = v_account_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'publication_attempt_exists');
  end if;

  if exists (
    select 1 from public.pin_schedules active
     where active.pin_id = v_schedule.pin_id
       and active.pinterest_account_id = v_account_id
       and active.id <> v_schedule.id
       and active.status in ('scheduled', 'publishing', 'published', 'unknown')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'active_schedule_exists');
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
     set pinterest_board_id = btrim(p_new_board_id),
         status = 'scheduled',
         original_scheduled_at = coalesce(original_scheduled_at, scheduled_at),
         scheduled_at = now(),
         attempts = 0,
         next_attempt_at = null,
         last_error = null,
         updated_at = now()
   where id = v_schedule.id;

  return jsonb_build_object('ok', true, 'schedule_id', v_schedule.id);
end;
$$;

revoke all on function public.change_failed_pin_schedule_board(text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.change_failed_pin_schedule_board(text,uuid,text)
  to service_role;
