-- AUD-091: verified provider refunds are recorded idempotently for paid-uncredited credit purchases.
begin;

do $$
declare
  v_admin_id uuid;
  v_non_admin_id uuid;
  v_purchase_id uuid;
  v_action_id uuid := 'd6d1b2c3-4e5f-4678-9abc-0123456789ab';
  v_recorded_at timestamptz;
  v_replayed_at timestamptz;
  v_event_count integer;
begin
  if not has_function_privilege('service_role',
      'public.admin_record_credit_purchase_refund(uuid,uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role must be able to record a provider refund';
  end if;
  if has_function_privilege('authenticated',
      'public.admin_record_credit_purchase_refund(uuid,uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'authenticated must not be able to record a provider refund';
  end if;

  insert into public.users(email, is_admin)
  values ('aud091-admin@example.invalid', true)
  returning id into v_admin_id;

  insert into public.users(email, is_admin)
  values ('aud091-non-admin@example.invalid', false)
  returning id into v_non_admin_id;

  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency, paid_at
  ) values (
    v_admin_id::text, 'pack_100', '100 credits', 100, 'paid_uncredited',
    'aud091-provider-order', 190.00, 'rub', '2026-11-12T11:00:00Z'
  ) returning id into v_purchase_id;

  select public.admin_record_credit_purchase_refund(
    v_admin_id, v_purchase_id, v_action_id,
    'provider_dashboard', 'refund-case-2026-001'
  ) into v_recorded_at;

  select public.admin_record_credit_purchase_refund(
    v_admin_id, v_purchase_id, v_action_id,
    'provider_dashboard', 'refund-case-2026-001'
  ) into v_replayed_at;

  if v_replayed_at <> v_recorded_at then
    raise exception 'idempotent refund replay returned a different timestamp';
  end if;

  select count(*) into v_event_count
    from public.credit_purchase_reconciliation_events
   where purchase_id = v_purchase_id and action_key = v_action_id;
  if v_event_count <> 1 then
    raise exception 'expected exactly one refund reconciliation event, found %', v_event_count;
  end if;

  if not exists (
    select 1 from public.credit_purchases
     where id = v_purchase_id
       and status = 'paid_uncredited'
       and balance_credited_at is null
       and provider_refunded_at = v_recorded_at
       and provider_refund_evidence_type = 'provider_dashboard'
       and provider_refund_evidence_reference = 'refund-case-2026-001'
       and provider_refund_recorded_by = v_admin_id::text
  ) then
    raise exception 'provider refund evidence was not persisted on the purchase';
  end if;

  begin
    perform public.admin_record_credit_purchase_refund(
      v_non_admin_id, v_purchase_id, gen_random_uuid(),
      'provider_dashboard', 'refund-case-2026-002'
    );
    raise exception 'expected non-admin refund reconciliation to be rejected';
  exception
    when others then
      if sqlerrm not like 'administrator privileges required%' then
        raise;
      end if;
  end;

  begin
    perform public.admin_record_credit_purchase_refund(
      v_admin_id, v_purchase_id, v_action_id,
      'provider_dashboard', 'refund-case-2026-999'
    );
    raise exception 'expected action replay payload mismatch to be rejected';
  exception
    when others then
      if sqlerrm not like 'action id replay payload mismatch%' then
        raise;
      end if;
  end;
end;
$$;

rollback;
