-- Durable account-deletion Storage manifest integration test.
-- Run after migrations 127-145 in the disposable PostgreSQL database.
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
  v_active_generation_request bigint;
  v_other_project uuid;
  v_other_board uuid;
  v_result jsonb;
begin
  if public.managed_pin_image_object_path_for_project(
       'https://project.supabase.co/storage/v1/object/public/pin-images/pins/123-0123456789abcdef0123456789abcdef.png',
       'https://project.supabase.co'
     ) is distinct from 'pins/123-0123456789abcdef0123456789abcdef.png' then
    raise exception 'configured Supabase project image URL was not recognized';
  end if;
  if public.managed_pin_image_object_path_for_project(
       'https://attacker.example/storage/v1/object/public/pin-images/pins/123-0123456789abcdef0123456789abcdef.png',
       'https://project.supabase.co'
     ) is not null then
    raise exception 'foreign-origin image URL was accepted';
  end if;

  begin
    perform public.materialize_account_deletion_storage_manifest(
      v_job,v_claim,'javascript:alert(1)'
    );
    raise exception 'invalid configured Supabase project URL was accepted';
  exception when raise_exception then
    if sqlerrm = 'invalid configured Supabase project URL was accepted' then
      raise;
    end if;
  end;

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
  insert into public.boards(project_id,title,cover_url) values(
    v_project,'owned',
    'https://project.supabase.co/storage/v1/object/public/pin-images/pins/555-0123456789abcdef0123456789abcdef.webp'
  ) returning id into v_board;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(
    v_board,
    'https://project.supabase.co/storage/v1/object/public/pin-images/pins/123-0123456789abcdef0123456789abcdef.png',
    'owned image','','approved','flux-schnell',0
  ) returning id into v_pin;
  -- A matching object path on another host must never be treated as this
  -- deployment's managed Storage object.
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(
    v_board,
    'https://attacker.example/storage/v1/object/public/pin-images/pins/789-0123456789abcdef0123456789abcdef.png',
    'foreign URL','','approved','flux-schnell',0
  );

  insert into public.projects(user_id,niche) values(v_other,'storage-manifest-other') returning id into v_other_project;
  insert into public.boards(project_id,title,cover_url) values(
    v_other_project,'not-owned',
    'https://project.supabase.co/storage/v1/object/public/pin-images/pins/777-0123456789abcdef0123456789abcdef.webp'
  ) returning id into v_other_board;
  insert into public.pin_review_queue(id,user_id,payload)
  values(
    'review-other-image',v_other::text,
    '{"id":"review-other-image","title":"other user review image","imageUrl":"https://project.supabase.co/storage/v1/object/public/pin-images/pins/888-0123456789abcdef0123456789abcdef.webp"}'::jsonb
  );
  insert into public.pin_image_object_lifecycle(bucket_id,object_path,state)
  values
    ('pin-images','pins/777-0123456789abcdef0123456789abcdef.webp','active'),
    ('pin-images','pins/888-0123456789abcdef0123456789abcdef.webp','active')
  on conflict(bucket_id,object_path) do nothing;
  v_result := public.claim_pin_image_deletion(
    'pin-images','pins/777-0123456789abcdef0123456789abcdef.webp',600
  );
  if v_result->>'claimed' <> 'false' or v_result->>'reason' <> 'referenced' then
    raise exception 'other-user board cover did not block Storage deletion: %',v_result;
  end if;
  v_result := public.claim_pin_image_deletion(
    'pin-images','pins/888-0123456789abcdef0123456789abcdef.webp',600
  );
  if v_result->>'claimed' <> 'false' or v_result->>'reason' <> 'referenced' then
    raise exception 'other-user review image did not block Storage deletion: %',v_result;
  end if;
  v_result := public.begin_pin_image_upload(
    'pin-images','pins/777-0123456789abcdef0123456789abcdef.webp',600
  );
  if v_result->>'reserved' <> 'false' or v_result->>'reason' <> 'referenced' then
    raise exception 'board cover did not block reuse of a referenced image path: %',v_result;
  end if;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(
    v_other_board,
    'https://project.supabase.co/storage/v1/object/public/pin-images/pins/456-other.png',
    'foreign image','','approved','flux-schnell',0
  );

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
  insert into public.pin_review_queue(id,user_id,payload)
  values(
    'review-image-test',v_user::text,
    '{"id":"review-image-test","title":"review image","imageUrl":"https://project.supabase.co/storage/v1/object/public/pin-images/pins/999-0123456789abcdef0123456789abcdef.webp"}'::jsonb
  );
  v_result := public.claim_pin_image_deletion(
    'pin-images','pins/generation-0123456789abcdef0123456789abcdef.webp',600
  );
  if v_result->>'claimed' <> 'false' or v_result->>'reason' <> 'referenced' then
    raise exception 'generation response reference did not block Storage deletion: %',v_result;
  end if;

  v_result := public.materialize_account_deletion_storage_manifest(v_job,v_claim,'https://project.supabase.co');
  if v_result->>'recorded' <> 'true' or (v_result->>'inserted')::integer <> 4
     or (v_result->>'total')::integer <> 4 then
    raise exception 'unexpected Storage manifest result: %',v_result;
  end if;

  -- Re-running the same leased operation is idempotent.
  v_result := public.materialize_account_deletion_storage_manifest(v_job,v_claim,'https://project.supabase.co');
  if v_result->>'recorded' <> 'true' or (v_result->>'inserted')::integer <> 0
     or (v_result->>'total')::integer <> 4 then
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
  if not exists (
    select 1 from public.account_deletion_storage_objects
     where request_id=v_request and bucket_id='pin-images'
       and object_path='pins/generation-0123456789abcdef0123456789abcdef.webp' and state='pending'
  ) then
    raise exception 'generation replay image path was not persisted';
  end if;
  if not exists (
    select 1 from public.account_deletion_storage_objects
     where request_id=v_request and bucket_id='pin-images'
       and object_path='pins/999-0123456789abcdef0123456789abcdef.webp' and state='pending'
  ) then
    raise exception 'review queue image path was not persisted';
  end if;
  if not exists (
    select 1 from public.account_deletion_storage_objects
     where request_id=v_request and bucket_id='pin-images'
       and object_path='pins/555-0123456789abcdef0123456789abcdef.webp' and state='pending'
  ) then
    raise exception 'board cover image path was not persisted';
  end if;
  if exists (
    select 1 from public.account_deletion_storage_objects
     where request_id=v_request and object_path='pins/456-other.png'
  ) then
    raise exception 'foreign account image path entered deletion manifest';
  end if;
  if exists (
    select 1 from public.account_deletion_storage_objects
     where request_id=v_request and object_path='pins/789-0123456789abcdef0123456789abcdef.png'
  ) then
    raise exception 'foreign-origin image URL entered deletion manifest';
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
  values(v_user::text,'start','success',190) returning id into v_subscription;
  insert into public.email_outbox(
    event_key,subscription_id,recipient_email,template_key,payload
  ) values(
    'deletion-email-'||v_user,v_subscription,'user@example.invalid','subscription_created','{"email":"user@example.invalid"}'::jsonb
  );

  insert into public.pin_generation_credit_reservations(user_id,idempotency_key,amount,status)
  values(v_user::text,'retained-credit-reservation',5,'settled');
  insert into public.pin_generation_text_usage(
    user_id,idempotency_key,provider_model,usage_status,total_cost_rub
  ) values(v_user::text,'retained-text-usage','gptunnel-model','recorded',0.10);
  insert into public.provider_refund_reconciliation_audit(
    request_kind,user_id,idempotency_key,provider_task_id,provider_refunded,evidence_reference
  ) values('generation',v_user::text,'retained-refund-audit','provider-task-123',true,'evidence-ref-123');

  insert into public.pin_generation_requests(
    user_id,board_id,idempotency_key,status,pins,request_fingerprint
  ) values(
    v_user::text,v_board,'active-provider-task-key','processing','[]'::jsonb,repeat('b',64)
  ) returning id into v_active_generation_request;
  insert into public.pin_generation_tasks(
    generation_request_id,user_id,board_id,task_index,title,prompt,model,aspect_ratio,status
  ) values(
    v_active_generation_request,v_user::text,v_board,1,'In flight','test prompt',
    'flux-schnell','2:3','running'
  );

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

  insert into public.credit_purchases(user_id,package_id,credits,amount,status)
  values(v_user::text,'pack_100',100,190,'pending');
  v_result := public.erase_account_deletion_content(v_job,v_claim);
  if v_result->>'erased' <> 'false' or v_result->>'reason' <> 'payment_outcome_unresolved' then
    raise exception 'pending payment did not block account erasure: %',v_result;
  end if;
  update public.credit_purchases set status='canceled'
   where user_id=v_user::text and package_id='pack_100';

  insert into public.pin_generation_credit_reservations(user_id,idempotency_key,amount,status)
  values(v_user::text,'pending-credit-reservation',5,'reserved');
  v_result := public.erase_account_deletion_content(v_job,v_claim);
  if v_result->>'erased' <> 'false' or v_result->>'reason' <> 'credit_reservation_unresolved' then
    raise exception 'pending credit reservation did not block account erasure: %',v_result;
  end if;
  update public.pin_generation_credit_reservations set status='released'
   where user_id=v_user::text and idempotency_key='pending-credit-reservation';

  v_result := public.erase_account_deletion_content(v_job,v_claim);
  if v_result->>'erased' <> 'false'
     or v_result->>'reason' <> 'provider_tasks_unresolved' then
    raise exception 'in-flight provider task did not block erasure: %',v_result;
  end if;
  if not exists(select 1 from public.projects where user_id=v_user)
     or not exists(select 1 from public.pin_generation_tasks where generation_request_id=v_active_generation_request) then
    raise exception 'provider task journal or source content was erased before its outcome was definitive';
  end if;
  update public.pin_generation_tasks set status='failed'
   where generation_request_id=v_active_generation_request;
  update public.pin_generation_requests set status='failed'
   where id=v_active_generation_request;

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

  -- Finalization is fenced until every manifest object is confirmed deleted.
  update public.account_deletion_jobs
     set status='succeeded',claim_token=null,lease_expires_at=null,finished_at=clock_timestamp()
   where request_id=v_request and step_key='erase_content';
  insert into public.account_deletion_jobs(
    id,request_id,step_key,status,claim_token,lease_expires_at,attempts
  ) values (
    gen_random_uuid(),v_request,'finalize','running',gen_random_uuid(),
    clock_timestamp()+interval '5 minutes',1
  );
  select claim_token into v_claim from public.account_deletion_jobs
   where request_id=v_request and step_key='finalize';
  select id into v_job from public.account_deletion_jobs
   where request_id=v_request and step_key='finalize';

  if public.finalize_account_deletion(v_job,v_claim) is distinct from false then
    raise exception 'account finalized while Storage manifest was still pending';
  end if;

  -- Simulate confirmed Storage removal and update the durable manifest.
  insert into public.pin_image_object_lifecycle(bucket_id,object_path,state)
  values
    ('pin-images','pins/123-0123456789abcdef0123456789abcdef.png','deleted'),
    ('pin-images','pins/generation-0123456789abcdef0123456789abcdef.webp','deleted'),
    ('pin-images','pins/999-0123456789abcdef0123456789abcdef.webp','deleted'),
    ('pin-images','pins/555-0123456789abcdef0123456789abcdef.webp','deleted')
  on conflict(bucket_id,object_path) do update
    set state='deleted',claim_token=null,claim_expires_at=null,updated_at=clock_timestamp();
  update public.account_deletion_storage_objects
     set state='deleted',updated_at=clock_timestamp()
   where request_id=v_request;

  if public.finalize_account_deletion(v_job,v_claim) is distinct from true then
    raise exception 'account finalization was not confirmed after Storage deletion';
  end if;
  if not exists (
    select 1 from public.users
     where id=v_user and account_status='deleted'
       and email='deleted+'||v_user::text||'@deleted.invalid'
       and password_hash is null and credits_balance=0
  ) then
    raise exception 'user row was not reduced to a pseudonymous tombstone';
  end if;
  if not exists (
    select 1 from public.account_deletion_requests
     where id=v_request and state='completed' and completed_at is not null
  ) then
    raise exception 'deletion request was not marked completed';
  end if;
  if not exists(select 1 from public.credit_transactions where user_id=v_user::text)
     or not exists(select 1 from public.subscriptions where id=v_subscription)
     or not exists(select 1 from public.pin_generation_credit_reservations where user_id=v_user::text)
     or not exists(select 1 from public.pin_generation_text_usage where user_id=v_user::text)
     or not exists(select 1 from public.provider_refund_reconciliation_audit where user_id=v_user::text) then
    raise exception 'financial and provider-cost ledgers were not retained';
  end if;

  raise notice 'Account deletion Storage manifest and finalization checks passed';
