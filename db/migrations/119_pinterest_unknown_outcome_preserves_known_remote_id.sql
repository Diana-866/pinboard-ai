-- 119_pinterest_unknown_outcome_preserves_known_remote_id.sql
-- Preserve a Pinterest Pin ID when the remote POST succeeded but local
-- publication completion could not be confirmed. The attempt remains unknown
-- and non-retryable until the exact publication is reconciled.

create or replace function public.record_pinterest_publish_unknown_v2(
  p_user_id text,
  p_pin_id uuid,
  p_pinterest_account_id uuid,
  p_pinterest_board_id text,
  p_pinterest_pin_id text,
  p_error text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_remote_id text := nullif(btrim(coalesce(p_pinterest_pin_id, '')), '');
  v_board_id text := nullif(btrim(coalesce(p_pinterest_board_id, '')), '');
begin
  if nullif(btrim(coalesce(p_user_id, '')), '') is null
     or p_pin_id is null
     or p_pinterest_account_id is null
     or v_board_id is null or length(v_board_id) > 200
     or v_remote_id is null or length(v_remote_id) > 200 then
    raise exception 'invalid Pinterest publication outcome identity' using errcode = '22023';
  end if;

  select * into v_attempt
    from public.pinterest_publish_attempts
   where user_id = p_user_id
     and pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id
   for update;

  if not found
     or v_attempt.pinterest_board_id is distinct from v_board_id
     or (v_attempt.pinterest_pin_id is not null and v_attempt.pinterest_pin_id is distinct from v_remote_id) then
    raise exception 'Pinterest publication attempt identity mismatch' using errcode = '23514';
  end if;

  if v_attempt.status = 'published' then
    -- A concurrent completion may have won. Never downgrade confirmed success.
    if v_attempt.pinterest_pin_id is distinct from v_remote_id then
      raise exception 'conflicting remote Pinterest publication identity' using errcode = '23514';
    end if;
    return true;
  end if;

  if v_attempt.status not in ('processing', 'unknown') then
    raise exception 'Pinterest publication attempt is not awaiting outcome' using errcode = '23514';
  end if;

  update public.pinterest_publish_attempts
     set status = 'unknown',
         retry_safe = false,
         pinterest_pin_id = v_remote_id,
         last_error = left(coalesce(p_error, 'Pinterest created the pin but local completion is unconfirmed'), 500),
         updated_at = clock_timestamp()
   where id = v_attempt.id;

  return true;
end;
$$;

revoke all on function public.record_pinterest_publish_unknown_v2(text,uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.record_pinterest_publish_unknown_v2(text,uuid,uuid,text,text,text)
  to service_role;
