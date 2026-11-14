-- Migration 148: retained account-deletion inventory RPC integration test.
-- Uses fixed synthetic identities and rolls back every fixture row.
begin;

insert into public.pinterest_oauth_connection_state(user_id, generation)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1);

insert into public.provider_refund_reconciliation_audit(
  request_kind,
  user_id,
  idempotency_key,
  task_index,
  provider_task_id,
  provider_refunded,
  evidence_reference
) values (
  'generation',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'retained-inventory-test-a',
  1,
  'provider-task-a',
  true,
  'evidence-reference-a'
), (
  'regeneration',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'retained-inventory-test-b',
  0,
  'provider-task-b',
  false,
  'evidence-reference-b'
);

do $test$
declare
  v_counts jsonb;
  v_function regprocedure := 'public.get_account_deletion_retained_record_counts(text)'::regprocedure;
begin
  if not has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'service_role cannot execute retained inventory RPC';
  end if;
  if has_function_privilege('anon', v_function, 'EXECUTE')
     or has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'client role can execute retained inventory RPC';
  end if;
  if exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
     where p.oid = v_function
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute retained inventory RPC';
  end if;

  begin
    perform public.get_account_deletion_retained_record_counts('not-a-uuid');
    raise exception 'malformed owner ID was accepted';
  exception when raise_exception then
    if sqlerrm <> 'valid account user id is required' then
      raise;
    end if;
  end;
end;
$test$;

-- Exercise the granted service_role path. The function must count only the
-- requested owner even though another owner's retained rows also exist.
set local role service_role;
do $service_role_test$
declare
  v_counts jsonb;
begin
  v_counts := public.get_account_deletion_retained_record_counts(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_counts <> jsonb_build_object(
    'pinterest_oauth_connection_state', 1,
    'provider_refund_reconciliation_audit', 1
  ) then
    raise exception 'retained inventory returned unexpected or cross-owner counts: %', v_counts;
  end if;
end;
$service_role_test$;
reset role;

rollback;
