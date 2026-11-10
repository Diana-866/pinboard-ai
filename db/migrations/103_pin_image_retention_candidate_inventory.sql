-- 103_pin_image_retention_candidate_inventory.sql
-- Read-only, bounded inventory of generated image journal references that are
-- older than the proposed retention window and have no live application refs.
-- This does not expire idempotency keys or delete Storage objects.

create or replace function public.list_pin_image_retention_candidates(
  p_retention_days integer default 90,
  p_limit integer default 100
)
returns table (
  bucket_id text,
  object_path text,
  reference_count bigint,
  source_types text[],
  oldest_reference_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_cutoff timestamptz;
begin
  if p_retention_days is null or p_retention_days < 30 or p_retention_days > 3650
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid pin image retention inventory bounds';
  end if;

  v_cutoff := now() - make_interval(days => p_retention_days);

  return query
  with journal_references as (
    select
      public.managed_pin_image_object_path(t.storage_url) as object_path,
      'generation_task'::text as source_type,
      t.created_at as referenced_at
    from public.pin_generation_tasks t
    join public.pin_generation_requests r on r.id = t.generation_request_id
    where r.status = 'completed'
      and r.updated_at <= v_cutoff
      and t.storage_url is not null

    union all

    select
      public.managed_pin_image_object_path(item.value ->> 'image_url') as object_path,
      'generation_result'::text as source_type,
      r.updated_at as referenced_at
    from public.pin_generation_requests r
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(r.pins) = 'array' then r.pins else '[]'::jsonb end
    ) as item(value)
    where r.status = 'completed'
      and r.updated_at <= v_cutoff
      and item.value ? 'image_url'

    union all

    select
      public.managed_pin_image_object_path(g.storage_url) as object_path,
      'regeneration_result'::text as source_type,
      g.created_at as referenced_at
    from public.pin_regeneration_requests g
    where g.status = 'completed'
      and g.updated_at <= v_cutoff
      and g.storage_url is not null
  ),
  grouped as (
    select
      jr.object_path,
      count(*) as reference_count,
      array_agg(distinct jr.source_type order by jr.source_type) as source_types,
      min(jr.referenced_at) as oldest_reference_at
    from journal_references jr
    where jr.object_path is not null
    group by jr.object_path
  )
  select
    'pin-images'::text,
    grouped.object_path,
    grouped.reference_count,
    grouped.source_types,
    grouped.oldest_reference_at
  from grouped
  join public.pin_image_object_lifecycle lifecycle
    on lifecycle.bucket_id = 'pin-images'
   and lifecycle.object_path = grouped.object_path
   and lifecycle.state in ('active', 'delete_failed')
  where not exists (
      select 1 from public.pins p
       where public.managed_pin_image_object_path(p.image_url) = grouped.object_path
    )
    and not exists (
      select 1 from public.pin_schedules s
       where s.status <> 'cancelled'
         and public.managed_pin_image_object_path(s.snapshot_image_url) = grouped.object_path
    )
    and not exists (
      select 1
        from public.pin_generation_tasks t
        join public.pin_generation_requests r on r.id = t.generation_request_id
       where public.managed_pin_image_object_path(t.storage_url) = grouped.object_path
         and (r.status <> 'completed' or r.updated_at > v_cutoff)
    )
    and not exists (
      select 1 from public.pin_regeneration_requests g
       where public.managed_pin_image_object_path(g.storage_url) = grouped.object_path
         and (g.status <> 'completed' or g.updated_at > v_cutoff)
    )
    and not exists (
      select 1
        from public.pin_generation_requests r
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(r.pins) = 'array' then r.pins else '[]'::jsonb end
        ) as item(value)
       where public.managed_pin_image_object_path(item.value ->> 'image_url') = grouped.object_path
         and (r.status <> 'completed' or r.updated_at > v_cutoff)
    )
  order by grouped.oldest_reference_at asc, grouped.object_path asc
  limit p_limit;
end;
$function$;

revoke all on function public.list_pin_image_retention_candidates(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_pin_image_retention_candidates(integer, integer)
  to service_role;
