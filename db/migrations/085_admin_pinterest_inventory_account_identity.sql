-- 085_admin_pinterest_inventory_account_identity.sql
-- Expose non-secret profile identity so operators can verify the target account.

create or replace function public.admin_list_pinterest_schedule_inventory(
  p_operator_user_id uuid,
  p_statuses text[],
  p_limit integer,
  p_offset integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if p_operator_user_id is null
     or p_statuses is null
     or cardinality(p_statuses) < 1
     or cardinality(p_statuses) > 5
     or exists (
       select 1
       from unnest(p_statuses) as requested(status)
       where requested.status is null
          or requested.status not in ('scheduled','publishing','unknown','failed','published')
     )
     or p_limit is null or p_limit < 1 or p_limit > 100
     or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'invalid Pinterest inventory payload' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.users
    where id = p_operator_user_id and is_admin is true
  ) then
    raise exception 'administrator privileges required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(page.item order by page.sort_updated_at desc, page.sort_id desc), '[]'::jsonb)
    into v_result
  from (
    select
      jsonb_build_object(
        'id', s.id,
        'user_id', s.user_id,
        'pin_id', s.pin_id,
        'pinterest_account_id', s.pinterest_account_id,
        'pinterest_account', case when account.id is null then null else jsonb_build_object(
          'username', account.username,
          'pinterest_user_id', account.pinterest_user_id,
          'connected', account.disconnected_at is null and account.access_token is not null
        ) end,
        'pinterest_board_id', s.pinterest_board_id,
        'pinterest_pin_id', s.pinterest_pin_id,
        'status', s.status,
        'scheduled_at', s.scheduled_at,
        'published_at', s.published_at,
        'updated_at', s.updated_at,
        'attempts', s.attempts,
        'next_attempt_at', s.next_attempt_at,
        'last_error', s.last_error,
        'claim_token', s.claim_token,
        'attempt', case when a.id is null then null else jsonb_build_object(
          'status', a.status,
          'retry_safe', a.retry_safe,
          'attempt_count', a.attempt_count,
          'updated_at', a.updated_at,
          'last_error', a.last_error,
          'pinterest_pin_id', a.pinterest_pin_id,
          'pinterest_board_id', a.pinterest_board_id
        ) end
      ) as item,
      s.updated_at as sort_updated_at,
      s.id as sort_id
    from (
      select *
      from public.pin_schedules
      where status = any(p_statuses)
      order by updated_at desc, id desc
      limit p_limit
      offset p_offset
    ) s
    left join lateral (
      select a.id, a.username, a.pinterest_user_id, a.disconnected_at, a.access_token
      from public.pinterest_accounts a
      where a.id = s.pinterest_account_id and a.user_id = s.user_id
      limit 1
    ) account on true
    left join lateral (
      select pa.id, pa.status, pa.retry_safe, pa.attempt_count,
             pa.updated_at, pa.last_error, pa.pinterest_pin_id,
             pa.pinterest_board_id
      from public.pinterest_publish_attempts pa
      where pa.user_id = s.user_id
        and pa.pin_id = s.pin_id
        and pa.pinterest_account_id is not distinct from s.pinterest_account_id
      order by pa.updated_at desc, pa.id desc
      limit 1
    ) a on true
  ) page;

  return v_result;
end;
$$;


revoke all on function public.admin_list_pinterest_schedule_inventory(uuid,text[],integer,integer)
  from public, anon, authenticated;
grant execute on function public.admin_list_pinterest_schedule_inventory(uuid,text[],integer,integer)
  to service_role;
