-- Манифест резервной копии PinPosy.
--
-- Запускается ТОЛЬКО внутри транзакции, из которой уже взят снапшот и в которой
-- выполняется pg_dump --snapshot=<id>: тогда числа в манифесте описывают ровно то
-- состояние базы, которое попало в дамп. См. scripts/backup-postgres.sh.
--
-- Возвращает одну строку JSON. Ничего не меняет в базе.
--
-- Зачем: без манифеста проверка восстановления доказывает только «строки есть».
-- Правильно восстановленная пустая база проходит такую проверку.

WITH cfg AS (
  -- Ключевые таблицы продукта. Список сверяется восстановлением, поэтому
  -- добавлять сюда таблицу нужно вместе с пониманием, что её потеря — авария.
  SELECT * FROM (VALUES
    ('users'), ('projects'), ('boards'), ('pins'),
    ('credit_transactions'), ('subscriptions')
  ) AS t(name)
),
present AS (
  SELECT c.relname AS name, c.oid, a.atttypid AS id_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attribute a
    ON a.attrelid = c.oid AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname::text IN (SELECT name FROM cfg)
),
table_stats AS (
  SELECT
    p.name,
    (xpath('/row/c/text()',
       query_to_xml(format('SELECT count(*) AS c FROM public.%I', p.name), false, true, '')))[1]::text::bigint AS rows,
    CASE
      WHEN p.id_type IS NULL THEN NULL
      -- Для uuid/текстовых ключей max() не существует: берём лексикографический
      -- максимум как отпечаток значения, точность сверки даёт count(*).
      WHEN p.id_type NOT IN ('int2'::regtype, 'int4'::regtype, 'int8'::regtype, 'numeric'::regtype)
        THEN (xpath('/row/m/text()',
               query_to_xml(format('SELECT max(id::text) AS m FROM public.%I', p.name), false, true, '')))[1]::text
      ELSE (xpath('/row/m/text()',
             query_to_xml(format('SELECT max(id)::text AS m FROM public.%I', p.name), false, true, '')))[1]::text
    END AS max_id
  FROM present p
),
sequence_stats AS (
  SELECT
    c.relname AS tbl,
    a.attname AS col,
    format('%I.%I', sn.nspname, s.relname) AS sequence,
    (xpath('/row/l/text()',
       query_to_xml(format('SELECT last_value AS l FROM %I.%I', sn.nspname, s.relname), false, true, '')))[1]::text::bigint AS last_value,
    -- max_value нужен проверке восстановления: last_value последовательности обязан
    -- быть не меньше максимального значения колонки, иначе первая же вставка упадёт
    -- на duplicate key при формально целом дампе.
    (xpath('/row/m/text()',
       query_to_xml(format('SELECT max(%I)::text AS m FROM public.%I', a.attname, c.relname), false, true, '')))[1]::text::bigint AS max_value
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_depend d ON d.refobjid = c.oid AND d.refobjsubid = a.attnum AND d.deptype IN ('a', 'i')
  JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
  JOIN pg_namespace sn ON sn.oid = s.relnamespace
  WHERE c.relkind = 'r'
),
role_stats AS (
  SELECT DISTINCT ro.rolname AS name
  FROM (
    SELECT (aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner)))).grantee AS grantee
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'S', 'f')
    UNION ALL
    SELECT (aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner)))).grantee
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    UNION ALL
    SELECT (aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner)))).grantee
    FROM pg_namespace n
    WHERE n.nspname = 'public'
  ) acl
  JOIN pg_roles ro ON ro.oid = acl.grantee
  WHERE acl.grantee <> 0
)
SELECT json_build_object(
  'format', 'pinposy-backup-manifest/1',
  'created_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'database', current_database(),
  'server_version', current_setting('server_version'),
  'server_version_num', current_setting('server_version_num')::int,
  'extensions', COALESCE((
    SELECT json_object_agg(extname, extversion ORDER BY extname)
    FROM pg_extension
  ), '{}'::json),
  'tables', COALESCE((
    SELECT json_object_agg(name, json_build_object('rows', rows, 'max_id', max_id))
    FROM table_stats
  ), '{}'::json),
  'sequences', COALESCE((
    SELECT json_agg(json_build_object(
             'table', tbl,
             'column', col,
             'sequence', sequence,
             'last_value', last_value,
             'max_value', max_value
           ) ORDER BY tbl, col)
    FROM sequence_stats
  ), '[]'::json),
  'roles', COALESCE((
    SELECT json_agg(name ORDER BY name) FROM role_stats
  ), '[]'::json),
  'objects', json_build_object(
    'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r'),
    'views', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')),
    'functions', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public'),
    'triggers', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND NOT t.tgisinternal),
    'indexes', (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'),
    'invalid_indexes', (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND NOT i.indisvalid),
    'constraints', (SELECT count(*) FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace
                    WHERE n.nspname = 'public')
  ),
  'rls', json_build_object(
    'tables', COALESCE((
      SELECT json_agg(c.relname ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    ), '[]'::json),
    'policies', COALESCE((
      SELECT json_object_agg(tablename, cnt ORDER BY tablename)
      FROM (
        SELECT tablename, count(*)::int AS cnt
        FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename
      ) p
    ), '{}'::json),
    'privileges', COALESCE((
      SELECT json_object_agg(t.name, has_table_privilege('authenticated', format('public.%I', t.name), 'SELECT'))
      FROM cfg t
      WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
        AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = t.name)
    ), '{}'::json)
  )
)::text;
