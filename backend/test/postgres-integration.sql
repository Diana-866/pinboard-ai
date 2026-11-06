-- Run only in disposable PostgreSQL CI database after migrations 010–045.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_purchase uuid;
  v_sub uuid;
  v_older_sub uuid;
  v_newer_sub uuid;
  v_same_plan_older_sub uuid;
  v_same_plan_result jsonb;
  v_balance integer;
  v_count integer;
  v_outbox_id uuid;
  v_outbox_claim uuid;
  v_outbox_marked boolean;
  v_outbox_retry_id uuid;
  v_outbox_retry_claim uuid;
  v_first_end timestamptz;
  v_second_end timestamptz;
  v_newer_end timestamptz;
  v_late_end timestamptz;
  v_plan text;
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_result jsonb;
  v_before integer;
  v_schedule uuid;
  v_pinterest_account uuid;
  v_schedule_count integer;
  v_publish_result jsonb;
  v_uncertain_pin uuid;
  v_late_success_pin uuid;
  v_schedule_test_pin uuid;
  v_language text;
  v_reset_token uuid;
  v_reset_token_old uuid;
  v_reset_result boolean;
  v_email_result boolean;
  v_email_token uuid;
  v_email_issue boolean;
  v_email_issue_token uuid;
  v_provider_key text;

