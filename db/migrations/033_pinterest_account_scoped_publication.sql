-- 033_pinterest_account_scoped_publication.sql
-- Move idempotency and durable scheduling from user/pin scope to exact Pinterest account.
-- Legacy records without a resolvable account remain visible but are not auto-published.

alter table public.pinterest_publications
  drop constraint if exists uniq_pinterest_publications_pin;
drop index if exists public.uniq_pinterest_publications_pin;

alter table public.pinterest_publish_attempts
  drop constraint if exists pinterest_publish_attempts_pin_id_key;
drop index if exists public.pinterest_publish_attempts_pin_id_key;

create unique index if not exists pinterest_publications_pin_account_uidx
  on public.pinterest_publications(pin_id, pinterest_account_id)
  where pinterest_account_id is not null;

create unique index if not exists pinterest_publish_attempts_pin_account_uidx
  on public.pinterest_publish_attempts(pin_id, pinterest_account_id)
  where pinterest_account_id is not null;

drop index if exists public.pin_schedules_one_active_per_pin;
create unique index if not exists pin_schedules_one_active_per_account_pin
  on public.pin_schedules(pin_id, pinterest_account_id)
  where pinterest_account_id is not null
    and status in ('scheduled','publishing','published','unknown');

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
  elsif v_attempt.status = 'failed' then
    update public.pinterest_publish_attempts
       set status='processing',
           pinterest_board_id=p_pinterest_board_id,
           attempt_count=attempt_count+1,
           last_error=null,
           updated_at=now()
     where id=v_attempt.id;
    return jsonb_build_object('status','started');
  end if;

  return jsonb_build_object('status','processing');
end;
$$;

