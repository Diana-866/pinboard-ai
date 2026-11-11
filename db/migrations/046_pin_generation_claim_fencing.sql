-- 046_pin_generation_claim_fencing.sql
-- A fresh UUID claim fences every backend owner across the complete generation lifecycle.
alter table public.pin_generation_requests
  add column if not exists claim_token uuid default gen_random_uuid();

-- Backfill rows that may have been created by a pre-fencing deployment.
update public.pin_generation_requests
   set claim_token=case when status='processing' then coalesce(claim_token,gen_random_uuid()) else null end;
alter table public.pin_generation_requests
  drop constraint if exists pin_generation_requests_processing_claim_check;
alter table public.pin_generation_requests
  add constraint pin_generation_requests_processing_claim_check
  check (status <> 'processing' or claim_token is not null);

create or replace function public.begin_pin_generation_request(
  p_user_id text,p_board_id uuid,p_idempotency_key text,p_fingerprint text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_request public.pin_generation_requests%rowtype; v_inserted integer; v_has_plan boolean;
begin
  if p_user_id is null or p_board_id is null or p_idempotency_key is null
     or length(p_idempotency_key)<16 or length(p_idempotency_key)>128
     or p_fingerprint is null or length(p_fingerprint)<>64 then raise exception 'invalid idempotency request'; end if;
  if not exists(select 1 from public.boards b join public.projects p on p.id=b.project_id
                where b.id=p_board_id and p.user_id::text=p_user_id)
    then raise exception 'board not found or not owned by user'; end if;
  insert into public.pin_generation_requests(user_id,board_id,idempotency_key,status,request_fingerprint)
  values(p_user_id,p_board_id,p_idempotency_key,'processing',p_fingerprint)
  on conflict(user_id,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_request from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if v_request.board_id<>p_board_id then raise exception 'idempotency key already used for another board'; end if;
  if v_request.request_fingerprint<>p_fingerprint then raise exception 'idempotency key reused with different request'; end if;
  if v_inserted=1 then return jsonb_build_object('status','started','claim_token',v_request.claim_token); end if;
  if v_request.status='completed' then return jsonb_build_object('status','completed','pins',v_request.pins); end if;
  select exists(select 1 from public.pin_generation_tasks t where t.generation_request_id=v_request.id) into v_has_plan;
  if v_request.status='processing' and v_request.updated_at<clock_timestamp()-interval '30 minutes' then
    if v_has_plan then
      update public.pin_generation_requests set claim_token=gen_random_uuid(),updated_at=clock_timestamp()
       where id=v_request.id returning * into v_request;
      return jsonb_build_object('status','resume','claim_token',v_request.claim_token);
    end if;
    update public.pin_generation_requests set status='unknown',claim_token=null,
      error_code='stale_provider_outcome',updated_at=clock_timestamp() where id=v_request.id;
    return jsonb_build_object('status','unknown','message','Provider outcome requires reconciliation');
  elsif v_request.status='processing' then return jsonb_build_object('status','processing');
  elsif v_request.status='unknown' and v_has_plan then
    update public.pin_generation_requests set status='processing',claim_token=gen_random_uuid(),
      error_code=null,updated_at=clock_timestamp() where id=v_request.id returning * into v_request;
    return jsonb_build_object('status','resume','claim_token',v_request.claim_token);
  elsif v_request.status='unknown' then return jsonb_build_object('status','unknown','message','Provider outcome requires reconciliation');
  else return jsonb_build_object('status','failed','error_code',v_request.error_code); end if;
end; $$;

-- Drop both the legacy three-argument and the current four-argument signature so
-- this migration can be replayed on an already-migrated database.
drop function if exists public.save_pin_generation_plan(text,text,jsonb);
drop function if exists public.save_pin_generation_plan(text,text,uuid,jsonb);
create function public.save_pin_generation_plan(
  p_user_id text,p_idempotency_key text,p_claim_token uuid,p_tasks jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_request public.pin_generation_requests%rowtype; v_count integer; v_existing integer;
  v_item jsonb; v_index integer; v_result jsonb;
begin
  if p_user_id is null or p_idempotency_key is null or p_claim_token is null
     or p_tasks is null or jsonb_typeof(p_tasks)<>'array' then raise exception 'invalid generation plan'; end if;
  v_count:=jsonb_array_length(p_tasks);
  if v_count<1 or v_count>10 then raise exception 'invalid generation plan size'; end if;
  select * into v_request from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found then raise exception 'generation request not found'; end if;
  if v_request.status<>'processing' then raise exception 'generation request is not processing'; end if;
  if v_request.claim_token is distinct from p_claim_token then raise exception 'generation claim token mismatch'; end if;
  select count(*) into v_existing from public.pin_generation_tasks where generation_request_id=v_request.id;
  if v_existing>0 then
    select coalesce(jsonb_agg(jsonb_build_object('task_index',task_index,'title',title,'description',description,
      'prompt',prompt,'model',model,'aspect_ratio',aspect_ratio,'provider_idempotency_key',provider_idempotency_key,
      'provider_task_id',provider_task_id,'status',status) order by task_index),'[]'::jsonb)
      into v_result from public.pin_generation_tasks where generation_request_id=v_request.id;
    return v_result;
  end if;
  for v_item,v_index in select value,ordinality::integer from jsonb_array_elements(p_tasks) with ordinality loop
    if coalesce(v_item->>'title','')='' or length(v_item->>'title')>200
      or coalesce(v_item->>'prompt','')='' or length(v_item->>'prompt')>12000
      or coalesce(v_item->>'model','')='' or length(v_item->>'model')>100
      or coalesce(v_item->>'aspect_ratio','') not in ('2:3','9:16','4:5','3:4','1:1')
      then raise exception 'invalid generation task at index %',v_index; end if;
  end loop;
  insert into public.pin_generation_tasks(generation_request_id,user_id,board_id,task_index,title,description,prompt,model,aspect_ratio)
  select v_request.id,p_user_id,v_request.board_id,ordinality::smallint,value->>'title',
    coalesce(value->>'description',''),value->>'prompt',value->>'model',value->>'aspect_ratio'
  from jsonb_array_elements(p_tasks) with ordinality;
  select coalesce(jsonb_agg(jsonb_build_object('task_index',task_index,'title',title,'description',description,
    'prompt',prompt,'model',model,'aspect_ratio',aspect_ratio,'provider_idempotency_key',provider_idempotency_key,
    'provider_task_id',provider_task_id,'status',status) order by task_index),'[]'::jsonb)
    into v_result from public.pin_generation_tasks where generation_request_id=v_request.id;
  return v_result;
end; $$;

drop function if exists public.update_pin_generation_task(text,text,integer,text,text,text,text,numeric,text);
drop function if exists public.update_pin_generation_task(text,text,uuid,integer,text,text,text,text,numeric,text);
create function public.update_pin_generation_task(
  p_user_id text,p_idempotency_key text,p_claim_token uuid,p_task_index integer,p_status text,
  p_provider_task_id text default null,p_provider_result_url text default null,p_storage_url text default null,
  p_provider_price numeric default null,p_error_code text default null
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_request public.pin_generation_requests%rowtype; v_task public.pin_generation_tasks%rowtype; v_allowed boolean;
begin
  if p_claim_token is null then raise exception 'generation claim token is required'; end if;
  if p_status not in ('submitting','queued','running','succeeded','failed','unknown') then raise exception 'invalid generation task status'; end if;
  if p_provider_task_id is not null and p_provider_task_id !~ '^[A-Za-z0-9_-]{1,200}$' then raise exception 'invalid provider task id'; end if;
  if p_provider_price is not null and (p_provider_price<0 or p_provider_price::text in ('NaN','Infinity','-Infinity')) then raise exception 'invalid provider price'; end if;
  -- Consistent lock order: parent request first, then task.
  select * into v_request from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found then raise exception 'generation request not found'; end if;
  if v_request.status<>'processing' then raise exception 'generation request is not processing'; end if;
  if v_request.claim_token is distinct from p_claim_token then raise exception 'generation claim token mismatch'; end if;
  select * into v_task from public.pin_generation_tasks
   where generation_request_id=v_request.id and user_id=p_user_id and task_index=p_task_index for update;
  if not found then raise exception 'generation task not found'; end if;
  if v_task.provider_task_id is not null and p_provider_task_id is not null and v_task.provider_task_id<>p_provider_task_id
    then raise exception 'provider task id mismatch for generation task'; end if;
  v_allowed:=(v_task.status='prepared' and p_status in ('submitting','failed','unknown'))
    or (v_task.status='submitting' and p_status in ('queued','running','succeeded','failed','unknown'))
    or (v_task.status='queued' and p_status in ('running','succeeded','failed','unknown'))
    or (v_task.status='running' and p_status in ('succeeded','failed','unknown'))
    or (v_task.status='unknown' and p_status in ('queued','running','succeeded','failed','unknown'));
  if not v_allowed and not (v_task.status=p_status and (p_provider_task_id is null or v_task.provider_task_id=p_provider_task_id))
    then raise exception 'invalid generation task transition: % -> %',v_task.status,p_status; end if;
  update public.pin_generation_tasks set status=p_status,provider_task_id=coalesce(p_provider_task_id,provider_task_id),
    provider_result_url=coalesce(p_provider_result_url,provider_result_url),storage_url=coalesce(p_storage_url,storage_url),
    provider_price=coalesce(p_provider_price,provider_price),
    error_code=case when p_error_code is null then error_code else left(p_error_code,64) end,
    updated_at=clock_timestamp() where id=v_task.id;
  update public.pin_generation_requests set updated_at=clock_timestamp() where id=v_request.id;
  return true;
end; $$;

drop function if exists public.complete_pin_generation_request(text,uuid,text,jsonb,integer);
drop function if exists public.complete_pin_generation_request(text,uuid,text,uuid,jsonb,integer);
create function public.complete_pin_generation_request(
  p_user_id text,p_board_id uuid,p_idempotency_key text,p_claim_token uuid,p_pins jsonb,p_amount integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_request public.pin_generation_requests%rowtype; v_saved jsonb;
begin
  select * into v_request from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found or v_request.board_id<>p_board_id then raise exception 'generation request not found'; end if;
  if v_request.status='completed' then return jsonb_build_object('pins',v_request.pins); end if;
  if v_request.status<>'processing' then raise exception 'generation request is not processing'; end if;
  if p_claim_token is null or v_request.claim_token is distinct from p_claim_token then raise exception 'generation claim token mismatch'; end if;
  -- Owner validation and charge/pin persistence are one transaction under the parent row lock.
  v_saved:=public.save_generated_pins_and_charge(p_user_id,p_board_id,p_pins,p_amount);
  update public.pin_generation_requests set status='completed',pins=v_saved->'pins',error_code=null,
    claim_token=null,updated_at=clock_timestamp() where id=v_request.id;
  return v_saved;
end; $$;

drop function if exists public.fail_pin_generation_request(text,text,text,boolean);
drop function if exists public.fail_pin_generation_request(text,text,text);
drop function if exists public.fail_pin_generation_request(text,text,uuid,text,boolean);
drop function if exists public.fail_pin_generation_request(text,text,text,uuid,boolean);
create function public.fail_pin_generation_request(
  p_user_id text,p_idempotency_key text,p_claim_token uuid,p_error_code text,p_outcome_unknown boolean default false
) returns boolean language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_request public.pin_generation_requests%rowtype;
begin
  select * into v_request from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if not found or v_request.status<>'processing' then return false; end if;
  if p_claim_token is null or v_request.claim_token is distinct from p_claim_token then raise exception 'generation claim token mismatch'; end if;
  update public.pin_generation_requests set
    status=case when coalesce(p_outcome_unknown,false) then 'unknown' else 'failed' end,
    error_code=left(coalesce(p_error_code,'generation_failed'),64),claim_token=null,updated_at=clock_timestamp()
   where id=v_request.id;
  return true;
end; $$;

revoke all on function public.begin_pin_generation_request(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.save_pin_generation_plan(text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.update_pin_generation_task(text,text,uuid,integer,text,text,text,text,numeric,text) from public,anon,authenticated;
revoke all on function public.complete_pin_generation_request(text,uuid,text,uuid,jsonb,integer) from public,anon,authenticated;
revoke all on function public.fail_pin_generation_request(text,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.begin_pin_generation_request(text,uuid,text,text) to service_role;
grant execute on function public.save_pin_generation_plan(text,text,uuid,jsonb) to service_role;
grant execute on function public.update_pin_generation_task(text,text,uuid,integer,text,text,text,text,numeric,text) to service_role;
grant execute on function public.complete_pin_generation_request(text,uuid,text,uuid,jsonb,integer) to service_role;
grant execute on function public.fail_pin_generation_request(text,text,uuid,text,boolean) to service_role;
