-- AUD-092: verified provider refunds are recorded idempotently for paid-unactivated subscriptions.
begin;

do $$
declare
  v_admin_id uuid;
  v_non_admin_id uuid;
  v_subscription_id uuid;
  v_action_id uuid := 'e6d1b2c3-4e5f-4678-9abc-0123456789ab';
  v_recorded_at timestamptz;
  v_replayed_at timestamptz;
  v_event_count integer;
begin
  if not has_function_privilege('service_role',
      'public.admin_record_subscription_provider_refund(uuid,uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'service_role must be able to record a subscription provider refund';
  end if;
  if has_function_privilege('authenticated',
      'public.admin_record_subscription_provider_refund(uuid,uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'authenticated must not be able to record a subscription provider refund';
  end if;

  insert into public.users(email, is_admin)
  values ('aud092-admin@example.invalid', true)
  returning id into v_admin_id;

  insert into public.users(email, is_admin)
  values ('aud092-non-admin@example.invalid', false)
  returning id into v_non_admin_id;

  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency, provider_paid_at
  ) values (
    v_admin_id::text, 'start', 'paid_unactivated', 'aud092-provider-order',
    790.00, 'rub', '2026-11-12T11:00:00Z'
  ) returning id into v_subscription_id;

  select public.admin_record_subscription_provider_refund(
    v_admin_id, v_subscription_id, v_action_id,
    'provider_dashboard', 'refund-case-2026-092'
  ) into v_recorded_at;

  select public.admin_record_subscription_provider_refund(
    v_admin_id, v_subscription_id, v_action_id,
    'provider_dashboard', 'refund-case-2026-092'
  ) into v_replayed_at;

  if v_replayed_at <> v_recorded_at then
    raise exception 'idempotent subscription refund replay returned a different timestamp';
  end if;

  select count(*) into v_event_count
    from public.subscription_reconciliation_events
   where subscription_id = v_subscription_id and action_key = v_action_id;
  if v_event_count <> 1 then
    raise exception 'expected exactly one subscription refund event, found %', v_event_count;
  end if;

  if not exists (
    select 1 from public.subscriptions
     where id = v_subscription_id
       and status = 'paid_unactivated'
       and provider_paid_at is not null
       and provider_refunded_at = v_recorded_at
       and provider_refund_evidence_type = 'provider_dashboard'
       and provider_refund_evidence_reference = 'refund-case-2026-092'
       and provider_refund_recorded_by = v_admin_id::text
  ) then
    raise exception 'subscription refund evidence was not persisted';
  end if;

  begin
    perform public.admin_record_subscription_provider_refund(
      v_non_admin_id, v_subscription_id, gen_random_uuid(),
      'provider_dashboard', 'refund-case-2026-093'
    );
    raise exception 'expected non-admin subscription refund reconciliation to be rejected';
  exception
    when others then
      if sqlerrm not like 'administrator privileges required%' then
        raise;
      end if;
  end;

  begin
    perform public.admin_record_subscription_provider_refund(
      v_admin_id, v_subscription_id, v_action_id,
      'provider_dashboard', 'refund-case-2026-999'
    );
    raise exception 'expected subscription action replay payload mismatch to be rejected';
  exception
    when others then
      if sqlerrm not like 'action id replay payload mismatch%' then
        raise;
      end if;
  end;
end;
$$;

rollback;
