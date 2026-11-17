-- CI upgrade-compatibility fixture. Cluster roles are provisioned by verify-integration.ps1.
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text,
  email_verified boolean not null default false,
  credits_balance integer not null default 0,
  tariff_plan text not null default 'none',
  is_admin boolean default false,
  tariff_period_end timestamptz
);
create table public.auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  token_hash text not null unique,
  purpose text not null default 'password_reset',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  niche text,
  tone text,
  language text
);
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  title text,
  description text,
  status text,
  cover_url text
);
create table public.pins (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id),
  image_url text,
  title text,
  description text,
  status text default 'pending',
  model_used text,
  credits_cost numeric,
  scheduled_date date,
  aspect_ratio text default '2:3',
  created_at timestamp without time zone default now()
);
create table public.pinterest_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  pinterest_user_id text,
  username text,
  access_token text not null,
  refresh_token text,
  scopes text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uniq_pinterest_accounts_user on public.pinterest_accounts(user_id);
create table public.pinterest_publications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  pin_id uuid not null,
  pinterest_pin_id text not null,
  pinterest_board_id text not null,
  created_at timestamptz not null default now()
);
create unique index uniq_pinterest_publications_pin on public.pinterest_publications(pin_id);
create unique index uniq_pinterest_publications_remote on public.pinterest_publications(pinterest_pin_id);
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  amount numeric,
  type text,
  description text,
  created_at timestamptz default now()
);
create table public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  package_id text not null,
  pack_title text,
  credits integer not null,
  status text not null default 'pending',
  provider_payment_id text,
  amount numeric not null default 0,
  currency text not null default 'rub',
  paid_at timestamptz,
  balance_credited_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  plan text not null,
  status text not null default 'pending',
  provider_payment_id text,
  amount numeric not null default 0,
  currency text not null default 'rub',
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);
-- Minimal baseline helper fixture: migration 041 hardens its function config.
create or replace function public.adjust_credits_balance(p_user_id text, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $fixture$
declare
  v_new_balance integer;
begin
  if p_user_id is null or p_amount is null then
    raise exception 'p_user_id and p_amount are required';
  end if;
  update public.users
     set credits_balance = credits_balance + p_amount
   where id::text = p_user_id
     and (p_amount >= 0 or credits_balance + p_amount >= 0)
   returning credits_balance into v_new_balance;
  if not found then
    if exists (select 1 from public.users where id::text = p_user_id) then
      raise exception 'insufficient credits';
    end if;
    raise exception 'user not found: %', p_user_id;
  end if;
  return v_new_balance;
end;
$fixture$;
revoke all on function public.adjust_credits_balance(text, integer)
  from public, anon, authenticated;
grant execute on function public.adjust_credits_balance(text, integer)
  to service_role;
