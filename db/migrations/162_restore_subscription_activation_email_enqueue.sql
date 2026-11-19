-- Restore the atomic "subscription activated" email enqueue.
--
-- Migration 030 put the notification insert inside activate_paid_subscription so a
-- paid activation and its email could never diverge. Migration 157 re-created that
-- function with the user-first lock order but without the insert, so from 157
-- onwards a paying customer's activation queued no email at all: nothing else in
-- the system enqueues this template (the backend only claims and sends), and
-- email_outbox stayed empty while claim_email_outbox kept returning nothing.
--
-- This migration re-creates the function as 157 defined it and puts the enqueue
-- back, unchanged in contract: same event_key, same payload keys, idempotent via
-- on conflict (event_key) do nothing, and only on the first activation.

begin;

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
  v_user_id text;
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
  -- Resolve the owner without taking a subscription lock. Match deletion's
  -- user-first order before locking the payment row.
  select user_id into v_user_id
    from public.subscriptions
   where id = p_subscription_id;

  if not found then
    raise exception 'subscription not found';
  end if;

  select * into v_user
    from public.users
   where id::text = v_user_id
   for update;

  if not found then
    raise exception 'subscription user not found';
  end if;

  select * into v_sub
    from public.subscriptions
   where id = p_subscription_id
   for update;

  if not found then
    raise exception 'subscription not found';
  end if;
  if v_sub.user_id is distinct from v_user.id::text then
    raise exception 'subscription owner changed during activation';
  end if;

  if v_user.account_status is distinct from 'active' then
    raise exception 'subscription user is not active';
  end if;

  if v_sub.status not in ('pending', 'denied', 'canceled', 'success') then
    raise exception 'subscription is not eligible for activation (status=%)', v_sub.status;
  end if;

  v_already_activated := (v_sub.status = 'success' and v_sub.period_end is not null);

  -- Compare against all other successful orders, not only the one whose
  -- period_end currently matches the user row. A late older webhook may itself
  -- extend tariff_period_end, so matching by period_end would lose chronology.
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

  -- Every valid late payment still adds its 30 days to the end of the
  -- entitlement. Only the newest-created paid order changes the current plan.
  if v_user.tariff_period_end is null or v_user.tariff_period_end <= v_end then
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
      v_plan_applied := true;
    else
      update public.users
         set tariff_period_end = v_end
       where id = v_user.id
         and account_status = 'active';
    end if;
  end if;

  select tariff_plan into v_effective_plan
    from public.users where id = v_user.id;

  -- The confirmation email is part of the activation, not a follow-up call: it is
  -- enqueued in the same transaction, exactly once per subscription, and only
  -- when an address exists. A repeated webhook for an already activated
  -- subscription must not send a second email.
  if not v_already_activated and v_user.email is not null and btrim(v_user.email) <> '' then
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

  return jsonb_build_object(
    'subscription_id', v_sub.id,
    'plan', v_sub.plan,
    'current_plan', v_effective_plan,
    'plan_applied', v_plan_applied,
    'period_start', v_start,
    'period_end', v_end,
    'email', v_user.email,
    'already_activated', v_already_activated
  );
end;
$$;

revoke all on function public.activate_paid_subscription(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.activate_paid_subscription(uuid, timestamptz)
  to service_role;

comment on function public.activate_paid_subscription(uuid, timestamptz) is
  'Activates a paid subscription, extends the entitlement and atomically enqueues the activation email exactly once.';

commit;
