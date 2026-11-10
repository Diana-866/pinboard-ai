-- 083_quarantine_expired_pin_image_deletions.sql
-- An expired external Storage delete may still be in flight. A new claim token
-- fences database finalization only; it cannot cancel the old remote side effect.
-- Permanently retire expired deleting paths instead of retrying/reopening them.

create or replace function public.claim_pin_image_deletion(
  p_bucket_id text,
  p_object_path text,
  p_claim_ttl_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state text;
  v_claim_expires_at timestamptz;
  v_token uuid;
  v_has_reference boolean;
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null
     or p_object_path !~* '^pins/(?:[0-9]+-[a-z0-9]{1,16}|generation-[a-f0-9]{32})[.](?:png|jpe?g|webp|gif)$'
     or p_claim_ttl_seconds is null
     or p_claim_ttl_seconds < 60 or p_claim_ttl_seconds > 1800 then
    raise exception 'invalid pin image deletion claim';
  end if;

  insert into public.pin_image_object_lifecycle(bucket_id, object_path, state)
  values (p_bucket_id, p_object_path, 'active')
  on conflict (bucket_id, object_path) do nothing;

  select state, claim_expires_at
    into v_state, v_claim_expires_at
    from public.pin_image_object_lifecycle
   where bucket_id = p_bucket_id and object_path = p_object_path
   for update;

  if v_state = 'uploading' then
    return jsonb_build_object('claimed', false, 'reason', 'upload_in_progress');
  end if;

  if v_state = 'deleting' then
    if v_claim_expires_at > now() then
      return jsonb_build_object('claimed', false, 'reason', 'already_claimed');
    end if;

    -- Never retry an expired external delete. Its original request may still
    -- complete after this transaction, and a second 4xx response cannot prove
    -- that the first request has terminated. Quarantine is permanent: no new
    -- references, uploads, or automatic deletes may reuse this object key.
    update public.pin_image_object_lifecycle
       set state = 'quarantined',
           claim_token = null,
           claim_expires_at = null,
           last_error_code = 'stale_delete_quarantined',
           updated_at = now()
     where bucket_id = p_bucket_id
       and object_path = p_object_path
       and state = 'deleting'
       and (claim_expires_at is null or claim_expires_at <= now());

    return jsonb_build_object('claimed', false, 'reason', 'path_quarantined');
  end if;

  if v_state = 'deleted' then
    return jsonb_build_object('claimed', false, 'reason', 'already_deleted');
  end if;
  if v_state = 'quarantined' then
    return jsonb_build_object('claimed', false, 'reason', 'path_quarantined');
  end if;

  select
    exists (select 1 from public.pins p
             where public.managed_pin_image_object_path(p.image_url) = p_object_path)
    or exists (select 1 from public.pin_schedules s
                where s.status <> 'cancelled'
                  and public.managed_pin_image_object_path(s.snapshot_image_url) = p_object_path)
    or exists (select 1 from public.pin_generation_tasks t
                where public.managed_pin_image_object_path(t.storage_url) = p_object_path)
    or exists (select 1 from public.pin_regeneration_requests r
                where public.managed_pin_image_object_path(r.storage_url) = p_object_path)
    into v_has_reference;

  if v_has_reference then
    update public.pin_image_object_lifecycle
       set state = 'active', updated_at = now()
     where bucket_id = p_bucket_id and object_path = p_object_path;
    return jsonb_build_object('claimed', false, 'reason', 'referenced');
  end if;

  v_token := gen_random_uuid();
  update public.pin_image_object_lifecycle
     set state = 'deleting',
         claim_token = v_token,
         claim_expires_at = now() + make_interval(secs => p_claim_ttl_seconds),
         attempts = attempts + 1,
         last_error_code = null,
         updated_at = now()
   where bucket_id = p_bucket_id and object_path = p_object_path;

  return jsonb_build_object(
    'claimed', true,
    'claim_token', v_token,
    'claim_expires_at', now() + make_interval(secs => p_claim_ttl_seconds)
  );
end;
$$;

revoke all on function public.claim_pin_image_deletion(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.claim_pin_image_deletion(text,text,integer)
  to service_role;
