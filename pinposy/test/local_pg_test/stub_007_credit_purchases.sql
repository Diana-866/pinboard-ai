-- Заглушка для теста: 007_credit_purchases.sql — таблица покупок кредитов.
create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  order_id text not null unique,
  pack_id text not null,
  credits integer not null,
  amount integer,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.credit_purchases enable row level security;
