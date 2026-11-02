-- ============================================================================
-- PinPosy · 000_check_schema.sql
-- ДИАГНОСТИКА. Только SELECT — ничего не меняет.
-- Можно запускать на рабочей базе в любой момент, до и после 001.
-- Ожидания колонок = полный набор, нужный коду backend (все миграции применены).
-- ============================================================================

-- 1. Какие таблицы реально есть в public
select c.relname as table_name,
       c.relkind  as kind,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relname;

-- 2. Ожидаемые колонки vs фактические.
--    present = true  — колонка есть;
--    present = false — НЕТ, код может упасть. Смотрим provided_by.
with expected(table_name, column_name, provided_by) as (
  values
    ('users', 'id',                 '001'),
    ('users', 'email',              '001'),
    ('users', 'password_hash',      '001'),
    ('users', 'credits_balance',    '001'),
    ('users', 'tariff_plan',        '001'),
    ('users', 'tariff_period_end',  '001'),
    ('users', 'subscription_tier',  '001'),
    ('users', 'is_admin',           '001'),
    ('users', 'created_at',         '001'),
    ('users', 'name',               '003'),
    ('users', 'surname',            '003'),
    ('users', 'onboarded',          '004'),
    ('users', 'email_verified',     '005'),
    ('projects', 'id',          '001'),
    ('projects', 'user_id',     '001'),
    ('projects', 'website_url', '001'),
    ('projects', 'niche',       '001'),
    ('projects', 'tone',        '001'),
    ('projects', 'created_at',  '001'),
    ('boards', 'id',          '001'),
    ('boards', 'project_id',  '001'),
    ('boards', 'title',       '001'),
    ('boards', 'description', '001'),
    ('boards', 'created_at',  '001'),
    ('pins', 'id',           '001'),
    ('pins', 'board_id',     '001'),
    ('pins', 'image_url',    '001'),
    ('pins', 'title',        '001'),
    ('pins', 'description',  '001'),
    ('pins', 'status',       '001'),
    ('pins', 'model_used',   '001'),
    ('pins', 'aspect_ratio', '001'),
    ('pins', 'credits_cost', '001'),
    ('pins', 'created_at',   '001'),
    ('credit_transactions', 'id',          '001'),
    ('credit_transactions', 'user_id',     '001'),
    ('credit_transactions', 'amount',      '001'),
    ('credit_transactions', 'type',        '001'),
    ('credit_transactions', 'description', '001'),
    ('credit_transactions', 'created_at',  '001')
),
actual as (
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
)
select e.table_name,
       e.column_name,
       (a.column_name is not null) as present,
       e.provided_by
from expected e
left join actual a
  on a.table_name = e.table_name and a.column_name = e.column_name
order by e.table_name, e.provided_by, e.column_name;

-- 3. Есть ли функция adjust_credits_balance и какая у неё сигнатура/свойства
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       n.nspname as schema
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'adjust_credits_balance';

-- 4. Кому разрешено выполнять функцию
select r.rolname as role,
       has_function_privilege(r.rolname, 'public.adjust_credits_balance(text,integer)', 'execute') as can_execute
from pg_roles r
where r.rolname in ('service_role', 'anon', 'authenticated', 'public')
order by r.rolname;

-- 5. Политики RLS на таблицах PinPosy
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('users', 'projects', 'boards', 'pins', 'credit_transactions')
order by tablename, policyname;

-- 6. Существование ключевых таблиц одним взглядом (без ошибок, если их нет)
select 'users'                as object, to_regclass('public.users')                is not null as exists_;
select 'projects'             as object, to_regclass('public.projects')             is not null as exists_;
select 'boards'               as object, to_regclass('public.boards')               is not null as exists_;
select 'pins'                 as object, to_regclass('public.pins')                 is not null as exists_;
select 'credit_transactions'  as object, to_regclass('public.credit_transactions')  is not null as exists_;

-- 7. Приблизительное число строк (оценка планировщика, читается из pg_class)
select c.relname as table_name, c.reltuples::bigint as approx_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in ('users', 'projects', 'boards', 'pins', 'credit_transactions')
order by c.relname;
