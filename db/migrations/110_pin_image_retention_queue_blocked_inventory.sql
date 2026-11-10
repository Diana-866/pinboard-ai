-- 110_pin_image_retention_queue_blocked_inventory.sql
-- Read-only operator diagnostics for queue items that cannot be retried safely.
create or replace function public.list_blocked_pin_image_retention_queue(
  p_limit integer default 50
)
returns table (
  bucket_id text, object_path text, source_types text[], attempts integer,
  last_error_code text, queue_created_at timestamptz, queue_updated_at timestamptz,
  lifecycle_state text, lifecycle_attempts integer, lifecycle_error_code text,
  lifecycle_updated_at timestamptz, has_reference boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid blocked retention queue inventory limit';
  end if;

  return query
  select q.bucket_id, q.object_path, q.source_types, q.attempts, q.last_error_code,
         q.created_at, q.updated_at, lifecycle.state, lifecycle.attempts,
         lifecycle.last_error_code, lifecycle.updated_at,
         (
           exists (select 1 from public.pins p
                    where public.managed_pin_image_object_path(p.image_url) = q.object_path)
           or exists (select 1 from public.pin_schedules s
                       where s.status <> 'cancelled'
                         and public.managed_pin_image_object_path(s.snapshot_image_url) = q.object_path)
           or exists (select 1 from public.pin_generation_tasks t
                       where public.managed_pin_image_object_path(t.storage_url) = q.object_path)
           or exists (select 1 from public.pin_generation_requests r
                       cross join lateral jsonb_array_elements(
                         case when jsonb_typeof(r.pins) = 'array' then r.pins else '[]'::jsonb end
                       ) item(value)
                      where public.managed_pin_image_object_path(item.value ->> 'image_url') = q.object_path)
           or exists (select 1 from public.pin_regeneration_requests r
                       where public.managed_pin_image_object_path(r.storage_url) = q.object_path
                          or public.managed_pin_image_object_path(r.result_pin ->> 'image_url') = q.object_path)
         ) as has_reference
    from public.pin_image_retention_queue q
    left join public.pin_image_object_lifecycle lifecycle
      on lifecycle.bucket_id = q.bucket_id and lifecycle.object_path = q.object_path
   where q.bucket_id = 'pin-images' and q.state = 'blocked'
   order by q.updated_at asc, q.object_path asc
   limit p_limit;
end;
$function$;

revoke all on function public.list_blocked_pin_image_retention_queue(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_blocked_pin_image_retention_queue(integer)
  to service_role;
