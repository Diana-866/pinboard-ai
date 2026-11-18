-- Migration 158: immutable provider facts and separate entitlement decisions.
begin;

do $$
declare
  v_receipt_id uuid;
  v_duplicate_id uuid;
  v_count integer;
  v_rejected boolean;
begin
  if not has_function_privilege(
    'service_role',
    'public.record_prodamus_payment_receipt(text,text,text,numeric,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute receipt RPC';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.record_prodamus_payment_receipt(text,text,text,numeric,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute receipt RPC';
  end if;
  if has_function_privilege(
    'service_role',
    'public.mark_prodamus_entitlement_granted(uuid,text,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role must not independently assert a granted entitlement';
  end if;
  if has_table_privilege('service_role', 'public.payment_provider_receipts', 'INSERT')
     or has_table_privilege('service_role', 'public.payment_provider_receipts', 'UPDATE')
     or has_table_privilege('service_role', 'public.payment_provider_receipts', 'DELETE') then
    raise exception 'service_role must not directly mutate provider receipts';
  end if;
  if has_table_privilege('service_role', 'public.payment_entitlement_decisions', 'INSERT')
     or has_table_privilege('service_role', 'public.payment_entitlement_decisions', 'UPDATE')
     or has_table_privilege('service_role', 'public.payment_entitlement_decisions', 'DELETE') then
    raise exception 'service_role must not directly mutate entitlement decisions';
  end if;

  v_receipt_id := public.record_prodamus_payment_receipt(
    'credits', 'migration158-order-001', 'success', 190.00, 'rub',
    repeat('a', 64)
  );
  v_duplicate_id := public.record_prodamus_payment_receipt(
    'credits', 'migration158-order-001', 'success', 190.00, 'rub',
    repeat('a', 64)
  );
  if v_receipt_id is distinct from v_duplicate_id then
    raise exception 'duplicate provider event did not resolve to the same receipt';
  end if;

  select count(*) into v_count
    from public.payment_provider_receipts
   where id = v_receipt_id
     and provider = 'prodamus'
     and payment_kind = 'credits'
     and provider_order_id = 'migration158-order-001'
     and provider_status = 'success'
     and received_amount = 190.00
     and received_currency = 'rub';
  if v_count <> 1 then
    raise exception 'expected exactly one normalized provider receipt';
  end if;

  select count(*) into v_count
    from public.payment_entitlement_decisions
   where receipt_id = v_receipt_id and decision = 'pending_review';
  if v_count <> 1 then
    raise exception 'receipt must start with one pending_review decision';
  end if;

  v_rejected := false;
  begin
    update public.payment_provider_receipts
       set provider_status = 'denied'
     where id = v_receipt_id;
  exception when raise_exception then
    if sqlerrm = 'payment provider receipts are immutable' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'provider receipt UPDATE was not rejected';
  end if;

  v_rejected := false;
  begin
    delete from public.payment_provider_receipts where id = v_receipt_id;
  exception when raise_exception then
    if sqlerrm = 'payment provider receipts are immutable' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'provider receipt DELETE was not rejected';
  end if;

  if not public.set_prodamus_payment_decision(
    v_receipt_id, 'unmatched', 'unknown_order_id'
  ) then
    raise exception 'unmatched decision was not confirmed';
  end if;
  v_rejected := false;
  begin
    perform public.set_prodamus_payment_decision(
      v_receipt_id, 'granted', null, 'credits',
      '00000000-0000-4000-8000-000000000158', 'migration158-user'
    );
  exception when raise_exception then
    if sqlerrm = 'invalid entitlement decision' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'general decision RPC was allowed to assert granted';
  end if;

  if not public.set_prodamus_payment_decision(
    v_receipt_id, 'rejected_mismatch', 'amount_mismatch',
    'credits', '00000000-0000-4000-8000-000000000158', 'migration158-user'
  ) then
    raise exception 'rejected mismatch decision was not confirmed';
  end if;

  v_rejected := false;
  begin
    perform public.set_prodamus_payment_decision(
      v_receipt_id, 'unmatched', 'unknown_order_id'
    );
  exception when raise_exception then
    if sqlerrm = 'terminal entitlement decision cannot be overwritten' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'terminal decision was allowed to be overwritten';
  end if;

  select count(*) into v_count
    from public.payment_entitlement_decisions
   where receipt_id = v_receipt_id
     and decision = 'rejected_mismatch'
     and local_payment_kind = 'credits'
     and local_payment_id = '00000000-0000-4000-8000-000000000158'
     and user_id = 'migration158-user';
  if v_count <> 1 then
    raise exception 'final entitlement decision metadata is incorrect';
  end if;
end;
$$;

rollback;
