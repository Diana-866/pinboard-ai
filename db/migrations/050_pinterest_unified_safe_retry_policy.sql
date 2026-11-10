-- 050_pinterest_unified_safe_retry_policy.sql
-- Retry only when the durable failure journal explicitly proves that the
-- Pinterest create request was rejected before a remote pin could be created.
-- Existing failed rows default to false: historical ambiguity stays blocked.
alter table public.pinterest_publish_attempts
  add column if not exists retry_safe boolean not null default false;

create or replace function public.begin_pinterest_publish_v2(
  p_user_id text,
  p_pin_id uuid,
  p_pinterest_account_id uuid,
  p_pinterest_board_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_publication public.pinterest_publications%rowtype;
  v_inserted integer := 0;
begin
  perform 1
    from public.pins p
    join public.boards b on b.id = p.board_id
    join public.projects pr on pr.id = b.project_id
   where p.id = p_pin_id
     and pr.user_id::text = p_user_id;
  if not found then
    raise exception 'pin not found for user' using errcode = '42501';
  end if;

  perform 1
    from public.pinterest_accounts a
   where a.id = p_pinterest_account_id
     and a.user_id = p_user_id
     and a.disconnected_at is null
     and a.access_token is not null;
  if not found then
    raise exception 'Pinterest account not found or disconnected' using errcode = '42501';
  end if;

  -- Historical rows from before account IDs existed cannot be assigned safely.
  -- Block publication rather than risk duplicating a remote pin in the wrong account.
  if exists (
       select 1 from public.pinterest_publications
        where pin_id = p_pin_id and pinterest_account_id is null
     )
     or exists (
       select 1 from public.pinterest_publish_attempts
        where pin_id = p_pin_id and pinterest_account_id is null
     ) then
    return jsonb_build_object(
      'status','unknown',
      'message','Legacy publication history has no verified Pinterest account mapping; manual reconciliation required'
    );
  end if;

  select * into v_publication
    from public.pinterest_publications
   where pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id;
  if found then
    return jsonb_build_object(
      'status','published',
      'pinterest_pin_id',v_publication.pinterest_pin_id,
      'pinterest_board_id',v_publication.pinterest_board_id
    );
  end if;

  insert into public.pinterest_publish_attempts(
    user_id, pin_id, pinterest_account_id, pinterest_board_id, status
  ) values (
    p_user_id, p_pin_id, p_pinterest_account_id, p_pinterest_board_id, 'processing'
  )
  on conflict (pin_id, pinterest_account_id)
    where pinterest_account_id is not null
  do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return jsonb_build_object('status','started');
  end if;

  select * into v_attempt
    from public.pinterest_publish_attempts
   where pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id
   for update;

  if v_attempt.user_id <> p_user_id then
    raise exception 'pin publication owner mismatch' using errcode = '42501';
  end if;

  if v_attempt.status = 'published' then
    return jsonb_build_object('status','published','pinterest_pin_id',v_attempt.pinterest_pin_id);
  elsif v_attempt.status = 'unknown' then
    return jsonb_build_object('status','unknown','message','Publication outcome requires manual reconciliation');
  elsif v_attempt.status = 'processing' then
    if v_attempt.updated_at < now() - interval '15 minutes' then
      update public.pinterest_publish_attempts
         set status='unknown', last_error='Worker stopped before outcome was confirmed', updated_at=now()
       where id=v_attempt.id;
      return jsonb_build_object('status','unknown','message','Stale publication requires manual reconciliation');
    end if;
    return jsonb_build_object('status','processing');
  elsif v_attempt.status = 'failed' and v_attempt.retry_safe then
    update public.pinterest_publish_attempts
       set status='processing',
           retry_safe=false,
           pinterest_board_id=p_pinterest_board_id,
           attempt_count=attempt_count+1,
           last_error=null,
           updated_at=now()
     where id=v_attempt.id;
    return jsonb_build_object('status','started');
  end if;

  if v_attempt.status = 'failed' then
    return jsonb_build_object('status','failed','message','Previous Pinterest rejection is not marked safe to retry');
  end if;

  return jsonb_build_object('status','processing');
end;
$$;

create or replace function public.fail_pinterest_publish_v2(
  p_user_id text,
  p_pin_id uuid,
  p_pinterest_account_id uuid,
  p_error text,
  p_outcome_unknown boolean default true
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.pinterest_publish_attempts
     set status=case when p_outcome_unknown then 'unknown' else 'failed' end,
         retry_safe=not p_outcome_unknown,
         last_error=left(coalesce(p_error,'Publication failed'),500),
         updated_at=now()
   where pin_id=p_pin_id
     and pinterest_account_id=p_pinterest_account_id
     and user_id=p_user_id
     and status='processing';
  if not found then
    raise exception 'active account publication attempt not found';
  end if;
end;
$$;

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
  v_attempt public.pinterest_publish_attempts%rowtype;
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

  -- Only a failed journal explicitly marked retry_safe by the failure RPC
  -- may be retried. Legacy failed rows default to false and remain blocked.
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
     set status = 'scheduled',
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

revoke all on function public.begin_pinterest_publish_v2(text,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.fail_pinterest_publish_v2(text,uuid,uuid,text,boolean)
  from public, anon, authenticated;
revoke all on function public.retry_failed_pin_schedule(text,uuid)
  from public, anon, authenticated;
grant execute on function public.begin_pinterest_publish_v2(text,uuid,uuid,text)
  to service_role;
grant execute on function public.fail_pinterest_publish_v2(text,uuid,uuid,text,boolean)
  to service_role;
grant execute on function public.retry_failed_pin_schedule(text,uuid)
  to service_role;
