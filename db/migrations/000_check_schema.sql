-- ============================================================================
-- PinPosy · 000_check_schema.sql — ДИАГНОСТИКА, НИЧЕГО НЕ МЕНЯЕТ
-- Запускать в Supabase SQL Editor на рабочей базе можно в ЛЮБОЙ момент:
-- до применения миграций (что есть / чего не хватает) и после (что появилось).
-- Только select-ы к системным каталогам. Возвращает 4 набора строк.
-- ============================================================================

-- 1. Какие таблицы схемы public реально есть
--    Ожидаем: users, projects, boards, pins, credit_transactions (001),
--    auth_tokens (002), subscriptions (006), credit_purchases (007),
--    pinterest_accounts, pinterest_publications (008).
select tablename as table_name
from pg_tables
where schemaname = 'public'
order by tablename;

-- 2. Какие колонки есть у ключевых таблиц кода
--    Сверяй с колонками ниже (это фактические ожидания backend-кода):
--      users:                id, email, password_hash, credits_balance,
--                            subscription_tier, is_admin, created_at,
--                            name, surname (003), onboarded, tariff_plan (004),
--                            email_verified (005), tariff_period_end (006)
--      projects:             id, user_id, website_url, niche, tone, goal,
--                            language, site_summary, analyzed_at, created_at
--      boards:               id, project_id, title, description, status, created_at
--      pins:                 id, board_id, image_url, title, description,
--                            status, model_used, aspect_ratio, credits_cost, created_at
--      credit_transactions:  id, user_id (text!), amount, type, description, created_at
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('users', 'projects', 'boards', 'pins', 'credit_transactions')
order by table_name, ordinal_position;

-- 3. Функция adjust_credits_balance: существует ли и с какой сигнатурой.
--    Ожидается ОДНА строка: adjust_credits_balance | text, integer.
select proname, pg_get_function_arguments(oid) as arguments
from pg_proc
where proname = 'adjust_credits_balance'
  and pronamespace = 'public'::regnamespace;

-- 4. Сводка «чего не хватает по ожиданиям кода».
--    Каждая строка = отсутствующий объект. Пустой результат = всё на месте.
with expected_tables(table_name) as (
  values ('users'), ('projects'), ('boards'), ('pins'), ('credit_transactions'),
         ('auth_tokens'), ('subscriptions'), ('credit_purchases'),
         ('pinterest_accounts'), ('pinterest_publications')
),
expected_columns(table_name, column_name) as (
  values
    ('users', 'id'), ('users', 'email'), ('users', 'password_hash'),
    ('users', 'credits_balance'), ('users', 'subscription_tier'), ('users', 'is_admin'),
    ('users', 'name'), ('users', 'surname'), ('users', 'onboarded'),
    ('users', 'tariff_plan'), ('users', 'tariff_period_end'), ('users', 'email_verified'),
    ('projects', 'id'), ('projects', 'user_id'), ('projects', 'website_url'),
    ('projects', 'niche'), ('projects', 'tone'), ('projects', 'goal'),
    ('projects', 'language'), ('projects', 'site_summary'), ('projects', 'analyzed_at'),
    ('boards', 'id'), ('boards', 'project_id'), ('boards', 'title'),
    ('boards', 'description'), ('boards', 'status'),
    ('pins', 'id'), ('pins', 'board_id'), ('pins', 'image_url'), ('pins', 'title'),
    ('pins', 'description'), ('pins', 'status'), ('pins', 'model_used'),
    ('pins', 'aspect_ratio'), ('pins', 'credits_cost'),
    ('credit_transactions', 'id'), ('credit_transactions', 'user_id'),
    ('credit_transactions', 'amount'), ('credit_transactions', 'type'),
    ('credit_transactions', 'description')
)
select 'missing table' as problem, e.table_name as object, null::text as detail
from expected_tables e
where not exists (
  select 1 from pg_tables t
  where t.schemaname = 'public' and t.tablename = e.table_name
)
union all
select 'missing column' as problem, c.table_name || '.' || c.column_name as object,
       'run the migration that adds it (see docs/database.md)' as detail
from expected_columns c
where exists (
        select 1 from pg_tables t
        where t.schemaname = 'public' and t.tablename = c.table_name
      )
  and not exists (
        select 1 from information_schema.columns i
        where i.table_schema = 'public'
          and i.table_name = c.table_name
          and i.column_name = c.column_name
      )
union all
select 'missing function' as problem, 'adjust_credits_balance(text, integer)' as object,
       'run db/migrations/001_baseline.sql' as detail
where not exists (
  select 1 from pg_proc
  where proname = 'adjust_credits_balance'
    and pronamespace = 'public'::regnamespace
    and pg_get_function_arguments(oid) = 'p_user_id text, p_amount integer'
);
