-- 101_retryable_pin_image_deletion_inventory.sql
-- Expose only definitively failed deletions for bounded, operator-triggered retries.
create or replace function public.list_failed_pin_image_deletions(p_limit integer default 25)
returns table (
  bucket_id text,
  object_path text,
  attempts integer,
  last_error_code text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid failed pin image deletion inventory limit';
  end if;

  return query
  select l.bucket_id, l.object_path, l.attempts, l.last_error_code, l.updated_at
    from public.pin_image_object_lifecycle l
   where l.bucket_id = 'pin-images'
     and l.state = 'delete_failed'
   order by l.updated_at asc, l.object_path asc
   limit p_limit;
end;
$function$;

revoke all on function public.list_failed_pin_image_deletions(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_failed_pin_image_deletions(integer)
  to service_role;
