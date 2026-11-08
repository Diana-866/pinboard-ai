-- 078_operator_action_journal.sql
-- AUD-128: durable, append-only accountability for administrator refund actions.
-- The existing 073/077 financial RPCs remain the only workflow mutators.

create table if not exists public.provider_refund_operator_actions (
  action_id uuid primary key,
  request_kind text not null check (request_kind in ('generation','regeneration')),
  target_request_id bigint not null check (target_request_id > 0),
  operator_user_id uuid not null references public.users(id) on delete restrict,
  action_kind text not null check (action_kind in ('reconcile_refund','finalize_failure')),
  task_index integer not null check (task_index between 0 and 10),
  provider_refunded boolean,
  evidence_type text,
  evidence_reference text,
  before_state text not null,
  after_state text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint provider_refund_operator_actions_shape_check check (
    (action_kind='reconcile_refund'
      and provider_refunded is not null
      and evidence_type in ('provider_dashboard','provider_support','payment_statement','manual_review')
      and evidence_reference is not null
      and length(trim(evidence_reference)) between 8 and 500
      and trim(evidence_reference) ~ '^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,499}
      and after_state in ('provider_refunded','provider_not_refunded')
      and ((request_kind='generation' and task_index between 1 and 10)
        or (request_kind='regeneration' and task_index=0)))
    or
    (action_kind='finalize_failure'
      and provider_refunded is null
      and evidence_type is null
      and evidence_reference is null
      and task_index=0
      and before_state='processing'
      and after_state='failed')
  ),
  constraint provider_refund_operator_actions_logical_unique
    unique(request_kind,target_request_id,action_kind,task_index)
);

create index if not exists provider_refund_operator_actions_operator_idx
  on public.provider_refund_operator_actions(operator_user_id,created_at desc);

alter table public.provider_refund_operator_actions enable row level security;
revoke all on table public.provider_refund_operator_actions
  from public,anon,authenticated,service_role;

create or replace function public.reject_provider_refund_operator_action_mutation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  raise exception 'provider refund operator actions are append-only';
end;
$$;

drop trigger if exists provider_refund_operator_actions_no_mutation
  on public.provider_refund_operator_actions;
create trigger provider_refund_operator_actions_no_mutation
before update or delete on public.provider_refund_operator_actions
for each row execute function public.reject_provider_refund_operator_action_mutation();

-- TRUNCATE does not fire row-level DELETE triggers, so block it separately.
create trigger provider_refund_operator_actions_no_truncate
before truncate on public.provider_refund_operator_actions
for each statement execute function public.reject_provider_refund_operator_action_mutation();

revoke all on function public.reject_provider_refund_operator_action_mutation()
  from public,anon,authenticated,service_role;

-- Internal worker. It is intentionally not executable by API roles; the four
-- narrow public RPCs below are the only supported entry points.
create or replace function public._admin_record_provider_refund_action(
  p_operator_user_id uuid,
  p_request_kind text,
  p_request_id bigint,
  p_action_kind text,
  p_task_index integer,
  p_provider_refunded boolean,
  p_evidence_type text,
  p_evidence_reference text,
  p_action_id uuid
) returns timestamptz
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_existing public.provider_refund_operator_actions%rowtype;
  v_owner text;
  v_target_user uuid;
  v_request_key text;
  v_provider_task_id text;
  v_at timestamptz;
  v_inserted integer;
