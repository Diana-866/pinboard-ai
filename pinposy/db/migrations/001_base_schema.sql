-- ============================================================================
-- PinPosy · 001_base_schema.sql
-- Базовая схема: users, projects, boards, pins, credit_transactions
-- + функция adjust_credits_balance(p_user_id text, p_amount integer)
--
-- ИДЕМПОТЕНТНЫЙ: можно запускать повторно в Supabase SQL Editor как есть.
-- Порядок применения: 000_check → 001 → 002 → ... → 008 (см. docs/database.md)
--
-- ВАЖНО (осознанные решения, см. docs/database.md, раздел «Решения»):
--  1. Колонки users.name / users.surname НЕ создаются здесь — их добавляет
--     003_users_profile.sql. onboarded — 004_onboarding.sql,
--     email_verified — 005_email_verified.sql (по правилу №3 из ТЗ,
--     чтобы повторный запуск цепочки не конфликтовал).
--  2. credit_transactions.user_id — TEXT (так пишет код: backend/credits.js
--     вставляет text и вызывает rpc с p_user_id text), поэтому на него НЕ
--     вешается FK на users.id (uuid). Целостность обеспечивает приложение.
--  3. У типа credit_transactions.type НЕТ CHECK-ограничения: код и миграция
--     007_credit_purchases могут писать значения за пределами перечисленных
--     в ТЗ (generation | topup | refund | admin) — CHECK сломал бы их.
--  4. RLS включён на всех таблицах с политикой «только своя строка» по
--     auth.uid()::text = user_id. В PinPosy авторизация — собственный JWT,
--     а НЕ Supabase Auth, поэтому auth.uid() для реальных запросов всегда
--     NULL и эти политики фактически блокируют anon/authenticated; весь
--     доступ идёт сервисным ключом (service_role), который RLS обходит.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  email          text unique not null,
  password_hash  text,
  credits_balance integer not null default 0,
  tariff_plan     text not null default 'none',
  tariff_period_end timestamptz,
  subscription_tier text,
  is_admin       boolean not null default false,
  created_at     timestamptz not null default now()
  -- НЕ создаются здесь (добавляют более поздние миграции):
  --   name, surname          -> 003_users_profile.sql
  --   onboarded              -> 004_onboarding.sql
  --   email_verified         -> 005_email_verified.sql
);

-- projects
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  website_url text,
  niche       text,
  tone        text,
  created_at  timestamptz not null default now()
);

-- boards
create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text,
  description text,
  created_at  timestamptz not null default now()
);

-- pins
create table if not exists public.pins (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.boards(id) on delete cascade,
  image_url    text,
  title        text,
  description  text,
  status       text,
  model_used   text,
  aspect_ratio text,
  credits_cost integer,
  created_at   timestamptz not null default now()
);

-- credit_transactions
-- user_id — TEXT намеренно: код (backend/credits.js) пишет сюда text и не
-- делает join по FK. FK на users.id (uuid) невозможен без изменения типа
-- колонки, менять схему существующих полей запрещено ТЗ (правило №3).
create table if not exists public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  amount      integer not null,
  type        text not null,
  description text,
  created_at  timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- Индексы
-- ----------------------------------------------------------------------------
create index if not exists idx_projects_user_id        on public.projects (user_id);
create index if not exists idx_boards_project_id       on public.boards (project_id);
create index if not exists idx_pins_board_id           on public.pins (board_id);
create index if not exists idx_credit_transactions_user_id      on public.credit_transactions (user_id);
create index if not exists idx_credit_transactions_user_created on public.credit_transactions (user_id, created_at);
-- RPC ищет по id::text = p_user_id — выражение-индекс, чтобы не сканировать таблицу:
create index if not exists idx_users_id_text           on public.users ((id::text));

-- ----------------------------------------------------------------------------
-- Функция adjust_credits_balance(p_user_id text, p_amount integer) -> integer
--  * атомарно, одним UPDATE ... RETURNING, меняет users.credits_balance
--  * запрещает уход в минус: при отрицательном p_amount и нехватке баланса —
--    raise exception 'insufficient credits' (UPDATE откатывается вместе со
--    всей транзакцией, т.к. исключение не перехватывается внутри функции)
--  * security definer, search_path зафиксирован
--  * execute только у service_role
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
  if p_amount is null then
    raise exception 'p_amount is required';
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
-- RLS: включить на всех таблицах, политики «только своя строка».
-- Всё re-runnable: drop policy if exists перед созданием.
-- boards/pins не имеют user_id — доступ через EXISTS-джойн по projects.
-- ----------------------------------------------------------------------------
alter table public.users                enable row level security;
alter table public.projects             enable row level security;
alter table public.boards               enable row level security;
alter table public.pins                 enable row level security;
alter table public.credit_transactions  enable row level security;

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
drop policy if exists credit_transactions_own_row on public.credit_transactions;
create policy credit_transactions_own_row on public.credit_transactions
  for all
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- Прямой доступ anon/authenticated к таблицам закрываем: сервис бьёт
-- сервисным ключом (bypassrls), реальные пользователи авторизуются своим JWT.
revoke all on public.users               from anon, authenticated;
revoke all on public.projects            from anon, authenticated;
revoke all on public.boards              from anon, authenticated;
revoke all on public.pins                from anon, authenticated;
revoke all on public.credit_transactions from anon, authenticated;
