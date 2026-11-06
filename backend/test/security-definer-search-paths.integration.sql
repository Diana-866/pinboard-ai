-- Run after migrations 040–043 in disposable PostgreSQL CI.
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
    'public.adjust_credits_balance(text,integer)'::regprocedure,
    'public.issue_password_reset_token(text,text,timestamptz,integer)'::regprocedure,
    'public.claim_email_outbox(integer)'::regprocedure,
    'public.mark_email_outbox_sent(uuid,uuid)'::regprocedure,
    'public.retry_email_outbox(uuid,uuid,text)'::regprocedure,
    'public.activate_paid_subscription(uuid,timestamptz)'::regprocedure,
    'public.acquire_pinterest_account_refresh_lease(text,uuid,uuid,integer)'::regprocedure,
    'public.release_pinterest_account_refresh_lease(text,uuid,uuid)'::regprocedure,
    'public.commit_pinterest_account_token_refresh(text,uuid,uuid,timestamptz,text,text,text,timestamptz)'::regprocedure,
    'public.disconnect_pinterest_account_v2(text,uuid)'::regprocedure,
    'public.commit_pinterest_oauth_attempt_v2(text,uuid,bigint,bigint,text,text,text,text,text,timestamptz)'::regprocedure,
    'public.begin_pinterest_publish_v2(text,uuid,uuid,text)'::regprocedure,
    'public.complete_pinterest_publish_v2(text,uuid,uuid,text,text)'::regprocedure,
    'public.fail_pinterest_publish_v2(text,uuid,uuid,text,boolean)'::regprocedure,
    'public.retry_failed_pin_schedule(text,uuid)'::regprocedure
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

    if has_function_privilege('anon', v_function::oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_function::oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_function::oid, 'EXECUTE') then
      raise exception 'SECURITY DEFINER function % execute privileges are not restricted to service_role',
        v_function;
    end if;
  end loop;


end;
$test$;
