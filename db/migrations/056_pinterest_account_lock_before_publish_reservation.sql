-- 056_pinterest_account_lock_before_publish_reservation.sql
-- Serialize publication reservation with account disconnect. The lock order is
-- account -> schedule, matching disconnect and manual retry, so disconnect
-- cannot commit between the active-account check and durable attempt creation.

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

  -- Hold the account row through the durable attempt reservation. Disconnect
  -- updates this row before touching queued schedules, so exactly one action
  -- wins: reservation first means in-flight; disconnect first means no POST.
  perform 1
    from public.pinterest_accounts a
   where a.id = p_pinterest_account_id
     and a.user_id = p_user_id
     and a.disconnected_at is null
     and a.access_token is not null
   for update;
  if not found then
    raise exception 'Pinterest account not found or disconnected' using errcode = '42501';
  end if;

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

revoke all on function public.begin_pinterest_publish_v2(text,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.begin_pinterest_publish_v2(text,uuid,uuid,text)
  to service_role;
grant execute on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  to service_role;
