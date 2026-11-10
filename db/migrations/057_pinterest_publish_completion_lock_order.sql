-- 057_pinterest_publish_completion_lock_order.sql
-- Keep publication completion in the same lock order as scheduled reservation
-- and manual retry: account -> schedule -> publication attempt.
-- This prevents a worker holding the schedule while waiting for the attempt
-- from deadlocking with a late-success handler holding the attempt while
-- waiting to reconcile that schedule.

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
  v_schedule public.pin_schedules%rowtype;
begin
  -- Lock the account even when disconnected: a confirmed remote success must
  -- still be reconciled after disconnect, but serialize with disconnect and
  -- with every other account-scoped publication operation.
  perform 1
    from public.pinterest_accounts a
   where a.id = p_pinterest_account_id
     and a.user_id = p_user_id
   for update;
  if not found then
    raise exception 'Pinterest account not found for publication completion' using errcode='42501';
  end if;

  -- A direct publish may have no schedule. If one exists, lock it before the
  -- attempt row, matching begin_scheduled_pinterest_publish/manual retry.
  select * into v_schedule
    from public.pin_schedules
   where user_id = p_user_id
     and pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id
   order by updated_at desc
   limit 1
   for update;

  select * into v_attempt
    from public.pinterest_publish_attempts
   where pin_id = p_pin_id
     and pinterest_account_id = p_pinterest_account_id
   for update;
  if not found or v_attempt.user_id <> p_user_id then
    raise exception 'publication attempt not found' using errcode='P0002';
  end if;

  insert into public.pinterest_publications(
    user_id,pin_id,pinterest_account_id,pinterest_pin_id,pinterest_board_id
  ) values (
    p_user_id,p_pin_id,p_pinterest_account_id,p_pinterest_pin_id,p_pinterest_board_id
  )
  on conflict (pin_id,pinterest_account_id) where pinterest_account_id is not null do nothing;

  select * into v_publication
    from public.pinterest_publications
   where pin_id=p_pin_id and pinterest_account_id=p_pinterest_account_id;
  if v_publication.pinterest_pin_id <> p_pinterest_pin_id then
    update public.pinterest_publish_attempts
       set status='unknown',last_error='A different remote pin is already recorded',updated_at=now()
     where id=v_attempt.id;
    raise exception 'conflicting remote publication id';
  end if;

  update public.pinterest_publish_attempts
     set status='published',pinterest_pin_id=p_pinterest_pin_id,
         pinterest_board_id=p_pinterest_board_id,last_error=null,updated_at=now()
   where id=v_attempt.id;

  -- Cancelled and failed schedules remain unchanged; late success reconciles
  -- only the matching account's active or uncertain schedule.
  update public.pin_schedules
     set status='published',pinterest_pin_id=p_pinterest_pin_id,
         published_at=coalesce(published_at,now()),last_error=null,
         next_attempt_at=null,updated_at=now()
   where user_id=p_user_id and pin_id=p_pin_id
     and pinterest_account_id=p_pinterest_account_id
     and status in ('publishing','unknown');

  return jsonb_build_object('status','published','pinterest_pin_id',p_pinterest_pin_id);
end;
$$;

revoke all on function public.complete_pinterest_publish_v2(text,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.complete_pinterest_publish_v2(text,uuid,uuid,text,text)
  to service_role;
