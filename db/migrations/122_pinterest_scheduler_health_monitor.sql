-- 122_pinterest_scheduler_health_monitor.sql
-- AUD-361: persist only the latest scheduler invocation metadata; no user, pin,
-- board, token, request body, or Pinterest response data is stored.
begin;

create table if not exists public.pinterest_scheduler_monitor (
  singleton_key text primary key check (singleton_key = 'pinterest_scheduler'),
  last_run_id uuid,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  status text not null default 'never'
    check (status in ('never', 'running', 'succeeded', 'failed')),
  claimed integer not null default 0 check (claimed >= 0),
  published integer not null default 0 check (published >= 0),
  failed integer not null default 0 check (failed >= 0),
  scheduled integer not null default 0 check (scheduled >= 0),
  unknown integer not null default 0 check (unknown >= 0),
  last_error_code text,
  updated_at timestamptz not null default now()
);

insert into public.pinterest_scheduler_monitor (singleton_key)
values ('pinterest_scheduler')
on conflict (singleton_key) do nothing;

alter table public.pinterest_scheduler_monitor enable row level security;
revoke all on table public.pinterest_scheduler_monitor from public, anon, authenticated;
grant select on table public.pinterest_scheduler_monitor to service_role;

create or replace function public.begin_pinterest_scheduler_run(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_run_id is null then raise exception 'scheduler run id is required'; end if;
  update public.pinterest_scheduler_monitor
     set last_run_id = p_run_id,
         last_started_at = clock_timestamp(),
         status = 'running',
         claimed = 0, published = 0, failed = 0, scheduled = 0, unknown = 0,
         last_error_code = null,
         updated_at = clock_timestamp()
   where singleton_key = 'pinterest_scheduler'
     and (
       status <> 'running'
       or last_started_at < clock_timestamp() - interval '20 minutes'
     );
  return found;
end;
$$;

create or replace function public.complete_pinterest_scheduler_run(
  p_run_id uuid, p_status text, p_claimed integer default 0,
  p_published integer default 0, p_failed integer default 0,
  p_scheduled integer default 0, p_unknown integer default 0
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_run_id is null or p_status not in ('succeeded', 'failed') then
    raise exception 'invalid scheduler completion';
  end if;
  if coalesce(p_claimed, 0) < 0 or coalesce(p_published, 0) < 0
     or coalesce(p_failed, 0) < 0 or coalesce(p_scheduled, 0) < 0
     or coalesce(p_unknown, 0) < 0 then
    raise exception 'invalid scheduler counters';
  end if;
  update public.pinterest_scheduler_monitor
     set status = p_status,
         last_completed_at = clock_timestamp(),
         claimed = greatest(0, coalesce(p_claimed, 0)),
         published = greatest(0, coalesce(p_published, 0)),
         failed = greatest(0, coalesce(p_failed, 0)),
         scheduled = greatest(0, coalesce(p_scheduled, 0)),
         unknown = greatest(0, coalesce(p_unknown, 0)),
         last_error_code = case when p_status = 'failed' then 'worker_run_failed' else null end,
         updated_at = clock_timestamp()
   where singleton_key = 'pinterest_scheduler'
     and last_run_id = p_run_id;
  return found;
end;
$$;

revoke all on function public.begin_pinterest_scheduler_run(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_pinterest_scheduler_run(uuid,text,integer,integer,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.begin_pinterest_scheduler_run(uuid) to service_role;
grant execute on function public.complete_pinterest_scheduler_run(uuid,text,integer,integer,integer,integer,integer)
  to service_role;

commit;
