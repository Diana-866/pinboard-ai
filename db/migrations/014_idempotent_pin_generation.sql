-- 014_idempotent_pin_generation.sql
-- Durable idempotency keys prevent duplicate AI calls/charges after retries.
create table if not exists public.pin_generation_requests (
  id bigserial primary key,
  user_id text not null,
  board_id uuid not null references public.boards(id) on delete cascade,
  idempotency_key varchar(128) not null,
  status text not null check (status in ('processing','completed','failed')),
  pins jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists pin_generation_requests_user_created_idx
  on public.pin_generation_requests(user_id, created_at desc);

alter table public.pin_generation_requests enable row level security;
revoke all on public.pin_generation_requests from public, anon, authenticated;
grant select, insert, update, delete on public.pin_generation_requests to service_role;
grant usage, select on sequence public.pin_generation_requests_id_seq to service_role;

create or replace function public.begin_pin_generation_request(
  p_user_id text, p_board_id uuid, p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
begin
  if p_user_id is null or p_board_id is null or p_idempotency_key is null
     or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 128 then
    raise exception 'invalid idempotency request';
  end if;
  if not exists (
    select 1 from public.boards b join public.projects p on p.id=b.project_id
    where b.id=p_board_id and p.user_id::text=p_user_id
  ) then raise exception 'board not found or not owned by user'; end if;

  insert into public.pin_generation_requests(user_id,board_id,idempotency_key,status)
  values(p_user_id,p_board_id,p_idempotency_key,'processing')
  on conflict (user_id,idempotency_key) do nothing;

  select * into v_request from public.pin_generation_requests
  where user_id=p_user_id and idempotency_key=p_idempotency_key
  for update;

  if v_request.board_id <> p_board_id then raise exception 'idempotency key already used for another board'; end if;
  if v_request.status='completed' then
    return jsonb_build_object('status','completed','pins',v_request.pins);
  elsif v_request.status='processing' then
    return jsonb_build_object('status','processing');
  else
    update public.pin_generation_requests
    set status='processing', pins=null, error_code=null, updated_at=now()
    where id=v_request.id;
    return jsonb_build_object('status','started');
  end if;
end;
$$;

create or replace function public.complete_pin_generation_request(
  p_user_id text, p_board_id uuid, p_idempotency_key text, p_pins jsonb, p_amount integer
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
  v_saved jsonb;
begin
  select * into v_request from public.pin_generation_requests
  where user_id=p_user_id and idempotency_key=p_idempotency_key
  for update;
  if not found or v_request.board_id <> p_board_id then raise exception 'generation request not found'; end if;
  if v_request.status='completed' then
    return jsonb_build_object('pins',v_request.pins);
  end if;
  if v_request.status <> 'processing' then raise exception 'generation request is not processing'; end if;

  v_saved := public.save_generated_pins_and_charge(p_user_id,p_board_id,p_pins,p_amount);
  update public.pin_generation_requests
  set status='completed', pins=v_saved->'pins', error_code=null, updated_at=now()
  where id=v_request.id;
  return v_saved;
end;
$$;

create or replace function public.fail_pin_generation_request(
  p_user_id text, p_idempotency_key text, p_error_code text
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  update public.pin_generation_requests
  set status='failed', error_code=left(coalesce(p_error_code,'generation_failed'),64), updated_at=now()
  where user_id=p_user_id and idempotency_key=p_idempotency_key and status='processing';
  return found;
end;
$$;

revoke all on function public.begin_pin_generation_request(text,uuid,text) from public,anon,authenticated;
revoke all on function public.complete_pin_generation_request(text,uuid,text,jsonb,integer) from public,anon,authenticated;
revoke all on function public.fail_pin_generation_request(text,text,text) from public,anon,authenticated;
grant execute on function public.begin_pin_generation_request(text,uuid,text) to service_role;
grant execute on function public.complete_pin_generation_request(text,uuid,text,jsonb,integer) to service_role;
grant execute on function public.fail_pin_generation_request(text,text,text) to service_role;