begin
  if p_operator_user_id is null or p_request_kind is null
     or p_request_kind not in ('generation','regeneration')
     or p_request_id is null or p_request_id<=0
     or p_action_kind is null or p_action_kind not in ('reconcile_refund','finalize_failure')
     or p_action_id is null then
    raise exception 'invalid administrator provider-refund action';
  end if;

  -- Operator-first lock serializes the action against administrator demotion
  -- and operator deletion. A demotion committed first makes this action fail.
  perform 1 from public.users where id=p_operator_user_id for update;
  if not found or not exists (
    select 1 from public.users where id=p_operator_user_id and is_admin is true
  ) then
    raise exception 'administrator privileges required';
  end if;

  -- Exact replay is checked only after current authorization succeeds.
  select * into v_existing
    from public.provider_refund_operator_actions
   where action_id=p_action_id;
  if found then
    if v_existing.operator_user_id is distinct from p_operator_user_id
       or v_existing.request_kind is distinct from p_request_kind
       or v_existing.target_request_id is distinct from p_request_id
       or v_existing.action_kind is distinct from p_action_kind
       or v_existing.task_index is distinct from p_task_index
       or v_existing.provider_refunded is distinct from p_provider_refunded
       or v_existing.evidence_type is distinct from p_evidence_type
       or v_existing.evidence_reference is distinct from nullif(trim(p_evidence_reference),'') then
      raise exception 'action id replay payload mismatch';
    end if;
    return v_existing.created_at;
  end if;

  if p_action_kind='reconcile_refund' then
    if p_provider_refunded is null
       or p_evidence_type is null
       or p_evidence_type not in ('provider_dashboard','provider_support','payment_statement','manual_review')
       or p_evidence_reference is null
       or length(trim(p_evidence_reference))<8
       or length(p_evidence_reference)>500
       or trim(p_evidence_reference) !~ '^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,499} and coalesce(p_task_index,0) not between 1 and 10)
       or (p_request_kind='regeneration' and p_task_index<>0) then
      raise exception 'invalid provider-refund reconciliation evidence';
    end if;
  elsif p_task_index<>0 or p_provider_refunded is not null
        or p_evidence_type is not null or p_evidence_reference is not null then
    raise exception 'invalid finalization action payload';
  end if;

  -- Discovery read only: owner and idempotency key are never caller supplied.
  if p_request_kind='generation' then
    select user_id,idempotency_key into v_owner,v_request_key
      from public.pin_generation_requests where id=p_request_id;
  else
    select user_id,idempotency_key into v_owner,v_request_key
      from public.pin_regeneration_requests where id=p_request_id;
  end if;
  if not found then raise exception 'target request not found'; end if;

  -- Global lock order: operator -> target user -> request -> tasks -> reservation.
  select id into v_target_user
    from public.users where id::text=v_owner for update;
  if not found then raise exception 'target user not found'; end if;

  if p_request_kind='generation' then
    perform 1 from public.pin_generation_requests
     where id=p_request_id and user_id=v_owner and idempotency_key=v_request_key
     for update;
  else
    perform 1 from public.pin_regeneration_requests
     where id=p_request_id and user_id=v_owner and idempotency_key=v_request_key
     for update;
  end if;
  if not found then raise exception 'target request changed during lock acquisition'; end if;

  if p_request_kind='generation' then
    if p_action_kind='reconcile_refund' then
      select provider_task_id into v_provider_task_id
        from public.pin_generation_tasks
       where generation_request_id=p_request_id
         and user_id=v_owner and task_index=p_task_index
       for update;
      if not found then raise exception 'generation task not found'; end if;
    else
      perform 1 from public.pin_generation_tasks
       where generation_request_id=p_request_id and user_id=v_owner
       order by task_index for update;
    end if;
  end if;

  perform 1 from public.pin_generation_credit_reservations
   where user_id=v_owner and idempotency_key=v_request_key and status='reserved'
   for update;
  if not found then raise exception 'active credit reservation not found'; end if;

  -- Delegate all business rules and mutations to the established RPCs.
  if p_action_kind='reconcile_refund' and p_request_kind='generation' then
    perform public.reconcile_pin_generation_provider_refund(
      v_owner,v_request_key,p_task_index,v_provider_task_id,
      p_provider_refunded,p_evidence_reference
    );
  elsif p_action_kind='reconcile_refund' and p_request_kind='regeneration' then
    select provider_task_id into v_provider_task_id
      from public.pin_regeneration_requests
     where id=p_request_id and user_id=v_owner;
    perform public.reconcile_pin_regeneration_provider_refund(
      v_owner,v_request_key,v_provider_task_id,p_provider_refunded,p_evidence_reference
    );
  elsif p_action_kind='finalize_failure' and p_request_kind='generation' then
    perform public.finalize_reconciled_pin_generation_failure(v_owner,v_request_key);
  else
    perform public.finalize_reconciled_pin_regeneration_failure(v_owner,v_request_key);
  end if;

  v_at:=clock_timestamp();
  insert into public.provider_refund_operator_actions(
    action_id,request_kind,target_request_id,operator_user_id,action_kind,
    task_index,provider_refunded,evidence_type,evidence_reference,
    before_state,after_state,created_at
  ) values (
    p_action_id,p_request_kind,p_request_id,p_operator_user_id,p_action_kind,
    p_task_index,p_provider_refunded,p_evidence_type,
    case when p_evidence_reference is null then null else trim(p_evidence_reference) end,
    case when p_action_kind='reconcile_refund' then 'refund_unknown' else 'processing' end,
    case when p_action_kind='finalize_failure' then 'failed'
         when p_provider_refunded then 'provider_refunded' else 'provider_not_refunded' end,
    v_at
  ) on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted<>1 then
    raise exception 'logical administrator action already recorded';
  end if;
  return v_at;
end;
$$;

