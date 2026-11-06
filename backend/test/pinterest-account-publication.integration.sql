-- Run only in disposable PostgreSQL CI after migrations 031-033.
-- A local pin can be published once per Pinterest identity, not once per user.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_account_a uuid;
  v_account_b uuid;
  v_result jsonb;
  v_publication_count integer;
  v_schedule_count integer;
  v_disconnected boolean;
begin
  insert into public.users(id, email, token_version)
  values (v_user, 'pinterest-account-publish-' || v_user || '@example.invalid', 0);

  insert into public.projects(user_id, niche) values (v_user, 'multi-account-ci') returning id into v_project;
  insert into public.boards(project_id, title) values (v_project, 'multi-account-ci') returning id into v_board;
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/multi-account.png', 'Multi account', '', 'pending', 'flux-schnell', 0)
  returning id into v_pin;

  insert into public.pinterest_accounts(user_id, pinterest_user_id, username, access_token)
  values (v_user::text, 'account-a-' || v_user, 'account_a', 'enc:a')
  returning id into v_account_a;

  insert into public.pinterest_accounts(user_id, pinterest_user_id, username, access_token)
  values (v_user::text, 'account-b-' || v_user, 'account_b', 'enc:b')
  returning id into v_account_b;

  v_result := public.begin_pinterest_publish_v2(v_user::text, v_pin, v_account_a, 'board-a');
  if v_result->>'status' <> 'started' then
    raise exception 'first account publication did not start: %', v_result;
  end if;
  perform public.complete_pinterest_publish_v2(v_user::text, v_pin, v_account_a, 'remote-a', 'board-a');

  v_result := public.begin_pinterest_publish_v2(v_user::text, v_pin, v_account_b, 'board-b');
  if v_result->>'status' <> 'started' then
    raise exception 'same local pin could not be published to second account: %', v_result;
  end if;
  perform public.complete_pinterest_publish_v2(v_user::text, v_pin, v_account_b, 'remote-b', 'board-b');

  select count(*) into v_publication_count
    from public.pinterest_publications
   where user_id = v_user::text and pin_id = v_pin;
  if v_publication_count <> 2 then
    raise exception 'expected one publication per Pinterest account, got %', v_publication_count;
  end if;

  v_result := public.begin_pinterest_publish_v2(v_user::text, v_pin, v_account_a, 'board-a');
  if v_result->>'status' <> 'published' or v_result->>'pinterest_pin_id' <> 'remote-a' then
    raise exception 'duplicate publication on account A was not idempotent: %', v_result;
  end if;

  -- Active schedules are also unique per pin + Pinterest account.
  insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id)
  values (v_user::text, v_pin, v_account_a, now() + interval '1 day', 'UTC', 'board-a');
  insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id)
  values (v_user::text, v_pin, v_account_b, now() + interval '1 day', 'UTC', 'board-b');

  select count(*) into v_schedule_count
    from public.pin_schedules
   where user_id = v_user::text and pin_id = v_pin
     and status = 'scheduled';
  if v_schedule_count <> 2 then
    raise exception 'same pin could not be scheduled independently for two accounts';
  end if;

  begin
    insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id)
    values (v_user::text, v_pin, v_account_a, now() + interval '2 days', 'UTC', 'board-a');
    raise exception 'duplicate active schedule for same account was accepted';
  exception when unique_violation then
    null;
  end;

  -- Disconnecting A must fail only A's future schedules; B remains queued.
  v_disconnected := public.disconnect_pinterest_account_v2(v_user::text, v_account_a);
  if v_disconnected is distinct from true then
    raise exception 'disconnecting account A failed';
  end if;
  if (select status from public.pin_schedules
       where user_id=v_user::text and pin_id=v_pin and pinterest_account_id=v_account_a) <> 'failed' then
    raise exception 'future schedule for disconnected account A was not failed';
  end if;
  if (select status from public.pin_schedules
       where user_id=v_user::text and pin_id=v_pin and pinterest_account_id=v_account_b) <> 'scheduled' then
    raise exception 'disconnecting account A changed account B schedule';
  end if;

  delete from public.pin_schedules where user_id = v_user::text;
  delete from public.pinterest_publish_attempts where user_id = v_user::text;
  delete from public.pinterest_publications where user_id = v_user::text;
  delete from public.pinterest_accounts where user_id = v_user::text;
  delete from public.pins where id = v_pin;
  delete from public.boards where id = v_board;
  delete from public.projects where id = v_project;
  delete from public.users where id = v_user;

  raise notice 'Pinterest account-scoped publication and scheduling checks passed';
end;
$$;