begin
  if to_regprocedure('public.issue_password_reset_token(text,text,timestamptz)') is not null then
    raise exception 'legacy three-argument password reset RPC overload still exists';
  end if;
  if to_regprocedure('public.issue_password_reset_token(text,text,timestamptz,integer)') is null then
    raise exception 'cooldown-aware four-argument password reset RPC is missing';
  end if;

  insert into public.users(id, email, credits_balance, tariff_plan, email_verified)
  values (v_user, 'atomic-test-' || v_user || '@example.invalid', 10, 'none', false);

  -- Email verification updates the account and consumes the token atomically.
  insert into public.auth_tokens(user_id, token_hash, purpose, expires_at)
  values (v_user::text, repeat('c', 64), 'email_verify', now() + interval '1 hour')
  returning id into v_email_token;

  v_email_result := public.consume_email_verification_token(repeat('c', 64));
  if v_email_result is distinct from true then
    raise exception 'valid email verification token was not consumed';
  end if;
  if (select email_verified from public.users where id = v_user) is distinct from true then
    raise exception 'email verification did not update user flag';
  end if;
  if (select used_at from public.auth_tokens where id = v_email_token) is null then
    raise exception 'email verification token was not marked used';
  end if;
  if public.consume_email_verification_token(repeat('c', 64)) is distinct from true then
    raise exception 'replaying a consumed verification link should be idempotent';
  end if;

  insert into public.auth_tokens(user_id, token_hash, purpose, expires_at)
  values (v_user::text, repeat('d', 64), 'email_verify', now() - interval '1 minute');
  if public.consume_email_verification_token(repeat('d', 64)) is distinct from false then
    raise exception 'expired email verification token was accepted';
  end if;

  -- Issuance enforces cooldown and invalidates prior unused links atomically.
  update public.auth_tokens
     set created_at = now() - interval '10 minutes'
   where user_id = v_user::text and purpose = 'email_verify';

  v_email_issue := public.issue_email_verification_token(
    v_user::text, repeat('e', 64), now() + interval '1 hour', 300
  );
  if v_email_issue is distinct from true then
    raise exception 'verification token was not issued after cooldown';
  end if;
  select id into v_email_issue_token from public.auth_tokens
   where token_hash = repeat('e', 64);

  v_email_issue := public.issue_email_verification_token(
    v_user::text, repeat('f', 64), now() + interval '1 hour', 300
  );
  if v_email_issue is distinct from false then
    raise exception 'verification issuance bypassed five-minute cooldown';
  end if;
  if exists (
    select 1 from public.auth_tokens where token_hash = repeat('f', 64)
  ) then
    raise exception 'cooldown-rejected verification token was inserted';
  end if;
  if (select used_at from public.auth_tokens where id = v_email_issue_token) is not null then
    raise exception 'cooldown attempt invalidated the active verification token';
  end if;

  -- Issuing a newer reset link invalidates the older link for this account.
  v_reset_result := public.issue_password_reset_token(
    v_user::text, repeat('a', 64), now() + interval '1 hour', 300
  );
  if v_reset_result is distinct from true then
    raise exception 'first password reset token was not issued';
  end if;
  select id into v_reset_token_old from public.auth_tokens
   where token_hash = repeat('a', 64);

  -- Age the first token to simulate an elapsed cooldown in this deterministic test.
  update public.auth_tokens
     set created_at = now() - interval '10 minutes'
   where id = v_reset_token_old;

  v_reset_result := public.issue_password_reset_token(
    v_user::text, repeat('b', 64), now() + interval '1 hour', 300
  );
  if v_reset_result is distinct from true then
    raise exception 'second password reset token was not issued';
  end if;
  select id into v_reset_token from public.auth_tokens
   where token_hash = repeat('b', 64);

  -- A third request inside five minutes is rejected without invalidating the live link.
  v_reset_result := public.issue_password_reset_token(
    v_user::text, repeat('g', 64), now() + interval '1 hour', 300
  );
  if v_reset_result is distinct from false then
    raise exception 'password reset issuance bypassed five-minute cooldown';
  end if;
  if exists (select 1 from public.auth_tokens where token_hash = repeat('g', 64)) then
    raise exception 'cooldown-rejected password reset token was inserted';
  end if;
  if (select used_at from public.auth_tokens where id = v_reset_token) is not null then
    raise exception 'cooldown attempt invalidated the active password reset token';
  end if;

  if (select used_at from public.auth_tokens where id = v_reset_token_old) is null then
    raise exception 'new password reset token did not invalidate the older token';
  end if;

  v_reset_result := public.consume_password_reset_token(
    repeat('a', 64),
    'ci-old-password-hash-' || v_user
  );
  if v_reset_result is distinct from false then
    raise exception 'older password reset token remained usable';
  end if;

  -- Password reset token is consumed together with the password update.
  v_reset_result := public.consume_password_reset_token(
    repeat('b', 64),
    'ci-password-hash-' || v_user
  );
  if v_reset_result is distinct from true then
    raise exception 'valid password reset token was not consumed';
  end if;
  if (select password_hash from public.users where id = v_user) <> ('ci-password-hash-' || v_user) then
    raise exception 'password reset did not update the user credential hash';
  end if;
  if (select token_version from public.users where id = v_user) <> 1 then
    raise exception 'password reset did not increment token_version to revoke old sessions';
  end if;
  if (select used_at from public.auth_tokens where id = v_reset_token) is null then
    raise exception 'password reset token was not marked used';
  end if;
  v_reset_result := public.consume_password_reset_token(
    repeat('b', 64),
    'ci-replay-hash-' || v_user
  );
  if v_reset_result is distinct from false then
    raise exception 'password reset token was accepted more than once';
  end if;
  if (select password_hash from public.users where id = v_user) <> ('ci-password-hash-' || v_user) then
    raise exception 'replayed password reset changed the credential hash';
  end if;

  -- Preferred interface language migration: existing users default to English,
  -- supported locales can be saved, and unsupported locales are rejected.
  select preferred_language into v_language from public.users where id = v_user;
  if v_language <> 'en' then raise exception 'new user language must default to en'; end if;
  update public.users set preferred_language = 'de' where id = v_user;
  select preferred_language into v_language from public.users where id = v_user;
  if v_language <> 'de' then raise exception 'supported preferred language was not saved'; end if;
  begin
    update public.users set preferred_language = 'xx' where id = v_user;
    raise exception 'unsupported preferred language was accepted';
  exception when check_violation then
    null;
  end;

  insert into public.credit_purchases(
    user_id, package_id, pack_title, credits, status,
    provider_payment_id, amount, currency
  ) values (
    v_user::text, 'pack_100', 'Atomic integration test', 100, 'pending',
    'ci-credit-' || v_user, 100, 'rub'
  ) returning id into v_purchase;

  v_balance := public.credit_paid_purchase(v_purchase, now(), 'first webhook');
  if v_balance <> 110 then raise exception 'expected balance 110, got %', v_balance; end if;

  v_balance := public.credit_paid_purchase(v_purchase, now(), 'duplicate webhook');
  if v_balance <> 110 then raise exception 'duplicate webhook changed balance: %', v_balance; end if;

  select count(*) into v_count from public.credit_transactions where purchase_id = v_purchase;
  if v_count <> 1 then raise exception 'expected one ledger entry, got %', v_count; end if;

  -- Generic balance adjustment must update balance and ledger in the same RPC.
  v_balance := public.adjust_credits_balance_and_log(v_user::text, -10, 'usage', 'test spend');
  if v_balance <> 100 then raise exception 'expected adjusted balance 100, got %', v_balance; end if;
  select count(*) into v_count from public.credit_transactions where user_id = v_user::text;
  if v_count <> 2 then raise exception 'expected two total ledger entries, got %', v_count; end if;

  insert into public.projects(user_id, niche) values (v_user, 'test') returning id into v_project;
  insert into public.boards(project_id) values (v_project) returning id into v_board;

  -- Generated pin rows and the corresponding credit debit must commit together.
  v_result := public.save_generated_pins_and_charge(
    v_user::text, v_board,
    '[{"image_url":"https://cdn.example.invalid/a.png","title":"A","description":"A","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":5},
      {"image_url":"https://cdn.example.invalid/b.png","title":"B","description":"B","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":5}]'::jsonb,
    10
  );
  if (v_result->>'balance')::integer <> 90 then raise exception 'generation debit was not applied'; end if;
  if jsonb_array_length(v_result->'pins') <> 2 then raise exception 'expected two persisted pins'; end if;
  select id into v_pin from public.pins where board_id=v_board order by created_at limit 1;

  -- Regeneration updates the image and debit as one transaction.
  v_result := public.update_pin_image_and_charge(
    v_user::text, v_pin, 'https://cdn.example.invalid/a-new.png', 10
  );
  if (v_result->>'balance')::integer <> 80 then raise exception 'regeneration debit was not applied'; end if;
  if (select image_url from public.pins where id=v_pin) <> 'https://cdn.example.invalid/a-new.png' then
    raise exception 'regenerated image was not saved';
  end if;

  -- Insufficient balance must roll back without inserting any pins or ledger rows.
  select credits_balance into v_before from public.users where id=v_user;
  begin
    perform public.save_generated_pins_and_charge(
      v_user::text, v_board,
      '[{"image_url":"https://cdn.example.invalid/c.png","title":"C","description":"C","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":999}]'::jsonb,
      999
    );
    raise exception 'expected insufficient credits error';
  exception when others then
    if sqlerrm = 'expected insufficient credits error' then raise; end if;
  end;
  if (select credits_balance from public.users where id=v_user) <> v_before then
    raise exception 'failed generation changed user balance';
  end if;

  -- Durable image-task plan: exact prompts and provider keys survive retries.
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-journal-0001', repeat('f',64));
  if v_result->>'status' <> 'started' then raise exception 'journal generation fixture must start'; end if;
  v_result := public.save_pin_generation_plan(
    v_user::text,
    'ci-generation-journal-0001',
    '[{"title":"Journal pin","description":"Saved before provider submission","prompt":"exact immutable image prompt","model":"flux-schnell","aspect_ratio":"2:3"}]'::jsonb
  );
  if jsonb_array_length(v_result) <> 1 then raise exception 'generation plan was not persisted'; end if;
  if v_result->0->>'status' <> 'prepared' then raise exception 'new journal task must be prepared'; end if;
  v_provider_key := v_result->0->>'provider_idempotency_key';
  if coalesce(v_provider_key,'') = '' then raise exception 'provider idempotency key was not created'; end if;
  v_result := public.save_pin_generation_plan(
    v_user::text,
    'ci-generation-journal-0001',
    '[{"title":"Changed title","description":"","prompt":"different prompt","model":"flux-schnell","aspect_ratio":"2:3"}]'::jsonb
  );
  if v_result->0->>'prompt' <> 'exact immutable image prompt'
     or v_result->0->>'provider_idempotency_key' <> v_provider_key then
    raise exception 'retry changed immutable plan or provider idempotency key';
  end if;
  if not public.update_pin_generation_task(
    v_user::text, 'ci-generation-journal-0001', 1, 'submitting'
  ) then raise exception 'journal task did not enter submitting'; end if;
  if not public.update_pin_generation_task(
    v_user::text, 'ci-generation-journal-0001', 1, 'queued', 'ci-task-0001'
  ) then raise exception 'provider task id was not persisted'; end if;
  if not public.update_pin_generation_task(
    v_user::text, 'ci-generation-journal-0001', 1, 'running'
  ) then raise exception 'journal task did not enter running'; end if;
  if not public.update_pin_generation_task(
    v_user::text, 'ci-generation-journal-0001', 1, 'succeeded',
    'ci-task-0001', 'https://provider.example.invalid/result.png',
    'https://storage.example.invalid/result.png', 0.6
  ) then raise exception 'journal task did not complete'; end if;
  begin
    perform public.update_pin_generation_task(
      v_user::text, 'ci-generation-journal-0001', 1, 'running'
    );
    raise exception 'completed journal task was allowed to regress';
  exception when others then
    if sqlerrm = 'completed journal task was allowed to regress' then raise; end if;
  end;

  -- A later provider response must not replace the provider task ID already
  -- associated with this stable idempotency key.
  begin
    perform public.update_pin_generation_task(
      v_user::text, 'ci-generation-journal-0001', 1, 'succeeded',
      'ci-task-different'
    );
    raise exception 'journal accepted a different provider task ID';
  exception when others then
    if sqlerrm = 'journal accepted a different provider task ID' then raise; end if;
    if sqlerrm not like '%provider task id mismatch%' then raise; end if;
  end;

  -- Numeric NaN/Infinity values must never become a billable provider price.
  begin
    perform public.update_pin_generation_task(
      v_user::text, 'ci-generation-journal-0001', 1, 'succeeded',
      'ci-task-0001', null, null, 'NaN'::numeric
    );
    raise exception 'journal accepted a non-finite provider price';
  exception when others then
    if sqlerrm = 'journal accepted a non-finite provider price' then raise; end if;
    if sqlerrm not like '%invalid provider price%' then raise; end if;
  end;

  insert into public.subscriptions(user_id, plan, status, provider_payment_id, amount, currency)
  values (v_user::text, 'start', 'pending', 'ci-sub-' || v_user, 1990, 'rub')
  returning id into v_sub;

  perform public.activate_paid_subscription(v_sub, now());
  select period_end into v_first_end from public.subscriptions where id = v_sub;

  -- Subscription activation and its notification event must be atomic and idempotent.
  select count(*) into v_count from public.email_outbox
   where subscription_id = v_sub and event_key = 'subscription_activated:' || v_sub::text;
  if v_count <> 1 then raise exception 'activation must enqueue exactly one email event'; end if;

  select id, claim_token into v_outbox_id, v_outbox_claim
    from public.claim_email_outbox(10)
   where subscription_id = v_sub;
  if v_outbox_id is null or v_outbox_claim is null then
    raise exception 'pending subscription email was not claimed';
  end if;
  v_outbox_marked := public.mark_email_outbox_sent(v_outbox_id, gen_random_uuid());
  if v_outbox_marked is distinct from false then
    raise exception 'email outbox accepted an incorrect claim token';
  end if;
  v_outbox_marked := public.mark_email_outbox_sent(v_outbox_id, v_outbox_claim);
  if v_outbox_marked is distinct from true then
    raise exception 'email outbox did not accept the current claim token';
  end if;
  if (select recipient_email from public.email_outbox where id = v_outbox_id) is not null then
    raise exception 'sent outbox row retained recipient email';
  end if;

  insert into public.email_outbox(
    event_key, subscription_id, recipient_email, locale, template_key, payload
  ) values (
    'ci-retry:' || v_sub::text, v_sub, 'retry@example.invalid', 'en',
    'subscription_activated', '{}'::jsonb
  ) returning id into v_outbox_retry_id;
  select claim_token into v_outbox_retry_claim
    from public.claim_email_outbox(10)
   where id = v_outbox_retry_id;
  if v_outbox_retry_claim is null then
    raise exception 'retry test outbox row was not claimed';
  end if;
  if public.retry_email_outbox(v_outbox_retry_id, v_outbox_retry_claim, 'smtp_error') is distinct from true then
    raise exception 'email outbox retry was not scheduled';
  end if;
  if (select status from public.email_outbox where id = v_outbox_retry_id) <> 'pending'
     or (select attempts from public.email_outbox where id = v_outbox_retry_id) <> 1
     or (select next_attempt_at from public.email_outbox where id = v_outbox_retry_id) <= now() then
    raise exception 'email outbox retry backoff was not applied';
  end if;
  if public.mark_email_outbox_sent(v_outbox_retry_id, v_outbox_retry_claim) is distinct from false then
    raise exception 'expired email claim token was accepted after retry';
  end if;

  perform public.activate_paid_subscription(v_sub, now() + interval '1 day');
  select count(*) into v_count from public.email_outbox
   where subscription_id = v_sub and event_key = 'subscription_activated:' || v_sub::text;
  if v_count <> 1 then raise exception 'duplicate payment callback enqueued a second email'; end if;

  perform public.activate_paid_subscription(v_sub, now() + interval '1 day');
  select period_end into v_second_end from public.subscriptions where id = v_sub;
  if v_first_end is distinct from v_second_end then
    raise exception 'duplicate subscription webhook extended the same order';
  end if;

  select tariff_plan into v_plan from public.users where id = v_user;
  if v_plan <> 'start' then raise exception 'expected tariff start, got %', v_plan; end if;


  -- Idempotency: completed generation returns stored pins without charging again.
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-key-0001', repeat('a',64));
  if v_result->>'status' <> 'started' then raise exception 'first generation request must start'; end if;
  v_result := public.complete_pin_generation_request(
    v_user::text, v_board, 'ci-generation-key-0001',
    '[{"image_url":"https://cdn.example.invalid/idempotent.png","title":"Idempotent","description":"","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":5}]'::jsonb,
    5
  );
  if (v_result->>'balance')::integer <> 75 then raise exception 'idempotent first charge incorrect'; end if;
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-key-0001', repeat('a',64));
  if v_result->>'status' <> 'completed' then raise exception 'duplicate generation must return completed'; end if;
  if jsonb_array_length(v_result->'pins') <> 1 then raise exception 'duplicate generation did not return cached pins'; end if;
  if (select credits_balance from public.users where id=v_user) <> 75 then
    raise exception 'duplicate generation charged credits twice';
  end if;

  -- A failed atomic completion must leave the request retryable and must not
  -- persist pins or debit credits. After funding, the same key completes once.
  v_result := public.begin_pin_generation_request(
    v_user::text, v_board, 'ci-generation-atomic-retry-0001', repeat('d',64)
  );
  if v_result->>'status' <> 'started' then
    raise exception 'atomic retry fixture must start';
  end if;
  select credits_balance into v_before from public.users where id=v_user;
  begin
    perform public.complete_pin_generation_request(
      v_user::text, v_board, 'ci-generation-atomic-retry-0001',
      '[{"image_url":"https://cdn.example.invalid/atomic-retry.png","title":"Atomic retry","description":"","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":76}]'::jsonb,
      76
    );
    raise exception 'expected atomic completion to reject insufficient credits';
  exception when others then
    if sqlerrm = 'expected atomic completion to reject insufficient credits' then raise; end if;
    if sqlerrm not like '%insufficient credits%' then raise; end if;
  end;
  if (select credits_balance from public.users where id=v_user) <> v_before
     or exists (select 1 from public.pins where board_id=v_board and title='Atomic retry')
     or (select status from public.pin_generation_requests
          where user_id=v_user::text and idempotency_key='ci-generation-atomic-retry-0001') <> 'processing' then
    raise exception 'failed atomic completion left partial state';
  end if;

  perform public.adjust_credits_balance_and_log(v_user::text, 1, 'topup', 'atomic retry test');
  v_result := public.complete_pin_generation_request(
    v_user::text, v_board, 'ci-generation-atomic-retry-0001',
    '[{"image_url":"https://cdn.example.invalid/atomic-retry.png","title":"Atomic retry","description":"","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":76}]'::jsonb,
    76
  );
  if (v_result->>'balance')::integer <> 0
     or jsonb_array_length(v_result->'pins') <> 1 then
    raise exception 'atomic retry did not save exactly one pin and debit once';
  end if;
  v_result := public.complete_pin_generation_request(
    v_user::text, v_board, 'ci-generation-atomic-retry-0001',
    '[{"image_url":"https://cdn.example.invalid/atomic-retry.png","title":"Atomic retry","description":"","model_used":"flux-schnell","aspect_ratio":"2:3","credits_cost":76}]'::jsonb,
    76
  );
  if jsonb_array_length(v_result->'pins') <> 1
     or (select credits_balance from public.users where id=v_user) <> 0
     or (select count(*) from public.pins where board_id=v_board and title='Atomic retry') <> 1 then
    raise exception 'repeated completion duplicated pins or charged credits again';
  end if;

  -- An expired generation request becomes unknown and is never auto-restarted.
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-stale-0001', repeat('b',64));
  if v_result->>'status' <> 'started' then raise exception 'stale generation fixture must start'; end if;
  update public.pin_generation_requests
     set updated_at=now() - interval '31 minutes'
   where user_id=v_user::text and idempotency_key='ci-generation-stale-0001';
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-stale-0001', repeat('b',64));
  if v_result->>'status' <> 'unknown' then raise exception 'stale generation must become unknown'; end if;
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-stale-0001', repeat('b',64));
  if v_result->>'status' <> 'unknown' then raise exception 'unknown generation must never auto-restart'; end if;

  -- A known pre-provider failure is terminal for this key too.
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-failed-0001', repeat('c',64));
  if v_result->>'status' <> 'started' then raise exception 'failed generation fixture must start'; end if;
  if not public.fail_pin_generation_request(v_user::text, 'ci-generation-failed-0001', 'insufficient_credits', false) then
    raise exception 'known generation failure was not recorded';
  end if;
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-failed-0001', repeat('c',64));
  if v_result->>'status' <> 'failed' then raise exception 'failed generation key must remain terminal'; end if;

  -- A network failure after submission to the provider is explicitly unknown.
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-provider-unknown-0001', repeat('e',64));
  if v_result->>'status' <> 'started' then raise exception 'provider-unknown fixture must start'; end if;
  if not public.fail_pin_generation_request(v_user::text, 'ci-generation-provider-unknown-0001', 'provider_timeout', true) then
    raise exception 'provider uncertainty was not recorded';
  end if;
  v_result := public.begin_pin_generation_request(v_user::text, v_board, 'ci-generation-provider-unknown-0001', repeat('e',64));
  if v_result->>'status' <> 'unknown' then raise exception 'provider timeout must block automatic replay'; end if;

  -- An uncertain request with a durable plan is resumable without new prompts or keys.
  if not public.fail_pin_generation_request(
    v_user::text, 'ci-generation-journal-0001', 'simulated_response_loss', true
  ) then raise exception 'journal request did not enter unknown state'; end if;
  v_result := public.begin_pin_generation_request(
    v_user::text, v_board, 'ci-generation-journal-0001', repeat('f',64)
  );
  if v_result->>'status' <> 'resume' then
    raise exception 'journal-backed unknown request must be resumable';
  end if;
  v_result := public.get_pin_generation_plan(v_user::text, 'ci-generation-journal-0001');
  if v_result->0->>'status' <> 'succeeded'
     or v_result->0->>'storage_url' <> 'https://storage.example.invalid/result.png'
     or v_result->0->>'provider_idempotency_key' <> v_provider_key then
    raise exception 'recovery did not return persisted provider result and key';
  end if;

  -- A second paid order must start after the current paid entitlement.
  insert into public.subscriptions(user_id, plan, status, provider_payment_id, amount, currency)
  values (v_user::text, 'pro', 'pending', 'ci-sub-next-' || v_user, 4990, 'rub')
  returning id into v_sub;

  perform public.activate_paid_subscription(v_sub, now());
  if (select period_start from public.subscriptions where id = v_sub) < v_first_end then
    raise exception 'next subscription overlaps existing entitlement';
  end if;

  -- A delayed webhook for an older order extends the period but must not
  -- replace the plan selected by a newer-created paid order.
  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency, created_at
  ) values (
    v_user::text, 'start', 'pending', 'ci-sub-late-older-' || v_user,
    1990, 'rub', now() + interval '1 hour'
  ) returning id into v_older_sub;

  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency, created_at
  ) values (
    v_user::text, 'agency', 'pending', 'ci-sub-late-newer-' || v_user,
    12990, 'rub', now() + interval '2 hours'
  ) returning id into v_newer_sub;

  perform public.activate_paid_subscription(v_newer_sub, now());
  select period_end into v_newer_end
    from public.subscriptions where id = v_newer_sub;

  v_result := public.activate_paid_subscription(v_older_sub, now() + interval '1 minute');
  if v_result->>'current_plan' <> 'agency' or v_result->>'plan_applied' <> 'false' then
    raise exception 'late older webhook reported an incorrect effective plan';
  end if;
  select period_end into v_late_end
    from public.subscriptions where id = v_older_sub;

  select tariff_plan into v_plan from public.users where id = v_user;
  if v_plan <> 'agency' then
    raise exception 'late older webhook downgraded the newer agency plan to %', v_plan;
  end if;
  if v_late_end <= v_newer_end then
    raise exception 'late older paid order did not extend the entitlement period';
  end if;
  if (select tariff_period_end from public.users where id = v_user) <> v_late_end then
    raise exception 'user entitlement end does not match the extended period';
  end if;

  -- A stale order for the same plan must still report that it did not apply
  -- the plan; comparing only plan-name equality would incorrectly return true.
  insert into public.subscriptions(
    user_id, plan, status, provider_payment_id, amount, currency, created_at
  ) values (
    v_user::text, 'agency', 'pending', 'ci-sub-same-plan-older-' || v_user,
    12990, 'rub', now() + interval '90 minutes'
  ) returning id into v_same_plan_older_sub;

  v_same_plan_result := public.activate_paid_subscription(v_same_plan_older_sub, now() + interval '2 minutes');
  if v_same_plan_result->>'current_plan' <> 'agency'
     or v_same_plan_result->>'plan_applied' <> 'false' then
    raise exception 'stale same-plan webhook incorrectly reported that it applied the current plan';
  end if;

  -- Use a real connected account row for account-scoped publication and schedules.
  insert into public.pinterest_accounts(
    user_id, pinterest_user_id, username, access_token, refresh_token, scopes
  ) values (
    v_user::text, 'ci-pinterest-' || v_user, 'ci_account',
    'enc:ci-access', 'enc:ci-refresh', 'boards:read,pins:write'
  ) returning id into v_pinterest_account;

  -- Pinterest publish reservation: concurrent/repeated calls cannot start a second request.
  v_publish_result := public.begin_pinterest_publish_v2(v_user::text, v_pin, v_pinterest_account, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'started' then
    raise exception 'first Pinterest publish reservation must start';
  end if;
  v_publish_result := public.begin_pinterest_publish_v2(v_user::text, v_pin, v_pinterest_account, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'processing' then
    raise exception 'duplicate Pinterest publish must be blocked while processing';
  end if;
  perform public.complete_pinterest_publish_v2(v_user::text, v_pin, v_pinterest_account, 'remote-pin-ci-001', 'pinterest-board-ci');
  v_publish_result := public.begin_pinterest_publish_v2(v_user::text, v_pin, v_pinterest_account, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'published' or v_publish_result->>'pinterest_pin_id' <> 'remote-pin-ci-001' then
    raise exception 'completed Pinterest publish must return the stored remote pin';
  end if;

  -- An uncertain external result must remain blocked, never auto-retried.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/uncertain.png', 'Uncertain', '', 'pending', 'flux-schnell', 0)
  returning id into v_uncertain_pin;
  v_publish_result := public.begin_pinterest_publish_v2(v_user::text, v_uncertain_pin, v_pinterest_account, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'started' then raise exception 'uncertain test reservation did not start'; end if;
  perform public.fail_pinterest_publish_v2(v_user::text, v_uncertain_pin, v_pinterest_account, 'simulated timeout', true);
  v_publish_result := public.begin_pinterest_publish_v2(v_user::text, v_uncertain_pin, v_pinterest_account, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'unknown' then
    raise exception 'uncertain Pinterest result must block duplicate retry';
  end if;

  -- A late successful Pinterest response can still reconcile an unknown attempt
  -- without issuing a second remote create request.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/late-success.png', 'Late success', '', 'pending', 'flux-schnell', 0)
  returning id into v_late_success_pin;
  v_publish_result := public.begin_pinterest_publish_v2(v_user::text, v_late_success_pin, v_pinterest_account, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'started' then
    raise exception 'late-success test reservation did not start';
  end if;
  update public.pinterest_publish_attempts
    set updated_at=now() - interval '16 minutes'
    where pin_id=v_late_success_pin and pinterest_account_id=v_pinterest_account;
  v_publish_result := public.begin_pinterest_publish_v2(v_user::text, v_late_success_pin, v_pinterest_account, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'unknown' then
    raise exception 'stale processing attempt should be marked unknown';
  end if;
  perform public.complete_pinterest_publish_v2(v_user::text, v_late_success_pin, v_pinterest_account, 'remote-pin-late-ci', 'pinterest-board-ci');
  v_publish_result := public.begin_pinterest_publish_v2(v_user::text, v_late_success_pin, v_pinterest_account, 'pinterest-board-ci');
  if v_publish_result->>'status' <> 'published'
     or v_publish_result->>'pinterest_pin_id' <> 'remote-pin-late-ci' then
    raise exception 'late successful response did not reconcile the unknown attempt';
  end if;

  -- An unknown publication outcome must block a second schedule for the same pin.
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status)
  values (v_user::text,v_uncertain_pin,v_pinterest_account,now() + interval '1 day','Europe/Moscow','pinterest-board-ci','unknown');
  begin
    insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id)
    values (v_user::text,v_uncertain_pin,v_pinterest_account,now() + interval '2 days','Europe/Moscow','pinterest-board-ci');
    raise exception 'expected unknown publication schedule to block rescheduling';
  exception when unique_violation then
    null;
  end;

  -- Due schedule rows are claimed atomically and not returned twice.
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id)
  values (v_user::text,v_pin,v_pinterest_account,now() - interval '1 minute','Europe/Moscow','pinterest-board-ci')
  returning id into v_schedule;
  select count(*) into v_schedule_count
    from public.claim_due_pin_schedules(10)
    where id=v_schedule;
  if v_schedule_count <> 1 then raise exception 'due schedule was not claimed'; end if;
  select count(*) into v_schedule_count from public.claim_due_pin_schedules(10);
  if v_schedule_count <> 0 then raise exception 'claimed schedule was returned twice'; end if;
  if (select status from public.pin_schedules where id=v_schedule) <> 'publishing' then
    raise exception 'claimed schedule status was not updated';
  end if;

  update public.pin_schedules set status='cancelled' where id=v_schedule;

  -- A worker that stopped after Pinterest success is recovered from the durable
  -- publication journal, rather than being marked unknown or republished.
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,updated_at)
  values (v_user::text,v_pin,v_pinterest_account,now() - interval '30 minutes','Europe/Moscow','pinterest-board-ci','publishing',now() - interval '21 minutes')
  returning id into v_schedule;
  perform public.claim_due_pin_schedules(10);
  if (select status from public.pin_schedules where id=v_schedule) <> 'published'
     or (select pinterest_pin_id from public.pin_schedules where id=v_schedule) <> 'remote-pin-ci-001' then
    raise exception 'stale schedule with confirmed Pinterest success was not recovered';
  end if;

  -- A stale publishing row without a confirmed remote ID becomes unknown,
  -- and is not automatically returned to the due queue.
  update public.pin_schedules
    set status='publishing', updated_at=now() - interval '21 minutes'
    where pin_id=v_uncertain_pin and status='unknown';
  perform public.claim_due_pin_schedules(10);
  if (select status from public.pin_schedules where pin_id=v_uncertain_pin and status='unknown' limit 1) <> 'unknown' then
    raise exception 'stale uncertain schedule was made retryable';
  end if;

  -- A separate unpublished pin is used for the schedule create/cancel/reschedule
  -- lifecycle: the previously published pin must remain protected by the unique index.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/schedule-test.png', 'Schedule lifecycle', '', 'pending', 'flux-schnell', 0)
  returning id into v_schedule_test_pin;

  -- Persistent schedule records remain scheduled until a publisher confirms success.
  insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone)
  values (v_user::text, v_schedule_test_pin, v_pinterest_account, now() + interval '1 day', 'Europe/Moscow')
  returning id into v_schedule;
  if (select status from public.pin_schedules where id=v_schedule) <> 'scheduled' then
    raise exception 'new schedule must start as scheduled';
  end if;
  begin
    insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone)
    values (v_user::text, v_schedule_test_pin, v_pinterest_account, now() + interval '2 days', 'Europe/Moscow');
    raise exception 'expected duplicate active schedule to be rejected';
  exception when unique_violation then
    null;
  end;
  update public.pin_schedules set status='cancelled' where id=v_schedule;
  insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone)
  values (v_user::text, v_schedule_test_pin, v_pinterest_account, now() + interval '2 days', 'Europe/Moscow');
  select count(*) into v_schedule_count from public.pin_schedules
    where user_id=v_user::text and pin_id=v_schedule_test_pin and status='scheduled';
  if v_schedule_count <> 1 then raise exception 'rescheduling after cancellation failed'; end if;

  -- Signed-but-unmatched payment notifications leave a minimal, deduplicated audit record.
  insert into public.billing_webhook_exceptions(
    payment_kind, order_id, payment_status, received_sum, expected_amount, reason, event_hash
  ) values (
    'credits', 'ppc-unknown-ci', 'success', '190.00', 790, 'amount_mismatch', repeat('a',64)
  );
  begin
    insert into public.billing_webhook_exceptions(
      payment_kind, order_id, payment_status, received_sum, expected_amount, reason, event_hash
    ) values (
      'credits', 'ppc-unknown-ci', 'success', '190.00', 790, 'amount_mismatch', repeat('a',64)
    );
    raise exception 'duplicate webhook exception fingerprint was accepted';
  exception when unique_violation then
    null;
  end;
  select count(*) into v_count from public.billing_webhook_exceptions
    where event_hash=repeat('a',64);
  if v_count <> 1 then raise exception 'webhook exception audit was not deduplicated'; end if;
  if has_table_privilege('anon', 'public.billing_webhook_exceptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.billing_webhook_exceptions', 'INSERT')
     or has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'SELECT')
     or has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'UPDATE')
     or has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'DELETE')
     or not has_table_privilege('service_role', 'public.billing_webhook_exceptions', 'INSERT') then
    raise exception 'billing webhook audit table privileges are too broad or insufficient';
  end if;

  if has_table_privilege('anon', 'public.email_outbox', 'SELECT')
     or has_table_privilege('authenticated', 'public.email_outbox', 'SELECT')
     or has_table_privilege('anon', 'public.email_outbox', 'INSERT')
     or has_table_privilege('authenticated', 'public.email_outbox', 'INSERT')
     or has_table_privilege('service_role', 'public.email_outbox', 'DELETE')
     or not has_table_privilege('service_role', 'public.email_outbox', 'SELECT')
     or not has_table_privilege('service_role', 'public.email_outbox', 'UPDATE') then
    raise exception 'email outbox table privileges are too broad or insufficient';
  end if;

  delete from public.pin_schedules where user_id=v_user::text;
  delete from public.pinterest_publish_attempts where user_id=v_user::text;
  delete from public.pinterest_publications where user_id=v_user::text;
  delete from public.pinterest_accounts where id=v_pinterest_account;
  delete from public.pins where board_id = v_board;
  delete from public.boards where id = v_board;
  delete from public.email_outbox where subscription_id in (select id from public.subscriptions where user_id = v_user::text);
  delete from public.subscriptions where user_id = v_user::text;
  delete from public.projects where id = v_project;
  delete from public.users where id = v_user;
end;
$$;
