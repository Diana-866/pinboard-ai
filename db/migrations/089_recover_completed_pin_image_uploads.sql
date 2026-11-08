-- 089_recover_completed_pin_image_uploads.sql
-- Resolve a deterministic generation object only after its upload reservation
-- has been finalized. Storage existence is verified by the backend separately.
create or replace function public.find_completed_pin_image_upload(p_bucket_id text, p_idempotency_key text)
returns text language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_digest text; v_path text;
begin
  if p_bucket_id is distinct from 'pin-images' or p_idempotency_key is null
     or length(p_idempotency_key) < 1 or length(p_idempotency_key) > 128 then
    raise exception 'invalid completed pin image lookup';
  end if;
  v_digest := substr(encode(digest(p_idempotency_key, 'sha256'), 'hex'), 1, 32);
  select l.object_path into v_path from public.pin_image_object_lifecycle l
   where l.bucket_id = p_bucket_id and l.state = 'active'
     and l.object_path ~ ('^pins/generation-' || v_digest || '[.](png|jpe?g|webp|gif)$')
   order by l.updated_at desc limit 1;
  return v_path;
end;
$$;
revoke all on function public.find_completed_pin_image_upload(text,text) from public, anon, authenticated;
grant execute on function public.find_completed_pin_image_upload(text,text) to service_role;
