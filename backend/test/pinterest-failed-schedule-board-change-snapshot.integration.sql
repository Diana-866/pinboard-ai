-- Run in disposable PostgreSQL after migrations 031-061, 081-083, 086, 091-096, 145-146.
-- Proves that a failed schedule can be safely re-routed using its immutable image
-- snapshot even after the source pin's live image reference has been removed.
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
  values(v_user,'pinterest-board-snapshot-'||v_user||'@example.invalid',0);
  insert into public.projects(user_id,niche)
  values(v_user,'board-snapshot-ci') returning id into v_project;
  insert into public.boards(project_id,title)
  values(v_project,'board-snapshot-ci') returning id into v_board;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'board-snapshot-'||v_user,'board_snapshot','enc:test')
  returning id into v_account;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/board-snapshot.png','Board snapshot','','approved','flux-schnell',0)
  returning id into v_pin;
  insert into public.pin_schedules(
    user_id,pin_id,pinterest_account_id,scheduled_at,timezone,
    pinterest_board_id,status,last_error,snapshot_image_url
  ) values(
    v_user::text,v_pin,v_account,now()-interval '1 hour','UTC',
    'old-board','failed',
    'Выбранная доска не найдена или недоступна',
    'https://cdn.example.invalid/immutable-board-snapshot.png'
  ) returning id into v_schedule;

  -- The schedule keeps its immutable creative after the live image is cleared.
  update public.pins set image_url=null where id=v_pin;

  v_result:=public.change_failed_pin_schedule_board(
    v_user::text,v_schedule,'replacement-board'
  );
  if v_result->>'ok' <> 'true' then
    raise exception 'board reassignment rejected a valid immutable snapshot: %',v_result;
  end if;
  if (select status from public.pin_schedules where id=v_schedule)<>'scheduled'
     or (select pinterest_board_id from public.pin_schedules where id=v_schedule)<>'replacement-board' then
    raise exception 'board reassignment did not persist the new schedule state';
  end if;

  raise notice 'Pinterest board reassignment from immutable snapshot passed';
end;
$$;

rollback;
