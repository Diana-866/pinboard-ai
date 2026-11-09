-- 105_pin_image_replay_expiry_tombstones.sql
-- Phase 1 of generated-image retention: preserve idempotency keys as permanent
-- tombstones before any replay payload or object reference can be retired.

alter table public.pin_generation_requests
  add column if not exists replay_expired_at timestamptz;
alter table public.pin_regeneration_requests
  add column if not exists replay_expired_at timestamptz;

create table if not exists public.pin_image_retention_queue (
  bucket_id text not null check (bucket_id = 'pin-images'),
  object_path text not null,
  state text not null default 'awaiting_reference_retirement'
    check (state in ('awaiting_reference_retirement','pending','processing','completed','failed','blocked')),
  source_types text[] not null default '{}'::text[],
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claim_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket_id, object_path),
  check (
    (state = 'processing' and claim_token is not null and claim_expires_at is not null)
    or
    (state <> 'processing' and claim_token is null and claim_expires_at is null)
  )
);
create index if not exists pin_image_retention_queue_work_idx
  on public.pin_image_retention_queue(state, next_attempt_at, created_at);
alter table public.pin_image_retention_queue enable row level security;
revoke all on public.pin_image_retention_queue from public, anon, authenticated, service_role;

create or replace function public.expire_pin_image_replay_results(
  p_retention_days integer default 90,
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_generation public.pin_generation_requests%rowtype;
  v_regeneration public.pin_regeneration_requests%rowtype;
  v_path text;
  v_generation_count integer := 0;
  v_regeneration_count integer := 0;
  v_queued_count integer := 0;
begin
  if p_retention_days is null or p_retention_days < 30 or p_retention_days > 3650
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid replay expiry bounds';
  end if;

  for v_generation in
    select r.* from public.pin_generation_requests r
     where r.status = 'completed' and r.replay_expired_at is null
       and r.updated_at <= now() - make_interval(days => p_retention_days)
     order by r.updated_at, r.id limit p_limit for update skip locked
  loop
    for v_path in
      select distinct paths.object_path from (
        select public.managed_pin_image_object_path(t.storage_url) as object_path
          from public.pin_generation_tasks t where t.generation_request_id = v_generation.id
        union all
        select public.managed_pin_image_object_path(item.value ->> 'image_url')
          from jsonb_array_elements(
            case when jsonb_typeof(v_generation.pins) = 'array'
                 then v_generation.pins else '[]'::jsonb end
          ) as item(value)
      ) paths where paths.object_path is not null
    loop
      insert into public.pin_image_retention_queue(bucket_id, object_path, state, source_types)
      values ('pin-images', v_path, 'awaiting_reference_retirement', array['generation_replay'])
      on conflict (bucket_id, object_path) do update
        set source_types = array(
              select distinct source_type
                from unnest(public.pin_image_retention_queue.source_types || excluded.source_types) as merged_sources(source_type)
                order by merged_sources.source_type
            ),
            updated_at = clock_timestamp();
      v_queued_count := v_queued_count + 1;
    end loop;
    update public.pin_generation_requests
       set replay_expired_at = clock_timestamp()
     where id = v_generation.id and replay_expired_at is null;
    v_generation_count := v_generation_count + 1;
  end loop;

  for v_regeneration in
    select r.* from public.pin_regeneration_requests r
     where r.status = 'completed' and r.replay_expired_at is null
       and r.updated_at <= now() - make_interval(days => p_retention_days)
     order by r.updated_at, r.id limit p_limit for update skip locked
  loop
    for v_path in
      select distinct paths.object_path from (
        select public.managed_pin_image_object_path(v_regeneration.storage_url) as object_path
        union all
        select public.managed_pin_image_object_path(v_regeneration.result_pin ->> 'image_url')
      ) paths where paths.object_path is not null
    loop
      insert into public.pin_image_retention_queue(bucket_id, object_path, state, source_types)
      values ('pin-images', v_path, 'awaiting_reference_retirement', array['regeneration_replay'])
      on conflict (bucket_id, object_path) do update
        set source_types = array(
              select distinct source_type
                from unnest(public.pin_image_retention_queue.source_types || excluded.source_types) as merged_sources(source_type)
                order by merged_sources.source_type
            ),
            updated_at = clock_timestamp();
      v_queued_count := v_queued_count + 1;
    end loop;
    update public.pin_regeneration_requests
       set replay_expired_at = clock_timestamp()
     where id = v_regeneration.id and replay_expired_at is null;
    v_regeneration_count := v_regeneration_count + 1;
  end loop;

  return jsonb_build_object(
    'retention_days', p_retention_days,
    'expired_generation_requests', v_generation_count,
    'expired_regeneration_requests', v_regeneration_count,
    'queue_rows_touched', v_queued_count,
    'deletion_started', false,
    'replay_payloads_cleared', false
  );
end;
$function$;

revoke all on function public.expire_pin_image_replay_results(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.expire_pin_image_replay_results(integer, integer)
  to service_role;

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
  if v_request.replay_expired_at is not null then
    return jsonb_build_object('status','expired');
  end if;
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

create or replace function public.begin_pin_regeneration_request(
  p_user_id text,p_pin_id uuid,p_idempotency_key text,p_fingerprint text,
  p_model text,p_prompt text,p_amount integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public as $$
declare v_req public.pin_regeneration_requests%rowtype; v_inserted integer;
begin
  if p_user_id is null or p_pin_id is null or p_idempotency_key is null
     or length(p_idempotency_key)<16 or length(p_idempotency_key)>128
     or p_fingerprint is null or length(p_fingerprint)<>64
     or p_model is null or p_prompt is null or length(p_prompt)>16000
     or p_amount is null or p_amount<=0 then raise exception 'invalid regeneration request'; end if;
  if not exists(select 1 from public.pins pin join public.boards b on b.id=pin.board_id
    join public.projects p on p.id=b.project_id where pin.id=p_pin_id and p.user_id::text=p_user_id)
    then raise exception 'pin not found or not owned by user'; end if;
  insert into public.pin_regeneration_requests(user_id,pin_id,idempotency_key,request_fingerprint,model,prompt,amount)
  values(p_user_id,p_pin_id,p_idempotency_key,p_fingerprint,p_model,p_prompt,p_amount)
  on conflict(user_id,idempotency_key) do nothing;
  get diagnostics v_inserted=row_count;
  select * into v_req from public.pin_regeneration_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if v_req.pin_id<>p_pin_id or v_req.request_fingerprint<>p_fingerprint then
    raise exception 'idempotency key reused with different regeneration request';
  end if;
  if v_req.replay_expired_at is not null then
    return jsonb_build_object('status','expired');
  end if;
  if v_inserted=1 then
    return jsonb_build_object('status','started','claim_token',v_req.claim_token,
      'provider_idempotency_key',v_req.provider_idempotency_key);
  end if;
  if v_req.status='completed' then
    return jsonb_build_object('status','completed','pin',v_req.result_pin);
  end if;
  -- A recorded provider task can be safely polled immediately on retry.
  -- Rotate the claim so only the latest poller can persist/complete the result.
  if v_req.status='processing' and v_req.provider_task_id is not null then
    update public.pin_regeneration_requests set claim_token=gen_random_uuid(),
      updated_at=clock_timestamp() where id=v_req.id returning * into v_req;
    return jsonb_build_object('status','resume','claim_token',v_req.claim_token,
      'provider_idempotency_key',v_req.provider_idempotency_key,
      'provider_task_id',v_req.provider_task_id,'provider_result_url',v_req.provider_result_url,
      'storage_url',v_req.storage_url,'provider_price',v_req.provider_price);
  end if;
  if v_req.status='processing' and v_req.updated_at>clock_timestamp()-interval '30 minutes' then
    return jsonb_build_object('status','processing');
  end if;
  if v_req.status='processing' then
    update public.pin_regeneration_requests set claim_token=gen_random_uuid(),
      updated_at=clock_timestamp() where id=v_req.id returning * into v_req;
    return jsonb_build_object('status','resume','claim_token',v_req.claim_token,
      'provider_idempotency_key',v_req.provider_idempotency_key,
      'provider_task_id',v_req.provider_task_id,'provider_result_url',v_req.provider_result_url,
      'storage_url',v_req.storage_url,'provider_price',v_req.provider_price);
  end if;
  if v_req.status='unknown' then
    update public.pin_regeneration_requests set status='processing',claim_token=gen_random_uuid(),
      error_code=null,updated_at=clock_timestamp() where id=v_req.id returning * into v_req;
    return jsonb_build_object('status','resume','claim_token',v_req.claim_token,
      'provider_idempotency_key',v_req.provider_idempotency_key,
      'provider_task_id',v_req.provider_task_id,'provider_result_url',v_req.provider_result_url,
      'storage_url',v_req.storage_url,'provider_price',v_req.provider_price);
  end if;
  return jsonb_build_object('status',v_req.status);
end; $$;

revoke all on function public.begin_pin_generation_request(text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.begin_pin_generation_request(text,uuid,text,text)
  to service_role;
revoke all on function public.begin_pin_regeneration_request(text,uuid,text,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.begin_pin_regeneration_request(text,uuid,text,text,text,text,integer)
  to service_role;
