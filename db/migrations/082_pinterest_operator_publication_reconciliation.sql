-- 082_pinterest_operator_publication_reconciliation.sql
-- AUD-145: record externally confirmed publication outcomes for stale unknown schedules.
-- This action is positive-only: it cannot prove non-publication or enable retry.

create table if not exists public.pinterest_operator_reconciliations (
  action_id uuid primary key,
  schedule_id uuid not null references public.pin_schedules(id) on delete restrict,
  user_id text not null,
  pin_id uuid not null references public.pins(id) on delete restrict,
  pinterest_account_id uuid not null references public.pinterest_accounts(id) on delete restrict,
  operator_user_id uuid not null references public.users(id) on delete restrict,
  pinterest_pin_id text not null check (length(trim(pinterest_pin_id)) between 1 and 200),
  pinterest_board_id text not null check (length(trim(pinterest_board_id)) between 1 and 200),
  evidence_type text not null check (evidence_type in ('pinterest_dashboard','pinterest_api','support_confirmation')),
  evidence_reference text not null check (
    length(trim(evidence_reference)) between 8 and 200
    and trim(evidence_reference) ~ '^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,199}$'
    and position('://' in lower(trim(evidence_reference)))=0
    and lower(trim(evidence_reference)) !~ '^(www[.])?([a-z0-9-]+[.])+[a-z]{2,}(/|$)'
  ),
  before_schedule_status text not null check (before_schedule_status='unknown'),
  before_attempt_status text not null check (before_attempt_status in ('unknown','processing')),
  after_status text not null default 'published' check (after_status='published'),
  created_at timestamptz not null default clock_timestamp(),
  constraint pinterest_operator_reconciliations_schedule_unique unique(schedule_id)
);

create index if not exists pinterest_operator_reconciliations_operator_idx
  on public.pinterest_operator_reconciliations(operator_user_id,created_at desc);

alter table public.pinterest_operator_reconciliations enable row level security;
revoke all on table public.pinterest_operator_reconciliations from public,anon,authenticated,service_role;

create or replace function public.reject_pinterest_operator_reconciliation_mutation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  raise exception 'Pinterest operator reconciliations are append-only';
end;
$$;

drop trigger if exists pinterest_operator_reconciliations_no_mutation
  on public.pinterest_operator_reconciliations;
create trigger pinterest_operator_reconciliations_no_mutation
before update or delete on public.pinterest_operator_reconciliations
for each row execute function public.reject_pinterest_operator_reconciliation_mutation();

drop trigger if exists pinterest_operator_reconciliations_no_truncate
  on public.pinterest_operator_reconciliations;
create trigger pinterest_operator_reconciliations_no_truncate
before truncate on public.pinterest_operator_reconciliations
for each statement execute function public.reject_pinterest_operator_reconciliation_mutation();

revoke all on function public.reject_pinterest_operator_reconciliation_mutation()
  from public,anon,authenticated,service_role;

create or replace function public.admin_reconcile_pinterest_unknown_publication(
  p_operator_user_id uuid,
  p_schedule_id uuid,
  p_pinterest_pin_id text,
  p_pinterest_board_id text,
  p_evidence_type text,
  p_evidence_reference text,
  p_action_id uuid
) returns timestamptz
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_existing public.pinterest_operator_reconciliations%rowtype;
  v_schedule public.pin_schedules%rowtype;
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_publication public.pinterest_publications%rowtype;
  v_owner uuid;
  v_inserted integer;
  v_at timestamptz;
