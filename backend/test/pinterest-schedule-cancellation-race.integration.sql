\set ON_ERROR_STOP on
begin;

do $$
declare
  v_user_id uuid;
  v_project_id uuid;
  v_board_id uuid;
  v_account_id uuid;
  v_pin_cancel_first uuid;
  v_pin_worker_first uuid;
  v_schedule_cancel_first uuid;
  v_schedule_worker_first uuid;
  v_claimed uuid[];
  v_cancelled uuid;
  v_status text;
  v_token uuid;
begin
  insert into public.users(email, tariff_plan, token_version, is_admin)
  values ('pinterest-cancel-race-' || gen_random_uuid() || '@example.invalid', 'start', 0, true)
  returning id into v_user_id;

  insert into public.projects(user_id, niche)
  values (v_user_id, 'Pinterest cancellation race') returning id into v_project_id;

  insert into public.boards(project_id, title)
  values (v_project_id, 'Pinterest cancellation race') returning id into v_board_id;

  insert into public.pinterest_accounts(user_id, pinterest_user_id, username, access_token)
  values (v_user_id, 'cancel-race-' || v_user_id, 'cancel_race', 'enc:test')
  returning id into v_account_id;

  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board_id, 'https://cdn.example.invalid/cancel-first.png', 'Cancel first', '', 'approved', 'flux-schnell', 0)
  returning id into v_pin_cancel_first;

  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board_id, 'https://cdn.example.invalid/worker-first.png', 'Worker first', '', 'approved', 'flux-schnell', 0)
  returning id into v_pin_worker_first;

  insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id, status, updated_at)
  values (v_user_id, v_pin_cancel_first, v_account_id, now() - interval '1 minute', 'UTC', 'remote-board-cancel-first', 'scheduled', now())
  returning id into v_schedule_cancel_first;

  insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id, status, updated_at)
  values (v_user_id, v_pin_worker_first, v_account_id, now() - interval '1 minute', 'UTC', 'remote-board-worker-first', 'scheduled', now())
  returning id into v_schedule_worker_first;

  -- Cancellation wins: the same conditional transition used by the API moves
  -- scheduled -> cancelled. A subsequent worker claim must not return it.
  update public.pin_schedules
     set status='cancelled', next_attempt_at=null, updated_at=clock_timestamp()
   where id=v_schedule_cancel_first and user_id=v_user_id::text and status='scheduled'
   returning id into v_cancelled;
  if v_cancelled is distinct from v_schedule_cancel_first then
    raise exception 'cancel-first transition did not win';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into v_claimed
    from public.claim_due_pin_schedules(10);
  if v_schedule_cancel_first = any(v_claimed) then
    raise exception 'worker claimed a schedule after cancellation had committed';
  end if;

  -- Worker wins: once claimed, a cancellation conditional on status=scheduled
  -- must affect zero rows and must not clear the fencing token.
  if not (v_schedule_worker_first = any(v_claimed)) then
    raise exception 'worker did not claim the due schedule in worker-first case';
  end if;

  update public.pin_schedules
     set status='cancelled', next_attempt_at=null, updated_at=clock_timestamp()
   where id=v_schedule_worker_first and user_id=v_user_id::text and status='scheduled'
   returning id into v_cancelled;

  if v_cancelled is not null then
    raise exception 'cancellation overwrote a worker-owned publishing schedule';
  end if;

  select status, claim_token into v_status, v_token
    from public.pin_schedules where id=v_schedule_worker_first;
  if v_status <> 'publishing' or v_token is null then
    raise exception 'worker claim was not preserved after rejected cancellation (status %, token %)', v_status, v_token;
  end if;

  -- Fixture cleanup inside the transaction; no production data is touched.
  delete from public.pin_schedules where id in (v_schedule_cancel_first, v_schedule_worker_first);
  delete from public.pins where id in (v_pin_cancel_first, v_pin_worker_first);
  delete from public.pinterest_accounts where id=v_account_id;
  delete from public.boards where id=v_board_id;
  delete from public.projects where id=v_project_id;
  delete from public.users where id=v_user_id;
end $$;

rollback;