revoke all on function public._admin_record_provider_refund_action(uuid,text,bigint,text,integer,boolean,text,text,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.admin_reconcile_pin_generation_provider_refund(
  p_operator_user_id uuid,p_request_id bigint,p_task_index integer,
  p_provider_refunded boolean,p_evidence_type text,p_evidence_reference text,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'generation',p_request_id,'reconcile_refund',p_task_index,
    p_provider_refunded,p_evidence_type,p_evidence_reference,p_action_id
  );
$$;

create or replace function public.admin_reconcile_pin_regeneration_provider_refund(
  p_operator_user_id uuid,p_request_id bigint,
  p_provider_refunded boolean,p_evidence_type text,p_evidence_reference text,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'regeneration',p_request_id,'reconcile_refund',0,
    p_provider_refunded,p_evidence_type,p_evidence_reference,p_action_id
  );
$$;

create or replace function public.admin_finalize_reconciled_pin_generation_failure(
  p_operator_user_id uuid,p_request_id bigint,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'generation',p_request_id,'finalize_failure',0,
    null,null,null,p_action_id
  );
$$;

create or replace function public.admin_finalize_reconciled_pin_regeneration_failure(
  p_operator_user_id uuid,p_request_id bigint,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'regeneration',p_request_id,'finalize_failure',0,
    null,null,null,p_action_id
  );
$$;

revoke all on function public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_reconcile_pin_regeneration_provider_refund(uuid,bigint,boolean,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_reconciled_pin_generation_failure(uuid,bigint,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_reconciled_pin_regeneration_failure(uuid,bigint,uuid)
  from public,anon,authenticated;

grant execute on function public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)
  to service_role;
grant execute on function public.admin_reconcile_pin_regeneration_provider_refund(uuid,bigint,boolean,text,text,uuid)
  to service_role;
grant execute on function public.admin_finalize_reconciled_pin_generation_failure(uuid,bigint,uuid)
  to service_role;
grant execute on function public.admin_finalize_reconciled_pin_regeneration_failure(uuid,bigint,uuid)
  to service_role;

      and before_state='refund_unknown'
      and after_state in ('provider_refunded','provider_not_refunded')
      and ((request_kind='generation' and task_index between 1 and 10)
        or (request_kind='regeneration' and task_index=0)))
    or
    (action_kind='finalize_failure'
      and provider_refunded is null
      and evidence_type is null
      and evidence_reference is null
      and task_index=0
      and before_state='processing'
      and after_state='failed')
  ),
  constraint provider_refund_operator_actions_logical_unique
    unique(request_kind,target_request_id,action_kind,task_index)
);

create index if not exists provider_refund_operator_actions_operator_idx
  on public.provider_refund_operator_actions(operator_user_id,created_at desc);

alter table public.provider_refund_operator_actions enable row level security;
revoke all on table public.provider_refund_operator_actions
  from public,anon,authenticated,service_role;

create or replace function public.reject_provider_refund_operator_action_mutation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  raise exception 'provider refund operator actions are append-only';
end;
$$;

drop trigger if exists provider_refund_operator_actions_no_mutation
  on public.provider_refund_operator_actions;
create trigger provider_refund_operator_actions_no_mutation
before update or delete on public.provider_refund_operator_actions
for each row execute function public.reject_provider_refund_operator_action_mutation();

revoke all on function public.reject_provider_refund_operator_action_mutation()
  from public,anon,authenticated,service_role;

-- Internal worker. It is intentionally not executable by API roles; the four
-- narrow public RPCs below are the only supported entry points.
create or replace function public._admin_record_provider_refund_action(
  p_operator_user_id uuid,
  p_request_kind text,
  p_request_id bigint,
  p_action_kind text,
  p_task_index integer,
  p_provider_refunded boolean,
  p_evidence_type text,
  p_evidence_reference text,
  p_action_id uuid
) returns timestamptz
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_existing public.provider_refund_operator_actions%rowtype;
  v_owner text;
  v_target_user uuid;
  v_request_key text;
  v_provider_task_id text;
  v_at timestamptz;
  v_inserted integer;
