-- 153_fence_subscription_entitlements_after_account_deletion.sql
-- Paid subscription callbacks may settle during/after deletion, but must not
-- restore access or send activation mail to a fenced account. Preserve the
-- latest-success ordering and transactional email behavior from migration 030.
-- Lock order is owner -> subscription, matching account lifecycle operations.
begin;

alter table public.subscriptions
  add column if not exists provider_paid_at timestamptz;

create or replace function public.activate_paid_subscription(
  p_subscription_id uuid,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_subscription_user_id text;
  v_sub public.subscriptions%rowtype;
  v_user public.users%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_already_activated boolean;
  v_latest_success_created_at timestamptz;
  v_latest_success_id uuid;
  v_effective_plan text;
  v_plan_applied boolean := false;
begin
  if p_subscription_id is null then
    raise exception 'subscription id is required';
  end if;

  -- Discover owner without locking dependent row, then take canonical owner
  -- lock before locking/re-reading the subscription.
  select user_id into v_subscription_user_id
    from public.subscriptions
   where id = p_subscription_id;
  if not found then
    raise exception 'subscription not found';
  end if;

  select * into v_user
    from public.users
   where id::text = v_subscription_user_id
   for update;
  if not found then
    raise exception 'subscription user not found';
  end if;

  select * into v_sub
    from public.subscriptions
   where id = p_subscription_id
   for update;
  if not found or v_sub.user_id is distinct from v_subscription_user_id then
    raise exception 'subscription owner changed';
  end if;

  if v_sub.status not in ('pending', 'denied', 'canceled', 'success', 'paid_unactivated') then
    raise exception 'subscription is not eligible for activation (status=%)', v_sub.status;
  end if;

  v_already_activated := (v_sub.status = 'success' and v_sub.period_end is not null);

  select created_at, id
    into v_latest_success_created_at, v_latest_success_id
    from public.subscriptions
   where user_id = v_sub.user_id
     and status = 'success'
     and id <> v_sub.id
   order by created_at desc, id desc
   limit 1;

  if v_already_activated then
    v_end := v_sub.period_end;
    v_start := coalesce(v_sub.period_start, v_end - interval '30 days');
  else
    if v_user.account_status = 'active' then
      v_start := greatest(
        coalesce(p_paid_at, now()),
        coalesce(v_user.tariff_period_end, coalesce(p_paid_at, now()))
      );
    else
      -- Retain paid-period evidence without extending access after deletion.
      v_start := coalesce(p_paid_at, now());
    end if;
    v_end := v_start + interval '30 days';

    update public.subscriptions
       set status = case when v_user.account_status = 'active'
                         then 'success' else 'paid_unactivated' end,
           provider_paid_at = coalesce(provider_paid_at, p_paid_at, now()),
           period_start = v_start,
           period_end = v_end
     where id = v_sub.id;
  end if;

  -- Only active accounts can receive an entitlement. Preserve ordering so an
  -- older delayed webhook cannot downgrade a newer paid plan.
  if v_user.account_status = 'active'
     and (v_user.tariff_period_end is null or v_user.tariff_period_end <= v_end) then
    if v_latest_success_created_at is null
       or v_sub.created_at > v_latest_success_created_at
       or (
         v_sub.created_at = v_latest_success_created_at
         and v_sub.id >= v_latest_success_id
       ) then
      update public.users
         set tariff_plan = v_sub.plan,
             tariff_period_end = v_end
       where id = v_user.id
         and account_status = 'active';
      v_plan_applied := found;
    else
      update public.users
         set tariff_period_end = v_end
       where id = v_user.id
         and account_status = 'active';
    end if;
  end if;

  -- Do not enqueue activation email for accounts that have requested or
  -- completed deletion. This avoids sending new mail after consent withdrawal.
  if v_user.account_status = 'active'
     and not v_already_activated
     and v_user.email is not null
     and btrim(v_user.email) <> '' then
    select tariff_plan into v_effective_plan
      from public.users
     where id = v_user.id;

    insert into public.email_outbox (
      event_key, subscription_id, recipient_email, locale, template_key, payload
    ) values (
      'subscription_activated:' || v_sub.id::text,
      v_sub.id,
      v_user.email,
      coalesce(nullif(v_user.preferred_language, ''), 'en'),
      'subscription_activated',
      jsonb_build_object(
        'paid_plan', v_sub.plan,
        'current_plan', v_effective_plan,
        'amount', v_sub.amount,
        'currency', v_sub.currency,
        'payment_reference', v_sub.provider_payment_id,
        'period_end', v_end
      )
    )
    on conflict (event_key) do nothing;
  end if;

  select tariff_plan into v_effective_plan
    from public.users where id = v_user.id;

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'plan', v_sub.plan,
    'current_plan', v_effective_plan,
    'plan_applied', v_plan_applied,
    'entitlement_applied', v_plan_applied,
    'period_start', v_start,
    'period_end', v_end,
    'email', v_user.email,
    'already_activated', v_already_activated
  );
end;
$function$;

revoke all on function public.activate_paid_subscription(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_paid_subscription(uuid, timestamptz)
  to service_role;

commit;
