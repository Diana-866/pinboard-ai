-- ============================================================================
-- PinPosy · 009_hardening.sql — укрепление схемы после базовой (идемпотентный)
-- ============================================================================
-- Запускать ПОСЛЕ 001_baseline.sql. Можно запускать повторно — без ошибок.
--
-- Что делает:
--   1. Политика users_own_row: убран FOR ALL → только SELECT своей строки.
--      Запись в users — только через сервисный ключ бэкенда (service_role
--      обходит RLS), клиент больше не может менять свою строку.
--   2. FK на users(id) ON DELETE CASCADE для всех таблиц с user_id TEXT
--      (auth_tokens, credit_transactions, subscriptions, credit_purchases,
--      pinterest_accounts, pinterest_publications). projects.user_id уже uuid —
--      его существующий FK пересоздаётся с ON DELETE CASCADE.
--   3. Триггер set_updated_at: pinterest_accounts.updated_at обновляется
--      автоматически при каждом UPDATE.
--   4. CHECK на boards.status и pins.status — список расширяется автоматически,
--      если в данных есть значения вне базового перечня (данные не ломаются).
--   5. Индексы idx_pins_scheduled (scheduled_date, status) и idx_pins_status.
--   6. credit_transactions.amount: numeric → integer (после проверки, что нет
--      дробных значений; если есть — колонка НЕ меняется, см. лог в notices).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. users: SELECT-only политика вместо FOR ALL
-- ----------------------------------------------------------------------------
drop policy if exists users_own_row on public.users;
create policy users_own_row on public.users
  for select
  using (auth.uid()::text = id::text);
-- INSERT/UPDATE/DELETE из-под anon/authenticated отныне запрещены политиками
-- (права таблицы у anon/authenticated и так отозваны в 001; запись — только
-- сервисным ключом бэкенда, который RLS обходит).

-- ----------------------------------------------------------------------------
-- 2. FK на users(id) ON DELETE CASCADE
--    user_id у шести таблиц — TEXT, users.id — uuid. Приводим user_id к uuid:
--    пустые строки/мусор → NULL (FK такие строки пропустит), строки с
--    несуществующим пользователем (orphans) удаляются ДО навешивания FK.
--    Результат идемпотентен: при повторном запуске констрейнт уже существует.
-- ----------------------------------------------------------------------------

-- 2a-pre. Политики, ссылающиеся на user_id, снимаются ПЕРЕД конвертацией
-- типа (PostgreSQL запрещает ALTER TYPE колонки, использованной в политике)
-- и пересоздаются в шаге 2e после конвертации.
drop policy if exists credit_transactions_own_row on public.credit_transactions;
drop policy if exists subscriptions_select_own on public.subscriptions;
drop policy if exists credit_purchases_select_own on public.credit_purchases;
drop policy if exists pinterest_accounts_select_own on public.pinterest_accounts;
drop policy if exists pinterest_publications_select_own on public.pinterest_publications;

-- 2a. Чистка неконвертируемых и осиротевших user_id.
--     * НЕ-uuid значения ('', мусор): в таблицах, где user_id nullable
--       (credit_transactions), → NULL; где NOT NULL (auth_tokens,
--       subscriptions, credit_purchases, pinterest_accounts,
--       pinterest_publications) — такие строки удаляются (иначе ALTER TYPE
--       упадёт). Перед каждым удалением печатается count в notice.
--     * Осиротевшие uuid (нет такого users.id) — удаляются до навешивания FK.
--     Идемпотентно: при повторном запуске удалять уже нечего.
do $$
declare
  t        text;
  n        bigint;
  nullable boolean;
begin
  foreach t in array array['auth_tokens', 'credit_transactions', 'subscriptions',
                           'credit_purchases', 'pinterest_accounts', 'pinterest_publications']
  loop
    -- Таблица уже сконвертирована (повторный запуск 009) — чистить нечего
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t
                     and column_name = 'user_id' and data_type = 'text') then
      continue;
    end if;

    select (is_nullable = 'YES') into nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = t and column_name = 'user_id';

    -- 1) не-uuid строки
    execute format($f$
      select count(*) from public.%I
      where user_id is not null
        and user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    $f$, t) into n;
    if n > 0 then
      if nullable then
        raise notice '009: таблица %: обнуляется % строк с некорректным (не-uuid) user_id', t, n;
        execute format($f$
          update public.%I set user_id = null
          where user_id is not null
            and user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        $f$, t);
      else
        raise notice '009: таблица %: удаляется % строк с некорректным (не-uuid) user_id (колонка NOT NULL)', t, n;
        execute format($f$
          delete from public.%I
          where user_id is not null
            and user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        $f$, t);
      end if;
    end if;

    -- 2) осиротевшие uuid
    execute format($f$
      select count(*) from public.%I d
      where d.user_id is not null
        and not exists (select 1 from public.users u where u.id = d.user_id::uuid)
    $f$, t) into n;
    if n > 0 then
      raise notice '009: таблица %: удаляется % осиротевших строк (user_id не найден в users)', t, n;
      execute format($f$
        delete from public.%I d
        where d.user_id is not null
          and not exists (select 1 from public.users u where u.id = d.user_id::uuid)
      $f$, t);
    end if;
  end loop;
