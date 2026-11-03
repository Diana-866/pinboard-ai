-- ============================================================================
-- PinPosy · 001_base_schema.sql
-- Базовая схема: users, projects, boards, pins, credit_transactions
-- + функция adjust_credits_balance(p_user_id text, p_amount integer)
--
-- ИДЕМПОТЕНТНЫЙ: можно запускать повторно в Supabase SQL Editor как есть.
-- Порядок применения: 000_check → 001 → 002 → … → 008 (см. docs/database.md)
--
-- ВАЖНО (осознанные решения, подробно в docs/database.md, раздел «Решения»):
--  1. Колонки users.name / users.surname НЕ создаются здесь — их добавляет
--     003_users_profile.sql; onboarded и tariff_plan — 004_onboarding.sql;
--     email_verified — 005_email_verified.sql; tariff_period_end —
--     006_subscriptions.sql (все — «add column if not exists», конфликтов нет).
--  2. subscription_tier НЕ добавляет ни одна миграция 002–008, но код её
--     читает (backend/admin.js, backend/index.js) — поэтому она создаётся здесь.
--  3. projects содержит goal, language, site_summary, analyzed_at — их пишет
--     backend/index.js (онбординг, POST /projects, POST /projects/:id/analyze),
--     и их тоже НЕТ в миграциях 002–008. boards.status ('new') — аналогично.
--  4. credit_transactions.user_id — TEXT (так пишет код: backend/credits.js
--     вставляет text и вызывает rpc с p_user_id text), поэтому на него НЕ
--     вешается FK на users.id (uuid). Целостность обеспечивает приложение.
--  5. У типов credit_transactions.type / pins.status / boards.status НЕТ
--     CHECK-ограничений: код пишет значения за пределами любого перечня
--     (например pins.status: pending|approved|rejected) — CHECK сломал бы их.
--  6. RLS включён на всех таблицах с политикой «только своя строка» по
--     auth.uid()::text = user_id. PinPosy авторизует СВОИМ JWT, а не Supabase
--     Auth, поэтому auth.uid() для реальных запросов всегда NULL и эти
--     политики блокируют anon/authenticated; весь доступ идёт сервисным
--     ключом (service_role, bypassrls), который RLS обходит. Прямой доступ
--     anon/authenticated к таблицам дополнительно отозван (revoke).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id                uuid primary key default gen_random_uuid(),
  email             text unique not null,
  password_hash     text,
  credits_balance   integer not null default 0,
  subscription_tier text,
  is_admin          boolean not null default false,
  created_at        timestamptz not null default now()
  -- НЕ создаются здесь (добавляют более поздние миграции, все идемпотентны):
  --   name, surname    -> 003_users_profile.sql
  --   onboarded,
  --   tariff_plan      -> 004_onboarding.sql (default 'none', + CHECK-констрейнт)
  --   email_verified   -> 005_email_verified.sql (default false)
  --   tariff_period_end -> 006_subscriptions.sql
);

-- projects
-- goal/language/site_summary/analyzed_at пишет бэкенд (index.js):
--   goal, language  — POST /projects и онбординг;
--   site_summary, analyzed_at — POST /projects/:id/analyze.
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  website_url  text,
  niche        text,
  tone         text,
  goal         text,
  language     text,
  site_summary text,
  analyzed_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- boards
-- status пишет бэкенд при генерации идей (index.js: status: 'new').
create table if not exists public.boards (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text,
  description text,
  status      text,
  created_at  timestamptz not null default now()
);

-- pins
-- Точный набор колонок из backend/pins.js (insert) и index.js (update/select).
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
-- колонки, менять схему существующих полей запрещено (правило №3).
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
--  * сравнение id::text = p_user_id (а не cast p_user_id::uuid): код передаёт
--    uuid в виде text; текстовое сравнение не падает на не-uuid входе
--    (например при опечатке/старом id) и опирается на выражение-индекс выше.
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
-- RLS: включить на всех таблицах, политики «только своя строка».
-- Всё re-runnable: drop policy if exists перед созданием (у create policy
-- нет if not exists).
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
