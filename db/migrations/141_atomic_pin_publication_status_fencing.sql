-- 141_atomic_pin_publication_status_fencing.sql
-- Serialize pin rejection, schedule creation and Pinterest publication against
-- the same pin row. App-level preflight checks alone are subject to TOCTOU races.

begin;

create or replace function public.guard_pin_rejection_from_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.status = 'rejected' and old.status is distinct from new.status then
    if exists (
      select 1 from public.pin_schedules s
       where s.user_id::text = (select pr.user_id::text
                            from public.boards b
                            join public.projects pr on pr.id = b.project_id
                           where b.id = old.board_id)
         and s.pin_id = old.id
         and s.status in ('scheduled', 'publishing', 'published', 'unknown')
    ) or exists (
      select 1 from public.pinterest_publish_attempts a
       where a.pin_id = old.id
         and a.user_id::text = (select pr.user_id::text
                            from public.boards b
                            join public.projects pr on pr.id = b.project_id
                           where b.id = old.board_id)
    ) or exists (
      select 1 from public.pinterest_publications p
       where p.pin_id = old.id
         and p.user_id::text = (select pr.user_id::text
                            from public.boards b
                            join public.projects pr on pr.id = b.project_id
                           where b.id = old.board_id)
    ) then
      raise exception 'pin has a schedule or publication history'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_pin_rejection_from_publication on public.pins;
create trigger guard_pin_rejection_from_publication
before update of status on public.pins
for each row execute function public.guard_pin_rejection_from_publication();

create or replace function public.guard_pin_schedule_insert_requires_approved_pin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_status text;
  v_owner_id text;
begin
  -- Lock order: pin before schedule/index writes. The scheduler's publish
  -- reservation uses account -> pin -> schedule, and pin status updates lock
  -- the same pin row before checking schedules.
  select p.status, pr.user_id::text
    into v_status, v_owner_id
    from public.pins p
    join public.boards b on b.id = p.board_id
    join public.projects pr on pr.id = b.project_id
   where p.id = new.pin_id
   for update of p;

  if not found or v_owner_id is distinct from new.user_id::text then
    raise exception 'pin not found for schedule owner'
      using errcode = '42501';
  end if;
  if v_status is distinct from 'approved' then
    raise exception 'only approved pins can be scheduled'
      using errcode = '55000';
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_pin_schedule_insert_requires_approved_pin on public.pin_schedules;
create trigger guard_pin_schedule_insert_requires_approved_pin
before insert on public.pin_schedules
for each row execute function public.guard_pin_schedule_insert_requires_approved_pin();

-- Manual and scheduled publication must lock in the same order and verify
-- approved status under that lock. This closes the race with pin rejection.
create or replace function public.begin_pinterest_publish_v2(
  p_user_id text,
  p_pin_id uuid,
  p_pinterest_account_id uuid,
  p_pinterest_board_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_publication public.pinterest_publications%rowtype;
  v_inserted integer := 0;
  v_pin_status text;
begin
  -- Verify ownership before taking provider-account and pin locks.
  perform 1
    from public.pins p
    join public.boards b on b.id = p.board_id
    join public.projects pr on pr.id = b.project_id
   where p.id = p_pin_id
     and pr.user_id::text = p_user_id;
  if not found then
    raise exception 'pin not found for user' using errcode = '42501';
  end if;

  -- Global lock order is account -> pin -> schedule/attempt.
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

  select p.status into v_pin_status
    from public.pins p
    join public.boards b on b.id = p.board_id
    join public.projects pr on pr.id = b.project_id
   where p.id = p_pin_id
     and pr.user_id::text = p_user_id
   for update of p;
  if not found then
    raise exception 'pin not found for user' using errcode = '42501';
  end if;
  if v_pin_status is distinct from 'approved' then
    return jsonb_build_object('status', 'pin_not_approved');
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
    if v_publication.user_id is distinct from p_user_id
       or v_publication.pinterest_board_id is distinct from p_pinterest_board_id
       or nullif(btrim(v_publication.pinterest_pin_id), '') is null then
      return jsonb_build_object(
        'status','unknown',
        'message','Existing publication ledger does not match the requested owner, account, or board; manual reconciliation required'
      );
    end if;
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

  if v_attempt.user_id is distinct from p_user_id then
    raise exception 'pin publication owner mismatch' using errcode = '42501';
  end if;

  if v_attempt.status = 'published' then
    return jsonb_build_object(
      'status','unknown',
      'message','Published attempt has no matching publication ledger; manual reconciliation required'
    );
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
  elsif v_attempt.status = 'failed' then
    return jsonb_build_object('status','failed','message','Previous Pinterest rejection is not marked safe to retry');
  end if;

  return jsonb_build_object('status','processing');
end;
$function$;

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
as $function$
declare
  v_schedule public.pin_schedules%rowtype;
  v_pin_status text;
begin
  if p_claim_token is null then
    raise exception 'schedule claim token is required' using errcode='40001';
  end if;

  -- Match disconnect lock order, then lock pin before schedule to avoid
  -- pin/schedule deadlocks with the schedule-insert and status triggers.
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

  select p.status into v_pin_status
    from public.pins p
    join public.boards b on b.id = p.board_id
    join public.projects pr on pr.id = b.project_id
   where p.id = p_pin_id
     and pr.user_id::text = p_user_id
   for update of p;
  if not found or v_pin_status is distinct from 'approved' then
    return jsonb_build_object('status', 'pin_not_approved');
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
$function$;

revoke all on function public.guard_pin_rejection_from_publication()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_pin_schedule_insert_requires_approved_pin()
  from public, anon, authenticated, service_role;
revoke all on function public.begin_pinterest_publish_v2(text,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.begin_pinterest_publish_v2(text,uuid,uuid,text)
  to service_role;
grant execute on function public.begin_scheduled_pinterest_publish(text,uuid,uuid,uuid,uuid,text)
  to service_role;

commit;
