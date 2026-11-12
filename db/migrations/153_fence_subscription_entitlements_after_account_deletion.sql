-- 153_fence_subscription_entitlements_after_account_deletion.sql
-- A paid subscription webhook may settle after deletion was requested, but it
-- must never restore access to a pending/deleted account.
-- Lock order is owner -> subscription, matching account lifecycle operations.
begin;

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
  v_entitlement_applied boolean := false;
begin
  if p_subscription_id is null then
    raise exception 'subscription id is required';
  end if;

  -- Read owner without locking the dependent row, then take the canonical
  -- owner lock before locking/re-reading the subscription.
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

  if v_sub.status not in ('pending', 'denied', 'canceled', 'success') then
    raise exception 'subscription is not eligible for activation (status=%)', v_sub.status;
  end if;

  v_already_activated := (v_sub.status = 'success' and v_sub.period_end is not null);

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
      -- Keep the paid period as financial evidence without extending access.
      v_start := coalesce(p_paid_at, now());
    end if;
    v_end := v_start + interval '30 days';

    update public.subscriptions
       set status = 'success',
           period_start = v_start,
           period_end = v_end
     where id = v_sub.id;
  end if;

  -- A paid order can settle during/after account deletion. Record its
  -- financial outcome, but never reactivate a fenced account's entitlement.
  if v_user.account_status = 'active'
     and (v_user.tariff_period_end is null or v_user.tariff_period_end <= v_end) then
    update public.users
       set tariff_plan = v_sub.plan,
           tariff_period_end = v_end
     where id = v_user.id
       and account_status = 'active';
    v_entitlement_applied := found;
  end if;

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'plan', v_sub.plan,
    'current_plan', v_user.tariff_plan,
    'period_start', v_start,
    'period_end', v_end,
    'email', v_user.email,
    'already_activated', v_already_activated,
    'entitlement_applied', v_entitlement_applied
  );
end;
$function$;

revoke all on function public.activate_paid_subscription(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_paid_subscription(uuid, timestamptz)
  to service_role;

commit;