create or replace function public.complete_pinterest_publish_v2(
  p_user_id text,
  p_pin_id uuid,
  p_pinterest_account_id uuid,
  p_pinterest_pin_id text,
  p_pinterest_board_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_publication public.pinterest_publications%rowtype;
begin
  select * into v_attempt
    from public.pinterest_publish_attempts
   where pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id
   for update;
  if not found or v_attempt.user_id <> p_user_id then
    raise exception 'publication attempt not found' using errcode = 'P0002';
  end if;

  insert into public.pinterest_publications(
    user_id, pin_id, pinterest_account_id, pinterest_pin_id, pinterest_board_id
  ) values (
    p_user_id, p_pin_id, p_pinterest_account_id, p_pinterest_pin_id, p_pinterest_board_id
  )
  on conflict (pin_id, pinterest_account_id)
    where pinterest_account_id is not null
  do nothing;

  select * into v_publication
    from public.pinterest_publications
   where pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id;
  if v_publication.pinterest_pin_id <> p_pinterest_pin_id then
    update public.pinterest_publish_attempts
       set status='unknown', last_error='A different remote pin is already recorded', updated_at=now()
     where id=v_attempt.id;
    raise exception 'conflicting remote publication id';
  end if;

  update public.pinterest_publish_attempts
     set status='published',
         pinterest_pin_id=p_pinterest_pin_id,
         pinterest_board_id=p_pinterest_board_id,
         last_error=null,
         updated_at=now()
   where id=v_attempt.id;

  return jsonb_build_object('status','published','pinterest_pin_id',p_pinterest_pin_id);
end;
$$;

create or replace function public.fail_pinterest_publish_v2(
  p_user_id text,
  p_pin_id uuid,
  p_pinterest_account_id uuid,
  p_error text,
  p_outcome_unknown boolean default false
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.pinterest_publish_attempts
     set status=case when p_outcome_unknown then 'unknown' else 'failed' end,
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

create or replace function public.claim_due_pin_schedules(p_limit integer default 10)
returns setof public.pin_schedules
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pin_schedules
     set status='failed',
         last_error='Pinterest account is missing or disconnected; select an active account and schedule again',
         updated_at=now()
   where status='scheduled'
     and scheduled_at <= now()
     and pinterest_account_id is null;

  update public.pin_schedules s
     set status='failed',
         last_error='Pinterest account is disconnected; reconnect it and schedule again',
         updated_at=now()
   where s.status='scheduled'
     and s.scheduled_at <= now()
     and s.pinterest_account_id is not null
     and not exists (
       select 1 from public.pinterest_accounts a
        where a.id=s.pinterest_account_id
          and a.user_id=s.user_id
          and a.disconnected_at is null
          and a.access_token is not null
     );

  update public.pin_schedules s
     set status='published',
         pinterest_pin_id=a.pinterest_pin_id,
         published_at=coalesce(s.published_at, a.updated_at),
         last_error=null,
         updated_at=now()
    from public.pinterest_publish_attempts a
   where s.pin_id=a.pin_id
     and s.pinterest_account_id=a.pinterest_account_id
     and a.status='published'
     and s.status='publishing'
     and s.updated_at < now() - interval '20 minutes';

  update public.pin_schedules
     set status='unknown',
         last_error='Worker stopped while publication outcome was not confirmed; manual reconciliation required',
         updated_at=now()
   where status='publishing'
     and updated_at < now() - interval '20 minutes';

  return query
  with due as (
    select id
      from public.pin_schedules
     where status='scheduled'
       and scheduled_at <= now()
       and pinterest_board_id is not null
       and pinterest_account_id is not null
     order by scheduled_at asc
     for update skip locked
     limit greatest(1, least(coalesce(p_limit,10),10))
  )
  update public.pin_schedules s
     set status='publishing',
         attempts=attempts+1,
         updated_at=now()
    from due
   where s.id=due.id
  returning s.*;
end;
$$;

-- Disconnecting a profile also fails its future queued schedules. Published
-- history remains untouched; in-flight work is left for journal reconciliation.
create or replace function public.disconnect_pinterest_account_v2(
  p_user_id text,
  p_pinterest_account_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $
declare
  v_updated integer := 0;
begin
  if not exists (
    select 1 from public.pinterest_accounts
     where id = p_pinterest_account_id
       and user_id = p_user_id
       and disconnected_at is null
  ) then
    return false;
  end if;

  insert into public.pinterest_oauth_connection_state (
    user_id, generation, current_attempt_id, token_version, attempt_expires_at, updated_at
  ) values (
    p_user_id, 1, null, null, null, now()
  )
  on conflict (user_id) do update
    set generation = public.pinterest_oauth_connection_state.generation + 1,
        current_attempt_id = null,
        token_version = null,
        attempt_expires_at = null,
        updated_at = now();

  -- Match refresh-commit lock order: lease first, then account row.
  delete from public.pinterest_account_refresh_leases
   where pinterest_account_id = p_pinterest_account_id
     and user_id = p_user_id;

  update public.pinterest_accounts
     set access_token = null,
         refresh_token = null,
         expires_at = null,
         disconnected_at = now(),
         updated_at = now()
   where id = p_pinterest_account_id
     and user_id = p_user_id
     and disconnected_at is null;

  get diagnostics v_updated = row_count;

  if v_updated = 1 then
    update public.pin_schedules
       set status = 'failed',
           last_error = 'Pinterest account was disconnected; reconnect it and schedule again',
           updated_at = now()
     where user_id = p_user_id
       and pinterest_account_id = p_pinterest_account_id
       and status = 'scheduled';
  end if;

  return v_updated = 1;
end;
$;

revoke all on function public.disconnect_pinterest_account_v2(text,uuid)
  from public, anon, authenticated;
grant execute on function public.disconnect_pinterest_account_v2(text,uuid)
  to service_role;

revoke all on function public.begin_pinterest_publish_v2(text,uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.complete_pinterest_publish_v2(text,uuid,uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.fail_pinterest_publish_v2(text,uuid,uuid,text,boolean)
  from public, anon, authenticated;
revoke all on function public.claim_due_pin_schedules(integer)
  from public, anon, authenticated;

grant execute on function public.begin_pinterest_publish_v2(text,uuid,uuid,text) to service_role;
grant execute on function public.complete_pinterest_publish_v2(text,uuid,uuid,text,text) to service_role;
grant execute on function public.fail_pinterest_publish_v2(text,uuid,uuid,text,boolean) to service_role;
grant execute on function public.claim_due_pin_schedules(integer) to service_role;
