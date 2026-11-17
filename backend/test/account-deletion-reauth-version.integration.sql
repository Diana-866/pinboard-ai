-- Run after canonical migrations 127-129 in the disposable CI database.
-- The RPC also writes durable queue/event rows; isolate this test with rollback.
begin;
-- Covers the password re-authentication/version race and idempotent receipt.

do $$
declare
  v_ok uuid := gen_random_uuid();
  v_stale uuid := gen_random_uuid();
  v_receipt jsonb;
  v_repeat jsonb;
  v_request_id uuid;
  v_version integer;
  v_rejected boolean := false;
begin
  insert into public.users(id,email,password_hash,token_version)
  values
    (v_ok,'deletion-reauth-ok-'||v_ok||'@example.invalid','not-used-by-this-sql-test',0),
    (v_stale,'deletion-reauth-stale-'||v_stale||'@example.invalid','not-used-by-this-sql-test',7);

  -- Fresh password verification is bound to the exact token version.
  v_receipt := public.request_account_deletion(v_ok,'password_reauth',0);
  v_request_id := (v_receipt->>'requestId')::uuid;

  select token_version into v_version from public.users where id=v_ok;
  if v_version <> 1 then
    raise exception 'successful deletion request did not increment token_version';
  end if;
  if (v_receipt->>'state') <> 'pending' or (v_receipt->>'alreadyRequested')::boolean then
    raise exception 'first deletion request returned an invalid receipt: %', v_receipt;
  end if;

  -- A stale password check must not fence the account.
  begin
    perform public.request_account_deletion(v_stale,'password_reauth',6);
  exception when raise_exception then
    if sqlerrm = 'reauthentication expired' then
      v_rejected := true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'stale re-authentication was not rejected';
  end if;
  if (select account_status from public.users where id=v_stale) <> 'active' then
    raise exception 'stale re-authentication changed account status';
  end if;
  if exists(select 1 from public.account_deletion_requests where user_id=v_stale) then
    raise exception 'stale re-authentication created a deletion request';
  end if;

  -- Repeated request returns the original receipt, without another version bump.
  v_repeat := public.request_account_deletion(v_ok,'password_reauth',0);
  if (v_repeat->>'requestId')::uuid <> v_request_id
     or not (v_repeat->>'alreadyRequested')::boolean then
    raise exception 'duplicate request did not return the original receipt';
  end if;
  if (select token_version from public.users where id=v_ok) <> 1 then
    raise exception 'duplicate request incremented token_version twice';
  end if;

  raise notice 'Account deletion re-authentication fencing checks passed';
end;
$$;
rollback;
