-- 100_pinterest_publish_completion_clears_claim.sql
-- AUD-292: release the worker claim atomically with the published schedule state.
-- 081_pinterest_publish_completion_board_integrity.sql
-- AUD-144: a confirmed remote publication must match the exact board reserved
-- before the Pinterest POST. Preserve account -> all active schedules -> attempt
-- lock ordering established by migrations 056-061.

create or replace function public.complete_pinterest_publish_v2(
  p_user_id text,
  p_pin_id uuid,
  p_pinterest_account_id uuid,
  p_pinterest_pin_id text,
  p_pinterest_board_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_publication public.pinterest_publications%rowtype;
begin
  if p_user_id is null or p_pin_id is null or p_pinterest_account_id is null
     or nullif(trim(p_pinterest_pin_id),'') is null
     or nullif(trim(p_pinterest_board_id),'') is null then
    raise exception 'invalid Pinterest publication completion payload'
      using errcode='22023';
  end if;

  -- Keep the account lock even after disconnect: a delayed confirmed success
  -- must still be persisted, but serialized with account-scoped operations.
  perform 1
    from public.pinterest_accounts a
   where a.id = p_pinterest_account_id
     and a.user_id = p_user_id
   for update;
  if not found then
    raise exception 'Pinterest account not found for publication completion'
      using errcode='42501';
  end if;

  -- Lock every active/uncertain schedule in stable order before locking the
  -- attempt row. Do not narrow this to one row: the UPDATE below can touch all.
  perform 1
    from public.pin_schedules
   where user_id = p_user_id
     and pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id
     and status in ('publishing','unknown')
   order by id
   for update;

  select * into v_attempt
    from public.pinterest_publish_attempts
   where pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id
   for update;
  if not found or v_attempt.user_id <> p_user_id then
    raise exception 'publication attempt not found' using errcode='P0002';
  end if;

  -- The remote confirmation is valid only for the exact board that was
  -- durably reserved before the POST. Never silently rewrite the attempt's
  -- destination to the caller-supplied board.
  if v_attempt.pinterest_board_id is distinct from trim(p_pinterest_board_id) then
    raise exception 'Pinterest publication board mismatch'
      using errcode='23514';
  end if;

  -- Any matching schedule must describe the same reserved destination. A
  -- mismatch is a data-integrity conflict; leave the schedule untouched.
  if exists (
    select 1
      from public.pin_schedules
     where user_id = p_user_id
       and pin_id = p_pin_id
       and pinterest_account_id = p_pinterest_account_id
       and status in ('publishing','unknown')
       and pinterest_board_id is distinct from v_attempt.pinterest_board_id
  ) then
    raise exception 'Pinterest schedule board mismatch'
      using errcode='23514';
  end if;

  insert into public.pinterest_publications(
    user_id,pin_id,pinterest_account_id,pinterest_pin_id,pinterest_board_id
  ) values (
    p_user_id,p_pin_id,p_pinterest_account_id,
    trim(p_pinterest_pin_id),trim(p_pinterest_board_id)
  )
  on conflict (pin_id,pinterest_account_id) where pinterest_account_id is not null do nothing;

  select * into v_publication
    from public.pinterest_publications
   where pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id;

  if v_publication.pinterest_pin_id is distinct from trim(p_pinterest_pin_id)
     or v_publication.pinterest_board_id is distinct from trim(p_pinterest_board_id) then
    raise exception 'conflicting remote Pinterest publication identity'
      using errcode='23514';
  end if;

  update public.pinterest_publish_attempts
     set status='published',
         pinterest_pin_id=trim(p_pinterest_pin_id),
         pinterest_board_id=trim(p_pinterest_board_id),
         last_error=null,
         updated_at=now()
   where id=v_attempt.id;

  update public.pin_schedules
     set status='published',
         claim_token=null,
         pinterest_pin_id=trim(p_pinterest_pin_id),
         published_at=coalesce(published_at,now()),
         last_error=null,
         next_attempt_at=null,
         updated_at=now()
   where user_id=p_user_id
     and pin_id=p_pin_id
     and pinterest_account_id=p_pinterest_account_id
     and status in ('publishing','unknown');

  return jsonb_build_object(
    'status','published',
    'pinterest_pin_id',trim(p_pinterest_pin_id),
    'pinterest_board_id',trim(p_pinterest_board_id)
  );
end;
$$;

revoke all on function public.complete_pinterest_publish_v2(text,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.complete_pinterest_publish_v2(text,uuid,uuid,text,text)
  to service_role;
