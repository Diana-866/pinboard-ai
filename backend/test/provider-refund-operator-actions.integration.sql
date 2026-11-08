-- AUD-128: administrator provider-refund journal integration tests.
-- Run after migrations 053-078 in a disposable PostgreSQL/Supabase-compatible DB.
begin;

create or replace function public._test_reject_operator_action_insert()
returns trigger language plpgsql as $trigger$
begin
  if current_setting('app.test_reject_journal_insert',true)='on' then
    raise exception 'injected journal failure';
  end if;
  return new;
end;
$trigger$;
create trigger _test_reject_operator_action_insert
  before insert on public.provider_refund_operator_actions
  for each row execute function public._test_reject_operator_action_insert();

do $test$
declare
  v_admin uuid := gen_random_uuid();
  v_target uuid := gen_random_uuid();
  v_nonadmin uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_req jsonb;
  v_request_id bigint;
  v_claim uuid;
  v_key text;
  v_action uuid;
  v_generation_action uuid;
  v_at timestamptz;
  v_refunded boolean;
  v_status text;
  v_count integer;
begin
  insert into public.users(id,email,credits_balance,token_version,is_admin)
  values
    (v_admin,'admin-action-'||v_admin||'@example.invalid',50,0,true),
    (v_target,'target-action-'||v_target||'@example.invalid',50,0,false),
    (v_nonadmin,'nonadmin-action-'||v_nonadmin||'@example.invalid',50,0,false);

  insert into public.projects(user_id,niche) values(v_target,'admin action test') returning id into v_project;
  insert into public.boards(project_id,title) values(v_project,'admin action test') returning id into v_board;
  insert into public.pins(board_id,title,image_url,model_used,credits_cost,aspect_ratio)
  values(v_board,'admin action test','https://storage.example.invalid/old.png','flux-schnell',1,'2:3')
  returning id into v_pin;

  -- Generation reconciliation: a journal insert failure must roll back the
  -- underlying provider-refund fact and the 073 reconciliation audit row.
  v_key:='admin-action-generation-'||v_target;
  v_req:=public.begin_pin_generation_request(v_target::text,v_board,v_key,repeat('c',64));
  v_claim:=(v_req->>'claim_token')::uuid;
  select id into v_request_id from public.pin_generation_requests
   where user_id=v_target::text and idempotency_key=v_key;
  perform public.reserve_pin_generation_credits(v_target::text,v_key,8);
  perform public.save_pin_generation_plan(v_target::text,v_key,v_claim,jsonb_build_array(
    jsonb_build_object('title','failed task','description','','prompt','failed','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.record_pin_generation_provider_outcome(
    v_target::text,v_key,v_claim,1,'admin_gen_task','failed',0.90,null,500,'UPSTREAM_ERROR',null
  );

  v_action:=gen_random_uuid();
  begin
    perform set_config('app.test_reject_journal_insert','on',true);
    perform public.admin_reconcile_pin_generation_provider_refund(
      v_admin,v_request_id,1,false,'provider_dashboard','ticket-generation-001',v_action
    );
    raise exception 'expected injected journal failure';
  exception when others then
    if sqlerrm not like '%injected journal failure%' then raise; end if;
  end;

  select provider_refunded into v_refunded from public.pin_generation_tasks
   where generation_request_id=v_request_id and task_index=1;
  if v_refunded is not null then
    raise exception 'provider refund fact survived failed journal insert';
  end if;
  select count(*) into v_count from public.provider_refund_reconciliation_audit
   where user_id=v_target::text and idempotency_key=v_key;
  if v_count<>0 then raise exception 'reconciliation audit survived failed journal insert'; end if;

  v_at:=public.admin_reconcile_pin_generation_provider_refund(
    v_admin,v_request_id,1,false,'provider_dashboard','ticket-generation-001',v_action
  );
  if v_at is null then raise exception 'generation reconciliation returned no timestamp'; end if;

  -- Exact replay returns the original receipt and creates no duplicate row.
  if public.admin_reconcile_pin_generation_provider_refund(
    v_admin,v_request_id,1,false,'provider_dashboard','ticket-generation-001',v_action
  ) is distinct from v_at then
    raise exception 'exact action replay did not return original timestamp';
  end if;
  select count(*) into v_count from public.provider_refund_operator_actions where action_id=v_action;
  if v_count<>1 then raise exception 'exact replay created duplicate journal rows'; end if;
  v_generation_action:=v_action;

  -- Same action UUID with altered evidence must be rejected.
  begin
    perform public.admin_reconcile_pin_generation_provider_refund(
      v_admin,v_request_id,1,false,'provider_dashboard','ticket-generation-002',v_action
    );
    raise exception 'mismatched action replay was accepted';
  exception when others then
    if sqlerrm not like '%action id replay payload mismatch%' then raise; end if;
  end;

  -- A non-admin cannot call the wrapper even with a valid target request.
  begin
    perform public.admin_finalize_reconciled_pin_generation_failure(v_nonadmin,v_request_id,gen_random_uuid());
    raise exception 'non-admin action was accepted';
  exception when others then
    if sqlerrm not like '%administrator privileges required%' then raise; end if;
  end;

  perform public.admin_finalize_reconciled_pin_generation_failure(v_admin,v_request_id,gen_random_uuid());
  select status into v_status from public.pin_generation_requests where id=v_request_id;
  if v_status<>'failed' then raise exception 'generation finalization did not fail request'; end if;
  select status into v_status from public.pin_generation_credit_reservations
   where user_id=v_target::text and idempotency_key=v_key;
  if v_status<>'released' then raise exception 'generation reservation was not released'; end if;

  -- Regeneration uses task_index=0 and the same journal/transaction boundary.
  v_key:='admin-action-regeneration-'||v_target;
  perform public.begin_pin_regeneration_request(
    v_target::text,v_pin,v_key,repeat('d',64),'flux-schnell','admin action test',3
  );
  select id,claim_token into v_request_id,v_claim from public.pin_regeneration_requests
   where user_id=v_target::text and idempotency_key=v_key;
  perform public.reserve_pin_regeneration_credits(v_target::text,v_key,v_claim);
  perform public.record_pin_regeneration_provider_outcome(
    v_target::text,v_key,v_claim,'admin_regen_task','failed',0.80,null,500,'UPSTREAM_ERROR'
  );
  v_action:=gen_random_uuid();
  perform public.admin_reconcile_pin_regeneration_provider_refund(
    v_admin,v_request_id,true,'provider_support','support-case-0001',v_action
  );
  perform public.admin_finalize_reconciled_pin_regeneration_failure(
    v_admin,v_request_id,gen_random_uuid()
  );
  select status into v_status from public.pin_regeneration_requests where id=v_request_id;
  if v_status<>'failed' then raise exception 'regeneration finalization did not fail request'; end if;
  select status into v_status from public.pin_generation_credit_reservations
   where user_id=v_target::text and idempotency_key=v_key;
  if v_status<>'released' then raise exception 'regeneration reservation was not released'; end if;

  select count(*) into v_count from public.provider_refund_operator_actions
   where operator_user_id=v_admin;
  if v_count<>4 then
    raise exception 'expected four operator journal rows (two reconciliations and two finalizations), got %',v_count;
  end if;

  -- A previously valid action UUID cannot be replayed after operator demotion.
  update public.users set is_admin=false where id=v_admin;
  begin
    perform public.admin_reconcile_pin_generation_provider_refund(
      v_admin,
      (select id from public.pin_generation_requests where user_id=v_target::text and idempotency_key like 'admin-action-generation-%'),
      1,false,'provider_dashboard','ticket-generation-001',v_generation_action
    );
    raise exception 'demoted operator replay was accepted';
  exception when others then
    if sqlerrm not like '%administrator privileges required%' then raise; end if;
  end;
end;
$test$;

-- Direct API-role access is denied; RPC execution is the only supported path.
do $$
begin
  if has_table_privilege('service_role','public.provider_refund_operator_actions','SELECT')
     or has_table_privilege('service_role','public.provider_refund_operator_actions','INSERT')
     or has_table_privilege('anon','public.provider_refund_operator_actions','SELECT')
     or has_table_privilege('authenticated','public.provider_refund_operator_actions','SELECT') then
    raise exception 'operator journal has unexpected direct table privileges';
  end if;
  if not has_function_privilege('service_role',
    'public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)','EXECUTE') then
    raise exception 'service_role cannot execute the admin reconciliation RPC';
  end if;
  if has_function_privilege('anon',
    'public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)','EXECUTE')
     or has_function_privilege('authenticated',
    'public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)','EXECUTE')
     or has_function_privilege('service_role',
    'public._admin_record_provider_refund_action(uuid,text,bigint,text,integer,boolean,text,text,uuid)','EXECUTE') then
    raise exception 'unexpected execute privilege on admin RPC or internal worker';
  end if;
end;
$$;

drop trigger _test_reject_operator_action_insert on public.provider_refund_operator_actions;
drop function public._test_reject_operator_action_insert();

-- Append-only triggers reject UPDATE and TRUNCATE even when executed as owner.
do $test$
begin
  begin
    update public.provider_refund_operator_actions
       set after_state='tampered'
     where action_id is not null;
    raise exception 'operator journal UPDATE was accepted';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
  begin
    truncate table public.provider_refund_operator_actions;
    raise exception 'operator journal TRUNCATE was accepted';
  exception when others then
    if sqlerrm not like '%append-only%' then raise; end if;
  end;
end;
$test$;

rollback;