begin
  if p_operator_user_id is null or p_schedule_id is null or p_action_id is null
     or nullif(trim(coalesce(p_pinterest_pin_id,'')),'') is null
     or length(trim(p_pinterest_pin_id))>200
     or nullif(trim(coalesce(p_pinterest_board_id,'')),'') is null
     or length(trim(p_pinterest_board_id))>200
     or p_evidence_type not in ('pinterest_dashboard','pinterest_api','support_confirmation')
     or p_evidence_reference is null
     or length(trim(p_evidence_reference))<8
     or length(p_evidence_reference)>200
     or trim(p_evidence_reference) !~ '^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,199}$'
     or position('://' in lower(trim(p_evidence_reference)))>0
     or lower(trim(p_evidence_reference)) ~ '^(www[.])?([a-z0-9-]+[.])+[a-z]{2,}(/|$)' then
    raise exception 'invalid Pinterest reconciliation payload' using errcode='22023';
  end if;

  if not exists(select 1 from public.users where id=p_operator_user_id and is_admin is true) then
    raise exception 'administrator privileges required' using errcode='42501';
  end if;

  -- Discover target owner without locking business rows. Lock both user rows in
  -- UUID order to serialize demotions and avoid cross-target admin deadlocks.
  select user_id::uuid into v_owner from public.pin_schedules where id=p_schedule_id;
  if not found then raise exception 'Pinterest schedule not found' using errcode='P0002'; end if;

  perform 1 from public.users
   where id in (p_operator_user_id,v_owner)
   order by id for update;

  if not exists(select 1 from public.users where id=p_operator_user_id and is_admin is true) then
    raise exception 'administrator privileges required' using errcode='42501';
  end if;

  -- Exact replay is permitted only for the same actor and full payload.
  select * into v_existing from public.pinterest_operator_reconciliations
   where action_id=p_action_id;
  if found then
    if v_existing.operator_user_id is distinct from p_operator_user_id
       or v_existing.schedule_id is distinct from p_schedule_id
       or v_existing.pinterest_pin_id is distinct from trim(p_pinterest_pin_id)
       or v_existing.pinterest_board_id is distinct from trim(p_pinterest_board_id)
       or v_existing.evidence_type is distinct from p_evidence_type
       or v_existing.evidence_reference is distinct from trim(p_evidence_reference) then
      raise exception 'action id replay payload mismatch' using errcode='23505';
    end if;
    return v_existing.created_at;
  end if;

  -- Established worker lock order: account -> schedule -> attempt.
  perform 1 from public.pinterest_accounts
   where user_id=v_owner::text
     and id=(select pinterest_account_id from public.pin_schedules where id=p_schedule_id)
   for update;
  if not found then raise exception 'Pinterest account not found' using errcode='P0002'; end if;

  select * into v_schedule from public.pin_schedules
   where id=p_schedule_id and user_id=v_owner::text
   for update;
  if not found or v_schedule.status<>'unknown'
     or v_schedule.claim_token is not null
     or v_schedule.updated_at>clock_timestamp()-interval '20 minutes'
     or v_schedule.pinterest_account_id is null
     or v_schedule.pinterest_board_id is distinct from trim(p_pinterest_board_id) then
    raise exception 'Pinterest schedule is not eligible for reconciliation' using errcode='23514';
  end if;

  select * into v_attempt from public.pinterest_publish_attempts
   where pin_id=v_schedule.pin_id
     and pinterest_account_id=v_schedule.pinterest_account_id
   for update;
  if not found
     or v_attempt.user_id is distinct from v_schedule.user_id
     or v_attempt.pinterest_board_id is distinct from v_schedule.pinterest_board_id
     or v_attempt.status not in ('unknown','processing')
     or v_attempt.retry_safe is distinct from false
     or v_attempt.updated_at>clock_timestamp()-interval '20 minutes' then
    raise exception 'Pinterest publication attempt is not eligible for reconciliation' using errcode='23514';
  end if;

  if not exists (
    select 1 from public.pins p
    join public.boards b on b.id=p.board_id
    join public.projects pr on pr.id=b.project_id
    where p.id=v_schedule.pin_id and pr.user_id::text=v_schedule.user_id
  ) then
    raise exception 'Pinterest pin ownership mismatch' using errcode='42501';
  end if;

  if exists (
    select 1 from public.pinterest_publish_attempts
     where pin_id=v_schedule.pin_id and pinterest_account_id is null
  ) or exists (
    select 1 from public.pinterest_publications
     where pin_id=v_schedule.pin_id and pinterest_account_id is null
  ) then
    raise exception 'legacy account mapping prevents safe reconciliation' using errcode='23514';
  end if;

  insert into public.pinterest_publications(
    user_id,pin_id,pinterest_account_id,pinterest_pin_id,pinterest_board_id
  ) values (
    v_schedule.user_id,v_schedule.pin_id,v_schedule.pinterest_account_id,
    trim(p_pinterest_pin_id),trim(p_pinterest_board_id)
  )
  on conflict (pin_id,pinterest_account_id) where pinterest_account_id is not null do nothing;

  select * into v_publication from public.pinterest_publications
   where pin_id=v_schedule.pin_id and pinterest_account_id=v_schedule.pinterest_account_id;
  if not found
     or v_publication.user_id is distinct from v_schedule.user_id
     or v_publication.pinterest_pin_id is distinct from trim(p_pinterest_pin_id)
     or v_publication.pinterest_board_id is distinct from trim(p_pinterest_board_id) then
    raise exception 'conflicting remote Pinterest publication identity' using errcode='23514';
  end if;

  update public.pinterest_publish_attempts
     set status='published',pinterest_pin_id=trim(p_pinterest_pin_id),
         last_error=null,updated_at=clock_timestamp()
   where id=v_attempt.id;

  update public.pin_schedules
     set status='published',pinterest_pin_id=trim(p_pinterest_pin_id),
         published_at=coalesce(published_at,clock_timestamp()),
         last_error=null,next_attempt_at=null,updated_at=clock_timestamp()
   where id=v_schedule.id and status='unknown';

  if not found then raise exception 'Pinterest schedule changed during reconciliation' using errcode='40001'; end if;

  v_at:=clock_timestamp();
  insert into public.pinterest_operator_reconciliations(
    action_id,schedule_id,user_id,pin_id,pinterest_account_id,operator_user_id,
    pinterest_pin_id,pinterest_board_id,evidence_type,evidence_reference,
    before_schedule_status,before_attempt_status,after_status,created_at
  ) values (
    p_action_id,v_schedule.id,v_schedule.user_id,v_schedule.pin_id,
    v_schedule.pinterest_account_id,p_operator_user_id,
    trim(p_pinterest_pin_id),trim(p_pinterest_board_id),p_evidence_type,
    trim(p_evidence_reference),'unknown',v_attempt.status,'published',v_at
  );
  return v_at;
end;
$$;

revoke all on function public.admin_reconcile_pinterest_unknown_publication(uuid,uuid,text,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.admin_reconcile_pinterest_unknown_publication(uuid,uuid,text,text,text,text,uuid)
  to service_role;
