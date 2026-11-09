-- 109_pin_image_retention_queue_worker.sql
-- Crash-safe queue leases. An expired processing lease is blocked, never
-- reissued: the remote Storage DELETE may still be in flight.
create or replace function public.claim_pin_image_retention_queue(
  p_limit integer default 10,
  p_claim_ttl_seconds integer default 900
) returns setof jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_row record;
  v_token uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 25
     or p_claim_ttl_seconds is null
     or p_claim_ttl_seconds < 120 or p_claim_ttl_seconds > 1800 then
    raise exception 'invalid retention queue claim parameters';
  end if;

  -- Never reclaim an expired external-operation lease. The old DELETE may
  -- still finish later; permanently block this queue item for reconciliation.
  update public.pin_image_retention_queue
     set state = 'blocked', claim_token = null, claim_expires_at = null,
         last_error_code = 'stale_retention_worker_lease',
         updated_at = clock_timestamp()
   where state = 'processing'
     and claim_expires_at <= clock_timestamp();

  for v_row in
    select q.bucket_id, q.object_path
      from public.pin_image_retention_queue q
     where q.state = 'pending' and q.next_attempt_at <= clock_timestamp()
     order by q.next_attempt_at, q.created_at
     limit p_limit
     for update skip locked
  loop
    v_token := gen_random_uuid();
    update public.pin_image_retention_queue q
       set state = 'processing', claim_token = v_token,
           claim_expires_at = clock_timestamp() + make_interval(secs => p_claim_ttl_seconds),
           attempts = attempts + 1, last_error_code = null,
           updated_at = clock_timestamp()
     where q.bucket_id = v_row.bucket_id and q.object_path = v_row.object_path;
    return next jsonb_build_object(
      'bucket_id', v_row.bucket_id,
      'object_path', v_row.object_path,
      'claim_token', v_token
    );
  end loop;
end;
$function$;

create or replace function public.finalize_pin_image_retention_queue_item(
  p_bucket_id text,
  p_object_path text,
  p_claim_token uuid,
  p_completed boolean,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_rows integer;
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null
     or p_object_path !~* '^pins/(?:[0-9]+-[a-z0-9]{1,32}|generation-[a-f0-9]{32})[.](?:png|jpe?g|webp|gif)$'
     or p_claim_token is null then
    raise exception 'invalid retention queue finalization';
  end if;

  update public.pin_image_retention_queue
     set state = case when p_completed then 'completed' else 'blocked' end,
         claim_token = null, claim_expires_at = null,
         last_error_code = case when p_completed then null
           else left(coalesce(p_error_code, 'retention_delete_unresolved'), 64) end,
         updated_at = clock_timestamp()
   where bucket_id = p_bucket_id and object_path = p_object_path
     and state = 'processing' and claim_token = p_claim_token
     and claim_expires_at > clock_timestamp();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$function$;

revoke all on function public.claim_pin_image_retention_queue(integer,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_pin_image_retention_queue_item(text,text,uuid,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_pin_image_retention_queue(integer,integer)
  to service_role;
grant execute on function public.finalize_pin_image_retention_queue(text,text,uuid,boolean,text)
  to service_role;
