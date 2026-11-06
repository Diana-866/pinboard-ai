-- Run after migration 042 in disposable PostgreSQL CI.
do $test$
begin
  if has_table_privilege('anon', 'public.billing_webhook_exceptions', 'SELECT')
     or has_table_privilege('authenticated', 'public.billing_webhook_exceptions', 'SELECT') then
    raise exception 'billing webhook exception audit must not be readable by client roles';
  end if;
  if not has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'SELECT')
     or not has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'INSERT') then
    raise exception 'service_role must be able to read and insert billing webhook exceptions';
  end if;
end;
$test$;
