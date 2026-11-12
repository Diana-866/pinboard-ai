-- AUD-090: paid subscription callbacks settle without restoring deleted accounts.
begin;

do $$
declare
  v_active_user uuid;
  v_pending_user uuid;
  v_deleted_user uuid;
  v_active_sub uuid;
  v_pending_sub uuid;
  v_deleted_sub uuid;
  v_result jsonb;
begin
  insert into public.users(email, account_status, tariff_plan)
  values ('aud090-active@example.invalid', 'active', 'none')
  returning id into v_active_user;

  insert into public.users(email, account_status, tariff_plan)
  values ('aud090-pending@example.invalid', 'deletion_pending', 'none')
  returning id into v_pending_user;

  insert into public.users(email, account_status, tariff_plan)
  values ('aud090-deleted@example.invalid', 'deleted', 'none')
  returning id into v_deleted_user;

  insert into public.subscriptions(user_id, plan, status, amount, currency)
  values (v_active_user::text, 'start', 'pending', 790, 'rub')
  returning id into v_active_sub;

  insert into public.subscriptions(user_id, plan, status, amount, currency)
  values (v_pending_user::text, 'start', 'pending', 790, 'rub')
  returning id into v_pending_sub;

  insert into public.subscriptions(user_id, plan, status, amount, currency)
  values (v_deleted_user::text, 'start', 'pending', 790, 'rub')
  returning id into v_deleted_sub;

  select public.activate_paid_subscription(v_active_sub, '2026-11-12T10:00:00Z')
    into v_result;
  if (select tariff_plan from public.users where id = v_active_user) <> 'start'
     or (v_result->>'entitlement_applied')::boolean is not true then
    raise exception 'active account did not receive its paid entitlement';
  end if;

  if not exists (
    select 1 from public.email_outbox
     where subscription_id = v_active_sub
       and template_key = 'subscription_activated'
  ) then
    raise exception 'active account activation email was not queued';
  end if;

  -- Retry a paid callback recorded as unresolved; the RPC settles the
  -- financial row but still refuses to restore an entitlement.
  update public.subscriptions
     set status = 'paid_unactivated',
         provider_paid_at = '2026-11-12T10:00:00Z'
   where id = v_pending_sub;

  select public.activate_paid_subscription(v_pending_sub, '2026-11-12T10:00:00Z')
    into v_result;
  if (select tariff_plan from public.users where id = v_pending_user) <> 'none'
     or (v_result->>'entitlement_applied')::boolean is not false then
    raise exception 'deletion-pending account received a subscription entitlement';
  end if;
  if not exists (
    select 1 from public.subscriptions
     where id = v_pending_sub and status = 'paid_unactivated' and provider_paid_at is not null and period_end is not null
  ) then
    raise exception 'paid subscription outcome was not retained for pending deletion';
  end if;
  if exists (
    select 1 from public.email_outbox where subscription_id = v_pending_sub
  ) then
    raise exception 'activation email was queued after deletion was requested';
  end if;

  update public.subscriptions
     set status = 'paid_unactivated',
         provider_paid_at = '2026-11-12T09:00:00Z'
   where id = v_deleted_sub;

  select public.activate_paid_subscription(v_deleted_sub, '2026-11-12T10:00:00Z')
    into v_result;
  if (select tariff_plan from public.users where id = v_deleted_user) <> 'none'
     or (v_result->>'entitlement_applied')::boolean is not false then
    raise exception 'deleted account received a subscription entitlement';
  end if;
  if not exists (
    select 1 from public.subscriptions
     where id = v_deleted_sub and status = 'paid_unactivated' and provider_paid_at is not null and period_end is not null
  ) then
    raise exception 'late paid subscription evidence was not retained for deleted account';
  end if;
  if exists (
    select 1 from public.email_outbox where subscription_id = v_deleted_sub
  ) then
    raise exception 'activation email was queued for a deleted account';
  end if;
end;
$$;

rollback;
