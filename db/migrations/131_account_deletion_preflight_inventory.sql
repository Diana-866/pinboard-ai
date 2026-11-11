-- 131_account_deletion_preflight_inventory.sql
-- Persist the read-only inventory under the active worker lease before the
-- preflight job can be marked successful.
begin;

alter table public.account_deletion_jobs
  add column if not exists inventory jsonb,
  add column if not exists inventory_recorded_at timestamptz;

create or replace function public.record_account_deletion_preflight(
  p_job_id uuid,
  p_claim_token uuid,
  p_inventory jsonb
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_request_id uuid;
  v_request_state text;
  v_job public.account_deletion_jobs%rowtype;
begin
  if p_job_id is null or p_claim_token is null or p_inventory is null
     or jsonb_typeof(p_inventory) is distinct from 'object'
     or p_inventory->>'ok' is distinct from 'true'
     or jsonb_typeof(p_inventory->'counts') is distinct from 'object' then
    raise exception 'invalid account deletion inventory';
  end if;

  select r.user_id, r.id into v_user_id, v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id = j.request_id
   where j.id = p_job_id;
  if not found then return false; end if;

  perform 1 from public.users where id = v_user_id for update;
  if not found then return false; end if;

  select r.state into v_request_state
    from public.account_deletion_requests r
   where r.id = v_request_id for update;
  if not found or v_request_state <> 'pending' then return false; end if;

  select * into v_job from public.account_deletion_jobs
   where id = p_job_id for update;
  if not found or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at <= clock_timestamp() then
    return false;
  end if;

  update public.account_deletion_jobs
     set inventory = p_inventory,
         inventory_recorded_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where id = p_job_id;
  return true;
end;
$record_inventory$;


create or replace function public.require_account_deletion_preflight_inventory()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $require_inventory$
begin
  if new.step_key = 'preflight' and new.status = 'succeeded'
     and old.status is distinct from 'succeeded'
     and (new.inventory is null or new.inventory_recorded_at is null) then
    raise exception 'account deletion preflight inventory is required';
  end if;
  return new;
end;
$require_inventory$;

drop trigger if exists account_deletion_preflight_inventory_required
  on public.account_deletion_jobs;
create trigger account_deletion_preflight_inventory_required
before update of status on public.account_deletion_jobs
for each row execute function public.require_account_deletion_preflight_inventory();

revoke all on function public.require_account_deletion_preflight_inventory()
  from public, anon, authenticated, service_role;

revoke all on function public.record_account_deletion_preflight(uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_account_deletion_preflight(uuid,uuid,jsonb)
  to service_role;

commit;
