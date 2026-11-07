-- 072_provider_refund_reconciliation_settlement_guard.sql
-- A terminal provider failure is not financially reconciled until GPTunnel
-- explicitly reports whether the provider charge was refunded. Never release
-- or settle the user's reservation while that fact is still unknown.

create or replace function public.guard_generation_provider_refund_reconciliation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.status in ('failed','completed') and old.status is distinct from new.status then
    if exists (
      select 1
        from public.pin_generation_tasks t
       where t.generation_request_id=new.id
         and t.provider_task_id is not null
         and (
           t.provider_outcome_status is distinct from 'failed'
           or t.provider_reconciled_at is null
         )
    ) then
      raise exception 'generation provider refund reconciliation is incomplete';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_generation_provider_refund_reconciliation()
  from public,anon,authenticated,service_role;

drop trigger if exists pin_generation_provider_refund_reconciliation_guard
  on public.pin_generation_requests;
create trigger pin_generation_provider_refund_reconciliation_guard
before update of status on public.pin_generation_requests
for each row
execute function public.guard_generation_provider_refund_reconciliation();

create or replace function public.guard_regeneration_provider_refund_reconciliation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
begin
  if new.status='failed' and old.status is distinct from 'failed'
     and new.provider_task_id is not null
     and (
       new.provider_status is distinct from 'failed'
       or new.provider_reconciled_at is null
     ) then
    raise exception 'regeneration provider refund reconciliation is incomplete';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_regeneration_provider_refund_reconciliation()
  from public,anon,authenticated,service_role;

drop trigger if exists pin_regeneration_provider_refund_reconciliation_guard
  on public.pin_regeneration_requests;
create trigger pin_regeneration_provider_refund_reconciliation_guard
before update of status on public.pin_regeneration_requests
for each row
execute function public.guard_regeneration_provider_refund_reconciliation();
