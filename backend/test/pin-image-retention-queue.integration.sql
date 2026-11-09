-- Queue worker leases and fencing (migration 109).
begin;
do $body$
declare
  v_path text := 'pins/1730000000000-abcdef0123456789abcdef0123456789.webp';
  v_claim jsonb;
  v_finalized boolean;
begin
  insert into public.pin_image_retention_queue(bucket_id, object_path, state)
  values ('pin-images', v_path, 'pending');

  select c into v_claim
    from public.claim_pin_image_retention_queue(1, 900) c;
  if v_claim is null
     or v_claim ->> 'bucket_id' <> 'pin-images'
     or v_claim ->> 'object_path' <> v_path
     or nullif(v_claim ->> 'claim_token','') is null then
    raise exception 'queue worker did not issue a fenced claim: %', v_claim;
  end if;

  v_finalized := public.finalize_pin_image_retention_queue_item(
    'pin-images', v_path, (v_claim ->> 'claim_token')::uuid, true, null
  );
  if v_finalized is distinct from true then
    raise exception 'valid queue lease could not be finalized';
  end if;
  if not exists (
    select 1 from public.pin_image_retention_queue
     where bucket_id = 'pin-images' and object_path = v_path
       and state = 'completed' and claim_token is null and claim_expires_at is null
  ) then
    raise exception 'completed queue item retained a lease or wrong state';
  end if;

  v_finalized := public.finalize_pin_image_retention_queue_item(
    'pin-images', v_path, (v_claim ->> 'claim_token')::uuid, true, null
  );
  if v_finalized is distinct from false then
    raise exception 'stale queue token finalized an already completed item';
  end if;

  if not has_function_privilege('service_role',
       'public.claim_pin_image_retention_queue(integer,integer)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.claim_pin_image_retention_queue(integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.claim_pin_image_retention_queue(integer,integer)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.finalize_pin_image_retention_queue_item(text,text,uuid,boolean,text)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.finalize_pin_image_retention_queue_item(text,text,uuid,boolean,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.finalize_pin_image_retention_queue_item(text,text,uuid,boolean,text)', 'EXECUTE') then
    raise exception 'queue worker RPC privileges are incorrect';
  end if;

  -- Malformed queue paths can be marked blocked under their lease token,
  -- but must never be treated as completed or sent to Storage.
  insert into public.pin_image_retention_queue(bucket_id, object_path, state)
  values ('pin-images', 'foreign/object.webp', 'pending');
  select c into v_claim
    from public.claim_pin_image_retention_queue(1, 900) c;
  if v_claim ->> 'object_path' <> 'foreign/object.webp' then
    raise exception 'malformed queue row was not claimed for fail-closed handling: %', v_claim;
  end if;
  v_finalized := public.finalize_pin_image_retention_queue_item(
    'pin-images', 'foreign/object.webp', (v_claim ->> 'claim_token')::uuid, false, 'invalid_path'
  );
  if v_finalized is distinct from true or not exists (
    select 1 from public.pin_image_retention_queue
     where bucket_id = 'pin-images' and object_path = 'foreign/object.webp'
       and state = 'blocked'
  ) then
    raise exception 'malformed queue row was not safely blocked';
  end if;

  begin
    perform public.claim_pin_image_retention_queue(26, 900);
    raise exception 'queue claim accepted a batch above 25';
  exception when raise_exception then
    if sqlerrm = 'queue claim accepted a batch above 25' then raise; end if;
  end;
end;
$body$;
rollback;
