-- Run after migrations 045-149 in disposable PostgreSQL CI.
-- Verifies partial success is chargeable only when every task is terminal and
-- the saved pins exactly correspond to the successful journal rows.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_request jsonb;
  v_claim uuid;
  v_key text;
  v_balance integer;
  v_pin_count integer;
  v_status text;
  v_saved jsonb;
  v_result_url text;
  v_storage_url text;
  v_price numeric;
  v_retry_user uuid := gen_random_uuid();
  v_retry_project uuid;
  v_retry_board uuid;
  v_retry_request jsonb;
  v_retry_claim uuid;
  v_retry_key text;
  v_blocker_key text;
begin
  insert into public.users(id,email,credits_balance,token_version)
  values(v_user,'generation-completion-guard-'||v_user||'@example.invalid',20,0);
  insert into public.projects(user_id,niche)
  values(v_user,'generation-completion-guard') returning id into v_project;
  insert into public.boards(project_id,title)
  values(v_project,'generation-completion-guard') returning id into v_board;

  -- A two-task batch with one confirmed success and one confirmed failure is
  -- valid: only the successful image is saved and charged.
  v_key := 'completion-partial-'||v_user;
  v_request := public.begin_pin_generation_request(v_user::text,v_board,v_key,repeat('a',64));
  v_claim := (v_request->>'claim_token')::uuid;
  perform public.reserve_pin_generation_credits(v_user::text,v_key,10);
  perform public.save_pin_generation_plan(v_user::text,v_key,v_claim,jsonb_build_array(
    jsonb_build_object('title','Successful task','description','saved description','prompt','success prompt','model','flux-schnell','aspect_ratio','2:3'),
    jsonb_build_object('title','Failed task','description','failed description','prompt','failed prompt','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.record_pin_generation_provider_outcome(
    v_user::text,v_key,v_claim,1,'provider-success-guard','succeeded',1.25,null,null,null,
    'https://provider.example.invalid/success.png'
  );
  perform public.update_pin_generation_task(
    v_user::text,v_key,v_claim,1,'succeeded','provider-success-guard',
    'https://provider.example.invalid/success.png',
    'https://storage.example.invalid/success.png',1.25,null
  );
  perform public.record_pin_generation_provider_outcome(
    v_user::text,v_key,v_claim,2,'provider-failed-guard','failed',0.50,false,400,
    'provider rejected task',null
  );
  perform public.resize_pin_generation_credit_reservation(v_user::text,v_key,v_claim,2);
  v_saved := public.complete_pin_generation_request(
    v_user::text,v_board,v_key,v_claim,
    '[{"image_url":"https://storage.example.invalid/success.png","title":"Successful task","description":"saved description","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":2}]'::jsonb,
    2
  );
  if jsonb_array_length(v_saved->'pins') <> 1 then
    raise exception 'partial-success completion did not save exactly one pin: %',v_saved;
  end if;

  -- A second request proves a mismatched URL cannot settle or charge.
  v_key := 'completion-mismatch-'||v_user;
  v_request := public.begin_pin_generation_request(v_user::text,v_board,v_key,repeat('b',64));
  v_claim := (v_request->>'claim_token')::uuid;
  perform public.reserve_pin_generation_credits(v_user::text,v_key,10);
  perform public.save_pin_generation_plan(v_user::text,v_key,v_claim,jsonb_build_array(
    jsonb_build_object('title','Expected task','description','expected description','prompt','expected prompt','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.record_pin_generation_provider_outcome(
    v_user::text,v_key,v_claim,1,'provider-mismatch-guard','succeeded',1.25,null,null,null,
    'https://provider.example.invalid/expected.png'
  );
  perform public.update_pin_generation_task(
    v_user::text,v_key,v_claim,1,'succeeded','provider-mismatch-guard',
    'https://provider.example.invalid/expected.png',
    'https://storage.example.invalid/expected.png',1.25,null
  );
  perform public.resize_pin_generation_credit_reservation(v_user::text,v_key,v_claim,2);
  select credits_balance into v_balance from public.users where id=v_user;
  begin
    perform public.complete_pin_generation_request(
      v_user::text,v_board,v_key,v_claim,
      '[{"image_url":"https://storage.example.invalid/substituted.png","title":"Expected task","description":"expected description","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":2}]'::jsonb,
      2
    );
    raise exception 'completion accepted a pin URL not present in the generation journal';
  exception when others then
    if sqlerrm not like '%completed pin content does not match generation task journal%' then
      raise;
    end if;
  end;
  select credits_balance into v_balance from public.users where id=v_user;
  select count(*) into v_pin_count from public.pins where board_id=v_board and title='Expected task';
  select status into v_status from public.pin_generation_requests
   where user_id=v_user::text and idempotency_key=v_key;
  if v_balance <> 18 or v_pin_count <> 0 or v_status <> 'processing' then
    raise exception 'mismatched completion changed durable state (balance %, pins %, status %)',
      v_balance,v_pin_count,v_status;
  end if;

  -- Non-terminal task state must also block completion, with all side effects rolled back.
  v_key := 'completion-nonterminal-'||v_user;
  v_request := public.begin_pin_generation_request(v_user::text,v_board,v_key,repeat('c',64));
  v_claim := (v_request->>'claim_token')::uuid;
  perform public.reserve_pin_generation_credits(v_user::text,v_key,5);
  perform public.save_pin_generation_plan(v_user::text,v_key,v_claim,jsonb_build_array(
    jsonb_build_object('title','Pending task','description','','prompt','pending prompt','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.update_pin_generation_task(
    v_user::text,v_key,v_claim,1,'submitting',null,null,null,null,null
  );
  select credits_balance into v_balance from public.users where id=v_user;
  begin
    perform public.complete_pin_generation_request(
      v_user::text,v_board,v_key,v_claim,
      '[{"image_url":"https://storage.example.invalid/pending.png","title":"Pending task","description":"","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":2}]'::jsonb,
      2
    );
    raise exception 'completion accepted a non-terminal task';
  exception when others then
    if sqlerrm not like '%generation task journal is not terminal%' then raise; end if;
  end;
  select credits_balance into v_balance from public.users where id=v_user;
  select count(*) into v_pin_count from public.pins where board_id=v_board and title='Pending task';
  select status into v_status from public.pin_generation_requests
   where user_id=v_user::text and idempotency_key=v_key;
  if v_balance <> 18 or v_pin_count <> 0 or v_status <> 'processing' then
    raise exception 'non-terminal completion changed durable state (balance %, pins %, status %)',
      v_balance,v_pin_count,v_status;
  end if;


  -- A provider-confirmed success is immutable. Storage may be attached once,
  -- but a retry must not replace the charged provider result, price or object.
  v_key := 'completion-immutable-result-'||v_user;
  v_request := public.begin_pin_generation_request(v_user::text,v_board,v_key,repeat('d',64));
  v_claim := (v_request->>'claim_token')::uuid;
  perform public.reserve_pin_generation_credits(v_user::text,v_key,5);
  perform public.save_pin_generation_plan(v_user::text,v_key,v_claim,jsonb_build_array(
    jsonb_build_object('title','Immutable task','description','description','prompt','immutable prompt','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.record_pin_generation_provider_outcome(
    v_user::text,v_key,v_claim,1,'provider-task-immutable','succeeded',1.25,null,null,null,
    'https://provider.example.invalid/immutable.png'
  );

  begin
    perform public.update_pin_generation_task(
      v_user::text,v_key,v_claim,1,'succeeded','provider-task-immutable',
      'https://provider.example.invalid/substituted.png',null,1.25,null
    );
    raise exception 'task journal accepted a substituted provider result URL';
  exception when others then
    if sqlerrm not like '%provider result URL is immutable%' then raise; end if;
  end;

  begin
    perform public.update_pin_generation_task(
      v_user::text,v_key,v_claim,1,'succeeded','provider-task-immutable',
      'https://provider.example.invalid/immutable.png',null,1.50,null
    );
    raise exception 'task journal accepted a substituted provider price';
  exception when others then
    if sqlerrm not like '%provider price is immutable%' then raise; end if;
  end;

  perform public.update_pin_generation_task(
    v_user::text,v_key,v_claim,1,'succeeded','provider-task-immutable',
    'https://provider.example.invalid/immutable.png',
    'https://storage.example.invalid/immutable.png',1.25,null
  );
  begin
    perform public.update_pin_generation_task(
      v_user::text,v_key,v_claim,1,'succeeded','provider-task-immutable',
      'https://provider.example.invalid/immutable.png',
      'https://storage.example.invalid/substituted.png',1.25,null
    );
    raise exception 'task journal accepted a substituted Storage URL';
  exception when others then
    if sqlerrm not like '%Storage URL is immutable%' then raise; end if;
  end;

  select provider_result_url,storage_url,provider_price
    into v_result_url,v_storage_url,v_price
    from public.pin_generation_tasks t
    join public.pin_generation_requests r on r.id=t.generation_request_id
   where r.user_id=v_user::text and r.idempotency_key=v_key and t.task_index=1;
  if v_result_url <> 'https://provider.example.invalid/immutable.png'
     or v_storage_url <> 'https://storage.example.invalid/immutable.png'
     or v_price <> 1.25 then
    raise exception 'immutable generation result facts changed (result %, storage %, price %)',
      v_result_url,v_storage_url,v_price;
  end if;


  -- The trigger also protects facts when a different privileged RPC writes
  -- the task row. This closes a bypass around update_pin_generation_task.
  v_key := 'completion-immutable-writer-'||v_user;
  v_request := public.begin_pin_generation_request(v_user::text,v_board,v_key,repeat('e',64));
  v_claim := (v_request->>'claim_token')::uuid;
  perform public.reserve_pin_generation_credits(v_user::text,v_key,5);
  perform public.save_pin_generation_plan(v_user::text,v_key,v_claim,jsonb_build_array(
    jsonb_build_object('title','Immutable writer task','description','','prompt','writer prompt','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.update_pin_generation_task(
    v_user::text,v_key,v_claim,1,'submitting',null,null,null,null,null
  );
  perform public.update_pin_generation_task(
    v_user::text,v_key,v_claim,1,'running','provider-task-writer',
    'https://provider.example.invalid/writer-original.png',null,1.75,null
  );
  begin
    perform public.record_pin_generation_provider_outcome(
      v_user::text,v_key,v_claim,1,'provider-task-writer','succeeded',2.25,null,null,null,
      'https://provider.example.invalid/writer-substituted.png'
    );
    raise exception 'provider outcome RPC overwrote previously journaled immutable facts';
  exception when others then
    if sqlerrm not like '%provider result URL is immutable%' then raise; end if;
  end;
  perform public.record_pin_generation_provider_outcome(
    v_user::text,v_key,v_claim,1,'provider-task-writer','succeeded',1.75,null,null,null,
    'https://provider.example.invalid/writer-original.png'
  );

  -- A price increase may exceed the user's available balance after provider
  -- success. The same idempotency key must resume from the immutable task
  -- journal after a top-up; it must not submit a second provider task.
  insert into public.users(id,email,credits_balance,token_version)
  values(v_retry_user,'generation-credit-retry-'||v_retry_user||'@example.invalid',20,0);
  insert into public.projects(user_id,niche)
  values(v_retry_user,'generation-credit-retry') returning id into v_retry_project;
  insert into public.boards(project_id,title)
  values(v_retry_project,'generation-credit-retry') returning id into v_retry_board;

  v_retry_key := 'credit-retry-'||v_retry_user;
  v_retry_request := public.begin_pin_generation_request(
    v_retry_user::text,v_retry_board,v_retry_key,repeat('f',64)
  );
  v_retry_claim := (v_retry_request->>'claim_token')::uuid;
  perform public.reserve_pin_generation_credits(v_retry_user::text,v_retry_key,2);
  perform public.save_pin_generation_plan(v_retry_user::text,v_retry_key,v_retry_claim,jsonb_build_array(
    jsonb_build_object('title','Recoverable task','description','saved','prompt','recoverable prompt','model','flux-schnell','aspect_ratio','2:3')
  ));
  perform public.record_pin_generation_provider_outcome(
    v_retry_user::text,v_retry_key,v_retry_claim,1,'provider-credit-retry','succeeded',1.25,null,null,null,
    'https://provider.example.invalid/recoverable.png'
  );
  perform public.update_pin_generation_task(
    v_retry_user::text,v_retry_key,v_retry_claim,1,'succeeded','provider-credit-retry',
    'https://provider.example.invalid/recoverable.png',
    'https://storage.example.invalid/recoverable.png',1.25,null
  );

  -- A competing reservation consumes the remaining balance, so the exact
  -- settlement resize fails even though the provider result is safely stored.
  v_blocker_key := 'credit-blocker-'||v_retry_user;
  v_request := public.begin_pin_generation_request(
    v_retry_user::text,v_retry_board,v_blocker_key,repeat('1',64)
  );
  perform public.reserve_pin_generation_credits(v_retry_user::text,v_blocker_key,18);
  begin
    perform public.resize_pin_generation_credit_reservation(v_retry_user::text,v_retry_key,v_retry_claim,5);
    raise exception 'settlement resize unexpectedly ignored competing credit reservation';
  exception when others then
    if sqlerrm not like '%insufficient available credits for resized generation reservation%' then
      raise;
    end if;
  end;

  -- This is the backend catch path for a confirmed provider result whose
  -- final charge cannot yet be reserved. The task plan keeps the request resumable.
  perform public.fail_pin_generation_request(
    v_retry_user::text,v_retry_key,v_retry_claim,'insufficient_credits',true
  );
  perform public.fail_pin_generation_request(
    v_retry_user::text,v_blocker_key,
    (v_request->>'claim_token')::uuid,'test_release',false
  );

  v_retry_request := public.begin_pin_generation_request(
    v_retry_user::text,v_retry_board,v_retry_key,repeat('f',64)
  );
  if v_retry_request->>'status' <> 'resume' then
    raise exception 'same-key retry did not resume journaled provider success: %',v_retry_request;
  end if;
  v_retry_claim := (v_retry_request->>'claim_token')::uuid;
  perform public.resize_pin_generation_credit_reservation(v_retry_user::text,v_retry_key,v_retry_claim,5);
  v_saved := public.complete_pin_generation_request(
    v_retry_user::text,v_retry_board,v_retry_key,v_retry_claim,
    '[{"image_url":"https://storage.example.invalid/recoverable.png","title":"Recoverable task","description":"saved","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":5}]'::jsonb,
    5
  );
  if jsonb_array_length(v_saved->'pins') <> 1 then
    raise exception 'same-key credit recovery did not persist the original generated pin: %',v_saved;
  end if;
  select credits_balance into v_balance from public.users where id=v_retry_user;
  if v_balance <> 15 then
    raise exception 'same-key credit recovery charged an incorrect balance: %',v_balance;
  end if;

  raise notice 'Generation completion journal guard checks passed';
end;
$$;

rollback;
