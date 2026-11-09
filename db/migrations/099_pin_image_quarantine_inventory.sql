-- 099_pin_image_quarantine_inventory.sql
-- Read-only operator inventory for permanently retired image paths. Quarantine
-- is intentionally irreversible automatically: a late Storage request may
-- still complete, so this RPC only reports state and reference visibility.

create or replace function public.list_quarantined_pin_image_objects(
  p_limit integer default 50
)
returns table (
  bucket_id text,
  object_path text,
  attempts integer,
  last_error_code text,
  updated_at timestamptz,
  has_reference boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid quarantined pin image inventory limit';
  end if;

  return query
  select
    lifecycle.bucket_id,
    lifecycle.object_path,
    lifecycle.attempts,
    lifecycle.last_error_code,
    lifecycle.updated_at,
    (
      exists (select 1 from public.pins p
               where public.managed_pin_image_object_path(p.image_url) = lifecycle.object_path)
      or exists (select 1 from public.pin_schedules s
                  where s.status <> 'cancelled'
                    and public.managed_pin_image_object_path(s.snapshot_image_url) = lifecycle.object_path)
      or exists (select 1 from public.pin_generation_tasks t
                  where public.managed_pin_image_object_path(t.storage_url) = lifecycle.object_path)
      or exists (select 1 from public.pin_regeneration_requests r
                  where public.managed_pin_image_object_path(r.storage_url) = lifecycle.object_path)
    ) as has_reference
  from public.pin_image_object_lifecycle lifecycle
  where lifecycle.bucket_id = 'pin-images'
    and lifecycle.state = 'quarantined'
  order by lifecycle.updated_at asc, lifecycle.object_path asc
  limit p_limit;
end;
$function$;

revoke all on function public.list_quarantined_pin_image_objects(integer) from public, anon, authenticated;
grant execute on function public.list_quarantined_pin_image_objects(integer) to service_role;
