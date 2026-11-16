-- Run in disposable PostgreSQL after the full migration chain through 148.
-- A confirmed account deletion must cancel the account's future publications and
-- block further processing of its scheduled tasks. The Pinterest worker is
-- driven by an external cron and never authenticates as the user, so the fence
-- has to hold at the database level: the claim cancels and skips the account,
-- an in-flight claim can no longer be renewed, and a scheduled reservation is
-- refused before any journal row exists. An active account is unaffected.
do $$
declare
  v_fenced uuid := gen_random_uuid();
  v_active uuid := gen_random_uuid();
  v_project_f uuid;
  v_board_f uuid;
  v_pin_f_queued uuid;
  v_pin_f_inflight uuid;
  v_project_a uuid;
  v_board_a uuid;
  v_pin_a uuid;
  v_account_f uuid;
  v_account_a uuid;
  v_sched_f_queued uuid;
  v_sched_f_inflight uuid;
  v_sched_a uuid;
  v_fenced_token uuid := gen_random_uuid();
  v_active_token uuid;
begin
  insert into public.users(id,email,token_version,account_status)
  values
    (v_fenced,'account-deletion-fence-fenced-'||v_fenced||'@example.invalid',0,'deletion_pending'),
    (v_active,'account-deletion-fence-active-'||v_active||'@example.invalid',0,'active');

  insert into public.projects(user_id,niche) values(v_fenced,'deletion-fence-ci') returning id into v_project_f;
  insert into public.boards(project_id,title) values(v_project_f,'deletion-fence-ci') returning id into v_board_f;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_fenced::text,'deletion-fence-'||v_fenced,'deletion_fence','enc:test') returning id into v_account_f;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board_f,'https://cdn.example.invalid/fenced-queued.png','Fenced queued','','approved','flux-schnell',0) returning id into v_pin_f_queued;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board_f,'https://cdn.example.invalid/fenced-inflight.png','Fenced inflight','','approved','flux-schnell',0) returning id into v_pin_f_inflight;

  insert into public.projects(user_id,niche) values(v_active,'deletion-fence-ci') returning id into v_project_a;
  insert into public.boards(project_id,title) values(v_project_a,'deletion-fence-ci') returning id into v_board_a;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_active::text,'deletion-fence-'||v_active,'deletion_fence_active','enc:test') returning id into v_account_a;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board_a,'https://cdn.example.invalid/active-queued.png','Active queued','','approved','flux-schnell',0) returning id into v_pin_a;

  -- Fenced account: one schedule due now, one already claimed (in flight).
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status)
  values(v_fenced::text,v_pin_f_queued,v_account_f,now()-interval '1 hour','UTC','board-fenced','scheduled') returning id into v_sched_f_queued;
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_fenced::text,v_pin_f_inflight,v_account_f,now()-interval '1 hour','UTC','board-fenced','publishing',v_fenced_token,now()) returning id into v_sched_f_inflight;

  -- Active control account: one schedule due now.
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status)
  values(v_active::text,v_pin_a,v_account_a,now()-interval '1 hour','UTC','board-active','scheduled') returning id into v_sched_a;

  drop table if exists claimed_schedules;
  create temporary table claimed_schedules as
    select * from public.claim_due_pin_schedules(10);

  -- The fenced account's due schedule must never be handed to a worker.
  if exists(select 1 from claimed_schedules where id=v_sched_f_queued) then
    raise exception 'fenced account schedule was claimed by the worker';
  end if;
  if not exists(select 1 from claimed_schedules where id=v_sched_a) then
    raise exception 'active account schedule was not claimed';
  end if;

  -- 1. Future publication cancelled.
  if not exists(select 1 from public.pin_schedules where id=v_sched_f_queued and status='cancelled' and claim_token is null and next_attempt_at is null) then
    raise exception 'fenced account future schedule was not cancelled';
  end if;

  -- 2. An in-flight claim can no longer be renewed.
  if public.renew_pin_schedule_claim(v_sched_f_inflight, v_fenced_token) then
    raise exception 'fenced account in-flight claim was renewed';
  end if;

  -- 3. A scheduled reservation is refused before any journal row is written.
  begin
    perform public.begin_scheduled_pinterest_publish(
      v_fenced::text, v_sched_f_inflight, v_fenced_token, v_pin_f_inflight, v_account_f, 'board-fenced');
    raise exception 'fenced account was allowed to reserve a scheduled publication';
  exception when insufficient_privilege then
    null;
  end;

  -- Control: the active account keeps working exactly as before.
  if not exists(select 1 from public.pin_schedules where id=v_sched_a and status='publishing' and claim_token is not null) then
    raise exception 'active account schedule was not claimed';
  end if;
  select claim_token into v_active_token from claimed_schedules where id=v_sched_a;
  if not public.renew_pin_schedule_claim(v_sched_a, v_active_token) then
    raise exception 'active account claim was not renewed';
  end if;

  drop table claimed_schedules;
  delete from public.pin_schedules where id in (v_sched_f_queued,v_sched_f_inflight,v_sched_a);
  delete from public.pinterest_accounts where id in (v_account_f,v_account_a);
  delete from public.pins where id in (v_pin_f_queued,v_pin_f_inflight,v_pin_a);
  delete from public.boards where id in (v_board_f,v_board_a);
  delete from public.projects where id in (v_project_f,v_project_a);
  delete from public.users where id in (v_fenced,v_active);
  raise notice 'Account deletion publication fencing checks passed';
end;
$$;
