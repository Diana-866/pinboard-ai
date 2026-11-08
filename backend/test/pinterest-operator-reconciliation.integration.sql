-- Run only in disposable PostgreSQL after migrations 015-017, 031-033,
-- 047-061, 078, and 081-082. All fixture writes are rolled back.
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

  raise notice 'Pinterest operator reconciliation checks passed';
end;
$$;

rollback;
