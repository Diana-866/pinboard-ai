-- Run only in disposable PostgreSQL after migrations 031-061, 081-083,
-- 086, and 091-094. All fixture writes are rolled back.
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
  values(v_user,'pinterest-board-reassignment-'||v_user||'@example.invalid',0);
  insert into public.projects(user_id,niche)
  values(v_user,'board-reassignment-ci') returning id into v_project;
  insert into public.boards(project_id,title)
  values(v_project,'board-reassignment-ci') returning id into v_board;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'board-reassignment-'||v_user,'board_reassignment','enc:test')
  returning id into v_account;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/board-reassignment.png','Board reassignment','','approved','flux-schnell',0)
  returning id into v_pin;

  insert into public.pin_schedules(
    user_id,pin_id,pinterest_account_id,scheduled_at,timezone,
    pinterest_board_id,status,last_error
  ) values(
    v_user::text,v_pin,v_account,now()-interval '1 hour','UTC',
    'schedule-board','failed',
    'Выбранная доска не найдена или недоступна подключённому Pinterest-аккаунту'
  ) returning id into v_schedule;

  -- Retry-safe alone is insufficient when the journal belongs to another
  -- destination board. It must not authorize re-routing this schedule.
  insert into public.pinterest_publish_attempts(
    user_id,pin_id,pinterest_account_id,pinterest_board_id,status,retry_safe
  ) values(
    v_user::text,v_pin,v_account,'different-old-board','failed',true
  );

  v_result:=public.change_failed_pin_schedule_board(v_user::text,v_schedule,'verified-new-board');
  if v_result->>'ok' <> 'false'
     or v_result->>'reason' <> 'attempt_identity_mismatch' then
    raise exception 'board reassignment accepted a retry-safe journal for another board: %',v_result;
  end if;
  if (select status from public.pin_schedules where id=v_schedule)<>'failed'
     or (select pinterest_board_id from public.pin_schedules where id=v_schedule)<>'schedule-board' then
    raise exception 'rejected board reassignment changed the schedule';
  end if;

  -- Matching owner + old board + explicit safe failure may be re-routed.
  update public.pinterest_publish_attempts
     set pinterest_board_id='schedule-board'
   where pin_id=v_pin and pinterest_account_id=v_account;
  v_result:=public.change_failed_pin_schedule_board(v_user::text,v_schedule,'verified-new-board');
  if v_result->>'ok' <> 'true'
     or (select status from public.pin_schedules where id=v_schedule)<>'scheduled'
     or (select pinterest_board_id from public.pin_schedules where id=v_schedule)<>'verified-new-board' then
    raise exception 'matching retry-safe journal did not permit verified board reassignment: %',v_result;
  end if;

  raise notice 'Pinterest failed-board reassignment identity checks passed';
end;
$$;

rollback;
