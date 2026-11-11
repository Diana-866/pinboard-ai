-- Verify that a known Pinterest Pin ID survives an ambiguous local completion.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_account uuid;
  v_schedule uuid;
  v_reconciled integer;
  v_result jsonb;
begin
  insert into public.users(id,email,token_version)
  values(v_user,'known-remote-id-'||v_user||'@example.invalid',0);
  insert into public.projects(user_id,niche) values(v_user,'known-remote-id-test') returning id into v_project;
  insert into public.boards(project_id,title) values(v_project,'known-remote-id-test') returning id into v_board;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/known-remote-id.png','Known remote ID','','approved','flux-schnell',0)
  returning id into v_pin;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'known-remote-id-'||v_user,'known_remote_id','enc:access')
  returning id into v_account;

  v_result := public.begin_pinterest_publish_v2(v_user::text,v_pin,v_account,'board-known');
  if v_result->>'status' <> 'started' then
    raise exception 'publication reservation failed: %',v_result;
  end if;

  if public.record_pinterest_publish_unknown_v2(
    v_user::text,v_pin,v_account,'board-known','remote-known-123',
    'Pinterest returned the ID but local completion was ambiguous'
  ) is distinct from true then
    raise exception 'known remote ID was not recorded';
  end if;

  if (select status from public.pinterest_publish_attempts
       where pin_id=v_pin and pinterest_account_id=v_account) <> 'unknown'
     or (select retry_safe from public.pinterest_publish_attempts
          where pin_id=v_pin and pinterest_account_id=v_account) is distinct from false
     or (select pinterest_pin_id from public.pinterest_publish_attempts
          where pin_id=v_pin and pinterest_account_id=v_account) <> 'remote-known-123'
     or (select pinterest_board_id from public.pinterest_publish_attempts
          where pin_id=v_pin and pinterest_account_id=v_account) <> 'board-known' then
    raise exception 'remote ID was not preserved as a non-retryable unknown attempt';
  end if;

  -- Simulate a scheduled publish whose remote POST succeeded but local
  -- completion response was lost. The stored remote ID must finalize it
  -- atomically without issuing another Pinterest POST.
  insert into public.pin_schedules(
    user_id,pin_id,pinterest_account_id,scheduled_at,timezone,
    pinterest_board_id,status,last_error,next_attempt_at
  ) values(
    v_user::text,v_pin,v_account,now()-interval '1 minute','UTC',
    'board-known','unknown','completion response was lost',null
  ) returning id into v_schedule;

  -- Exact replay is safe; a conflicting ID must never overwrite the first one.
  perform public.record_pinterest_publish_unknown_v2(
    v_user::text,v_pin,v_account,'board-known','remote-known-123','retry'
  );
  begin
    perform public.record_pinterest_publish_unknown_v2(
      v_user::text,v_pin,v_account,'board-known','remote-other-456','conflict'
    );
    raise exception 'conflicting remote ID was accepted';
  exception when sqlstate '23514' then
    null;
  end;

  v_result := public.begin_pinterest_publish_v2(v_user::text,v_pin,v_account,'board-known');
  if v_result->>'status' <> 'unknown' then
    raise exception 'recorded remote ID incorrectly enabled another publish attempt: %',v_result;
  end if;

  -- The normal worker tick invokes this reconciler. It must recover even
  -- if the process died after recording the ID and before calling completion.
  v_reconciled := public.reconcile_confirmed_pinterest_schedule_successes();
  if v_reconciled <> 1
     or not exists (
       select 1 from public.pinterest_publications
        where user_id=v_user::text and pin_id=v_pin
          and pinterest_account_id=v_account
          and pinterest_pin_id='remote-known-123'
          and pinterest_board_id='board-known'
     )
     or not exists (
       select 1 from public.pin_schedules
        where id=v_schedule and status='published'
          and pinterest_pin_id='remote-known-123'
          and claim_token is null and next_attempt_at is null
     ) then
    raise exception 'known remote ID was not recovered by the scheduler reconciler (count=%)',v_reconciled;
  end if;

  -- A second worker tick is idempotent and does not rewrite the published row.
  v_reconciled := public.reconcile_confirmed_pinterest_schedule_successes();
  if v_reconciled <> 0 then
    raise exception 'known remote ID reconciliation was not idempotent: % rows changed',v_reconciled;
  end if;

  delete from public.pin_schedules where id=v_schedule;
  delete from public.pinterest_publish_attempts where user_id=v_user::text;
  delete from public.pinterest_publications where user_id=v_user::text;
  delete from public.pinterest_accounts where user_id=v_user::text;
  delete from public.pins where id=v_pin;
  delete from public.boards where id=v_board;
  delete from public.projects where id=v_project;
  delete from public.users where id=v_user;
  raise notice 'Known Pinterest remote ID recovery checks passed';
end;
$$;
