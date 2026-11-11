-- Migration 130 durable account-deletion queue integration test.
begin;
do $$
declare
  v_user_id uuid;
  v_request_id uuid;
  v_job_id uuid;
  v_claim uuid;
  v_claimed record;
  v_count integer;
  v_finished boolean;
begin
  insert into public.users(email,password_hash,token_version,account_status)
  values ('deletion-queue-test@example.invalid','test-hash',0,'active')
  returning id into v_user_id;

  perform public.request_account_deletion(v_user_id,'password_reauth',0);

  select id into v_request_id from public.account_deletion_requests where user_id=v_user_id;
  select id into v_job_id from public.account_deletion_jobs
   where request_id=v_request_id and step_key='preflight';
  if v_job_id is null then raise exception 'accepted deletion request has no durable preflight job'; end if;

  select count(*) into v_count from public.account_deletion_events
   where request_id=v_request_id and event_key='request_accepted';
  if v_count <> 1 then raise exception 'request acceptance event missing or duplicated'; end if;

  -- Idempotent repeat must not enqueue duplicate work or duplicate events.
  perform public.request_account_deletion(v_user_id,'password_reauth',0);
  select count(*) into v_count from public.account_deletion_jobs
   where request_id=v_request_id and step_key='preflight';
  if v_count <> 1 then raise exception 'idempotent request duplicated the job'; end if;

  select * into v_claimed from public.claim_account_deletion_jobs(1,120);
  if v_claimed.job_id is null or v_claimed.request_id <> v_request_id then
    raise exception 'worker could not claim the accepted preflight job';
  end if;
  v_claim := v_claimed.claim_token;

  -- Null outcomes are invalid and must not silently become retries.
  begin
    perform public.finish_account_deletion_job(v_job_id,v_claim,null,null);
    raise exception 'null job outcome unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm <> 'invalid account deletion job result' then raise; end if;
  end;

  -- A stale claim token must never finalize another worker's job.
  v_finished := public.finish_account_deletion_job(v_job_id,gen_random_uuid(),'succeeded',null);
  if v_finished then raise exception 'stale worker token unexpectedly finalized job'; end if;

  -- Successful preflight requires a persisted inventory under this claim.
  begin
    perform public.finish_account_deletion_job(v_job_id,v_claim,'succeeded',null);
    raise exception 'preflight completed without an inventory';
  exception when raise_exception then
    if sqlerrm <> 'account deletion preflight inventory is required' then raise; end if;
  end;

  if not public.record_account_deletion_preflight(
    v_job_id, v_claim,
    '{"ok":true,"sectionsChecked":22,"counts":{"projects":0,"boards":0,"pins":0}}'::jsonb
  ) then
    raise exception 'active worker could not persist preflight inventory';
  end if;

  v_finished := public.finish_account_deletion_job(v_job_id,v_claim,'succeeded',null);
  if not v_finished then raise exception 'current worker claim failed to finalize job'; end if;

  select count(*) into v_count from public.account_deletion_jobs
   where id=v_job_id and status='succeeded' and claim_token is null and lease_expires_at is null;
  if v_count <> 1 then raise exception 'successful job was not finalized cleanly'; end if;

  select count(*) into v_count from public.account_deletion_jobs
   where id=v_job_id
     and inventory_recorded_at is not null
     and inventory->>'ok' = 'true'
     and inventory->'counts'->>'projects' = '0';
  if v_count <> 1 then raise exception 'preflight inventory was not durably persisted'; end if;

  -- Event log must be immutable.
  begin
    update public.account_deletion_events set reason_code='tampered'
     where request_id=v_request_id and event_key='request_accepted';
    raise exception 'event log mutation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'account deletion events are append-only' then raise; end if;
  end;
end;
$$;
rollback;
