-- Durable account-deletion Storage manifest integration test.
-- Run after migrations 127-134 in the disposable PostgreSQL database.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_job uuid := gen_random_uuid();
  v_claim uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_other_project uuid;
  v_other_board uuid;
  v_result jsonb;
begin
  insert into public.users(id,email,password_hash,token_version,account_status)
  values
    (v_user,'storage-manifest-'||v_user||'@example.invalid','unused',1,'deletion_pending'),
    (v_other,'storage-manifest-other-'||v_other||'@example.invalid','unused',0,'active');

  insert into public.account_deletion_requests(id,user_id,state,confirmation_method,token_version)
  values(v_request,v_user,'pending','password_reauth',1);

  insert into public.account_deletion_jobs(
    id,request_id,step_key,status,claim_token,lease_expires_at,inventory,inventory_recorded_at
  ) values (
    v_job,v_request,'preflight','running',v_claim,clock_timestamp()+interval '5 minutes',
    '{"ok":true,"sectionsChecked":14,"counts":{}}'::jsonb,clock_timestamp()
  );

  insert into public.projects(user_id,niche) values(v_user,'storage-manifest') returning id into v_project;
  insert into public.boards(project_id,title) values(v_project,'owned') returning id into v_board;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(
    v_board,
    'https://project.supabase.co/storage/v1/object/public/pin-images/pins/123-0123456789abcdef0123456789abcdef.png',
    'owned image','','approved','flux-schnell',0
  );

  insert into public.projects(user_id,niche) values(v_other,'storage-manifest-other') returning id into v_other_project;
  insert into public.boards(project_id,title) values(v_other_project,'not-owned') returning id into v_other_board;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(
    v_other_board,
    'https://project.supabase.co/storage/v1/object/public/pin-images/pins/456-other.png',
    'foreign image','','approved','flux-schnell',0
  );

  v_result := public.materialize_account_deletion_storage_manifest(v_job,v_claim);
  if v_result->>'recorded' <> 'true' or (v_result->>'inserted')::integer <> 1
     or (v_result->>'total')::integer <> 1 then
    raise exception 'unexpected Storage manifest result: %',v_result;
  end if;

  -- Re-running the same leased operation is idempotent.
  v_result := public.materialize_account_deletion_storage_manifest(v_job,v_claim);
  if v_result->>'recorded' <> 'true' or (v_result->>'inserted')::integer <> 0
     or (v_result->>'total')::integer <> 1 then
    raise exception 'Storage manifest retry was not idempotent: %',v_result;
  end if;

  if not exists (
    select 1 from public.account_deletion_storage_objects
     where request_id=v_request and bucket_id='pin-images'
       and object_path='pins/123-0123456789abcdef0123456789abcdef.png' and state='pending'
  ) then
    raise exception 'owned managed image path was not persisted';
  end if;
  if exists (
    select 1 from public.account_deletion_storage_objects
     where request_id=v_request and object_path='pins/456-other.png'
  ) then
    raise exception 'foreign account image path entered deletion manifest';
  end if;

  -- A completed generation response is a durable replay reference even
  -- when its pin/task rows are absent. The lifecycle claim must still refuse.
  insert into public.pin_generation_requests(
    user_id,board_id,idempotency_key,status,pins,request_fingerprint
  ) values (
    v_user::text,v_board,'manifest-generation-key-001','completed',
    '[{"image_url":"https://project.supabase.co/storage/v1/object/public/pin-images/pins/generation-0123456789abcdef0123456789abcdef.webp"}]'::jsonb,
    repeat('a',64)
  );
  insert into public.pin_image_object_lifecycle(bucket_id,object_path,state)
  values ('pin-images','pins/generation-0123456789abcdef0123456789abcdef.webp','active')
  on conflict (bucket_id,object_path) do nothing;
  v_result := public.claim_pin_image_deletion(
    'pin-images','pins/generation-0123456789abcdef0123456789abcdef.webp',600
  );
  if v_result->>'claimed' <> 'false' or v_result->>'reason' <> 'referenced' then
    raise exception 'generation response reference did not block Storage deletion: %',v_result;
  end if;

  raise notice 'Account deletion Storage manifest checks passed';
end;
$$;
rollback;
