-- Run only in disposable PostgreSQL CI after migrations 031-034.
-- A local pin can be published once per Pinterest identity, not once per user.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_legacy_pin uuid;
  v_inflight_pin uuid;
  v_retry_pin uuid;
  v_retry_schedule uuid;
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

  -- Legacy history without an account mapping must not be guessed or retried.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/legacy.png', 'Legacy pin', '', 'pending', 'flux-schnell', 0)
  returning id into v_legacy_pin;
  insert into public.pinterest_publish_attempts(
    user_id, pin_id, pinterest_board_id, status
  ) values (
    v_user::text, v_legacy_pin, 'legacy-board', 'failed'
  );
  v_result := public.begin_pinterest_publish_v2(v_user::text, v_legacy_pin, v_account_a, 'board-a');
  if v_result->>'status' <> 'unknown' then
    raise exception 'unmapped legacy publication history was allowed to retry: %', v_result;
  end if;

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

  -- A separate claimed schedule models a worker already in flight.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/inflight.png', 'In-flight pin', '', 'pending', 'flux-schnell', 0)
  returning id into v_inflight_pin;
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status
  ) values (
    v_user::text, v_inflight_pin, v_account_a, now() - interval '1 minute',
    'UTC', 'board-a', 'publishing'
  );

  -- A retry backoff must keep a due schedule out of the worker claim set
  -- until next_attempt_at, then allow it to be claimed normally.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/retry.png', 'Retry pin', '', 'pending', 'flux-schnell', 0)
  returning id into v_retry_pin;
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status, next_attempt_at
  ) values (
    v_user::text, v_retry_pin, v_account_b, now() - interval '2 minutes',
    'UTC', 'board-b', 'scheduled', now() + interval '5 minutes'
  ) returning id into v_retry_schedule;

  if exists (
    select 1 from public.claim_due_pin_schedules(10) where id = v_retry_schedule
  ) then
    raise exception 'schedule was claimed before its retry backoff elapsed';
  end if;

  update public.pin_schedules
     set next_attempt_at = now() - interval '1 second'
   where id = v_retry_schedule;
  if not exists (
    select 1 from public.claim_due_pin_schedules(10) where id = v_retry_schedule
  ) then
    raise exception 'schedule was not claimed after its retry backoff elapsed';
  end if;
  if (select attempts from public.pin_schedules where id = v_retry_schedule) <> 1 then
    raise exception 'retry schedule claim did not increment attempts exactly once';
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

  -- A claimed/in-flight job is not cancelled underneath its remote request.
  if (select status from public.pin_schedules
       where user_id=v_user::text and pin_id=v_inflight_pin
         and pinterest_account_id=v_account_a) <> 'publishing' then
    raise exception 'disconnecting account A rewrote an in-flight schedule';
  end if;

  -- Disconnecting A must not erase either account's already-published history.
  select count(*) into v_publication_count
    from public.pinterest_publications
   where user_id = v_user::text and pin_id = v_pin;
  if v_publication_count <> 2
     or not exists (
       select 1 from public.pinterest_publications
        where user_id=v_user::text and pin_id=v_pin
          and pinterest_account_id=v_account_a and pinterest_pin_id='remote-a'
     )
     or not exists (
       select 1 from public.pinterest_publications
        where user_id=v_user::text and pin_id=v_pin
          and pinterest_account_id=v_account_b and pinterest_pin_id='remote-b'
     ) then
    raise exception 'disconnecting account A changed published history for A or B';
  end if;

  delete from public.pin_schedules where user_id = v_user::text;
  delete from public.pinterest_publish_attempts where user_id = v_user::text;
  delete from public.pinterest_publications where user_id = v_user::text;
  delete from public.pinterest_accounts where user_id = v_user::text;
  delete from public.pins where id in (v_pin, v_legacy_pin, v_inflight_pin, v_retry_pin);
  delete from public.boards where id = v_board;
  delete from public.projects where id = v_project;
  delete from public.users where id = v_user;

  raise notice 'Pinterest account-scoped publication and scheduling checks passed';
end;
$$;
