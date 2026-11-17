-- Run only in disposable PostgreSQL after migrations 031-061, 081, 091 and 093.
-- Reconciliation is positive-only and requires exact attempt + publication agreement.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_account uuid;
  v_schedule uuid;
  v_reconciled integer;
  v_actual_status text;
  v_actual_remote_pin_id text;
  v_effective_function text;
begin
  insert into public.users(id,email,token_version)
  values(v_user,'pinterest-unknown-reconcile-'||v_user||'@example.invalid',0);

  insert into public.projects(user_id,niche)
  values(v_user,'unknown-reconcile-ci') returning id into v_project;
  insert into public.boards(project_id,title)
  values(v_project,'unknown-reconcile-ci') returning id into v_board;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'unknown-reconcile-'||v_user,'unknown_reconcile','enc:test')
  returning id into v_account;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/unknown-reconcile.png','Unknown reconcile','','approved','flux-schnell',0)
  returning id into v_pin;

  insert into public.pin_schedules(
    user_id,pin_id,pinterest_account_id,scheduled_at,timezone,
    pinterest_board_id,status,last_error,next_attempt_at
  ) values(
    v_user::text,v_pin,v_account,now()-interval '1 hour','UTC',
    'verified-board','unknown','worker lost local status',null
  ) returning id into v_schedule;

  insert into public.pinterest_publish_attempts(
    user_id,pin_id,pinterest_account_id,pinterest_board_id,status,
    pinterest_pin_id,retry_safe,updated_at
  ) values(
    v_user::text,v_pin,v_account,'verified-board','published',
    'remote-confirmed-123',false,clock_timestamp()-interval '30 minutes'
  );

  insert into public.pinterest_publications(
    user_id,pin_id,pinterest_account_id,pinterest_pin_id,pinterest_board_id
  ) values(
    v_user::text,v_pin,v_account,'remote-confirmed-123','verified-board'
  );

  v_reconciled := public.reconcile_confirmed_pinterest_schedule_successes();
  if v_reconciled <> 1 then
    raise exception 'expected one confirmed unknown schedule to reconcile, got %',v_reconciled;
  end if;
  if not exists (
    select 1 from public.pin_schedules
     where id=v_schedule and status='published'
       and pinterest_pin_id='remote-confirmed-123'
       and claim_token is null and next_attempt_at is null and last_error is null
  ) then
    raise exception 'confirmed schedule was not fully reconciled';
  end if;

  -- Re-running is idempotent and does not rewrite an already-published row.
  v_reconciled := public.reconcile_confirmed_pinterest_schedule_successes();
  if v_reconciled <> 0 then
    raise exception 'reconciliation was not idempotent: % rows changed',v_reconciled;
  end if;

  -- A mismatched remote ID must never promote an unknown schedule.
  update public.pin_schedules
     set status='unknown',pinterest_pin_id=null
   where id=v_schedule;
  update public.pinterest_publications
     set pinterest_pin_id='different-remote-id'
   where pin_id=v_pin and pinterest_account_id=v_account;
  v_reconciled := public.reconcile_confirmed_pinterest_schedule_successes();
  if v_reconciled <> 0
     or (select status from public.pin_schedules where id=v_schedule) <> 'unknown' then
    raise exception 'mismatched publication evidence incorrectly promoted schedule';
  end if;

  -- Even if attempt and ledger agree, a conflicting remote ID already stored
  -- on the schedule is part of the identity and must keep it fenced.
  update public.pinterest_publish_attempts
     set pinterest_pin_id='remote-confirmed-123'
   where pin_id=v_pin and pinterest_account_id=v_account;
  update public.pinterest_publications
     set pinterest_pin_id='remote-confirmed-123'
   where pin_id=v_pin and pinterest_account_id=v_account;
  update public.pin_schedules
     set pinterest_pin_id='remote-already-recorded'
   where id=v_schedule;
  v_reconciled := public.reconcile_confirmed_pinterest_schedule_successes();
  select status, pinterest_pin_id
    into v_actual_status, v_actual_remote_pin_id
    from public.pin_schedules
   where id=v_schedule;
  if v_reconciled <> 0
     or v_actual_status <> 'unknown'
     or v_actual_remote_pin_id <> 'remote-already-recorded' then
    v_effective_function := pg_get_functiondef(
      'public.reconcile_confirmed_pinterest_schedule_successes()'::regprocedure
    );
    raise exception 'schedule remote pin identity conflict incorrectly promoted schedule: reconciled=%, actual_status=%, actual_remote_pin_id=%, effective_function=%',
      v_reconciled, v_actual_status, v_actual_remote_pin_id, v_effective_function;
  end if;

  delete from public.pin_schedules where id=v_schedule;
  delete from public.pinterest_publish_attempts where pin_id=v_pin and pinterest_account_id=v_account;
  delete from public.pinterest_publications where pin_id=v_pin and pinterest_account_id=v_account;
  delete from public.pinterest_accounts where id=v_account;
  delete from public.pins where id=v_pin;
  delete from public.boards where id=v_board;
  delete from public.projects where id=v_project;
  delete from public.users where id=v_user;

  raise notice 'Pinterest unknown-schedule reconciliation checks passed';
end;
$$;
