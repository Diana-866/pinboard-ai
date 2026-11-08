-- Run only in disposable PostgreSQL after migrations 015-017, 031-033,
-- 047-061, and 081-082. All fixture writes are rolled back.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_account uuid;
  v_schedule uuid;
  v_action uuid := gen_random_uuid();
  v_recorded timestamptz;
  v_replayed timestamptz;
  v_attempt_status text;
  v_schedule_status text;
begin
  if has_table_privilege('anon','public.pinterest_operator_reconciliations','SELECT')
     or has_table_privilege('anon','public.pinterest_operator_reconciliations','INSERT')
     or has_table_privilege('authenticated','public.pinterest_operator_reconciliations','SELECT')
     or has_table_privilege('authenticated','public.pinterest_operator_reconciliations','INSERT')
     or has_table_privilege('service_role','public.pinterest_operator_reconciliations','SELECT')
     or has_table_privilege('service_role','public.pinterest_operator_reconciliations','INSERT')
     or has_table_privilege('service_role','public.pinterest_operator_reconciliations','UPDATE')
     or has_table_privilege('service_role','public.pinterest_operator_reconciliations','DELETE')
     or has_table_privilege('service_role','public.pinterest_operator_reconciliations','TRUNCATE') then
    raise exception 'operator reconciliation journal has unexpected direct table grants';
  end if;

  if has_function_privilege('anon','public.admin_reconcile_pinterest_unknown_publication(uuid,uuid,text,text,text,text,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.admin_reconcile_pinterest_unknown_publication(uuid,uuid,text,text,text,text,uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.admin_reconcile_pinterest_unknown_publication(uuid,uuid,text,text,text,text,uuid)','EXECUTE') then
    raise exception 'operator reconciliation RPC has unexpected execute grants';
  end if;

  insert into public.users(id,email,token_version,is_admin)
  values(v_user,'pinterest-admin-reconcile-'||v_user||'@example.invalid',0,true);

  insert into public.projects(user_id,niche)
  values(v_user,'admin-reconcile-ci') returning id into v_project;
  insert into public.boards(project_id,title)
  values(v_project,'admin-reconcile-ci') returning id into v_board;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'admin-reconcile-'||v_user,'admin_reconcile','enc:test')
  returning id into v_account;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/reconcile.png','Reconcile fixture','','approved','flux-schnell',0)
  returning id into v_pin;

  insert into public.pinterest_publish_attempts(
    user_id,pin_id,pinterest_account_id,pinterest_board_id,status,retry_safe,
    updated_at
  ) values (
    v_user::text,v_pin,v_account,'remote-board-1','processing',false,
    clock_timestamp()-interval '30 minutes'
  );

  insert into public.pin_schedules(
    user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,
    status,claim_token,updated_at,last_error,next_attempt_at
  ) values (
    v_user::text,v_pin,v_account,clock_timestamp()-interval '1 hour','UTC',
    'remote-board-1','unknown',null,clock_timestamp()-interval '30 minutes',
    'uncertain worker result',null
  ) returning id into v_schedule;

  v_recorded:=public.admin_reconcile_pinterest_unknown_publication(
    v_user,v_schedule,'remote-pin-123456','remote-board-1',
    'pinterest_dashboard','case-2026-0001',v_action
  );

  if v_recorded is null then raise exception 'reconciliation returned no receipt timestamp'; end if;
  if (select status from public.pin_schedules where id=v_schedule)<>'published'
     or (select status from public.pinterest_publish_attempts
       where pin_id=v_pin and pinterest_account_id=v_account)<>'published'
     or (select retry_safe from public.pinterest_publish_attempts
       where pin_id=v_pin and pinterest_account_id=v_account) is distinct from false
     or (select pinterest_pin_id from public.pinterest_publications
       where pin_id=v_pin and pinterest_account_id=v_account)<>'remote-pin-123456' then
    raise exception 'reconciliation did not atomically persist the confirmed publication';
  end if;

  v_replayed:=public.admin_reconcile_pinterest_unknown_publication(
    v_user,v_schedule,'remote-pin-123456','remote-board-1',
    'pinterest_dashboard','case-2026-0001',v_action
  );
  if v_replayed is distinct from v_recorded then
    raise exception 'exact idempotent replay did not return original receipt timestamp';
  end if;

  begin
    perform public.admin_reconcile_pinterest_unknown_publication(
      v_user,v_schedule,'remote-pin-changed','remote-board-1',
      'pinterest_dashboard','case-2026-0001',v_action
    );
    raise exception 'changed payload replay was accepted';
  exception when unique_violation then
    if sqlerrm not like '%action id replay payload mismatch%' then raise; end if;
  end;

  begin
    update public.pinterest_operator_reconciliations
       set evidence_reference='tampered-reference'
     where action_id=v_action;
    raise exception 'append-only reconciliation receipt allowed UPDATE';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;

  begin
    execute 'truncate table public.pinterest_operator_reconciliations';
    raise exception 'append-only reconciliation receipt allowed TRUNCATE';
  exception when raise_exception then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;

  -- A second action for the same schedule cannot create a second receipt.
  begin
    perform public.admin_reconcile_pinterest_unknown_publication(
      v_user,v_schedule,'remote-pin-123456','remote-board-1',
      'pinterest_dashboard','case-2026-0001',gen_random_uuid()
    );
    raise exception 'a second action for an already reconciled schedule was accepted';
  exception when check_violation then
    if sqlerrm not like '%not eligible for reconciliation%' then raise; end if;
  end;

  -- Fresh/terminal states are deliberately not eligible for operator reconciliation.
  update public.pin_schedules
     set status='failed',updated_at=clock_timestamp()-interval '30 minutes'
   where id=v_schedule;
  begin
    perform public.admin_reconcile_pinterest_unknown_publication(
      v_user,v_schedule,'remote-pin-123456','remote-board-1',
      'pinterest_dashboard','case-2026-0001',gen_random_uuid()
    );
    raise exception 'failed schedule was accepted for reconciliation';
  exception when check_violation then
    if sqlerrm not like '%not eligible for reconciliation%' then raise; end if;
  end;
  update public.pin_schedules set status='published' where id=v_schedule;

  -- A stale attempt is insufficient if the schedule itself is still fresh.
  update public.pin_schedules
     set status='unknown',claim_token=null,updated_at=clock_timestamp()
   where id=v_schedule;
  update public.pinterest_publish_attempts
     set status='processing',updated_at=clock_timestamp()-interval '30 minutes'
   where pin_id=v_pin and pinterest_account_id=v_account;
  begin
    perform public.admin_reconcile_pinterest_unknown_publication(
      v_user,v_schedule,'remote-pin-123456','remote-board-1',
      'pinterest_dashboard','case-2026-0001',gen_random_uuid()
    );
    raise exception 'fresh schedule was accepted for reconciliation';
  exception when check_violation then
    if sqlerrm not like '%not eligible for reconciliation%' then raise; end if;
  end;

  -- A stale schedule is insufficient while its attempt is still fresh.
  update public.pin_schedules
     set updated_at=clock_timestamp()-interval '30 minutes'
   where id=v_schedule;
  update public.pinterest_publish_attempts
     set updated_at=clock_timestamp()
   where pin_id=v_pin and pinterest_account_id=v_account;
  begin
    perform public.admin_reconcile_pinterest_unknown_publication(
      v_user,v_schedule,'remote-pin-123456','remote-board-1',
      'pinterest_dashboard','case-2026-0001',gen_random_uuid()
    );
    raise exception 'fresh attempt was accepted for reconciliation';
  exception when check_violation then
    if sqlerrm not like '%attempt is not eligible for reconciliation%' then raise; end if;
  end;

  -- The schedule cannot claim a different board from the reserved attempt.
  update public.pinterest_publish_attempts
     set updated_at=clock_timestamp()-interval '30 minutes'
   where pin_id=v_pin and pinterest_account_id=v_account;
  update public.pin_schedules
     set pinterest_board_id='remote-board-2'
   where id=v_schedule;
  begin
    perform public.admin_reconcile_pinterest_unknown_publication(
      v_user,v_schedule,'remote-pin-123456','remote-board-2',
      'pinterest_dashboard','case-2026-0001',gen_random_uuid()
    );
    raise exception 'board-mismatched attempt was accepted';
  exception when check_violation then
    if sqlerrm not like '%attempt is not eligible for reconciliation%' then raise; end if;
  end;

  -- Matching schedule/attempt IDs cannot overwrite a conflicting publication ledger row.
  update public.pinterest_publish_attempts
     set pinterest_board_id='remote-board-1',pinterest_pin_id='remote-pin-conflict'
   where pin_id=v_pin and pinterest_account_id=v_account;
  update public.pin_schedules
     set pinterest_board_id='remote-board-1',pinterest_pin_id='remote-pin-conflict'
   where id=v_schedule;
  begin
    perform public.admin_reconcile_pinterest_unknown_publication(
      v_user,v_schedule,'remote-pin-conflict','remote-board-1',
      'pinterest_dashboard','case-2026-0001',gen_random_uuid()
    );
    raise exception 'conflicting publication identity was overwritten';
  exception when check_violation then
    if sqlerrm not like '%conflicting remote Pinterest publication identity%' then raise; end if;
  end;

  raise notice 'Pinterest operator reconciliation checks passed';
end;
$$;

rollback;
