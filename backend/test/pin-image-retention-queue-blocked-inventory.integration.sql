-- Read-only blocked retention queue diagnostics (migration 110).
begin;
do $body$
declare
  v_path text := 'pins/1730000000001-abcdef0123456789abcdef0123456789.webp';
  v_row record;
begin
  insert into public.pin_image_retention_queue(
    bucket_id, object_path, state, source_types, attempts, last_error_code
  ) values ('pin-images', v_path, 'blocked', array['generation_replay'], 2, 'storage_delete_unresolved');

  select * into v_row from public.list_blocked_pin_image_retention_queue(50)
   where object_path = v_path;
  if not found then raise exception 'blocked queue row missing from read-only inventory'; end if;
  if v_row.last_error_code <> 'storage_delete_unresolved'
     or v_row.attempts <> 2
     or v_row.source_types <> array['generation_replay']::text[] then
    raise exception 'blocked queue diagnostics are incomplete: %', row_to_json(v_row);
  end if;
  if v_row.has_reference is null then
    raise exception 'reference status must always be explicit';
  end if;

  if not has_function_privilege('service_role',
       'public.list_blocked_pin_image_retention_queue(integer)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.list_blocked_pin_image_retention_queue(integer)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.list_blocked_pin_image_retention_queue(integer)', 'EXECUTE') then
    raise exception 'blocked queue inventory RPC privileges are incorrect';
  end if;

  begin
    perform * from public.list_blocked_pin_image_retention_queue(101);
    raise exception 'blocked queue inventory accepted a batch above 100';
  exception when raise_exception then
    if sqlerrm = 'blocked queue inventory accepted a batch above 100' then raise; end if;
  end;
end;
$body$;
rollback;
