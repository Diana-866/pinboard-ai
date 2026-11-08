-- Run in disposable PostgreSQL after migrations through 092.
-- Stale schedule recovery must require exact attempt + publication evidence.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin_exact uuid;
  v_pin_wrong_board uuid;
  v_pin_no_ledger uuid;
  v_account uuid;
  v_schedule_exact uuid;
  v_schedule_wrong_board uuid;
  v_schedule_no_ledger uuid;
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

  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_user::text,v_pin_exact,v_account,now()-interval '1 hour','UTC','board-exact','publishing',gen_random_uuid(),now()-interval '30 minutes') returning id into v_schedule_exact;
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_user::text,v_pin_wrong_board,v_account,now()-interval '1 hour','UTC','board-current','publishing',gen_random_uuid(),now()-interval '30 minutes') returning id into v_schedule_wrong_board;
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_user::text,v_pin_no_ledger,v_account,now()-interval '1 hour','UTC','board-no-ledger','publishing',gen_random_uuid(),now()-interval '30 minutes') returning id into v_schedule_no_ledger;

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

  delete from public.pin_schedules where id in (v_schedule_exact,v_schedule_wrong_board,v_schedule_no_ledger);
  delete from public.pinterest_publish_attempts where pin_id in (v_pin_exact,v_pin_wrong_board,v_pin_no_ledger) and pinterest_account_id=v_account;
  delete from public.pinterest_publications where pin_id in (v_pin_exact,v_pin_wrong_board,v_pin_no_ledger) and pinterest_account_id=v_account;
  delete from public.pinterest_accounts where id=v_account;
  delete from public.pins where id in (v_pin_exact,v_pin_wrong_board,v_pin_no_ledger);
  delete from public.boards where id=v_board;
  delete from public.projects where id=v_project;
  delete from public.users where id=v_user;
  raise notice 'Pinterest stale schedule recovery checks passed';
end;
$$;
