-- ============================================================================
-- PinPosy · 001_baseline.sql — ПОЛНАЯ БАЗОВАЯ СХЕМА (baseline), идемпотентная
-- ============================================================================
-- Фиксирует фактическое состояние схемы на момент хандоффа (сверено с живой
-- базой: information_schema / pg_constraint / pg_indexes / pg_policies).
-- Заменяет собой разрозненные 001_base_schema + 002…008: создаёт ВСЕ 10 таблиц
-- со всеми колонками, констрейнтами, индексами, RLS/политиками и функцией
-- adjust_credits_balance — так, как они выглядят в продакшн-базе СЕЙЧАС.
--
-- ИДЕМПОТЕНТНОСТЬ: можно запускать повторно в Supabase SQL Editor без ошибок.
--   * create table if not exists, create index if not exists;
--   * drop policy if exists перед каждым create policy;
--   * констрейнты добавляются через DO-блоки с проверкой pg_constraint.
--
-- ВАЖНЫЕ фактические типы (соответствие живой базе, см. docs/database.md):
--   * users.id — uuid; у projects.user_id — тоже uuid (FK на users.id);
--   * у auth_tokens / credit_transactions / subscriptions / credit_purchases /
--     pinterest_accounts / pinterest_publications колонка user_id — TEXT
--     (так пишет код бэкенда). FK на users.id на эти колонки вешает
--     миграция 009_hardening.sql (после конвертации типа в uuid).
--   * credit_transactions.amount — numeric (целое конвертирует 009);
--   * pins.credits_cost — numeric, pins.scheduled_date — date;
--   * created_at в users/projects/boards/pins/credit_transactions —
--     timestamp WITHOUT time zone (исторически), в остальных — timestamptz.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ТАБЛИЦЫ
-- ----------------------------------------------------------------------------

-- users — корневая таблица аккаунтов (свой JWT, не Supabase Auth)
create table if not exists public.users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  password_hash     text,
  credits_balance   integer default 0,
  subscription_tier text default 'free',          -- LEGACY: читается только через tariff_plan (см. 009 + backend/tariff.js)
  is_admin          boolean default false,
  name              text,
  surname           text,
  onboarded         boolean not null default false,
  tariff_plan       text not null default 'none', -- none | analytics | start | pro | agency
  email_verified    boolean not null default false,
  token_version     integer not null default 0 check (token_version >= 0),
  tariff_period_end timestamptz,
  created_at        timestamp without time zone default now()
);

-- projects — сайт/ниша пользователя; user_id — uuid, FK на users.id
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.users (id),
  website_url       text,
  niche             text,
  tone              text,
  goal              text,
  language          text,
  site_summary      text,
  analyzed_at       timestamp without time zone,
  created_at        timestamp without time zone default now()
);

-- boards — доски идей внутри проекта
create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects (id) on delete cascade,
  title       text,
  description text,
  status      text default 'new',
  cover_url   text,
  created_at  timestamp without time zone default now()
);

-- pins — сгенерированные пины
create table if not exists public.pins (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid references public.boards (id) on delete cascade,
  image_url      text,
  title          text,
  description    text,
  status         text default 'pending',
  model_used     text,
  credits_cost   numeric,
  scheduled_date date,
  aspect_ratio   text default '2:3',
  created_at     timestamp without time zone default now()
);

-- credit_transactions — журнал движения кредитов (user_id — TEXT, как пишет код)
create table if not exists public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     text,
  amount      numeric,
  type        text,
  description text,
  created_at  timestamp without time zone default now()
);

-- auth_tokens — одноразовые токены (сброс пароля, подтверждение email)
create table if not exists public.auth_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  token_hash text not null,
  purpose    text not null default 'password_reset',
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz default now()
);

-- subscriptions — подписки Prodamus
create table if not exists public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,
  plan                text not null,
  status              text not null default 'pending',
  provider_payment_id text,
  amount              numeric not null default 0,
  currency            text not null default 'rub',
  period_start        timestamptz,
  period_end          timestamptz,
  created_at          timestamptz not null default now()
);

-- credit_purchases — разовые покупки пакетов кредитов (Prodamus)
create table if not exists public.credit_purchases (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,
  package_id          text not null,
  pack_title          text,
  credits             integer not null,
  status              text not null default 'pending',
  provider_payment_id text,
  amount              numeric not null default 0,
  currency            text not null default 'rub',
  paid_at             timestamptz,
  balance_credited_at timestamptz,
  created_at          timestamptz not null default now()
);

