-- Run after migrations 045-067 in disposable PostgreSQL CI.
-- Verifies quote persistence, immutable replay, claim fencing and reservation resize.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_request jsonb;
  v_claim uuid;
  v_key text;
  v_plan jsonb;
  v_amount integer;
begin
  insert into public.users(id,email,credits_balance,token_version)
  values(v_user,'provider-quote-'||v_user||'@example.invalid',20,0);

  insert into public.projects(user_id,niche)
  values(v_user,'provider-quote-ci') returning id into v_project;

  insert into public.boards(project_id,title)
  values(v_project,'provider-quote-ci') returning id into v_board;

  v_key := 'provider-quote-'||v_user;
  v_request := public.begin_pin_generation_request(
    v_user::text,v_board,v_key,repeat('e',64)
  );
  v_claim := (v_request->>'claim_token')::uuid;

  perform public.reserve_pin_generation_credits(v_user::text,v_key,10);

  perform public.save_pin_generation_plan(
    v_user::text,v_key,v_claim,
    jsonb_build_array(jsonb_build_object(
      'task_index',1,
      'title','Quoted image',
      'description','Quote journal integration',
      'prompt','A precise test image prompt',
      'model','flux-schnell',
      'aspect_ratio','2:3'
    ))
  );

  perform public.record_pin_generation_task_quote(
    v_user::text,v_key,v_claim,1,1.25,'RUB','flux-schnell','2:3'
  );

  v_plan := public.get_pin_generation_plan(v_user::text,v_key);
  if jsonb_array_length(v_plan) <> 1
     or (v_plan->0->>'provider_quote_price')::numeric <> 1.25
     or v_plan->0->>'provider_quote_currency' <> 'RUB'
     or v_plan->0->>'provider_quote_model' <> 'flux-schnell'
     or v_plan->0->>'provider_quote_aspect_ratio' <> '2:3' then
    raise exception 'exact provider quote was not returned in recovery plan: %',v_plan;
  end if;

  perform public.resize_pin_generation_credit_reservation(
    v_user::text,v_key,v_claim,2
  );
  select amount into v_amount
    from public.pin_generation_credit_reservations
   where user_id=v_user::text and idempotency_key=v_key and status='reserved';
  if v_amount <> 2 then
    raise exception 'reservation was not resized to exact quoted retail amount: %',v_amount;
  end if;

  begin
    perform public.record_pin_generation_task_quote(
      v_user::text,v_key,v_claim,1,1.50,'RUB','flux-schnell','2:3'
    );
    raise exception 'conflicting quote replay was accepted';
  exception when others then
    if sqlerrm not like '%conflicting generation task quote replay%' then raise; end if;
  end;

  begin
    perform public.record_pin_generation_task_quote(
      v_user::text,v_key,v_claim,1,1.25,'USD','flux-schnell','2:3'
    );
    raise exception 'non-RUB quote was accepted';
  exception when others then
    if sqlerrm not like '%invalid generation task quote%' then raise; end if;
  end;

  begin
    perform public.record_pin_generation_task_quote(
      v_user::text,v_key,gen_random_uuid(),1,1.25,'RUB','flux-schnell','2:3'
    );
    raise exception 'stale claim token wrote a provider quote';
  exception when others then
    if sqlerrm not like '%generation claim token mismatch%' then raise; end if;
  end;

  raise notice 'Exact provider quote journal and reservation resize checks passed';
end;
$$;

rollback;
