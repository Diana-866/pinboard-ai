-- Migrations 159-161: receipt identity, lifecycle fence, atomic entitlement grants and decision journal.
begin;

do $$
declare
  v_credit_user uuid;
  v_subscription_user uuid;
  v_deleted_user uuid;
  v_mismatch_user uuid;
  v_deleted_subscription_user uuid;
  v_deleted_subscription uuid;
  v_purchase uuid;
  v_subscription uuid;
  v_deleted_purchase uuid;
  v_mismatch_purchase uuid;
  v_conflict_user uuid;
  v_conflict_purchase uuid;
  v_conflict_subscription uuid;
  v_terminal_conflict boolean := false;
  v_receipt uuid;
  v_duplicate_receipt uuid;
  v_result jsonb;
  v_count integer;
  v_balance integer;
begin
  if not has_function_privilege(
    'service_role',
    'public.credit_paid_purchase_with_receipt(uuid,timestamp with time zone,text,uuid)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.activate_paid_subscription_with_receipt(uuid,timestamp with time zone,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute receipt-bound fulfillment RPCs';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.credit_paid_purchase_with_receipt(uuid,timestamp with time zone,text,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.activate_paid_subscription_with_receipt(uuid,timestamp with time zone,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute receipt-bound fulfillment RPCs';
  end if;

  insert into public.users(email, credits_balance, account_status)
  values ('migration159-credit@example.invalid', 10, 'active')
  returning id into v_credit_user;
  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency
  ) values (
    v_credit_user::text, 'pack_100', '100 credits', 100, 'canceled',
    'migration159-credit-order', 190.00, 'rub'
  ) returning id into v_purchase;

  v_receipt := public.record_prodamus_payment_receipt(
    'credits', 'migration159-credit-order', 'success', 190.00, 'rub', repeat('b', 64)
  );
  v_result := public.credit_paid_purchase_with_receipt(
    v_purchase, '2026-11-18T10:00:00Z', 'migration 159 credit', v_receipt
  );
  if v_result->>'decision' <> 'granted' or (v_result->>'balance')::integer <> 110 then
    raise exception 'receipt-bound credit fulfillment returned unexpected result: %', v_result;
  end if;

  v_duplicate_receipt := public.record_prodamus_payment_receipt(
    'credits', 'migration159-credit-order', 'success', 190.00, 'rub', repeat('b', 64)
  );
  if v_duplicate_receipt is distinct from v_receipt then
    raise exception 'duplicate delivery did not return the same immutable receipt';
  end if;
  v_result := public.credit_paid_purchase_with_receipt(
    v_purchase, '2026-11-18T10:00:00Z', 'duplicate migration 159 credit', v_receipt
  );
  if v_result->>'decision' <> 'granted' or v_result->>'idempotent' <> 'true' then
    raise exception 'duplicate receipt fulfillment was not idempotent: %', v_result;
  end if;

  select credits_balance into v_balance from public.users where id = v_credit_user;
  select count(*) into v_count from public.credit_transactions where purchase_id = v_purchase;
  if v_balance <> 110 or v_count <> 1 then
    raise exception 'receipt-bound credit fulfillment was not exactly once';
  end if;
  if not exists (
    select 1 from public.payment_entitlement_decisions
     where receipt_id = v_receipt and decision = 'granted'
       and local_payment_kind = 'credits' and local_payment_id = v_purchase
  ) then
    raise exception 'credit grant and decision were not committed together';
  end if;

  -- A granted receipt must never be rebound to a different local credit purchase.
  insert into public.users(email, credits_balance, account_status)
  values ('migration159-credit-conflict@example.invalid', 7, 'active')
  returning id into v_conflict_user;
  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency
  ) values (
    v_conflict_user::text, 'pack_100', '100 credits', 100, 'pending',
    'migration159-different-credit-order', 190.00, 'rub'
  ) returning id into v_conflict_purchase;
  begin
    perform public.credit_paid_purchase_with_receipt(
      v_conflict_purchase, '2026-11-18T10:00:00Z', 'conflicting receipt identity', v_receipt
    );
  exception when others then
    if position('terminal receipt decision conflicts with local credit purchase' in sqlerrm) > 0 then
      v_terminal_conflict := true;
    else
      raise;
    end if;
  end;
  if not v_terminal_conflict then
    raise exception 'granted credit receipt was rebound to a different local purchase';
  end if;
  select credits_balance into v_balance from public.users where id = v_conflict_user;
  select count(*) into v_count from public.credit_transactions where purchase_id = v_conflict_purchase;
  if v_balance <> 7 or v_count <> 0 then
    raise exception 'conflicting credit receipt mutated a different user's entitlement';
  end if;

  insert into public.users(email, account_status)
  values ('migration159-subscription@example.invalid', 'active')
  returning id into v_subscription_user;
  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency
  ) values (
    v_subscription_user::text, 'pro', 'canceled',
    'migration159-subscription-order', 4990.00, 'rub'
  ) returning id into v_subscription;

  v_receipt := public.record_prodamus_payment_receipt(
    'subscription', 'migration159-subscription-order', 'success', 4990.00, 'rub', repeat('c', 64)
  );
  v_result := public.activate_paid_subscription_with_receipt(
    v_subscription, '2026-11-18T10:00:00Z', v_receipt
  );
  if v_result->>'decision' <> 'granted'
     or v_result->>'subscription_id' <> v_subscription::text then
    raise exception 'receipt-bound subscription activation returned unexpected result: %', v_result;
  end if;
  if not exists (
    select 1 from public.subscriptions where id = v_subscription and status = 'success'
      and period_start is not null and period_end > period_start
  ) or not exists (
    select 1 from public.users where id = v_subscription_user and tariff_plan = 'pro'
  ) or not exists (
    select 1 from public.payment_entitlement_decisions
     where receipt_id = v_receipt and decision = 'granted'
       and local_payment_kind = 'subscription' and local_payment_id = v_subscription
  ) then
    raise exception 'subscription entitlement and decision were not committed together';
  end if;

  update public.users set account_status = 'deletion_pending' where id = v_subscription_user;
  v_result := public.activate_paid_subscription_with_receipt(
    v_subscription, '2026-11-18T10:00:00Z', v_receipt
  );
  if v_result->>'decision' <> 'granted' or v_result->>'already_activated' <> 'true' then
    raise exception 'previously granted subscription was not idempotent after deletion fence: %', v_result;
  end if;

  -- A granted subscription receipt must not activate a different subscription.
  insert into public.users(email, account_status)
  values ('migration159-subscription-conflict@example.invalid', 'active')
  returning id into v_conflict_user;
  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency
  ) values (
    v_conflict_user::text, 'pro', 'canceled',
    'migration159-different-subscription-order', 4990.00, 'rub'
  ) returning id into v_conflict_subscription;
  v_terminal_conflict := false;
  begin
    perform public.activate_paid_subscription_with_receipt(
      v_conflict_subscription, '2026-11-18T10:00:00Z', v_receipt
    );
  exception when others then
    if position('terminal receipt decision conflicts with local subscription' in sqlerrm) > 0 then
      v_terminal_conflict := true;
    else
      raise;
    end if;
  end;
  if not v_terminal_conflict then
    raise exception 'granted subscription receipt was rebound to a different local subscription';
  end if;
  if not exists (
    select 1 from public.subscriptions
     where id = v_conflict_subscription and status = 'canceled'
  ) or not exists (
    select 1 from public.users
     where id = v_conflict_user and tariff_plan = 'none'
  ) then
    raise exception 'conflicting subscription receipt mutated a different user's entitlement';
  end if;

  insert into public.users(email, credits_balance, account_status)
  values ('migration159-deleted@example.invalid', 35, 'deletion_pending')
  returning id into v_deleted_user;
  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency
  ) values (
    v_deleted_user::text, 'pack_100', '100 credits', 100, 'canceled',
    'migration159-deleted-order', 190.00, 'rub'
  ) returning id into v_deleted_purchase;
  v_receipt := public.record_prodamus_payment_receipt(
    'credits', 'migration159-deleted-order', 'success', 190.00, 'rub', repeat('d', 64)
  );
  v_result := public.credit_paid_purchase_with_receipt(
    v_deleted_purchase, '2026-11-18T10:00:00Z', 'deleted account receipt', v_receipt
  );
  if v_result->>'decision' <> 'withheld_account_lifecycle' then
    raise exception 'deletion-pending account was not durably withheld: %', v_result;
  end if;
  select credits_balance into v_balance from public.users where id = v_deleted_user;
  select count(*) into v_count from public.credit_transactions where purchase_id = v_deleted_purchase;
  if v_balance <> 35 or v_count <> 0
     or not exists (select 1 from public.credit_purchases where id = v_deleted_purchase and status = 'canceled')
     or not exists (select 1 from public.payment_entitlement_decisions where receipt_id = v_receipt and decision = 'withheld_account_lifecycle') then
    raise exception 'withheld payment mutated account entitlements or lost its decision';
  end if;

  insert into public.users(email, account_status)
  values ('migration159-deleted-subscription@example.invalid', 'deletion_pending')
  returning id into v_deleted_subscription_user;
  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency
  ) values (
    v_deleted_subscription_user::text, 'agency', 'canceled',
    'migration159-deleted-subscription-order', 12990.00, 'rub'
  ) returning id into v_deleted_subscription;
  v_receipt := public.record_prodamus_payment_receipt(
    'subscription', 'migration159-deleted-subscription-order', 'success',
    12990.00, 'rub', repeat('f', 64)
  );
  v_result := public.activate_paid_subscription_with_receipt(
    v_deleted_subscription, '2026-11-18T10:00:00Z', v_receipt
  );
  if v_result->>'decision' <> 'withheld_account_lifecycle' then
    raise exception 'deletion-pending subscription was not durably withheld: %', v_result;
  end if;
  if not exists (
    select 1 from public.subscriptions where id = v_deleted_subscription
      and status = 'canceled' and period_start is null and period_end is null
  ) or not exists (
    select 1 from public.users where id = v_deleted_subscription_user
      and tariff_plan = 'none' and tariff_period_end is null
  ) or not exists (
    select 1 from public.payment_entitlement_decisions
     where receipt_id = v_receipt and decision = 'withheld_account_lifecycle'
  ) then
    raise exception 'withheld subscription mutated tariff or lost its decision';
  end if;

  insert into public.users(email, credits_balance, account_status)
  values ('migration159-mismatch@example.invalid', 5, 'active')
  returning id into v_mismatch_user;
  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency
  ) values (
    v_mismatch_user::text, 'pack_100', '100 credits', 100, 'pending',
    'migration159-mismatch-order', 190.00, 'rub'
  ) returning id into v_mismatch_purchase;
  v_receipt := public.record_prodamus_payment_receipt(
    'credits', 'migration159-mismatch-order', 'success', 191.00, 'rub', repeat('e', 64)
  );
  v_result := public.credit_paid_purchase_with_receipt(
    v_mismatch_purchase, '2026-11-18T10:00:00Z', 'mismatched payment', v_receipt
  );
  if v_result->>'decision' <> 'rejected_mismatch' then
    raise exception 'receipt amount mismatch was not rejected: %', v_result;
  end if;
  v_result := public.credit_paid_purchase_with_receipt(
    v_mismatch_purchase, '2026-11-18T10:00:00Z', 'duplicate mismatched payment', v_receipt
  );
  if v_result->>'decision' <> 'rejected_mismatch' or v_result->>'idempotent' <> 'true' then
    raise exception 'duplicate rejected-mismatch receipt was not idempotent: %', v_result;
  end if;
  select credits_balance into v_balance from public.users where id = v_mismatch_user;
  select count(*) into v_count from public.credit_transactions where purchase_id = v_mismatch_purchase;
  if v_balance <> 5 or v_count <> 0
     or not exists (select 1 from public.payment_entitlement_decisions where receipt_id = v_receipt and decision = 'rejected_mismatch') then
    raise exception 'mismatched payment granted entitlement or lost its decision';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.set_prodamus_payment_decision(uuid,text,text,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute non-grant decision RPC';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.set_prodamus_payment_decision(uuid,text,text,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'only service_role may record non-grant payment decisions';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.mark_prodamus_entitlement_granted(uuid,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute private granted-decision helper';
  end if;
  if has_function_privilege(
    'service_role',
    'public.mark_prodamus_entitlement_granted(uuid,text,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.mark_prodamus_entitlement_granted(uuid,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'direct granted-decision helper must remain private to SECURITY DEFINER wrappers';
  end if;

  v_terminal_conflict := false;
  begin
    perform public.set_prodamus_payment_decision(
      v_receipt, 'granted', null, 'credits', v_mismatch_purchase, v_mismatch_user::text
    );
  exception when others then
    if position('invalid entitlement decision' in sqlerrm) > 0 then
      v_terminal_conflict := true;
    else
      raise;
    end if;
  end;
  if not v_terminal_conflict then
    raise exception 'service decision RPC accepted a direct granted transition';
  end if;
  if not exists (
    select 1 from public.payment_entitlement_decisions
     where receipt_id = v_receipt and decision = 'rejected_mismatch'
  ) then
    raise exception 'rejected mismatch decision changed after forbidden grant attempt';
  end if;
end;
$$;

rollback;
