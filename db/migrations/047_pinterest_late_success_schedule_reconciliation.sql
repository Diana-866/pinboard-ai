-- 047_pinterest_late_success_schedule_reconciliation.sql
-- Persist a confirmed Pinterest success and its schedule state atomically.
-- A slow worker may return after recovery has changed its schedule to unknown.

create or replace function public.complete_pinterest_publish_v2(
  p_user_id text, p_pin_id uuid, p_pinterest_account_id uuid,
  p_pinterest_pin_id text, p_pinterest_board_id text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_attempt public.pinterest_publish_attempts%rowtype;
  v_publication public.pinterest_publications%rowtype;
begin
  select * into v_attempt from public.pinterest_publish_attempts
   where pin_id=p_pin_id and pinterest_account_id=p_pinterest_account_id for update;
  if not found or v_attempt.user_id <> p_user_id then
    raise exception 'publication attempt not found' using errcode='P0002';
  end if;

  insert into public.pinterest_publications(
    user_id,pin_id,pinterest_account_id,pinterest_pin_id,pinterest_board_id
  ) values (p_user_id,p_pin_id,p_pinterest_account_id,p_pinterest_pin_id,p_pinterest_board_id)
  on conflict (pin_id,pinterest_account_id) where pinterest_account_id is not null do nothing;

  select * into v_publication from public.pinterest_publications
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

  -- Only the same owner's matching account/pin schedule can be reconciled.
  -- Cancelled and failed schedules are deliberately left unchanged.
  update public.pin_schedules
     set status='published',pinterest_pin_id=p_pinterest_pin_id,
         published_at=coalesce(published_at,now()),last_error=null,
         next_attempt_at=null,updated_at=now()
   where user_id=p_user_id and pin_id=p_pin_id
     and pinterest_account_id=p_pinterest_account_id
     and status in ('publishing','unknown');

  return jsonb_build_object('status','published','pinterest_pin_id',p_pinterest_pin_id);
end; $$;

revoke all on function public.complete_pinterest_publish_v2(text,uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.complete_pinterest_publish_v2(text,uuid,uuid,text,text)
  to service_role;