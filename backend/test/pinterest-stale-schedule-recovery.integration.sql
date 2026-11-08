-- Run in disposable PostgreSQL after migrations 091-096.
-- Stale recovery must require exact publication evidence and may requeue only
-- an explicitly retry-safe failure for the exact scheduled destination.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin_exact uuid;
  v_pin_wrong_board uuid;
  v_pin_no_ledger uuid;
  v_pin_wrong_remote uuid;
  v_pin_safe_retry uuid;
  v_pin_wrong_board_retry uuid;
  v_account uuid;
  v_schedule_exact uuid;
  v_schedule_wrong_board uuid;
  v_schedule_no_ledger uuid;
  v_schedule_wrong_remote uuid;
  v_schedule_safe_retry uuid;
  v_schedule_wrong_board_retry uuid;
begin
  insert into public.users(id,email,token_version)
  values(v_user,'pinterest-stale-recovery-'||v_user||'@example.invalid',0);
  insert into public.projects(user_id,niche) values(v_user,'stale-recovery-ci') returning id into v_project;
  insert into public.boards(project_id,title) values(v_project,'stale-recovery-ci') returning id into v_board;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'stale-recovery-'||v_user,'stale_recovery','enc:test') returning id into v_account;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/exact.png','Exact','','approved','flux-schnell',0) returning id into v_pin_exact;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/wrong.png','Wrong board','','approved','flux-schnell',0) returning id into v_pin_wrong_board;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/no-ledger.png','No ledger','','approved','flux-schnell',0) returning id into v_pin_no_ledger;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/wrong-remote.png','Wrong remote ID','','approved','flux-schnell',0) returning id into v_pin_wrong_remote;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/safe-retry.png','Safe retry','','approved','flux-schnell',0) returning id into v_pin_safe_retry;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/wrong-board-retry.png','Wrong board retry','','approved','flux-schnell',0) returning id into v_pin_wrong_board_retry;

  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_user::text,v_pin_exact,v_account,now()-interval '1 hour','UTC','board-exact','publishing',gen_random_uuid(),now()-interval '30 minutes') returning id into v_schedule_exact;
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_user::text,v_pin_wrong_board,v_account,now()-interval '1 hour','UTC','board-current','publishing',gen_random_uuid(),now()-interval '30 minutes') returning id into v_schedule_wrong_board;
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_user::text,v_pin_no_ledger,v_account,now()-interval '1 hour','UTC','board-no-ledger','publishing',gen_random_uuid(),now()-interval '30 minutes') returning id into v_schedule_no_ledger;
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,pinterest_pin_id,status,claim_token,updated_at)
  values(v_user::text,v_pin_wrong_remote,v_account,now()-interval '1 hour','UTC','board-wrong-remote','remote-already-recorded','publishing',gen_random_uuid(),now()-interval '30 minutes') returning id into v_schedule_wrong_remote;
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_user::text,v_pin_safe_retry,v_account,now()-interval '1 hour','UTC','board-safe-retry','publishing',gen_random_uuid(),now()-interval '30 minutes') returning id into v_schedule_safe_retry;
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_user::text,v_pin_wrong_board_retry,v_account,now()-interval '1 hour','UTC','board-current','publishing',gen_random_uuid(),now()-interval '30 minutes') returning id into v_schedule_wrong_board_retry;

  insert into public.pinterest_publish_attempts(user_id,pin_id,pinterest_account_id,pinterest_board_id,status,pinterest_pin_id,retry_safe,updated_at)
  values(v_user::text,v_pin_exact,v_account,'board-exact','published','remote-exact',false,now()-interval '30 minutes');
  insert into public.pinterest_publications(user_id,pin_id,pinterest_account_id,pinterest_pin_id,pinterest_board_id)
  values(v_user::text,v_pin_exact,v_account,'remote-exact','board-exact');

  -- The attempt and publication agree with each other, but not with the schedule board.
  insert into public.pinterest_publish_attempts(user_id,pin_id,pinterest_account_id,pinterest_board_id,status,pinterest_pin_id,retry_safe,updated_at)
  values(v_user::text,v_pin_wrong_board,v_account,'board-previous','published','remote-previous',false,now()-interval '30 minutes');
  insert into public.pinterest_publications(user_id,pin_id,pinterest_account_id,pinterest_pin_id,pinterest_board_id)
  values(v_user::text,v_pin_wrong_board,v_account,'remote-previous','board-previous');

  -- A published attempt without the matching publication ledger is not enough.
  insert into public.pinterest_publish_attempts(user_id,pin_id,pinterest_account_id,pinterest_board_id,status,pinterest_pin_id,retry_safe,updated_at)
  values(v_user::text,v_pin_no_ledger,v_account,'board-no-ledger','published','remote-unledgered',false,now()-interval '30 minutes');
  insert into public.pinterest_publish_attempts(user_id,pin_id,pinterest_account_id,pinterest_board_id,status,pinterest_pin_id,retry_safe,updated_at)
  values(v_user::text,v_pin_wrong_remote,v_account,'board-wrong-remote','published','remote-confirmed-different',false,now()-interval '30 minutes');
  insert into public.pinterest_publications(user_id,pin_id,pinterest_account_id,pinterest_pin_id,pinterest_board_id)
  values(v_user::text,v_pin_wrong_remote,v_account,'remote-confirmed-different','board-wrong-remote');

  -- A stale worker claim may be requeued only after an explicit safe failure
  -- for the exact same destination board.
  insert into public.pinterest_publish_attempts(user_id,pin_id,pinterest_account_id,pinterest_board_id,status,retry_safe,updated_at)
  values(v_user::text,v_pin_safe_retry,v_account,'board-safe-retry','failed',true,now()-interval '30 minutes');
  -- A retry-safe rejection for a different board must not authorize this schedule.
  insert into public.pinterest_publish_attempts(user_id,pin_id,pinterest_account_id,pinterest_board_id,status,retry_safe,updated_at)
  values(v_user::text,v_pin_wrong_board_retry,v_account,'board-previous','failed',true,now()-interval '30 minutes');

  perform * from public.claim_due_pin_schedules(1);

  if not exists(select 1 from public.pin_schedules where id=v_schedule_exact and status='published' and pinterest_pin_id='remote-exact' and claim_token is null) then
    raise exception 'exact confirmed publication was not reconciled';
  end if;
  if not exists(select 1 from public.pin_schedules where id=v_schedule_wrong_board and status='unknown' and claim_token is null and next_attempt_at is null) then
    raise exception 'publication for another board incorrectly promoted stale schedule';
  end if;
  if not exists(select 1 from public.pin_schedules where id=v_schedule_no_ledger and status='unknown' and claim_token is null and next_attempt_at is null) then
    raise exception 'attempt without publication ledger incorrectly promoted stale schedule';
  end if;
  if not exists(select 1 from public.pin_schedules where id=v_schedule_wrong_remote and status='unknown' and pinterest_pin_id='remote-already-recorded' and claim_token is null and next_attempt_at is null) then
    raise exception 'publication with a different remote pin ID incorrectly promoted stale schedule';
  end if;
  if not exists(select 1 from public.pin_schedules where id=v_schedule_safe_retry and status='scheduled' and claim_token is null and next_attempt_at > now()) then
    raise exception 'exact retry-safe failure was not safely requeued';
  end if;
  if not exists(select 1 from public.pin_schedules where id=v_schedule_wrong_board_retry and status='failed' and claim_token is null and next_attempt_at is null) then
    raise exception 'retry-safe failure for another board incorrectly requeued stale schedule';
  end if;

  delete from public.pin_schedules where id in (v_schedule_exact,v_schedule_wrong_board,v_schedule_no_ledger,v_schedule_wrong_remote,v_schedule_safe_retry,v_schedule_wrong_board_retry);
  delete from public.pinterest_publish_attempts where pin_id in (v_pin_exact,v_pin_wrong_board,v_pin_no_ledger,v_pin_wrong_remote,v_pin_safe_retry,v_pin_wrong_board_retry) and pinterest_account_id=v_account;
  delete from public.pinterest_publications where pin_id in (v_pin_exact,v_pin_wrong_board,v_pin_no_ledger) and pinterest_account_id=v_account;
  delete from public.pinterest_accounts where id=v_account;
  delete from public.pins where id in (v_pin_exact,v_pin_wrong_board,v_pin_no_ledger,v_pin_wrong_remote,v_pin_safe_retry,v_pin_wrong_board_retry);
  delete from public.boards where id=v_board;
  delete from public.projects where id=v_project;
  delete from public.users where id=v_user;
  raise notice 'Pinterest stale schedule recovery checks passed';
end;
$$;
