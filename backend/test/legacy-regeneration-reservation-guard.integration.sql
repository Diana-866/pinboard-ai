-- Legacy single-pin debit must not consume credits held by active jobs.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_balance integer;
  v_image text;
  v_ledger_count integer;
begin
  insert into public.users(id,email,credits_balance,token_version)
  values(v_user,'legacy-regeneration-' || v_user || '@example.invalid',10,0);

  insert into public.projects(user_id,website_url,niche)
  values(v_user,'https://example.invalid','test')
  returning id into v_project;

  insert into public.boards(project_id,title)
  values(v_project,'reservation guard test')
  returning id into v_board;

  insert into public.pins(board_id,image_url,title,status,credits_cost)
  values(v_board,'https://example.invalid/old.png','guard test','pending',0)
  returning id into v_pin;

  insert into public.pin_generation_credit_reservations(
    user_id,idempotency_key,amount,status
  ) values(v_user::text,'legacy-regeneration-' || v_user,7,'reserved');

  begin
    perform public.update_pin_image_and_charge(
      v_user::text,v_pin,'https://example.invalid/new.png',4
    );
    raise exception 'legacy regeneration RPC consumed active reservation';
  exception when others then
    if sqlerrm not like '%insufficient unreserved credits%' then raise; end if;
  end;

  select credits_balance into v_balance from public.users where id=v_user;
  select image_url into v_image from public.pins where id=v_pin;
  select count(*) into v_ledger_count from public.credit_transactions where user_id=v_user;
  if v_balance <> 10 or v_image <> 'https://example.invalid/old.png' or v_ledger_count <> 0 then
    raise exception 'blocked legacy regeneration changed state: balance %, image %, ledger %',
      v_balance,v_image,v_ledger_count;
  end if;

  update public.pin_generation_credit_reservations
     set status='released'
   where user_id=v_user::text and idempotency_key='legacy-regeneration-' || v_user;

  perform public.update_pin_image_and_charge(
    v_user::text,v_pin,'https://example.invalid/new.png',4
  );

  select credits_balance into v_balance from public.users where id=v_user;
  select image_url into v_image from public.pins where id=v_pin;
  select count(*) into v_ledger_count from public.credit_transactions where user_id=v_user;
  if v_balance <> 6 or v_image <> 'https://example.invalid/new.png' or v_ledger_count <> 1 then
    raise exception 'legacy regeneration after release mismatch: balance %, image %, ledger %',
      v_balance,v_image,v_ledger_count;
  end if;
end;
$$;

rollback;