end;
$$;
rollback;


-- Successful bounded Storage batches must be retried promptly in real job state,
-- while the normal exponential backoff remains reserved for actual failures.
do $batch$
declare
  v_user uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_job uuid := gen_random_uuid();
  v_claim uuid := gen_random_uuid();
  v_before timestamptz;
  v_after timestamptz;
  v_status text;
begin
  insert into public.users(id,email,password_hash,token_version,account_status)
  values(v_user,'storage-batch-retry-'||v_user||'@example.invalid','unused',1,'deletion_pending');
  insert into public.account_deletion_requests(id,user_id,state,confirmation_method,token_version)
  values(v_request,v_user,'pending','password_reauth',1);
  insert into public.account_deletion_jobs(
    id,request_id,step_key,status,claim_token,lease_expires_at,attempts
  ) values (
    v_job,v_request,'erase_content','running',v_claim,
    clock_timestamp()+interval '5 minutes',3
  );

  v_before := clock_timestamp();
  if public.finish_account_deletion_job(
    v_job,v_claim,'retry','storage_manifest_batch_remaining'
  ) is distinct from true then
    raise exception 'active Storage batch claim was not accepted for retry';
  end if;

  select status,next_attempt_at into v_status,v_after
    from public.account_deletion_jobs where id=v_job;
  if v_status <> 'retry_wait'
     or v_after < v_before + interval '4 seconds'
     or v_after > v_before + interval '7 seconds' then
    raise exception 'remaining Storage batch was not scheduled promptly: status %, next attempt %',
      v_status,v_after;
  end if;
end;
$batch$;