end $$;

-- 2b. Конвертация user_id text → uuid + FK (один DO-блок на таблицу)
do $$
begin
  -- auth_tokens
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='auth_tokens'
               and column_name='user_id' and data_type='text') then
    alter table public.auth_tokens
      alter column user_id set data type uuid
      using (user_id::uuid);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'auth_tokens_user_id_fkey'
                   and conrelid = 'public.auth_tokens'::regclass) then
    alter table public.auth_tokens
      add constraint auth_tokens_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  -- credit_transactions
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='credit_transactions'
               and column_name='user_id' and data_type='text') then
    alter table public.credit_transactions
      alter column user_id set data type uuid
      using (user_id::uuid);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'credit_transactions_user_id_fkey'
                   and conrelid = 'public.credit_transactions'::regclass) then
    alter table public.credit_transactions
      add constraint credit_transactions_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  -- subscriptions
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='subscriptions'
               and column_name='user_id' and data_type='text') then
    alter table public.subscriptions
      alter column user_id set data type uuid
      using (user_id::uuid);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'subscriptions_user_id_fkey'
                   and conrelid = 'public.subscriptions'::regclass) then
    alter table public.subscriptions
      add constraint subscriptions_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  -- credit_purchases
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='credit_purchases'
               and column_name='user_id' and data_type='text') then
    alter table public.credit_purchases
      alter column user_id set data type uuid
      using (user_id::uuid);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'credit_purchases_user_id_fkey'
                   and conrelid = 'public.credit_purchases'::regclass) then
    alter table public.credit_purchases
      add constraint credit_purchases_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  -- pinterest_accounts
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='pinterest_accounts'
               and column_name='user_id' and data_type='text') then
    alter table public.pinterest_accounts
      alter column user_id set data type uuid
      using (user_id::uuid);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'pinterest_accounts_user_id_fkey'
                   and conrelid = 'public.pinterest_accounts'::regclass) then
    alter table public.pinterest_accounts
      add constraint pinterest_accounts_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

do $$
begin
  -- pinterest_publications
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='pinterest_publications'
               and column_name='user_id' and data_type='text') then
    alter table public.pinterest_publications
      alter column user_id set data type uuid
      using (user_id::uuid);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'pinterest_publications_user_id_fkey'
                   and conrelid = 'public.pinterest_publications'::regclass) then
    alter table public.pinterest_publications
      add constraint pinterest_publications_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

-- 2c. projects.user_id уже uuid с FK (без cascade) — пересоздаём с CASCADE
do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'projects_user_id_fkey'
               and conrelid = 'public.projects'::regclass
               and pg_get_constraintdef(oid) not like '%on delete cascade%') then
    alter table public.projects drop constraint projects_user_id_fkey;
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'projects_user_id_fkey'
                   and conrelid = 'public.projects'::regclass) then
    alter table public.projects
      add constraint projects_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

-- 2c-2. pinterest_publications.pin_id → pins(id) ON DELETE CASCADE:
--       журнал публикаций ссылается на пин, но FK до сих пор не было —
--       удалённый пин оставлял висячие строки в журнале.
--       Осиротевшие pin_id удаляются до навешивания (идемпотентно).
do $$
declare
  n bigint;
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='pinterest_publications'
               and column_name='pin_id' and data_type<>'uuid') then
    raise notice '009: pinterest_publications.pin_id имеет неожиданный тип — FK не навешан, проверьте вручную';
  else
    select count(*) into n
    from public.pinterest_publications d
    where not exists (select 1 from public.pins p where p.id = d.pin_id);
    if n > 0 then
      raise notice '009: pinterest_publications: удаляется % строк с несуществующим pin_id', n;
      delete from public.pinterest_publications d
      where not exists (select 1 from public.pins p where p.id = d.pin_id);
    end if;
    if not exists (select 1 from pg_constraint
                   where conname = 'pinterest_publications_pin_id_fkey'
                     and conrelid = 'public.pinterest_publications'::regclass) then
      alter table public.pinterest_publications
        add constraint pinterest_publications_pin_id_fkey
        foreign key (pin_id) references public.pins(id) on delete cascade;
    end if;
  end if;
