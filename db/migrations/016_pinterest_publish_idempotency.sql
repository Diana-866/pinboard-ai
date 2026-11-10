-- 016_pinterest_publish_idempotency.sql
-- Reserve one local pin before calling Pinterest. Uncertain outcomes are never
-- retried automatically because Pinterest may already have created the remote pin.

create table if not exists public.pinterest_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  pin_id uuid not null,
  pinterest_board_id text not null,
  status text not null default 'processing'
    check (status in ('processing','published','unknown','failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  pinterest_pin_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pin_id)
);

create index if not exists pinterest_publish_attempts_user_idx
  on public.pinterest_publish_attempts(user_id, updated_at desc);

alter table public.pinterest_publish_attempts enable row level security;
revoke all on public.pinterest_publish_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.pinterest_publish_attempts to service_role;

create or replace function public.begin_pinterest_publish(
  p_user_id text,
  p_pin_id uuid,
  p_pinterest_board_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_publication public.pinterest_publications%rowtype;
  v_inserted integer := 0;
begin
  -- SECURITY DEFINER bypasses table RLS. Re-check the full ownership chain
  -- inside the database function instead of trusting the supplied user ID.
  perform 1
    from public.pins p
    join public.boards b on b.id = p.board_id
    join public.projects pr on pr.id = b.project_id
    where p.id = p_pin_id
      and pr.user_id::text = p_user_id;
  if not found then
    raise exception 'pin not found for user' using errcode = '42501';
  end if;

  select * into v_publication
    from public.pinterest_publications
    where pin_id = p_pin_id;
  if found then
    return jsonb_build_object(
      'status','published',
      'pinterest_pin_id',v_publication.pinterest_pin_id,
      'pinterest_board_id',v_publication.pinterest_board_id
    );
  end if;

  insert into public.pinterest_publish_attempts(user_id,pin_id,pinterest_board_id,status)
  values (p_user_id,p_pin_id,p_pinterest_board_id,'processing')
  on conflict (pin_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return jsonb_build_object('status','started');
  end if;

  select * into v_attempt
    from public.pinterest_publish_attempts
    where pin_id = p_pin_id
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

create or replace function public.complete_pinterest_publish(
  p_user_id text,
  p_pin_id uuid,
  p_pinterest_pin_id text,
  p_pinterest_board_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_publication public.pinterest_publications%rowtype;
begin
  select * into v_attempt
    from public.pinterest_publish_attempts
    where pin_id=p_pin_id
    for update;
  if not found or v_attempt.user_id <> p_user_id then
    raise exception 'publication attempt not found' using errcode='P0002';
  end if;

  insert into public.pinterest_publications(user_id,pin_id,pinterest_pin_id,pinterest_board_id)
  values (p_user_id,p_pin_id,p_pinterest_pin_id,p_pinterest_board_id)
  on conflict (pin_id) do nothing;

  select * into v_publication from public.pinterest_publications where pin_id=p_pin_id;
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

create or replace function public.fail_pinterest_publish(
  p_user_id text,
  p_pin_id uuid,
  p_error text,
  p_outcome_unknown boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pinterest_publish_attempts
    set status=case when p_outcome_unknown then 'unknown' else 'failed' end,
        last_error=left(coalesce(p_error,'Publication failed'),500),
        updated_at=now()
    where pin_id=p_pin_id and user_id=p_user_id and status='processing';
  if not found then
    raise exception 'active publication attempt not found';
  end if;
end;
$$;

revoke all on function public.begin_pinterest_publish(text,uuid,text) from public, anon, authenticated;
revoke all on function public.complete_pinterest_publish(text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.fail_pinterest_publish(text,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.begin_pinterest_publish(text,uuid,text) to service_role;
grant execute on function public.complete_pinterest_publish(text,uuid,text,text) to service_role;
grant execute on function public.fail_pinterest_publish(text,uuid,text,boolean) to service_role;
