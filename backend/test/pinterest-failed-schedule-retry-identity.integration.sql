-- Run only in disposable PostgreSQL after migrations 031-061, 081-083,
-- 086, 091-095. All fixture writes are rolled back.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_account uuid;
  v_schedule uuid;
  v_result jsonb;
begin
  insert into public.users(id,email,token_version)
  values(v_user,'pinterest-schedule-retry-'||v_user||'@example.invalid',0);
  insert into public.projects(user_id,niche)
  values(v_user,'schedule-retry-ci') returning id into v_project;
  insert into public.boards(project_id,title)
  values(v_project,'schedule-retry-ci') returning id into v_board;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'schedule-retry-'||v_user,'schedule_retry','enc:test')
  returning id into v_account;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/schedule-retry.png','Schedule retry','','approved','flux-schnell',0)
  returning id into v_pin;
  insert into public.pin_schedules(
    user_id,pin_id,pinterest_account_id,scheduled_at,timezone,
    pinterest_board_id,status,last_error
  ) values(
    v_user::text,v_pin,v_account,now()-interval '1 hour','UTC',
    'schedule-board','failed','Temporary Pinterest rejection'
  ) returning id into v_schedule;

  -- A safe failure for a different board must not authorize this retry.
  insert into public.pinterest_publish_attempts(
    user_id,pin_id,pinterest_account_id,pinterest_board_id,status,retry_safe
  ) values(
    v_user::text,v_pin,v_account,'different-board','failed',true
  );

  v_result:=public.retry_failed_pin_schedule(v_user::text,v_schedule);
  if v_result->>'ok' <> 'false'
     or v_result->>'reason' <> 'attempt_identity_mismatch' then
    raise exception 'retry accepted an attempt journal for another board: %',v_result;
  end if;
  if (select status from public.pin_schedules where id=v_schedule)<>'failed' then
    raise exception 'rejected retry changed schedule status';
  end if;

  -- Exact owner + pin + account + board + retry_safe=true permits retry.
  update public.pinterest_publish_attempts
     set pinterest_board_id='schedule-board'
   where pin_id=v_pin and pinterest_account_id=v_account;
  v_result:=public.retry_failed_pin_schedule(v_user::text,v_schedule);
  if v_result->>'ok' <> 'true'
     or (select status from public.pin_schedules where id=v_schedule)<>'scheduled' then
    raise exception 'matching retry-safe attempt did not permit retry: %',v_result;
  end if;

  raise notice 'Pinterest failed-schedule retry identity checks passed';
end;
$$;

rollback;
