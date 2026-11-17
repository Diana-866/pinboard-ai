-- Run after migrations 053-072 in disposable PostgreSQL CI.
-- Unknown provider refund state must retain reservations for both generation
-- modes. Explicit provider_refunded=false is a reconciled non-refund and may
-- safely release a failed request's reservation.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_req jsonb;
  v_claim uuid;
  v_key text;
  v_status text;
  v_reservation text;
  v_balance integer;
begin
  insert into public.users(id,email,credits_balance,token_version)
  values(v_user,'refund-guard-'||v_user||'@example.invalid',30,0);
  insert into public.projects(user_id,niche) values(v_user,'refund guard') returning id into v_project;
  insert into public.boards(project_id,title) values(v_project,'refund guard') returning id into v_board;
  insert into public.pins(board_id,title,image_url,model_used,credits_cost,aspect_ratio)
  values(v_board,'refund guard','https://storage.example.invalid/old.png','flux-schnell',1,'2:3')
  returning id into v_pin;

  -- Multi-pin partial success cannot settle while a failed task's refund is unknown.
  v_key := 'refund-multi-unknown-'||v_user;
  v_req := public.begin_pin_generation_request(v_user::text,v_board,v_key,repeat('d',64));
  v_claim := (v_req->>'claim_token')::uuid;
  perform public.reserve_pin_generation_credits(v_user::text,v_key,8);
  perform public.save_pin_generation_plan(v_user::text,v_key,v_claim,jsonb_build_array(
    jsonb_build_object('title','failed task','description','','prompt','failed','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.record_pin_generation_provider_outcome(
    v_user::text,v_key,v_claim,1,'refund_unknown_multi','failed',1.10,null,500,'UPSTREAM_ERROR',null
  );
  begin
    perform public.complete_pin_generation_request(
      v_user::text,v_board,v_key,v_claim,
      jsonb_build_array(jsonb_build_object(
        'image_url','https://storage.example.invalid/unexpected-completion.png',
        'title','unexpected completion',
        'description','',
        'model_used','flux-schnell',
        'aspect_ratio','2:3',
        'credits_cost',1
      )),
      1
    );
    raise exception 'multi-pin completion accepted an unreconciled provider refund';
  exception when others then
    if sqlerrm not like '%provider refund reconciliation is incomplete%' then raise; end if;
  end;
  begin
    perform public.fail_pin_generation_request(v_user::text,v_key,v_claim,'provider_failed',false);
    raise exception 'multi-pin failure released an unreconciled provider refund';
  exception when others then
    if sqlerrm not like '%provider refund reconciliation is incomplete%' then raise; end if;
  end;
  select status into v_status from public.pin_generation_requests where user_id=v_user::text and idempotency_key=v_key;
  select status into v_reservation from public.pin_generation_credit_reservations where user_id=v_user::text and idempotency_key=v_key;
  if v_status<>'processing' or v_reservation<>'reserved' then
    raise exception 'multi-pin unknown refund did not retain processing reservation: %, %',v_status,v_reservation;
  end if;

  -- Explicit false means provider confirms no refund; it is reconciled and releasable.
  v_key := 'refund-multi-known-'||v_user;
  v_req := public.begin_pin_generation_request(v_user::text,v_board,v_key,repeat('e',64));
  v_claim := (v_req->>'claim_token')::uuid;
  perform public.reserve_pin_generation_credits(v_user::text,v_key,4);
  perform public.save_pin_generation_plan(v_user::text,v_key,v_claim,jsonb_build_array(
    jsonb_build_object('title','known failed task','description','','prompt','failed','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.record_pin_generation_provider_outcome(
    v_user::text,v_key,v_claim,1,'refund_known_multi','failed',0.80,false,400,'POLICY_REJECTED',null
  );
  perform public.fail_pin_generation_request(v_user::text,v_key,v_claim,'provider_failed',false);
  select status into v_reservation from public.pin_generation_credit_reservations where user_id=v_user::text and idempotency_key=v_key;
  if v_reservation<>'released' then raise exception 'reconciled provider failure did not release reservation'; end if;

  -- Single-pin regeneration must also retain its reservation on unknown refund.
  v_key := 'refund-regen-unknown-'||v_user;
  perform public.begin_pin_regeneration_request(v_user::text,v_pin,v_key,repeat('f',64),'flux-schnell','refund guard',3);
  select claim_token into v_claim from public.pin_regeneration_requests where user_id=v_user::text and idempotency_key=v_key;
  perform public.reserve_pin_regeneration_credits(v_user::text,v_key,v_claim);
  perform public.record_pin_regeneration_provider_outcome(
    v_user::text,v_key,v_claim,'refund_unknown_regen','failed',0.90,null,500,'UPSTREAM_ERROR'
  );
  begin
    perform public.update_pin_regeneration_request(v_user::text,v_key,v_claim,'failed',null,null,null,null,'provider_failed');
    raise exception 'regeneration failure accepted an unreconciled provider refund';
  exception when others then
    if sqlerrm not like '%provider refund reconciliation is incomplete%' then raise; end if;
  end;
  select status into v_status from public.pin_regeneration_requests where user_id=v_user::text and idempotency_key=v_key;
  select status into v_reservation from public.pin_generation_credit_reservations where user_id=v_user::text and idempotency_key=v_key;
  if v_status<>'processing' or v_reservation<>'reserved' then
    raise exception 'regeneration unknown refund did not retain processing reservation: %, %',v_status,v_reservation;
  end if;

  select credits_balance into v_balance from public.users where id=v_user;
  if v_balance<>30 then raise exception 'refund guards changed user balance unexpectedly: %',v_balance; end if;
end;
$$;

rollback;
