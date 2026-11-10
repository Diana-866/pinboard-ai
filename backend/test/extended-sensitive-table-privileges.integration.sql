-- AUD-102: run after migrations 015-076 in disposable PostgreSQL CI.
-- Verifies every additional durable queue/journal/ledger table reviewed in AUD-102.
-- PinPosy uses custom JWTs; anon/authenticated must never access these tables directly.
do $audit$
declare
  v_table text;
  v_privilege text;
  v_backend_crud text[] := array[
    'pin_schedules',
    'pinterest_publish_attempts',
    'pinterest_token_refresh_leases',
    'pinterest_account_refresh_leases',
    'pin_generation_requests',
    'pin_generation_tasks',
    'pin_regeneration_requests',
    'pin_generation_credit_reservations',
    'pin_generation_text_usage'
  ];
  v_client_privileges text[] := array[
    'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
  ];
  v_private_tables text[] := array[
    'pinterest_oauth_connection_state',
    'provider_refund_reconciliation_audit'
  ];
begin
  foreach v_table in array array[
    'pin_schedules',
    'pinterest_publish_attempts',
    'pinterest_token_refresh_leases',
    'pinterest_account_refresh_leases',
    'pinterest_oauth_connection_state',
    'billing_webhook_exceptions',
    'email_outbox',
    'pin_generation_requests',
    'pin_generation_tasks',
    'pin_regeneration_requests',
    'pin_generation_credit_reservations',
    'pin_generation_text_usage',
    'provider_refund_reconciliation_audit'
  ] loop
    if to_regclass(format('public.%I',v_table)) is null then
      raise exception 'AUD-102 expected table public.% to exist',v_table;
    end if;

    if not (select c.relrowsecurity
              from pg_class c
             where c.oid=to_regclass(format('public.%I',v_table))) then
      raise exception 'RLS is not enabled on public.%',v_table;
    end if;

    foreach v_privilege in array v_client_privileges loop
      if has_table_privilege('anon',format('public.%I',v_table),v_privilege)
         or has_table_privilege('authenticated',format('public.%I',v_table),v_privilege) then
        raise exception 'client role retains % on public.%',v_privilege,v_table;
      end if;
    end loop;
  end loop;

  foreach v_table in array v_backend_crud loop
    foreach v_privilege in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if not has_table_privilege('service_role',format('public.%I',v_table),v_privilege) then
        raise exception 'service_role is missing % on public.%',v_privilege,v_table;
      end if;
    end loop;
  end loop;

  -- Append-only signed webhook exception trail: read + insert, never mutate/delete.
  if not has_table_privilege('service_role','public.billing_webhook_exceptions','SELECT')
     or not has_table_privilege('service_role','public.billing_webhook_exceptions','INSERT')
     or has_table_privilege('service_role','public.billing_webhook_exceptions','UPDATE')
     or has_table_privilege('service_role','public.billing_webhook_exceptions','DELETE') then
    raise exception 'billing_webhook_exceptions must remain append-only for service_role';
  end if;

  -- Email outbox is updated only through claim/ack/retry RPCs and is not deletable.
  if not has_table_privilege('service_role','public.email_outbox','SELECT')
     or not has_table_privilege('service_role','public.email_outbox','INSERT')
     or not has_table_privilege('service_role','public.email_outbox','UPDATE')
     or has_table_privilege('service_role','public.email_outbox','DELETE') then
    raise exception 'email_outbox service_role privileges are not least-privilege';
  end if;

  -- OAuth state and provider refund audit are function-owner-only, including service_role.
  foreach v_table in array v_private_tables loop
    foreach v_privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('service_role',format('public.%I',v_table),v_privilege) then
        raise exception 'service_role must not directly access private table public.% (%).',v_table,v_privilege;
      end if;
    end loop;
  end loop;
end;
$audit$;
