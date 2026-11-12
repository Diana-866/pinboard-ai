-- AUD-091: verified provider refunds are recorded idempotently for paid-uncredited credit purchases.
begin;

do $$
declare
  v_admin_id uuid;
  v_non_admin_id uuid;
  v_purchase_id uuid;
  v_deleting_user_id uuid;
  v_request_id uuid;
  v_erase_job_id uuid;
  v_finalize_job_id uuid;
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

  insert into public.users(email, is_admin, account_status, token_version)
  values ('aud091-deleting@example.invalid', false, 'deletion_pending', 1)
  returning id into v_deleting_user_id;

  insert into public.account_deletion_requests(user_id, state, confirmation_method, token_version)
  values (v_deleting_user_id, 'pending', 'password_reauth', 1)
  returning id into v_request_id;

  insert into public.account_deletion_jobs(request_id, step_key, status, attempts)
  values (v_request_id, 'erase_content', 'blocked', 100)
  returning id into v_erase_job_id;
  insert into public.account_deletion_jobs(request_id, step_key, status, attempts)
  values (v_request_id, 'finalize', 'blocked', 8)
  returning id into v_finalize_job_id;

  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status, provider_payment_id, amount, currency, paid_at
  ) values (
    v_deleting_user_id::text, 'pack_100', '100 credits', 100, 'paid_uncredited',
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

  if (
    select count(*) from public.account_deletion_jobs
     where id in (v_erase_job_id, v_finalize_job_id)
       and status = 'retry_wait' and attempts = 0
       and claim_token is null and lease_expires_at is null
       and next_attempt_at <= clock_timestamp()
  ) <> 2 then
    raise exception 'refund did not reopen blocked account-deletion stages';
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
