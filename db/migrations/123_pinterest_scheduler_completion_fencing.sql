-- 123_pinterest_scheduler_completion_fencing.sql
-- A scheduler run is terminal once completed. A retry after a lost PostgREST
-- response must not overwrite a committed success with a synthetic failure.
begin;

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
  if p_run_id is null or p_status is null or p_status not in ('succeeded', 'failed') then
    raise exception 'invalid scheduler completion';
  end if;
  if coalesce(p_claimed, 0) < 0 or coalesce(p_published, 0) < 0
     or coalesce(p_failed, 0) < 0 or coalesce(p_scheduled, 0) < 0
     or coalesce(p_unknown, 0) < 0 then
    raise exception 'invalid scheduler counters';
  end if;

  -- The run UUID fences superseded workers; status='running' makes completion
  -- immutable after the first successful terminal write.
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
     and last_run_id = p_run_id
     and status = 'running';
  return found;
end;
$$;

commit;
