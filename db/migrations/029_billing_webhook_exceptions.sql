-- 029_billing_webhook_exceptions.sql
-- Keep a minimal, durable reconciliation trail for signed but unmatched or
-- amount-mismatched Prodamus notifications. Do not persist customer PII/raw payloads.

create table if not exists public.billing_webhook_exceptions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'prodamus' check (provider = 'prodamus'),
  payment_kind text not null check (payment_kind in ('subscription','credits')),
  order_id text,
  payment_status text,
  received_sum text,
  expected_amount numeric(12,2),
  reason text not null,
  event_hash text not null unique check (event_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists billing_webhook_exceptions_created_idx
  on public.billing_webhook_exceptions(created_at desc);
create index if not exists billing_webhook_exceptions_order_idx
  on public.billing_webhook_exceptions(order_id);

alter table public.billing_webhook_exceptions enable row level security;
revoke all on public.billing_webhook_exceptions from public, anon, authenticated;
revoke all on public.billing_webhook_exceptions from service_role;
grant insert on public.billing_webhook_exceptions to service_role;
