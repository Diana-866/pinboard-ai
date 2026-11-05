-- 030_transactional_email_outbox.sql
-- Subscription activation and notification enqueue commit in one transaction.
-- SMTP delivery remains at-least-once: a crash after SMTP acceptance but before
-- mark_email_outbox_sent may result in a duplicate with the same Message-ID.

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  recipient_email text not null,
  locale text not null default 'en',
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  locked_until timestamptz,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'sending' and claim_token is not null and locked_until is not null)
    or status <> 'sending'
  )
);

create index if not exists email_outbox_pending_idx
  on public.email_outbox (next_attempt_at, created_at)
  where status in ('pending', 'sending');

alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public, anon, authenticated, service_role;
grant select, insert, update on public.email_outbox to service_role;

create or replace function public.claim_email_outbox(p_limit integer default 10)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.email_outbox
     set status = 'dead',
         claim_token = null,
         locked_until = null,
         last_error_code = coalesce(last_error_code, 'attempts_exhausted'),
         updated_at = now()
   where status = 'sending'
     and locked_until < now()
     and attempts >= max_attempts;

  return query
  with candidates as (
    select id
      from public.email_outbox
     where attempts < max_attempts
       and (
         (status = 'pending' and next_attempt_at <= now())
         or (status = 'sending' and locked_until < now())
       )
     order by next_attempt_at, created_at
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.email_outbox as outbox
     set status = 'sending',
         attempts = outbox.attempts + 1,
         claim_token = gen_random_uuid(),
         locked_until = now() + interval '2 minutes',
         updated_at = now()
    from candidates
   where outbox.id = candidates.id
  returning outbox.*;
end;
$$;

create or replace function public.mark_email_outbox_sent(
  p_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.email_outbox
     set status = 'sent',
         sent_at = now(),
         claim_token = null,
         locked_until = null,
         last_error_code = null,
         updated_at = now()
   where id = p_id
     and status = 'sending'
     and claim_token = p_claim_token;
  return found;
end;
$$;

create or replace function public.retry_email_outbox(
  p_id uuid,
  p_claim_token uuid,
  p_error_code text default 'smtp_error'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempts integer;
  v_max_attempts integer;
begin
  select attempts, max_attempts
    into v_attempts, v_max_attempts
    from public.email_outbox
   where id = p_id
     and status = 'sending'
     and claim_token = p_claim_token
   for update;

  if not found then return false; end if;

  update public.email_outbox
     set status = case when v_attempts >= v_max_attempts then 'dead' else 'pending' end,
         next_attempt_at = now() + make_interval(secs =>
           least(3600, (30 * power(2, greatest(v_attempts - 1, 0)))::integer)
         ),
         claim_token = null,
         locked_until = null,
         last_error_code = left(coalesce(nullif(p_error_code, ''), 'smtp_error'), 80),
         updated_at = now()
   where id = p_id;

  return true;
end;
$$;

revoke all on function public.claim_email_outbox(integer) from public, anon, authenticated;
revoke all on function public.mark_email_outbox_sent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.retry_email_outbox(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_email_outbox(integer) to service_role;
grant execute on function public.mark_email_outbox_sent(uuid, uuid) to service_role;
grant execute on function public.retry_email_outbox(uuid, uuid, text) to service_role;

-- Replace activation with an atomic version that also inserts the email event.
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
  v_already_activated boolean;
  v_latest_success_created_at timestamptz;
  v_latest_success_id uuid;
  v_effective_plan text;
  v_plan_applied boolean := false;
begin
  select * into v_sub
    from public.subscriptions
   where id = p_subscription_id
   for update;

  if not found then raise exception 'subscription not found'; end if;

  select * into v_user
    from public.users
   where id::text = v_sub.user_id::text
   for update;

  if not found then raise exception 'subscription user not found'; end if;

  if v_sub.status not in ('pending', 'denied', 'canceled', 'success') then
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
       where id = v_user.id;
      v_plan_applied := true;
    else
      update public.users
         set tariff_period_end = v_end
       where id = v_user.id;
    end if;
  end if;

  if not v_already_activated and v_user.email is not null and btrim(v_user.email) <> '' then
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

  select tariff_plan into v_effective_plan from public.users where id = v_user.id;

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