-- pinterest_accounts — подключённые аккаунты Pinterest (одна строка на юзера)
create table if not exists public.pinterest_accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null,
  pinterest_user_id text,
  username         text,
  access_token     text not null,
  refresh_token    text,
  scopes           text,
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- pinterest_publications — журнал публикаций (защита от двойной публикации)
create table if not exists public.pinterest_publications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            text not null,
  pin_id             uuid not null,
  pinterest_pin_id   text not null,
  pinterest_board_id text not null,
  created_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. КОНСТРЕЙНТЫ (каждый — через DO-блок: не падает ни на пустой, ни на
--    живой базе, где констрейнт уже существует под тем же именем)
-- ----------------------------------------------------------------------------

-- users: уникальный email + допустимые тарифы
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'users_email_key'
                   and conrelid = 'public.users'::regclass) then
    alter table public.users add constraint users_email_key unique (email);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'users_tariff_plan_check'
                   and conrelid = 'public.users'::regclass) then
    alter table public.users add constraint users_tariff_plan_check
      check (tariff_plan in ('none', 'analytics', 'start', 'pro', 'agency'));
  end if;
end $$;

-- auth_tokens: уникальный хэш токена
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'auth_tokens_token_hash_key'
                   and conrelid = 'public.auth_tokens'::regclass) then
    alter table public.auth_tokens add constraint auth_tokens_token_hash_key unique (token_hash);
  end if;
end $$;

