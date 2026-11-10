-- Run only in disposable PostgreSQL after migrations 031-061 and 081.
-- Verifies that completion cannot rewrite the reserved Pinterest destination.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin_direct uuid;
  v_pin_scheduled uuid;
  v_account uuid;
  v_schedule uuid;
  v_claim uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into public.users(id,email,token_version)
  values(v_user,'pinterest-board-integrity-'||v_user||'@example.invalid',0);

  insert into public.projects(user_id,niche)
  values(v_user,'board-integrity-ci') returning id into v_project;
  insert into public.boards(project_id,title)
  values(v_project,'board-integrity-ci') returning id into v_board;

  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'board-integrity-'||v_user,'board_integrity','enc:test')
  returning id into v_account;

  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/direct.png','Direct board integrity','','approved','flux-schnell',0)
  returning id into v_pin_direct;

  v_result := public.begin_pinterest_publish_v2(
    v_user::text,v_pin_direct,v_account,'reserved-board-direct'
  );
  if v_result->>'status' <> 'started' then
    raise exception 'direct publish reservation failed: %',v_result;
  end if;

  begin
    perform public.complete_pinterest_publish_v2(
      v_user::text,v_pin_direct,v_account,'remote-direct','different-board'
    );
    raise exception 'completion accepted a board different from the reserved destination';
  exception when check_violation then
    if sqlerrm <> 'Pinterest publication board mismatch' then raise; end if;
  end;

  if (select status from public.pinterest_publish_attempts
       where pin_id=v_pin_direct and pinterest_account_id=v_account) <> 'processing'
     or exists (select 1 from public.pinterest_publications
       where pin_id=v_pin_direct and pinterest_account_id=v_account) then
    raise exception 'rejected direct completion changed the attempt or publication ledger';
  end if;

  v_result := public.complete_pinterest_publish_v2(
    v_user::text,v_pin_direct,v_account,'remote-direct','reserved-board-direct'
  );
  if v_result->>'status' <> 'published'
     or v_result->>'pinterest_board_id' <> 'reserved-board-direct' then
    raise exception 'matching direct completion did not persist: %',v_result;
  end if;

  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/scheduled.png','Scheduled board integrity','','approved','flux-schnell',0)
  returning id into v_pin_scheduled;

  insert into public.pin_schedules(
    user_id,pin_id,pinterest_account_id,scheduled_at,timezone,
    pinterest_board_id,status,claim_token
  ) values(
    v_user::text,v_pin_scheduled,v_account,now()-interval '1 minute',
    'UTC','reserved-board-scheduled','publishing',v_claim
  ) returning id into v_schedule;

  v_result := public.begin_scheduled_pinterest_publish(
    v_user::text,v_schedule,v_claim,v_pin_scheduled,v_account,'reserved-board-scheduled'
  );
  if v_result->>'status' <> 'started' then
    raise exception 'scheduled publish reservation failed: %',v_result;
  end if;

  -- Simulate inconsistent persisted schedule metadata after reservation.
  update public.pin_schedules
     set pinterest_board_id='different-schedule-board'
   where id=v_schedule;

  begin
    perform public.complete_pinterest_publish_v2(
      v_user::text,v_pin_scheduled,v_account,'remote-scheduled','reserved-board-scheduled'
    );
    raise exception 'completion accepted a schedule whose board diverged from its attempt';
  exception when check_violation then
    if sqlerrm <> 'Pinterest schedule board mismatch' then raise; end if;
  end;

  if (select status from public.pin_schedules where id=v_schedule) <> 'publishing'
     or (select status from public.pinterest_publish_attempts
       where pin_id=v_pin_scheduled and pinterest_account_id=v_account) <> 'processing'
     or exists (select 1 from public.pinterest_publications
       where pin_id=v_pin_scheduled and pinterest_account_id=v_account) then
    raise exception 'rejected schedule mismatch changed publication state';
  end if;

  update public.pin_schedules
     set pinterest_board_id='reserved-board-scheduled'
   where id=v_schedule;

  v_result := public.complete_pinterest_publish_v2(
    v_user::text,v_pin_scheduled,v_account,'remote-scheduled','reserved-board-scheduled'
  );
  if v_result->>'status' <> 'published'
     or (select status from public.pin_schedules where id=v_schedule) <> 'published'
     or (select pinterest_board_id from public.pinterest_publications
       where pin_id=v_pin_scheduled and pinterest_account_id=v_account) <> 'reserved-board-scheduled' then
    raise exception 'matching scheduled completion did not reconcile: %',v_result;
  end if;

  delete from public.pin_schedules where user_id=v_user::text;
  delete from public.pinterest_publish_attempts where user_id=v_user::text;
  delete from public.pinterest_publications where user_id=v_user::text;
  delete from public.pinterest_accounts where user_id=v_user::text;
  delete from public.pins where id in (v_pin_direct,v_pin_scheduled);
  delete from public.boards where id=v_board;
  delete from public.projects where id=v_project;
  delete from public.users where id=v_user;

  raise notice 'Pinterest publication board-integrity checks passed';
end;
$$;
