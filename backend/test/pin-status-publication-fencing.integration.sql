-- Atomic pin status/publication fencing regression test.
-- Run after the full migration chain, including 141_atomic_pin_publication_status_fencing.sql.
begin;

do $body$
declare
  v_user_id uuid := gen_random_uuid();
  v_project_id uuid := gen_random_uuid();
  v_board_id uuid := gen_random_uuid();
  v_pin_id uuid := gen_random_uuid();
  v_account_id uuid := gen_random_uuid();
  v_result jsonb;
  v_status text;
  v_schedule_id uuid;
begin
  insert into public.users(id, email, tariff_plan, token_version, is_admin)
  values (v_user_id, v_user_id::text || '@pin-status-fence-test.invalid', 'start', 0, false);

  insert into public.projects(id, user_id, niche)
  values (v_project_id, v_user_id, 'Pin status fencing');
  insert into public.boards(id, project_id, title)
  values (v_board_id, v_project_id, 'Pin status fencing');
  insert into public.pinterest_accounts(id, user_id, pinterest_user_id, username, access_token)
  values (v_account_id, v_user_id, 'pin-status-' || v_user_id::text, 'pin_status_test', 'enc:test');
  insert into public.pins(id, board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_pin_id, v_board_id, 'https://cdn.example.invalid/pin-status.webp',
          'Pin status fencing', '', 'approved', 'flux-schnell', 0);

  -- Existing active schedule blocks rejection atomically in the BEFORE trigger.
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status
  ) values (
    v_user_id::text, v_pin_id, v_account_id, now() + interval '1 hour',
    'UTC', 'remote-board', 'scheduled'
  ) returning id into v_schedule_id;

  begin
    update public.pins set status = 'rejected' where id = v_pin_id;
    raise exception 'pin rejection unexpectedly passed an active schedule';
  exception when sqlstate '55000' then
    null;
  end;
  select status into v_status from public.pins where id = v_pin_id;
  if v_status <> 'approved' then
    raise exception 'blocked rejection changed the pin status';
  end if;

  delete from public.pin_schedules where id = v_schedule_id;

  -- Any publication attempt, even a failed/ambiguous one, blocks rejection.
  insert into public.pinterest_publish_attempts(
    user_id, pin_id, pinterest_account_id, pinterest_board_id, status
  ) values (
    v_user_id::text, v_pin_id, v_account_id, 'remote-board', 'failed'
  );
  begin
    update public.pins set status = 'rejected' where id = v_pin_id;
    raise exception 'pin rejection unexpectedly passed publication history';
  exception when sqlstate '55000' then
    null;
  end;
  delete from public.pinterest_publish_attempts where pin_id = v_pin_id;

  -- Once rejected, neither schedule insertion nor provider publication can start.
  update public.pins set status = 'rejected' where id = v_pin_id;
  begin
    insert into public.pin_schedules(
      user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
      pinterest_board_id, status
    ) values (
      v_user_id::text, v_pin_id, v_account_id, now() + interval '1 hour',
      'UTC', 'remote-board', 'scheduled'
    );
    raise exception 'schedule insert unexpectedly accepted a rejected pin';
  exception when sqlstate '55000' then
    null;
  end;

  v_result := public.begin_pinterest_publish_v2(
    v_user_id::text, v_pin_id, v_account_id, 'remote-board'
  );
  if v_result ->> 'status' <> 'pin_not_approved' then
    raise exception 'provider reservation did not reject a non-approved pin: %', v_result;
  end if;

  -- A started publication is itself durable history and blocks later rejection.
  update public.pins set status = 'approved' where id = v_pin_id;
  v_result := public.begin_pinterest_publish_v2(
    v_user_id::text, v_pin_id, v_account_id, 'remote-board'
  );
  if v_result ->> 'status' <> 'started' then
    raise exception 'approved pin could not reserve publication: %', v_result;
  end if;
  begin
    update public.pins set status = 'rejected' where id = v_pin_id;
    raise exception 'pin rejection unexpectedly passed a newly reserved publication';
  exception when sqlstate '55000' then
    null;
  end;

  delete from public.pinterest_publish_attempts where pin_id = v_pin_id;
  delete from public.pinterest_accounts where id = v_account_id;
  delete from public.pins where id = v_pin_id;
  delete from public.boards where id = v_board_id;
  delete from public.projects where id = v_project_id;
  delete from public.users where id = v_user_id;
end;
$body$;

rollback;
