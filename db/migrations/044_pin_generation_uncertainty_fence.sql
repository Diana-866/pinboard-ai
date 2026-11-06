-- 044_pin_generation_uncertainty_fence.sql
-- An expired or failed generation request is not proof that the provider did
-- not accept an image task. Never restart it automatically with a new task.
alter table public.pin_generation_requests
  drop constraint if exists pin_generation_requests_status_check;

alter table public.pin_generation_requests
  add constraint pin_generation_requests_status_check
  check (status in ('processing','completed','failed','unknown'));

create or replace function public.begin_pin_generation_request(
  p_user_id text, p_board_id uuid, p_idempotency_key text, p_fingerprint text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
  v_inserted integer;
begin
  if p_user_id is null or p_board_id is null or p_idempotency_key is null
     or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 128
     or p_fingerprint is null or length(p_fingerprint) <> 64 then
    raise exception 'invalid idempotency request';
  end if;
  if not exists (
    select 1 from public.boards b join public.projects p on p.id=b.project_id
    where b.id=p_board_id and p.user_id::text=p_user_id
  ) then raise exception 'board not found or not owned by user'; end if;

  insert into public.pin_generation_requests(user_id,board_id,idempotency_key,status,request_fingerprint)
  values(p_user_id,p_board_id,p_idempotency_key,'processing',p_fingerprint)
  on conflict (user_id,idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_request from public.pin_generation_requests
  where user_id=p_user_id and idempotency_key=p_idempotency_key
  for update;

  if v_request.board_id <> p_board_id then raise exception 'idempotency key already used for another board'; end if;
  if v_request.request_fingerprint <> p_fingerprint then raise exception 'idempotency key reused with different request'; end if;
  if v_inserted = 1 then return jsonb_build_object('status','started'); end if;

  if v_request.status='completed' then
    return jsonb_build_object('status','completed','pins',v_request.pins);
  elsif v_request.status='processing' and v_request.updated_at < now() - interval '30 minutes' then
    update public.pin_generation_requests
       set status='unknown',
           error_code='stale_provider_outcome',
           updated_at=now()
     where id=v_request.id;
    return jsonb_build_object('status','unknown','message','Provider outcome requires reconciliation');
  elsif v_request.status='processing' then
    return jsonb_build_object('status','processing');
  elsif v_request.status='unknown' then
    return jsonb_build_object('status','unknown','message','Provider outcome requires reconciliation');
  else
    return jsonb_build_object('status','failed','error_code',v_request.error_code);
  end if;
end;
$$;

drop function if exists public.fail_pin_generation_request(text,text,text);

create or replace function public.fail_pin_generation_request(
  p_user_id text, p_idempotency_key text, p_error_code text,
  p_outcome_unknown boolean default false
) returns boolean
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  update public.pin_generation_requests
     set status=case when coalesce(p_outcome_unknown,false) then 'unknown' else 'failed' end,
         error_code=left(coalesce(p_error_code,'generation_failed'),64),
         updated_at=now()
   where user_id=p_user_id
     and idempotency_key=p_idempotency_key
     and status='processing';
  return found;
end;
$$;

revoke all on function public.begin_pin_generation_request(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.complete_pin_generation_request(text,uuid,text,jsonb,integer) from public,anon,authenticated;
revoke all on function public.fail_pin_generation_request(text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.begin_pin_generation_request(text,uuid,text,text) to service_role;
grant execute on function public.complete_pin_generation_request(text,uuid,text,jsonb,integer) to service_role;
grant execute on function public.fail_pin_generation_request(text,text,text,boolean) to service_role;