begin
  if p_operator_user_id is null or p_request_kind is null
     or p_request_kind not in ('generation','regeneration')
     or p_request_id is null or p_request_id<=0
     or p_action_kind is null or p_action_kind not in ('reconcile_refund','finalize_failure')
     or p_action_id is null then
    raise exception 'invalid administrator provider-refund action';
  end if;

  -- Operator-first lock serializes the action against administrator demotion
  -- and operator deletion. A demotion committed first makes this action fail.
  perform 1 from public.users where id=p_operator_user_id for update;
  if not found or not exists (
    select 1 from public.users where id=p_operator_user_id and is_admin is true
  ) then
    raise exception 'administrator privileges required';
  end if;

  -- Exact replay is checked only after current authorization succeeds.
  select * into v_existing
    from public.provider_refund_operator_actions
   where action_id=p_action_id;
  if found then
    if v_existing.operator_user_id is distinct from p_operator_user_id
       or v_existing.request_kind is distinct from p_request_kind
       or v_existing.target_request_id is distinct from p_request_id
       or v_existing.action_kind is distinct from p_action_kind
       or v_existing.task_index is distinct from p_task_index
       or v_existing.provider_refunded is distinct from p_provider_refunded
       or v_existing.evidence_type is distinct from p_evidence_type
       or v_existing.evidence_reference is distinct from nullif(trim(p_evidence_reference),'') then
      raise exception 'action id replay payload mismatch';
    end if;
    return v_existing.created_at;
  end if;

  if p_action_kind='reconcile_refund' then
    if p_provider_refunded is null
       or p_evidence_type is null
       or p_evidence_type not in ('provider_dashboard','provider_support','payment_statement','manual_review')
       or p_evidence_reference is null
       or length(trim(p_evidence_reference))<8
       or length(p_evidence_reference)>500
       or (p_request_kind='generation' and coalesce(p_task_index,0) not between 1 and 10)
       or (p_request_kind='regeneration' and p_task_index<>0) then
      raise exception 'invalid provider-refund reconciliation evidence';
    end if;
  elsif p_task_index<>0 or p_provider_refunded is not null
        or p_evidence_type is not null or p_evidence_reference is not null then
    raise exception 'invalid finalization action payload';
  end if;

  -- Discovery read only: owner and idempotency key are never caller supplied.
  if p_request_kind='generation' then
    select user_id,idempotency_key into v_owner,v_request_key
      from public.pin_generation_requests where id=p_request_id;
  else
    select user_id,idempotency_key into v_owner,v_request_key
      from public.pin_regeneration_requests where id=p_request_id;
  end if;
  if not found then raise exception 'target request not found'; end if;

  -- Global lock order: operator -> target user -> request -> tasks -> reservation.
  select id into v_target_user
    from public.users where id::text=v_owner for update;
  if not found then raise exception 'target user not found'; end if;

  if p_request_kind='generation' then
    perform 1 from public.pin_generation_requests
     where id=p_request_id and user_id=v_owner and idempotency_key=v_request_key
     for update;
  else
    perform 1 from public.pin_regeneration_requests
     where id=p_request_id and user_id=v_owner and idempotency_key=v_request_key
     for update;
  end if;
  if not found then raise exception 'target request changed during lock acquisition'; end if;

  if p_request_kind='generation' then
    if p_action_kind='reconcile_refund' then
      select provider_task_id into v_provider_task_id
        from public.pin_generation_tasks
       where generation_request_id=p_request_id
         and user_id=v_owner and task_index=p_task_index
       for update;
      if not found then raise exception 'generation task not found'; end if;
    else
      perform 1 from public.pin_generation_tasks
       where generation_request_id=p_request_id and user_id=v_owner
       order by task_index for update;
    end if;
  end if;

  perform 1 from public.pin_generation_credit_reservations
   where user_id=v_owner and idempotency_key=v_request_key and status='reserved'
   for update;
  if not found then raise exception 'active credit reservation not found'; end if;

  -- Delegate all business rules and mutations to the established RPCs.
  if p_action_kind='reconcile_refund' and p_request_kind='generation' then
    perform public.reconcile_pin_generation_provider_refund(
      v_owner,v_request_key,p_task_index,v_provider_task_id,
      p_provider_refunded,p_evidence_reference
    );
  elsif p_action_kind='reconcile_refund' and p_request_kind='regeneration' then
    select provider_task_id into v_provider_task_id
      from public.pin_regeneration_requests
     where id=p_request_id and user_id=v_owner;
    perform public.reconcile_pin_regeneration_provider_refund(
      v_owner,v_request_key,v_provider_task_id,p_provider_refunded,p_evidence_reference
    );
  elsif p_action_kind='finalize_failure' and p_request_kind='generation' then
    perform public.finalize_reconciled_pin_generation_failure(v_owner,v_request_key);
  else
    perform public.finalize_reconciled_pin_regeneration_failure(v_owner,v_request_key);
  end if;

  v_at:=clock_timestamp();
  insert into public.provider_refund_operator_actions(
    action_id,request_kind,target_request_id,operator_user_id,action_kind,
    task_index,provider_refunded,evidence_type,evidence_reference,
    before_state,after_state,created_at
  ) values (
    p_action_id,p_request_kind,p_request_id,p_operator_user_id,p_action_kind,
    p_task_index,p_provider_refunded,p_evidence_type,
    case when p_evidence_reference is null then null else trim(p_evidence_reference) end,
    case when p_action_kind='reconcile_refund' then 'refund_unknown' else 'processing' end,
    case when p_action_kind='finalize_failure' then 'failed'
         when p_provider_refunded then 'provider_refunded' else 'provider_not_refunded' end,
    v_at
  ) on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted<>1 then
    raise exception 'logical administrator action already recorded';
  end if;
  return v_at;
