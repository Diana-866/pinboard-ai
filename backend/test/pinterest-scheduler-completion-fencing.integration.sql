-- AUD-364: run after migrations 122 and 123 in a disposable PostgreSQL database.
-- Verifies duplicate completion idempotency and stale-run fencing.
do $$
declare
  v_run_a uuid := gen_random_uuid();
  v_run_b uuid := gen_random_uuid();
  v_ok boolean;
  v_status text;
  v_current uuid;
begin
  select public.begin_pinterest_scheduler_run(v_run_a) into v_ok;
  if not v_ok then raise exception 'first scheduler run did not acquire monitor'; end if;

  select public.complete_pinterest_scheduler_run(v_run_a, 'succeeded', 1, 1, 0, 0, 0) into v_ok;
  if not v_ok then raise exception 'first completion was not accepted'; end if;

  select public.complete_pinterest_scheduler_run(v_run_a, 'failed', 1, 0, 1, 0, 0) into v_ok;
  if v_ok then raise exception 'duplicate terminal completion unexpectedly changed status'; end if;

  select status, last_run_id into v_status, v_current
    from public.pinterest_scheduler_monitor
   where singleton_key = 'pinterest_scheduler';
  if v_status <> 'succeeded' or v_current <> v_run_a then
    raise exception 'duplicate completion overwrote terminal success';
  end if;

  select public.begin_pinterest_scheduler_run(v_run_b) into v_ok;
  if not v_ok then raise exception 'second scheduler run did not acquire monitor'; end if;

  select public.complete_pinterest_scheduler_run(v_run_a, 'failed', 1, 0, 1, 0, 0) into v_ok;
  if v_ok then raise exception 'superseded run unexpectedly completed current monitor'; end if;

  select public.complete_pinterest_scheduler_run(v_run_b, 'succeeded', 0, 0, 0, 0, 0) into v_ok;
  if not v_ok then raise exception 'current scheduler run did not complete'; end if;

  select status, last_run_id into v_status, v_current
    from public.pinterest_scheduler_monitor
   where singleton_key = 'pinterest_scheduler';
  if v_status <> 'succeeded' or v_current <> v_run_b then
    raise exception 'current run result was not preserved';
  end if;
  raise notice 'AUD-364 scheduler completion fencing checks passed';
end;
$$;