end $$;

-- 2e. Пересоздание политик, снятых в шаге 2a-pre (теперь user_id — uuid;
-- приведение ::text делает политику совместимой с обоими вариантами типа)
drop policy if exists credit_transactions_own_row on public.credit_transactions;
create policy credit_transactions_own_row on public.credit_transactions
  for all
  using ((user_id)::text = auth.uid()::text)
  with check ((user_id)::text = auth.uid()::text);

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

-- 2d. Служебные индексы под новые uuid-типы user_id (идемпотентно).
--     Старые текстовые индексы user_id снимаются (после cast они не нужны
--     и оставались бы от типов, которых больше нет).
drop index if exists public.idx_auth_tokens_user;
drop index if exists public.idx_credit_transactions_user_id;
create index if not exists idx_auth_tokens_user_uuid         on public.auth_tokens (user_id);
create index if not exists idx_credit_transactions_user_uuid on public.credit_transactions (user_id);

-- ----------------------------------------------------------------------------
-- 3. Триггер updated_at для pinterest_accounts
-- ----------------------------------------------------------------------------
create or replace function public.set_pinterest_accounts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pinterest_accounts_updated_at on public.pinterest_accounts;
create trigger trg_pinterest_accounts_updated_at
  before update on public.pinterest_accounts
  for each row
  execute function public.set_pinterest_accounts_updated_at();

-- ----------------------------------------------------------------------------
-- 4. CHECK на boards.status и pins.status
--    ПЕРЕД созданием проверяем фактические значения: список автоматически
--    расширяется на всё, что реально есть в данных (данные не ломаются).
-- ----------------------------------------------------------------------------
do $$
declare
  boards_list  text[] := array['new', 'in_progress', 'done'];
  pins_list    text[] := array['pending', 'approved', 'rejected', 'scheduled', 'published'];
  v            text;
begin  -- boards: что реально есть в базе, кроме базового списка
  for v in
    select distinct status from public.boards
    where status is not null
      and status not in ('new', 'in_progress', 'done')
  loop
    boards_list := boards_list || v;
  end loop;
  raise notice '009: boards.status список CHECK: %', boards_list;

  if not exists (select 1 from pg_constraint
                 where conname = 'boards_status_check'
                   and conrelid = 'public.boards'::regclass) then
    execute format(
      'alter table public.boards add constraint boards_status_check
         check (status in (%s))',
      (select string_agg(quote_literal(x), ', ') from unnest(boards_list) x)
    );
  end if;

  -- pins: что реально есть в базе, кроме базового списка
  for v in
    select distinct status from public.pins
    where status is not null
      and status not in ('pending', 'approved', 'rejected', 'scheduled', 'published')
  loop
    pins_list := pins_list || v;
  end loop;
  raise notice '009: pins.status список CHECK: %', pins_list;

  if not exists (select 1 from pg_constraint
                 where conname = 'pins_status_check'
                   and conrelid = 'public.pins'::regclass) then
    execute format(
      'alter table public.pins add constraint pins_status_check
         check (status in (%s))',
      (select string_agg(quote_literal(x), ', ') from unnest(pins_list) x)
    );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Индексы планирования пинов
-- ----------------------------------------------------------------------------
create index if not exists idx_pins_scheduled on public.pins (scheduled_date, status);
create index if not exists idx_pins_status    on public.pins (status);

-- ----------------------------------------------------------------------------
-- 6. credit_transactions.amount: numeric → integer (только если нет дробных)
-- ----------------------------------------------------------------------------
do $$
declare
  n_frac bigint;
begin
  select count(*) into n_frac
  from public.credit_transactions
  where amount is not null and amount <> round(amount);

  if n_frac > 0 then
    raise notice '009: credit_transactions.amount НЕ конвертирован в integer: найдено % дробных значений. Требуется ручное решение.', n_frac;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'credit_transactions'
      and column_name = 'amount'
      and data_type = 'numeric'
  ) then
    alter table public.credit_transactions
      alter column amount set data type integer
      using (round(amount)::integer);
    raise notice '009: credit_transactions.amount конвертирован в integer (дробных значений не было).';
  else
    raise notice '009: credit_transactions.amount уже integer — пропущено.';
  end if;
end $$;
