-- Run after migration 042 in disposable PostgreSQL CI.
do $test$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'billing_webhook_exceptions'
       and column_name = 'received_currency'
       and data_type = 'text'
  ) then
    raise exception 'billing webhook audit must persist the received currency';
  end if;

  if has_table_privilege('anon', 'public.billing_webhook_exceptions', 'SELECT')
     or has_table_privilege('authenticated', 'public.billing_webhook_exceptions', 'SELECT')
     or has_table_privilege('anon', 'public.billing_webhook_exceptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.billing_webhook_exceptions', 'INSERT')
     or has_table_privilege('anon', 'public.billing_webhook_exceptions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.billing_webhook_exceptions', 'UPDATE')
     or has_table_privilege('anon', 'public.billing_webhook_exceptions', 'DELETE')
     or has_table_privilege('authenticated', 'public.billing_webhook_exceptions', 'DELETE') then
    raise exception 'client roles must not access billing webhook exception audit';
  end if;

  if not has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'SELECT')
     or not has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'INSERT') then
    raise exception 'service_role must be able to read and insert billing webhook exceptions';
  end if;

  if has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'UPDATE')
     or has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'DELETE') then
    raise exception 'billing webhook exception audit must remain append-only';
  end if;
end;
$test$;
