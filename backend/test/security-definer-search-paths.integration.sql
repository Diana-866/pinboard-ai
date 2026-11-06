-- Run after migrations 040 and 041 in disposable PostgreSQL CI.
do $test$
declare
  v_function regprocedure;
  v_config text[];
begin
  foreach v_function in array array[
    'public.begin_pinterest_publish(text,uuid,text)'::regprocedure,
    'public.complete_pinterest_publish(text,uuid,text,text)'::regprocedure,
    'public.fail_pinterest_publish(text,uuid,text,boolean)'::regprocedure,
    'public.claim_due_pin_schedules(integer)'::regprocedure,
    'public.acquire_pinterest_token_refresh_lease(text,uuid,integer)'::regprocedure,
    'public.release_pinterest_token_refresh_lease(text,uuid)'::regprocedure,
    'public.commit_pinterest_token_refresh(text,uuid,timestamptz,text,text,text,timestamptz)'::regprocedure,
    'public.begin_pinterest_oauth_attempt(text,uuid,bigint)'::regprocedure,
    'public.commit_pinterest_oauth_attempt(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz)'::regprocedure,
    'public.disconnect_pinterest_account(text)'::regprocedure,
    'public.adjust_credits_balance(text,integer)'::regprocedure
  ]
  loop
    select p.proconfig into v_config
      from pg_proc p
      where p.oid = v_function
        and p.prosecdef;
    if v_config is null
       or not ('search_path=pg_catalog, public' = any(v_config)) then
      raise exception 'SECURITY DEFINER function % lacks hardened search_path (config=%)',
        v_function, v_config;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.adjust_credits_balance(text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.adjust_credits_balance(text,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.adjust_credits_balance(text,integer)', 'EXECUTE') then
    raise exception 'adjust_credits_balance execute privileges are not restricted to service_role';
  end if;
end;
$test$;
