-- Verify the admin recovery inventory exposes bounded immutable creative text,
-- while withholding image URLs, snapshot column names, and private worker fields.
-- Run after migrations 015-017, 031-033, 051, 082, 084-085, and 097.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_account uuid;
  v_schedule uuid;
  v_inventory jsonb;
  v_item jsonb;
  v_title text := 'Recovery fixture title';
  v_description text := repeat('D', 520);
begin
  insert into public.users(id,email,token_version,is_admin)
  values(v_user,'pinterest-inventory-'||v_user||'@example.invalid',0,true);

  insert into public.projects(user_id,niche)
  values(v_user,'admin-inventory-ci') returning id into v_project;
  insert into public.boards(project_id,title)
  values(v_project,'admin-inventory-ci') returning id into v_board;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'inventory-'||v_user,'inventory_fixture','enc:test')
  returning id into v_account;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/current.png','Live title','Live description','approved','flux-schnell',0)
  returning id into v_pin;

  insert into public.pin_schedules(
    user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,
    status,claim_token,updated_at,snapshot_title,snapshot_description,
    snapshot_image_url,snapshot_destination_url
  ) values (
    v_user::text,v_pin,v_account,clock_timestamp()-interval '1 hour','UTC',
    'remote-board-1','unknown',null,clock_timestamp()-interval '30 minutes',
    v_title,v_description,'https://private.example.invalid/snapshot.png',
    'https://private.example.invalid/destination'
  ) returning id into v_schedule;

  v_inventory:=public.admin_list_pinterest_schedule_inventory(
    v_user,array['unknown'],10,0
  );
  select item into v_item
    from jsonb_array_elements(v_inventory) as entries(item)
   where item->>'id'=v_schedule::text;

  if v_item is null then raise exception 'admin inventory omitted the recovery schedule'; end if;
  if v_item->>'creative_title' is distinct from v_title then
    raise exception 'admin inventory did not prefer immutable snapshot title';
  end if;
  if length(v_item->>'creative_description') is distinct from 500 then
    raise exception 'admin inventory description was not bounded to 500 characters';
  end if;
  if v_item ? 'snapshot_title' or v_item ? 'snapshot_image_url'
     or v_item ? 'snapshot_destination_url' or v_item ? 'claim_token' then
    raise exception 'admin inventory leaked a private database field';
  end if;
  if position('private.example.invalid' in v_item::text)>0 then
    raise exception 'admin inventory leaked a private snapshot URL';
  end if;

  raise notice 'Pinterest admin recovery creative context checks passed';
end;
$$;

rollback;
