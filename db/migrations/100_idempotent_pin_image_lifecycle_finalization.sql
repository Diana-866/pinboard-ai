-- 100_idempotent_pin_image_lifecycle_finalization.sql
-- A database response can be lost after a lifecycle finalization committed.
-- Persist the exact fencing token so replay can confirm only that same terminal result.
alter table public.pin_image_object_lifecycle
  add column if not exists last_finalized_token uuid;

create or replace function public.finalize_pin_image_upload(
  p_bucket_id text,
  p_object_path text,
  p_upload_token uuid,
  p_uploaded boolean,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_error_code text;
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null or p_upload_token is null or p_uploaded is null then
    raise exception 'invalid pin image upload finalization';
  end if;

  v_error_code := case when p_uploaded then null
    else left(regexp_replace(coalesce(p_error_code, 'storage_upload_failed'),
                             '[^a-zA-Z0-9_.-]', '_', 'g'), 64)
  end;

  update public.pin_image_object_lifecycle
     set state = 'active',
         claim_token = null,
         claim_expires_at = null,
         last_finalized_token = p_upload_token,
         last_error_code = v_error_code,
         updated_at = now()
   where bucket_id = p_bucket_id
     and object_path = p_object_path
     and state = 'uploading'
     and claim_token = p_upload_token;

  if found then
    return true;
  end if;

  -- Idempotent acknowledgement after a lost response. A different/newer
  -- reservation has a different last_finalized_token and cannot be confirmed.
  return exists (
    select 1
      from public.pin_image_object_lifecycle
     where bucket_id = p_bucket_id
       and object_path = p_object_path
       and state = 'active'
       and claim_token is null
       and claim_expires_at is null
       and last_finalized_token = p_upload_token
       and last_error_code is not distinct from v_error_code
  );
end;
$function$;

create or replace function public.finalize_pin_image_deletion(
  p_bucket_id text,
  p_object_path text,
  p_claim_token uuid,
  p_deleted boolean,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_error_code text;
  v_terminal_state text;
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null or p_claim_token is null or p_deleted is null then
    raise exception 'invalid pin image deletion finalization';
  end if;

  v_terminal_state := case when p_deleted then 'deleted' else 'delete_failed' end;
  v_error_code := case when p_deleted then null
    else left(regexp_replace(coalesce(p_error_code, 'storage_delete_failed'),
                             '[^a-zA-Z0-9_.-]', '_', 'g'), 64)
  end;

  update public.pin_image_object_lifecycle
     set state = v_terminal_state,
         claim_token = null,
         claim_expires_at = null,
         last_finalized_token = p_claim_token,
         last_error_code = v_error_code,
         updated_at = now()
   where bucket_id = p_bucket_id
     and object_path = p_object_path
     and state = 'deleting'
     and claim_token = p_claim_token;

  if found then
    return true;
  end if;

  -- A replay is accepted only for the same token and same terminal outcome.
  return exists (
    select 1
      from public.pin_image_object_lifecycle
     where bucket_id = p_bucket_id
       and object_path = p_object_path
       and state = v_terminal_state
       and claim_token is null
       and claim_expires_at is null
       and last_finalized_token = p_claim_token
       and last_error_code is not distinct from v_error_code
  );
end;
$function$;

revoke all on function public.finalize_pin_image_upload(text,text,uuid,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_pin_image_upload(text,text,uuid,boolean,text)
  to service_role;
revoke all on function public.finalize_pin_image_deletion(text,text,uuid,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_pin_image_deletion(text,text,uuid,boolean,text)
  to service_role;
