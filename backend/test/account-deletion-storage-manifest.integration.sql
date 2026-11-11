-- Durable account-deletion Storage manifest integration test.
-- Run after migrations 127-137 in the disposable PostgreSQL database.
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
  v_pin uuid;
  v_pinterest_account uuid;
  v_subscription uuid;
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
    '{"ok":true,"sectionsChecked":22,"counts":{}}'::jsonb,clock_timestamp()
  );

  insert into public.projects(user_id,niche) values(v_user,'storage-manifest') returning id into v_project;
  insert into public.boards(project_id,title) values(v_project,'owned') returning id into v_board;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(
    v_board,
    'https://project.supabase.co/storage/v1/object/public/pin-images/pins/123-0123456789abcdef0123456789abcdef.png',
    'owned image','','approved','flux-schnell',0
  ) returning id into v_pin;

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
  if public.mark_account_deletion_storage_manifest(v_job,v_claim) is distinct from true then
    raise exception 'Storage manifest completion marker was not fenced';
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

  -- Verify the next durable stage removes operational content but retains
  -- financial evidence and never crosses the account ownership boundary.
  insert into public.auth_tokens(user_id,token_hash,purpose,expires_at)
  values(v_user::text,'deletion-test-'||v_user,'password_reset',clock_timestamp()+interval '1 hour');
  insert into public.credit_transactions(user_id,amount,type,description)
  values(v_user::text,190,'purchase','retained financial evidence');

  insert into public.pinterest_publish_attempts(user_id,pin_id,pinterest_board_id,status)
  values(v_user::text,v_pin,'board-123','failed');
  insert into public.pinterest_token_refresh_leases(user_id,lease_id,lease_until)
  values(v_user::text,gen_random_uuid(),clock_timestamp()+interval '5 minutes');
  insert into public.pinterest_oauth_connection_state(user_id,generation)
  values(v_user::text,1);
  insert into public.pinterest_accounts(user_id,access_token)
  values(v_user::text,'test-token') returning id into v_pinterest_account;
  insert into public.pinterest_account_refresh_leases(
    pinterest_account_id,user_id,lease_id,lease_until
  ) values(v_pinterest_account,v_user::text,gen_random_uuid(),clock_timestamp()+interval '5 minutes');

  insert into public.subscriptions(user_id,plan,status,amount)
  values(v_user::text,'start','pending',190) returning id into v_subscription;
  insert into public.email_outbox(
    event_key,subscription_id,recipient_email,template_key,payload
  ) values(
    'deletion-email-'||v_user,v_subscription,'user@example.invalid','subscription_created','{"email":"user@example.invalid"}'::jsonb
  );

  insert into public.pin_generation_credit_reservations(user_id,idempotency_key,amount)
  values(v_user::text,'retained-credit-reservation',5);
  insert into public.pin_generation_text_usage(
    user_id,idempotency_key,provider_model,usage_status,total_cost_rub
  ) values(v_user::text,'retained-text-usage','gptunnel-model','recorded',0.10);
  insert into public.provider_refund_reconciliation_audit(
    request_kind,user_id,idempotency_key,provider_task_id,provider_refunded,evidence_reference
  ) values('generation',v_user::text,'retained-refund-audit','provider-task-123',true,'evidence-ref-123');

  update public.account_deletion_jobs
     set status='succeeded',claim_token=null,lease_expires_at=null,finished_at=clock_timestamp()
   where id=v_job;
  insert into public.account_deletion_jobs(
    id,request_id,step_key,status,claim_token,lease_expires_at,attempts
  ) values (
    gen_random_uuid(),v_request,'erase_content','running',gen_random_uuid(),
    clock_timestamp()+interval '5 minutes',1
  );
  -- Retrieve the claim token from the active erasure job.
  select claim_token into v_claim from public.account_deletion_jobs
   where request_id=v_request and step_key='erase_content';
  select id into v_job from public.account_deletion_jobs
   where request_id=v_request and step_key='erase_content';

  v_result := public.erase_account_deletion_content(v_job,v_claim);
  if v_result->>'erased' <> 'true'
     or v_result->>'financial_records_retained' <> 'true' then
    raise exception 'local content erasure was not confirmed: %',v_result;
  end if;
  if exists(select 1 from public.projects where user_id=v_user)
     or exists(select 1 from public.auth_tokens where user_id=v_user::text)
     or exists(select 1 from public.pin_generation_requests where user_id=v_user::text)
     or exists(select 1 from public.pinterest_publications where user_id=v_user::text)
     or exists(select 1 from public.pinterest_publish_attempts where user_id=v_user::text)
     or exists(select 1 from public.pinterest_token_refresh_leases where user_id=v_user::text)
     or exists(select 1 from public.pinterest_oauth_connection_state where user_id=v_user::text)
     or exists(select 1 from public.pinterest_account_refresh_leases where user_id=v_user::text)
     or exists(select 1 from public.email_outbox where subscription_id=v_subscription) then
    raise exception 'owned operational rows remain after content erasure';
  end if;
  if not exists(select 1 from public.pin_generation_credit_reservations where user_id=v_user::text)
     or not exists(select 1 from public.pin_generation_text_usage where user_id=v_user::text)
     or not exists(select 1 from public.provider_refund_reconciliation_audit where user_id=v_user::text)
     or not exists(select 1 from public.subscriptions where id=v_subscription)
     or not exists(select 1 from public.credit_transactions where user_id=v_user::text)
     or not exists(select 1 from public.projects where user_id=v_other) then
    raise exception 'financial evidence or other-user data was incorrectly removed';
  end if;

  raise notice 'Account deletion Storage manifest checks passed';
end;
$$;
rollback;