end;
$$;

revoke all on function public._admin_record_provider_refund_action(uuid,text,bigint,text,integer,boolean,text,text,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.admin_reconcile_pin_generation_provider_refund(
  p_operator_user_id uuid,p_request_id bigint,p_task_index integer,
  p_provider_refunded boolean,p_evidence_type text,p_evidence_reference text,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'generation',p_request_id,'reconcile_refund',p_task_index,
    p_provider_refunded,p_evidence_type,p_evidence_reference,p_action_id
  );
$$;

create or replace function public.admin_reconcile_pin_regeneration_provider_refund(
  p_operator_user_id uuid,p_request_id bigint,
  p_provider_refunded boolean,p_evidence_type text,p_evidence_reference text,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'regeneration',p_request_id,'reconcile_refund',0,
    p_provider_refunded,p_evidence_type,p_evidence_reference,p_action_id
  );
$$;

create or replace function public.admin_finalize_reconciled_pin_generation_failure(
  p_operator_user_id uuid,p_request_id bigint,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'generation',p_request_id,'finalize_failure',0,
    null,null,null,p_action_id
  );
$$;

create or replace function public.admin_finalize_reconciled_pin_regeneration_failure(
  p_operator_user_id uuid,p_request_id bigint,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'regeneration',p_request_id,'finalize_failure',0,
    null,null,null,p_action_id
  );
$$;

revoke all on function public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_reconcile_pin_regeneration_provider_refund(uuid,bigint,boolean,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_reconciled_pin_generation_failure(uuid,bigint,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_reconciled_pin_regeneration_failure(uuid,bigint,uuid)
  from public,anon,authenticated;

grant execute on function public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)
  to service_role;
grant execute on function public.admin_reconcile_pin_regeneration_provider_refund(uuid,bigint,boolean,text,text,uuid)
  to service_role;
grant execute on function public.admin_finalize_reconciled_pin_generation_failure(uuid,bigint,uuid)
  to service_role;
grant execute on function public.admin_finalize_reconciled_pin_regeneration_failure(uuid,bigint,uuid)
  to service_role;

       or (p_request_kind='generation' and coalesce(p_task_index,0) not between 1 and 10)
       or (p_request_kind='regeneration' and p_task_index<>0) then
      raise exception 'invalid provider-refund reconciliation evidence';
    end if;
  elsif p_task_index<>0 or p_provider_refunded is not null
        or p_evidence_type is not null or p_evidence_reference is not null then
    raise exception 'invalid finalization action payload';
  end if;

  -- Discovery read only: owner and idempotency key are never caller supplied.
  if p_request_kind='generation' then
    select user_id,idempotency_key into v_owner,v_request_key
      from public.pin_generation_requests where id=p_request_id;
  else
    select user_id,idempotency_key into v_owner,v_request_key
      from public.pin_regeneration_requests where id=p_request_id;
  end if;
  if not found then raise exception 'target request not found'; end if;

  -- Global lock order: operator -> target user -> request -> tasks -> reservation.
  select id into v_target_user
    from public.users where id::text=v_owner for update;
  if not found then raise exception 'target user not found'; end if;

  if p_request_kind='generation' then
    perform 1 from public.pin_generation_requests
     where id=p_request_id and user_id=v_owner and idempotency_key=v_request_key
     for update;
  else
    perform 1 from public.pin_regeneration_requests
     where id=p_request_id and user_id=v_owner and idempotency_key=v_request_key
     for update;
  end if;
  if not found then raise exception 'target request changed during lock acquisition'; end if;

  if p_request_kind='generation' then
    if p_action_kind='reconcile_refund' then
      select provider_task_id into v_provider_task_id
        from public.pin_generation_tasks
       where generation_request_id=p_request_id
         and user_id=v_owner and task_index=p_task_index
       for update;
      if not found then raise exception 'generation task not found'; end if;
    else
      perform 1 from public.pin_generation_tasks
       where generation_request_id=p_request_id and user_id=v_owner
       order by task_index for update;
    end if;
  end if;

  perform 1 from public.pin_generation_credit_reservations
   where user_id=v_owner and idempotency_key=v_request_key and status='reserved'
   for update;
  if not found then raise exception 'active credit reservation not found'; end if;

  -- Delegate all business rules and mutations to the established RPCs.
  if p_action_kind='reconcile_refund' and p_request_kind='generation' then
    perform public.reconcile_pin_generation_provider_refund(
      v_owner,v_request_key,p_task_index,v_provider_task_id,
      p_provider_refunded,p_evidence_reference
    );
  elsif p_action_kind='reconcile_refund' and p_request_kind='regeneration' then
    select provider_task_id into v_provider_task_id
      from public.pin_regeneration_requests
     where id=p_request_id and user_id=v_owner;
    perform public.reconcile_pin_regeneration_provider_refund(
      v_owner,v_request_key,v_provider_task_id,p_provider_refunded,p_evidence_reference
    );
  elsif p_action_kind='finalize_failure' and p_request_kind='generation' then
    perform public.finalize_reconciled_pin_generation_failure(v_owner,v_request_key);
  else
    perform public.finalize_reconciled_pin_regeneration_failure(v_owner,v_request_key);
  end if;

  v_at:=clock_timestamp();
  insert into public.provider_refund_operator_actions(
    action_id,request_kind,target_request_id,operator_user_id,action_kind,
    task_index,provider_refunded,evidence_type,evidence_reference,
    before_state,after_state,created_at
  ) values (
    p_action_id,p_request_kind,p_request_id,p_operator_user_id,p_action_kind,
    p_task_index,p_provider_refunded,p_evidence_type,
    case when p_evidence_reference is null then null else trim(p_evidence_reference) end,
    case when p_action_kind='reconcile_refund' then 'refund_unknown' else 'processing' end,
    case when p_action_kind='finalize_failure' then 'failed'
         when p_provider_refunded then 'provider_refunded' else 'provider_not_refunded' end,
    v_at
  ) on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted<>1 then
    raise exception 'logical administrator action already recorded';
  end if;
  return v_at;
end;
$$;

revoke all on function public._admin_record_provider_refund_action(uuid,text,bigint,text,integer,boolean,text,text,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.admin_reconcile_pin_generation_provider_refund(
  p_operator_user_id uuid,p_request_id bigint,p_task_index integer,
  p_provider_refunded boolean,p_evidence_type text,p_evidence_reference text,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'generation',p_request_id,'reconcile_refund',p_task_index,
    p_provider_refunded,p_evidence_type,p_evidence_reference,p_action_id
  );
$$;

create or replace function public.admin_reconcile_pin_regeneration_provider_refund(
  p_operator_user_id uuid,p_request_id bigint,
  p_provider_refunded boolean,p_evidence_type text,p_evidence_reference text,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'regeneration',p_request_id,'reconcile_refund',0,
    p_provider_refunded,p_evidence_type,p_evidence_reference,p_action_id
  );
$$;

create or replace function public.admin_finalize_reconciled_pin_generation_failure(
  p_operator_user_id uuid,p_request_id bigint,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'generation',p_request_id,'finalize_failure',0,
    null,null,null,p_action_id
  );
$$;

create or replace function public.admin_finalize_reconciled_pin_regeneration_failure(
  p_operator_user_id uuid,p_request_id bigint,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'regeneration',p_request_id,'finalize_failure',0,
    null,null,null,p_action_id
  );
$$;

revoke all on function public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_reconcile_pin_regeneration_provider_refund(uuid,bigint,boolean,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_reconciled_pin_generation_failure(uuid,bigint,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_reconciled_pin_regeneration_failure(uuid,bigint,uuid)
  from public,anon,authenticated;

grant execute on function public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)
  to service_role;
grant execute on function public.admin_reconcile_pin_regeneration_provider_refund(uuid,bigint,boolean,text,text,uuid)
  to service_role;
grant execute on function public.admin_finalize_reconciled_pin_generation_failure(uuid,bigint,uuid)
  to service_role;
grant execute on function public.admin_finalize_reconciled_pin_regeneration_failure(uuid,bigint,uuid)
  to service_role;

      and before_state='refund_unknown'
      and after_state in ('provider_refunded','provider_not_refunded')
      and ((request_kind='generation' and task_index between 1 and 10)
        or (request_kind='regeneration' and task_index=0)))
    or
    (action_kind='finalize_failure'
      and provider_refunded is null
      and evidence_type is null
      and evidence_reference is null
      and task_index=0
      and before_state='processing'
      and after_state='failed')
  ),
  constraint provider_refund_operator_actions_logical_unique
    unique(request_kind,target_request_id,action_kind,task_index)
);

create index if not exists provider_refund_operator_actions_operator_idx
  on public.provider_refund_operator_actions(operator_user_id,created_at desc);

alter table public.provider_refund_operator_actions enable row level security;
revoke all on table public.provider_refund_operator_actions
  from public,anon,authenticated,service_role;

create or replace function public.reject_provider_refund_operator_action_mutation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  raise exception 'provider refund operator actions are append-only';
end;
$$;

drop trigger if exists provider_refund_operator_actions_no_mutation
  on public.provider_refund_operator_actions;
create trigger provider_refund_operator_actions_no_mutation
before update or delete on public.provider_refund_operator_actions
for each row execute function public.reject_provider_refund_operator_action_mutation();

revoke all on function public.reject_provider_refund_operator_action_mutation()
  from public,anon,authenticated,service_role;

-- Internal worker. It is intentionally not executable by API roles; the four
-- narrow public RPCs below are the only supported entry points.
create or replace function public._admin_record_provider_refund_action(
  p_operator_user_id uuid,
  p_request_kind text,
  p_request_id bigint,
  p_action_kind text,
  p_task_index integer,
  p_provider_refunded boolean,
  p_evidence_type text,
  p_evidence_reference text,
  p_action_id uuid
) returns timestamptz
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_existing public.provider_refund_operator_actions%rowtype;
  v_owner text;
  v_target_user uuid;
  v_request_key text;
  v_provider_task_id text;
  v_at timestamptz;
  v_inserted integer;
begin
  if p_operator_user_id is null or p_request_kind is null
     or p_request_kind not in ('generation','regeneration')
     or p_request_id is null or p_request_id<=0
     or p_action_kind is null or p_action_kind not in ('reconcile_refund','finalize_failure')
     or p_action_id is null then
    raise exception 'invalid administrator provider-refund action';
  end if;

  -- Operator-first lock serializes the action against administrator demotion
  -- and operator deletion. A demotion committed first makes this action fail.
  perform 1 from public.users where id=p_operator_user_id for update;
  if not found or not exists (
    select 1 from public.users where id=p_operator_user_id and is_admin is true
  ) then
    raise exception 'administrator privileges required';
  end if;

  -- Exact replay is checked only after current authorization succeeds.
  select * into v_existing
    from public.provider_refund_operator_actions
   where action_id=p_action_id;
  if found then
    if v_existing.operator_user_id is distinct from p_operator_user_id
       or v_existing.request_kind is distinct from p_request_kind
       or v_existing.target_request_id is distinct from p_request_id
       or v_existing.action_kind is distinct from p_action_kind
       or v_existing.task_index is distinct from p_task_index
       or v_existing.provider_refunded is distinct from p_provider_refunded
       or v_existing.evidence_type is distinct from p_evidence_type
       or v_existing.evidence_reference is distinct from nullif(trim(p_evidence_reference),'') then
      raise exception 'action id replay payload mismatch';
    end if;
    return v_existing.created_at;
  end if;

  if p_action_kind='reconcile_refund' then
    if p_provider_refunded is null
       or p_evidence_type is null
       or p_evidence_type not in ('provider_dashboard','provider_support','payment_statement','manual_review')
       or p_evidence_reference is null
       or length(trim(p_evidence_reference))<8
       or length(p_evidence_reference)>500
       or (p_request_kind='generation' and coalesce(p_task_index,0) not between 1 and 10)
       or (p_request_kind='regeneration' and p_task_index<>0) then
      raise exception 'invalid provider-refund reconciliation evidence';
    end if;
  elsif p_task_index<>0 or p_provider_refunded is not null
        or p_evidence_type is not null or p_evidence_reference is not null then
    raise exception 'invalid finalization action payload';
  end if;

  -- Discovery read only: owner and idempotency key are never caller supplied.
  if p_request_kind='generation' then
    select user_id,idempotency_key into v_owner,v_request_key
      from public.pin_generation_requests where id=p_request_id;
  else
    select user_id,idempotency_key into v_owner,v_request_key
      from public.pin_regeneration_requests where id=p_request_id;
  end if;
  if not found then raise exception 'target request not found'; end if;

  -- Global lock order: operator -> target user -> request -> tasks -> reservation.
  select id into v_target_user
    from public.users where id::text=v_owner for update;
  if not found then raise exception 'target user not found'; end if;

  if p_request_kind='generation' then
    perform 1 from public.pin_generation_requests
     where id=p_request_id and user_id=v_owner and idempotency_key=v_request_key
     for update;
  else
    perform 1 from public.pin_regeneration_requests
     where id=p_request_id and user_id=v_owner and idempotency_key=v_request_key
     for update;
  end if;
  if not found then raise exception 'target request changed during lock acquisition'; end if;

  if p_request_kind='generation' then
    if p_action_kind='reconcile_refund' then
      select provider_task_id into v_provider_task_id
        from public.pin_generation_tasks
       where generation_request_id=p_request_id
         and user_id=v_owner and task_index=p_task_index
       for update;
      if not found then raise exception 'generation task not found'; end if;
    else
      perform 1 from public.pin_generation_tasks
       where generation_request_id=p_request_id and user_id=v_owner
       order by task_index for update;
    end if;
  end if;

  perform 1 from public.pin_generation_credit_reservations
   where user_id=v_owner and idempotency_key=v_request_key and status='reserved'
   for update;
  if not found then raise exception 'active credit reservation not found'; end if;

  -- Delegate all business rules and mutations to the established RPCs.
  if p_action_kind='reconcile_refund' and p_request_kind='generation' then
    perform public.reconcile_pin_generation_provider_refund(
      v_owner,v_request_key,p_task_index,v_provider_task_id,
      p_provider_refunded,p_evidence_reference
    );
  elsif p_action_kind='reconcile_refund' and p_request_kind='regeneration' then
    select provider_task_id into v_provider_task_id
      from public.pin_regeneration_requests
     where id=p_request_id and user_id=v_owner;
    perform public.reconcile_pin_regeneration_provider_refund(
      v_owner,v_request_key,v_provider_task_id,p_provider_refunded,p_evidence_reference
    );
  elsif p_action_kind='finalize_failure' and p_request_kind='generation' then
    perform public.finalize_reconciled_pin_generation_failure(v_owner,v_request_key);
  else
    perform public.finalize_reconciled_pin_regeneration_failure(v_owner,v_request_key);
  end if;

  v_at:=clock_timestamp();
  insert into public.provider_refund_operator_actions(
    action_id,request_kind,target_request_id,operator_user_id,action_kind,
    task_index,provider_refunded,evidence_type,evidence_reference,
    before_state,after_state,created_at
  ) values (
    p_action_id,p_request_kind,p_request_id,p_operator_user_id,p_action_kind,
    p_task_index,p_provider_refunded,p_evidence_type,
    case when p_evidence_reference is null then null else trim(p_evidence_reference) end,
    case when p_action_kind='reconcile_refund' then 'refund_unknown' else 'processing' end,
    case when p_action_kind='finalize_failure' then 'failed'
         when p_provider_refunded then 'provider_refunded' else 'provider_not_refunded' end,
    v_at
  ) on conflict do nothing;
  get diagnostics v_inserted=row_count;
  if v_inserted<>1 then
    raise exception 'logical administrator action already recorded';
  end if;
  return v_at;
end;
$$;

revoke all on function public._admin_record_provider_refund_action(uuid,text,bigint,text,integer,boolean,text,text,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.admin_reconcile_pin_generation_provider_refund(
  p_operator_user_id uuid,p_request_id bigint,p_task_index integer,
  p_provider_refunded boolean,p_evidence_type text,p_evidence_reference text,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'generation',p_request_id,'reconcile_refund',p_task_index,
    p_provider_refunded,p_evidence_type,p_evidence_reference,p_action_id
  );
$$;

create or replace function public.admin_reconcile_pin_regeneration_provider_refund(
  p_operator_user_id uuid,p_request_id bigint,
  p_provider_refunded boolean,p_evidence_type text,p_evidence_reference text,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'regeneration',p_request_id,'reconcile_refund',0,
    p_provider_refunded,p_evidence_type,p_evidence_reference,p_action_id
  );
$$;

create or replace function public.admin_finalize_reconciled_pin_generation_failure(
  p_operator_user_id uuid,p_request_id bigint,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'generation',p_request_id,'finalize_failure',0,
    null,null,null,p_action_id
  );
$$;

create or replace function public.admin_finalize_reconciled_pin_regeneration_failure(
  p_operator_user_id uuid,p_request_id bigint,p_action_id uuid
) returns timestamptz
language sql security definer
set search_path=pg_catalog,public
as $$
  select public._admin_record_provider_refund_action(
    p_operator_user_id,'regeneration',p_request_id,'finalize_failure',0,
    null,null,null,p_action_id
  );
$$;

revoke all on function public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_reconcile_pin_regeneration_provider_refund(uuid,bigint,boolean,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_reconciled_pin_generation_failure(uuid,bigint,uuid)
  from public,anon,authenticated;
revoke all on function public.admin_finalize_reconciled_pin_regeneration_failure(uuid,bigint,uuid)
  from public,anon,authenticated;

grant execute on function public.admin_reconcile_pin_generation_provider_refund(uuid,bigint,integer,boolean,text,text,uuid)
  to service_role;
grant execute on function public.admin_reconcile_pin_regeneration_provider_refund(uuid,bigint,boolean,text,text,uuid)
  to service_role;
grant execute on function public.admin_finalize_reconciled_pin_generation_failure(uuid,bigint,uuid)
  to service_role;
grant execute on function public.admin_finalize_reconciled_pin_regeneration_failure(uuid,bigint,uuid)
  to service_role;
