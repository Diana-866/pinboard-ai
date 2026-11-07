-- Run after migrations 053-073 in disposable PostgreSQL CI.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_req jsonb;
  v_request_id bigint;
  v_claim uuid;
  v_key text;
  v_at timestamptz;
  v_status text;
  v_refunded boolean;
  v_audit_count integer;
begin
  insert into public.users(id,email,credits_balance,token_version)
  values(v_user,'refund-reconcile-'||v_user||'@example.invalid',40,0);
  insert into public.projects(user_id,niche) values(v_user,'refund reconcile') returning id into v_project;
  insert into public.boards(project_id,title) values(v_project,'refund reconcile') returning id into v_board;
  insert into public.pins(board_id,title,image_url,model_used,credits_cost,aspect_ratio)
  values(v_board,'refund reconcile','https://storage.example.invalid/old.png','flux-schnell',1,'2:3')
  returning id into v_pin;

  -- Generation: reconcile only the missing refund fact, preserving all other provider facts.
  v_key := 'refund-reconcile-generation-'||v_user;
  v_req := public.begin_pin_generation_request(v_user::text,v_board,v_key,repeat('a',64));
  v_claim := (v_req->>'claim_token')::uuid;
  select id into v_request_id from public.pin_generation_requests where user_id=v_user::text and idempotency_key=v_key;
  perform public.reserve_pin_generation_credits(v_user::text,v_key,8);
  perform public.save_pin_generation_plan(v_user::text,v_key,v_claim,jsonb_build_array(
    jsonb_build_object('title','failed task','description','','prompt','failed','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.record_pin_generation_provider_outcome(
    v_user::text,v_key,v_claim,1,'reconcile_gen_task','failed',0.90,null,500,'UPSTREAM_ERROR',null
  );
  v_at := public.reconcile_pin_generation_provider_refund(
    v_user::text,v_key,1,'reconcile_gen_task',false,'provider-ticket-0001'
  );
  select provider_refunded into v_refunded from public.pin_generation_tasks
   where generation_request_id=v_request_id and task_index=1;
  if v_refunded is distinct from false then raise exception 'generation refund fact was not reconciled'; end if;
  perform public.fail_pin_generation_request(v_user::text,v_key,v_claim,'provider_failed',false);
  select status into v_status from public.pin_generation_credit_reservations
   where user_id=v_user::text and idempotency_key=v_key;
  if v_status<>'released' then raise exception 'reconciled generation reservation was not released'; end if;

  -- Regeneration: same controlled NULL -> known boolean transition.
  v_key := 'refund-reconcile-regeneration-'||v_user;
  perform public.begin_pin_regeneration_request(v_user::text,v_pin,v_key,repeat('b',64),'flux-schnell','refund reconcile',3);
  select claim_token into v_claim from public.pin_regeneration_requests
   where user_id=v_user::text and idempotency_key=v_key;
  perform public.reserve_pin_regeneration_credits(v_user::text,v_key,v_claim);
  perform public.record_pin_regeneration_provider_outcome(
    v_user::text,v_key,v_claim,'reconcile_regen_task','failed',0.80,null,500,'UPSTREAM_ERROR'
  );
  v_at := public.reconcile_pin_regeneration_provider_refund(
    v_user::text,v_key,'reconcile_regen_task',true,'provider-ticket-0002'
  );
  select provider_refunded into v_refunded from public.pin_regeneration_requests
   where user_id=v_user::text and idempotency_key=v_key;
  if v_refunded is distinct from true then raise exception 'regeneration refund fact was not reconciled'; end if;
  perform public.update_pin_regeneration_request(
    v_user::text,v_key,v_claim,'failed',null,null,null,null,'provider_failed'
  );
  select status into v_status from public.pin_generation_credit_reservations
   where user_id=v_user::text and idempotency_key=v_key;
  if v_status<>'released' then raise exception 'reconciled regeneration reservation was not released'; end if;

  select count(*) into v_audit_count from public.provider_refund_reconciliation_audit
   where user_id=v_user::text;
  if v_audit_count<>2 then raise exception 'expected two immutable reconciliation audit rows, got %',v_audit_count; end if;

  -- Replays cannot rewrite a reconciled fact or create duplicate audit entries.
  begin
    perform public.reconcile_pin_regeneration_provider_refund(
      v_user::text,v_key,'reconcile_regen_task',false,'provider-ticket-0003'
    );
    raise exception 'conflicting refund reconciliation replay was accepted';
  exception when others then
    if sqlerrm not like '%not eligible for reconciliation%' then raise; end if;
  end;
end;
$$;

rollback;