-- subscriptions: допустимые план/статус
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'subscriptions_plan_check'
                   and conrelid = 'public.subscriptions'::regclass) then
    alter table public.subscriptions add constraint subscriptions_plan_check
      check (plan in ('analytics', 'start', 'pro', 'agency'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'subscriptions_status_check'
                   and conrelid = 'public.subscriptions'::regclass) then
    alter table public.subscriptions add constraint subscriptions_status_check
      check (status in ('pending', 'success', 'canceled', 'denied', 'expired'));
  end if;
end $$;

-- credit_purchases: допустимые пакет/статус
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'credit_purchases_package_check'
                   and conrelid = 'public.credit_purchases'::regclass) then
    alter table public.credit_purchases add constraint credit_purchases_package_check
      check (package_id in ('pack_100', 'pack_500', 'pack_1000'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'credit_purchases_status_check'
                   and conrelid = 'public.credit_purchases'::regclass) then
    alter table public.credit_purchases add constraint credit_purchases_status_check
      check (status in ('pending', 'success', 'canceled', 'denied'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. ИНДЕКСЫ (полный набор из живой базы)
-- ----------------------------------------------------------------------------

-- users
create index if not exists idx_users_id_text       on public.users ((id::text));
create index if not exists idx_users_email_verified on public.users (email_verified);

-- projects
create index if not exists idx_projects_user_id on public.projects (user_id);

-- boards
create index if not exists idx_boards_project_id on public.boards (project_id);

-- pins
create index if not exists idx_pins_board_id on public.pins (board_id);

-- credit_transactions
create index if not exists idx_credit_transactions_user_id      on public.credit_transactions (user_id);
create index if not exists idx_credit_transactions_user_created on public.credit_transactions (user_id, created_at);

-- auth_tokens
create index if not exists idx_auth_tokens_hash         on public.auth_tokens (token_hash);
create index if not exists idx_auth_tokens_user         on public.auth_tokens (user_id);
create index if not exists idx_auth_tokens_user_purpose on public.auth_tokens (user_id, purpose);

-- subscriptions
create unique index if not exists uniq_subscriptions_provider_payment_id
  on public.subscriptions (provider_payment_id) where provider_payment_id is not null;
create index if not exists idx_subscriptions_user        on public.subscriptions (user_id, created_at desc);
create index if not exists idx_subscriptions_status      on public.subscriptions (status);
create index if not exists idx_subscriptions_period_end  on public.subscriptions (user_id, period_end desc);

-- credit_purchases
create unique index if not exists uniq_credit_purchases_provider_payment_id
  on public.credit_purchases (provider_payment_id) where provider_payment_id is not null;
create index if not exists idx_credit_purchases_user   on public.credit_purchases (user_id, created_at desc);
create index if not exists idx_credit_purchases_status on public.credit_purchases (status);

-- pinterest_accounts
create unique index if not exists uniq_pinterest_accounts_user on public.pinterest_accounts (user_id);

-- pinterest_publications
create unique index if not exists uniq_pinterest_publications_pin    on public.pinterest_publications (pin_id);
create unique index if not exists uniq_pinterest_publications_remote on public.pinterest_publications (pinterest_pin_id);
create index if not exists idx_pinterest_publications_user           on public.pinterest_publications (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 4. ФУНКЦИЯ adjust_credits_balance(p_user_id text, p_amount integer) -> integer
--    * атомарный UPDATE ... RETURNING по users.credits_balance;
--    * запрещает уход в минус (raise 'insufficient credits');
--    * SECURITY DEFINER, search_path зафиксирован, execute только у service_role;
--    * сравнение id::text = p_user_id — не падает на не-uuid входе.
-- ----------------------------------------------------------------------------
create or replace function public.adjust_credits_balance(p_user_id text, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.adjust_credits_balance(text, integer)
  from public, anon, authenticated;
grant execute on function public.adjust_credits_balance(text, integer)
  to service_role;

-- ----------------------------------------------------------------------------
-- 5. RLS: включён на всех 10 таблицах; политики «только своя строка».
--    PinPosy авторизует СВОИМ JWT, auth.uid() для реальных запросов всегда
--    NULL, поэтому политики блокируют anon/authenticated; весь доступ идёт
--    сервисным ключом (service_role, bypassrls). boards/pins не имеют user_id —
--    доступ через EXISTS-джойн по projects. Жёсткое ужесточение политики
--    users (только SELECT, запись — только service_role) — в 009_hardening.sql.
-- ----------------------------------------------------------------------------
alter table public.users                   enable row level security;
alter table public.projects                enable row level security;
alter table public.boards                  enable row level security;
alter table public.pins                    enable row level security;
alter table public.credit_transactions     enable row level security;
alter table public.auth_tokens             enable row level security;
alter table public.subscriptions           enable row level security;
alter table public.credit_purchases        enable row level security;
alter table public.pinterest_accounts      enable row level security;
alter table public.pinterest_publications  enable row level security;

-- users: своя строка по id
drop policy if exists users_own_row on public.users;
create policy users_own_row on public.users
  for all
  using (auth.uid()::text = id::text)
  with check (auth.uid()::text = id::text);

-- projects: своя строка по user_id
drop policy if exists projects_own_row on public.projects;
create policy projects_own_row on public.projects
  for all
  using (auth.uid()::text = user_id::text)
  with check (auth.uid()::text = user_id::text);

-- boards: своя строка через проект
drop policy if exists boards_own_row on public.boards;
create policy boards_own_row on public.boards
  for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = boards.project_id
        and p.user_id::text = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = boards.project_id
        and p.user_id::text = auth.uid()::text
    )
  );

-- pins: своя строка через доску и проект
drop policy if exists pins_own_row on public.pins;
create policy pins_own_row on public.pins
  for all
  using (
    exists (
      select 1
      from public.boards b
      join public.projects p on p.id = b.project_id
      where b.id = pins.board_id
        and p.user_id::text = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1
      from public.boards b
      join public.projects p on p.id = b.project_id
      where b.id = pins.board_id
        and p.user_id::text = auth.uid()::text
    )
  );

-- credit_transactions: своя строка по user_id
-- (user_id::text — работает и для исторического TEXT, и для uuid после 009)
drop policy if exists credit_transactions_own_row on public.credit_transactions;
create policy credit_transactions_own_row on public.credit_transactions
  for all
  using ((user_id)::text = auth.uid()::text)
  with check ((user_id)::text = auth.uid()::text);

-- subscriptions / credit_purchases / pinterest_* : только чтение своих строк
-- (запись всегда через сервисный ключ бэкенда; user_id::text — совместимо
-- и с TEXT, и с uuid после 009)
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using ((user_id)::text = auth.uid()::text);

drop policy if exists credit_purchases_select_own on public.credit_purchases;
create policy credit_purchases_select_own on public.credit_purchases
  for select using ((user_id)::text = auth.uid()::text);

drop policy if exists pinterest_accounts_select_own on public.pinterest_accounts;
create policy pinterest_accounts_select_own on public.pinterest_accounts
  for select using ((user_id)::text = auth.uid()::text);

drop policy if exists pinterest_publications_select_own on public.pinterest_publications;
create policy pinterest_publications_select_own on public.pinterest_publications
  for select using ((user_id)::text = auth.uid()::text);

-- auth_tokens: обслуживается только сервисным ключом, клиентских политик нет.

-- Прямой доступ anon/authenticated к базовым таблицам закрываем: сервис бьёт
-- сервисным ключом (bypassrls), реальные пользователи авторизуются своим JWT.
revoke all on public.users               from anon, authenticated;
revoke all on public.projects            from anon, authenticated;
revoke all on public.boards              from anon, authenticated;
revoke all on public.pins                from anon, authenticated;
revoke all on public.credit_transactions from anon, authenticated;
