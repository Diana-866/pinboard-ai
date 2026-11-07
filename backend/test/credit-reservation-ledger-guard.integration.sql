-- Run after migration 074 in disposable PostgreSQL CI.
-- Proves generic ledger debits cannot consume credits held by provider jobs.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_balance integer;
  v_ledger_count integer;
begin
  insert into public.users(id,email,credits_balance,token_version)
  values(v_user,'reserved-ledger-' || v_user || '@example.invalid',10,0);

  insert into public.pin_generation_credit_reservations(
    user_id,idempotency_key,amount,status
  ) values(v_user::text,'reserved-ledger-test-' || v_user,7,'reserved');

  begin
    perform public.adjust_credits_balance_and_log(
      v_user::text,-4,'admin_adjustment','must not consume held credits'
    );
    raise exception 'generic debit consumed active reservation';
  exception when others then
    if sqlerrm not like '%insufficient unreserved credits%' then raise; end if;
  end;

  select credits_balance into v_balance from public.users where id=v_user;
  select count(*) into v_ledger_count from public.credit_transactions where user_id=v_user::text;
  if v_balance <> 10 or v_ledger_count <> 0 then
    raise exception 'blocked debit changed balance or ledger: balance %, rows %',v_balance,v_ledger_count;
  end if;

  -- Positive top-ups do not consume holds and remain fully ledgered.
  perform public.adjust_credits_balance_and_log(
    v_user::text,5,'admin_adjustment','positive adjustment'
  );
  select credits_balance into v_balance from public.users where id=v_user;
  if v_balance <> 15 then
    raise exception 'positive adjustment failed while reservation active: %',v_balance;
  end if;

  update public.pin_generation_credit_reservations
     set status='released'
   where user_id=v_user::text and idempotency_key='reserved-ledger-test-' || v_user;

  -- Once the hold is released, the same debit can safely use those credits.
  perform public.adjust_credits_balance_and_log(
    v_user::text,-8,'admin_adjustment','debit after reservation release'
  );
  select credits_balance into v_balance from public.users where id=v_user;
  select count(*) into v_ledger_count from public.credit_transactions where user_id=v_user::text;
  if v_balance <> 7 or v_ledger_count <> 2 then
    raise exception 'post-release debit mismatch: balance %, rows %',v_balance,v_ledger_count;
  end if;
end;
$$;

rollback;
