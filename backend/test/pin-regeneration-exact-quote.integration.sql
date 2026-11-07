-- Run after migrations 053, 063, 066 and 068 in disposable PostgreSQL CI.
-- Verifies exact quote persistence, claim fencing, and reservation repricing.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_request jsonb;
  v_claim uuid;
  v_key text;
  v_amount integer;
  v_reservation integer;
begin
  insert into public.users(id,email,credits_balance)
  values(v_user,'regen-quote-'||v_user||'@example.invalid',100);

  insert into public.projects(user_id,niche)
  values(v_user,'regen-quote-ci') returning id into v_project;

  insert into public.boards(project_id,title)
  values(v_project,'regen-quote-ci') returning id into v_board;

  insert into public.pins(board_id,title,description,image_url,model_used)
  values(v_board,'Quote test','Test description','https://storage.invalid/old.png','flux-schnell')
  returning id into v_pin;

  v_key := 'regen-quote-'||v_user;
  v_request := public.begin_pin_regeneration_request(
    v_user::text,v_pin,v_key,repeat('a',64),
    'flux-schnell','A precise regeneration prompt',20
  );
  v_claim := (v_request->>'claim_token')::uuid;

  perform public.record_pin_regeneration_quote(
    v_user::text,v_key,v_claim,1.25,'RUB','flux-schnell','2:3',2
  );

  perform public.reserve_pin_regeneration_credits(v_user::text,v_key,v_claim);

  select amount into v_amount from public.pin_regeneration_requests
   where user_id=v_user::text and idempotency_key=v_key;
  select amount into v_reservation from public.pin_generation_credit_reservations
   where user_id=v_user::text and idempotency_key=v_key and status='reserved';
  if v_amount<>2 or v_reservation<>2 then
    raise exception 'quote-based request/reservation mismatch: request %, reservation %',v_amount,v_reservation;
  end if;

  perform public.resize_pin_regeneration_credit_reservation(
    v_user::text,v_key,v_claim,3
  );
  select amount into v_amount from public.pin_regeneration_requests
   where user_id=v_user::text and idempotency_key=v_key;
  select amount into v_reservation from public.pin_generation_credit_reservations
   where user_id=v_user::text and idempotency_key=v_key and status='reserved';
  if v_amount<>3 or v_reservation<>3 then
    raise exception 'actual-price settlement resize mismatch: request %, reservation %',v_amount,v_reservation;
  end if;

  begin
    perform public.record_pin_regeneration_quote(
      v_user::text,v_key,v_claim,1.50,'RUB','flux-schnell','2:3',3
    );
    raise exception 'conflicting regeneration quote replay was accepted';
  exception when others then
    if sqlerrm not like '%conflicting regeneration quote replay%' then raise; end if;
  end;

  begin
    perform public.record_pin_regeneration_quote(
      v_user::text,v_key,gen_random_uuid(),1.25,'RUB','flux-schnell','2:3',2
    );
    raise exception 'stale claim token wrote a regeneration quote';
  exception when others then
    if sqlerrm not like '%regeneration claim mismatch%' then raise; end if;
  end;

  raise notice 'Single-pin exact quote and settlement resize checks passed';
end;
$$;

rollback;
