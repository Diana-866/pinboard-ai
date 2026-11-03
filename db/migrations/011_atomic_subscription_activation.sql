-- 011_atomic_subscription_activation.sql
-- Requires baseline + hardening migrations (subscriptions.user_id is UUID).

create or replace function public.activate_paid_subscription(
  p_subscription_id uuid,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_user public.users%rowtype;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_sub
    from public.subscriptions
   where id = p_subscription_id
   for update;

  if not found then
    raise exception 'subscription not found';
  end if;

  select * into v_user
    from public.users
   where id = v_sub.user_id
   for update;

  if not found then
    raise exception 'subscription user not found';
  end if;

  if v_sub.status not in ('pending', 'denied', 'success') then
    raise exception 'subscription is not eligible for activation (status=%)', v_sub.status;
  end if;

  -- Existing successful activation: repair user entitlement if needed,
  -- but never extend the same paid order twice.
  if v_sub.status = 'success' and v_sub.period_end is not null then
    v_end := v_sub.period_end;
    v_start := coalesce(v_sub.period_start, v_end - interval '30 days');
  else
    v_start := greatest(
      coalesce(p_paid_at, now()),
      coalesce(v_user.tariff_period_end, coalesce(p_paid_at, now()))
    );
    v_end := v_start + interval '30 days';

    update public.subscriptions
       set status = 'success',
           period_start = v_start,
           period_end = v_end
     where id = v_sub.id;
  end if;

  -- Do not let a delayed older webhook downgrade a newer active entitlement.
  if v_user.tariff_period_end is null or v_user.tariff_period_end <= v_end then
    update public.users
       set tariff_plan = v_sub.plan,
           tariff_period_end = v_end
     where id = v_user.id;
  end if;

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'plan', v_sub.plan,
    'period_start', v_start,
    'period_end', v_end,
    'email', v_user.email,
    'already_activated', (v_sub.status = 'success' and v_sub.period_end is not null)
  );
end;
$$;

revoke all on function public.activate_paid_subscription(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.activate_paid_subscription(uuid, timestamptz)
  to service_role;
