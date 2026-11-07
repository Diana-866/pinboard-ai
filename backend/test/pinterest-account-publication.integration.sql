-- Run only in disposable PostgreSQL CI after migrations 031-052.
-- A local pin can be published once per Pinterest identity, not once per user.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_legacy_pin uuid;
  v_reconcile_pin uuid;
  v_reconcile_schedule uuid;
  v_legacy_history_schedule uuid;
  v_inflight_pin uuid;
  v_crash_pin uuid;
  v_crash_schedule uuid;
  v_old_claim_token uuid;
  v_new_claim_token uuid;
  v_retry_pin uuid;
  v_retry_schedule uuid;
  v_manual_retry_pin uuid;
  v_manual_retry_schedule uuid;
  v_attempt_retry_pin uuid;
  v_attempt_retry_schedule uuid;
  v_safe_retry_pin uuid;
  v_safe_retry_schedule uuid;
  v_delete_before_pin uuid;
  v_delete_before_schedule uuid;
  v_delete_after_pin uuid;
  v_delete_after_schedule uuid;
  v_delete_after_claim uuid;
  v_account_a uuid;
  v_account_b uuid;
  v_result jsonb;
  v_original_schedule_at timestamptz;
  v_publication_count integer;
  v_schedule_count integer;
  v_disconnected boolean;
begin
  insert into public.users(id, email, token_version)
  values (v_user, 'pinterest-account-publish-' || v_user || '@example.invalid', 0);

  insert into public.projects(user_id, niche) values (v_user, 'multi-account-ci') returning id into v_project;
  insert into public.boards(project_id, title) values (v_project, 'multi-account-ci') returning id into v_board;
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/multi-account.png', 'Multi account', '', 'pending', 'flux-schnell', 0)
  returning id into v_pin;

  insert into public.pinterest_accounts(user_id, pinterest_user_id, username, access_token)
  values (v_user::text, 'account-a-' || v_user, 'account_a', 'enc:a')
  returning id into v_account_a;

  insert into public.pinterest_accounts(user_id, pinterest_user_id, username, access_token)
  values (v_user::text, 'account-b-' || v_user, 'account_b', 'enc:b')
  returning id into v_account_b;

  -- Legacy history without an account mapping must not be guessed or retried.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/legacy.png', 'Legacy pin', '', 'pending', 'flux-schnell', 0)
  returning id into v_legacy_pin;
  insert into public.pinterest_publish_attempts(
    user_id, pin_id, pinterest_board_id, status
  ) values (
    v_user::text, v_legacy_pin, 'legacy-board', 'failed'
  );
  v_result := public.begin_pinterest_publish_v2(v_user::text, v_legacy_pin, v_account_a, 'board-a');
  if v_result->>'status' <> 'unknown' then
    raise exception 'unmapped legacy publication history was allowed to retry: %', v_result;
  end if;

  -- A legacy schedule with a publish journal must not be assigned to a new identity.
  insert into public.pin_schedules(
    user_id, pin_id, scheduled_at, timezone, pinterest_board_id, status
  ) values (
    v_user::text, v_legacy_pin, now() + interval '1 day', 'UTC', 'legacy-board', 'failed'
  ) returning id into v_legacy_history_schedule;
  v_result := public.reconcile_legacy_pinterest_schedule_account(
    v_user::text, v_legacy_history_schedule, v_account_a
  );
  if v_result->>'reason' <> 'publication_history_exists'
     or (select pinterest_account_id from public.pin_schedules where id=v_legacy_history_schedule) is not null then
    raise exception 'legacy schedule with a publication journal was incorrectly reconciled: %', v_result;
  end if;

  -- A schedule with no publication history can be explicitly bound to the
  -- account whose remote board was verified by the API layer.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/reconcile.png', 'Reconcile account', '', 'approved', 'flux-schnell', 0)
  returning id into v_reconcile_pin;
  insert into public.pin_schedules(
    user_id, pin_id, scheduled_at, timezone, pinterest_board_id, status, last_error
  ) values (
    v_user::text, v_reconcile_pin, now() - interval '1 hour', 'UTC', 'board-b', 'failed',
    'Pinterest account is missing or disconnected'
  ) returning id into v_reconcile_schedule;
  v_result := public.reconcile_legacy_pinterest_schedule_account(
    v_user::text, v_reconcile_schedule, v_account_b
  );
  if v_result->>'ok' <> 'true'
     or (select pinterest_account_id from public.pin_schedules where id=v_reconcile_schedule) <> v_account_b
     or (select status from public.pin_schedules where id=v_reconcile_schedule) <> 'scheduled'
     or (select last_error from public.pin_schedules where id=v_reconcile_schedule) is not null then
    raise exception 'safe legacy schedule reconciliation failed: %', v_result;
  end if;

  v_result := public.begin_pinterest_publish_v2(v_user::text, v_pin, v_account_a, 'board-a');
  if v_result->>'status' <> 'started' then
    raise exception 'first account publication did not start: %', v_result;
  end if;
  perform public.complete_pinterest_publish_v2(v_user::text, v_pin, v_account_a, 'remote-a', 'board-a');

  v_result := public.begin_pinterest_publish_v2(v_user::text, v_pin, v_account_b, 'board-b');
  if v_result->>'status' <> 'started' then
    raise exception 'same local pin could not be published to second account: %', v_result;
  end if;
  perform public.complete_pinterest_publish_v2(v_user::text, v_pin, v_account_b, 'remote-b', 'board-b');

  select count(*) into v_publication_count
    from public.pinterest_publications
   where user_id = v_user::text and pin_id = v_pin;
  if v_publication_count <> 2 then
    raise exception 'expected one publication per Pinterest account, got %', v_publication_count;
  end if;

  v_result := public.begin_pinterest_publish_v2(v_user::text, v_pin, v_account_a, 'board-a');
  if v_result->>'status' <> 'published' or v_result->>'pinterest_pin_id' <> 'remote-a' then
    raise exception 'duplicate publication on account A was not idempotent: %', v_result;
  end if;

  -- A separate claimed schedule models a worker already in flight.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/inflight.png', 'In-flight pin', '', 'pending', 'flux-schnell', 0)
  returning id into v_inflight_pin;
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status, claim_token
  ) values (
    v_user::text, v_inflight_pin, v_account_a, now() - interval '1 minute',
    'UTC', 'board-a', 'publishing', gen_random_uuid()
  );

  -- A stale claim with no attempt journal is safe to requeue, but its old
  -- worker must be fenced before it can reserve an attempt or send a POST.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/pre-journal-crash.png', 'Pre-journal crash', '', 'pending', 'flux-schnell', 0)
  returning id into v_crash_pin;
  v_old_claim_token := gen_random_uuid();
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status, claim_token, updated_at
  ) values (
    v_user::text, v_crash_pin, v_account_a, now() - interval '1 day',
    'UTC', 'board-a', 'publishing', v_old_claim_token, now() - interval '21 minutes'
  ) returning id into v_crash_schedule;

  if exists (
    select 1 from public.claim_due_pin_schedules(10) where id=v_crash_schedule
  ) then
    raise exception 'pre-journal stale claim was re-claimed before its safety backoff';
  end if;
  if (select status from public.pin_schedules where id=v_crash_schedule) <> 'scheduled'
     or (select claim_token from public.pin_schedules where id=v_crash_schedule) is not null
     or (select next_attempt_at from public.pin_schedules where id=v_crash_schedule) <= now()
     or exists (select 1 from public.pinterest_publish_attempts where pin_id=v_crash_pin and pinterest_account_id=v_account_a) then
    raise exception 'stale pre-journal claim was not safely requeued';
  end if;

  begin
    perform public.begin_scheduled_pinterest_publish(
      v_user::text,v_crash_schedule,v_old_claim_token,v_crash_pin,v_account_a,'board-a'
    );
    raise exception 'stale worker claim token was accepted after recovery';
  exception when sqlstate '40001' then
    null;
  end;

  update public.pin_schedules
     set next_attempt_at=now() - interval '1 second'
   where id=v_crash_schedule;
  select claim_token into v_new_claim_token
    from public.claim_due_pin_schedules(10)
   where id=v_crash_schedule;
  if v_new_claim_token is null or v_new_claim_token=v_old_claim_token then
    raise exception 'reclaimed schedule did not receive a fresh fencing token';
  end if;

  begin
    perform public.begin_scheduled_pinterest_publish(
      v_user::text,v_crash_schedule,v_old_claim_token,v_crash_pin,v_account_a,'board-a'
    );
    raise exception 'old worker was able to reserve an attempt after a new claim';
  exception when sqlstate '40001' then
    null;
  end;

  v_result := public.begin_scheduled_pinterest_publish(
    v_user::text,v_crash_schedule,v_new_claim_token,v_crash_pin,v_account_a,'board-a'
  );
  if v_result->>'status' <> 'started'
     or not exists (select 1 from public.pinterest_publish_attempts where pin_id=v_crash_pin and pinterest_account_id=v_account_a) then
    raise exception 'current schedule claim could not atomically reserve its publish journal: %',v_result;
  end if;

  -- A retry backoff must keep a due schedule out of the worker claim set
  -- until next_attempt_at, then allow it to be claimed normally.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/retry.png', 'Retry pin', '', 'pending', 'flux-schnell', 0)
  returning id into v_retry_pin;
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status, next_attempt_at
  ) values (
    v_user::text, v_retry_pin, v_account_b, now() - interval '2 minutes',
    'UTC', 'board-b', 'scheduled', now() + interval '5 minutes'
  ) returning id into v_retry_schedule;

  if exists (
    select 1 from public.claim_due_pin_schedules(10) where id = v_retry_schedule
  ) then
    raise exception 'schedule was claimed before its retry backoff elapsed';
  end if;

  update public.pin_schedules
     set next_attempt_at = now() - interval '1 second'
   where id = v_retry_schedule;
  if not exists (
    select 1 from public.claim_due_pin_schedules(10) where id = v_retry_schedule
  ) then
    raise exception 'schedule was not claimed after its retry backoff elapsed';
  end if;
  if (select attempts from public.pin_schedules where id = v_retry_schedule) <> 1 then
    raise exception 'retry schedule claim did not increment attempts exactly once';
  end if;

  -- Manual retry is allowed only when the journal proves no publish attempt exists.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/manual-retry.png', 'Manual retry pin', '', 'pending', 'flux-schnell', 0)
  returning id into v_manual_retry_pin;
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status, last_error
  ) values (
    v_user::text, v_manual_retry_pin, v_account_a, now() - interval '1 day',
    'UTC', 'board-a', 'failed', 'Account disconnected'
  ) returning id into v_manual_retry_schedule;

  select scheduled_at into v_original_schedule_at from public.pin_schedules where id = v_manual_retry_schedule;
  v_result := public.retry_failed_pin_schedule(v_user::text, v_manual_retry_schedule);
  if v_result->>'ok' <> 'true' then
    raise exception 'safe failed schedule could not be retried: %', v_result;
  end if;
  if (select status from public.pin_schedules where id = v_manual_retry_schedule) <> 'scheduled'
     or (select next_attempt_at from public.pin_schedules where id = v_manual_retry_schedule) is not null
     or (select attempts from public.pin_schedules where id = v_manual_retry_schedule) <> 0
     or (select last_error from public.pin_schedules where id = v_manual_retry_schedule) is not null
     or (select original_scheduled_at from public.pin_schedules where id = v_manual_retry_schedule) is distinct from v_original_schedule_at then
    raise exception 'manual retry did not restore the schedule cleanly';
  end if;

  -- A failed journal row is still evidence that the remote request may have
  -- started; the manual retry RPC must refuse it.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/attempt-retry.png', 'Attempt retry pin', '', 'pending', 'flux-schnell', 0)
  returning id into v_attempt_retry_pin;
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status
  ) values (
    v_user::text, v_attempt_retry_pin, v_account_a, now() - interval '1 day',
    'UTC', 'board-a', 'failed'
  ) returning id into v_attempt_retry_schedule;
  insert into public.pinterest_publish_attempts(
    user_id, pin_id, pinterest_account_id, pinterest_board_id, status
  ) values (
    v_user::text, v_attempt_retry_pin, v_account_a, 'board-a', 'failed'
  );

  v_result := public.retry_failed_pin_schedule(v_user::text, v_attempt_retry_schedule);
  if v_result->>'ok' <> 'false' or v_result->>'reason' <> 'publication_attempt_exists' then
    raise exception 'manual retry ignored an existing publish journal: %', v_result;
  end if;
  if (select status from public.pin_schedules where id = v_attempt_retry_schedule) <> 'failed' then
    raise exception 'unsafe schedule was changed despite an existing publish attempt';
  end if;
  v_result := public.begin_pinterest_publish_v2(
    v_user::text,v_attempt_retry_pin,v_account_a,'board-a'
  );
  if v_result->>'status' <> 'failed' then
    raise exception 'direct publish reopened a failed attempt without retry_safe=true: %',v_result;
  end if;

  -- A durable failed attempt is retryable only when the failure RPC marked it
  -- as a confirmed pre-create rejection. Manual retry and begin RPC share it.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/safe-retry.png', 'Safe retry pin', '', 'pending', 'flux-schnell', 0)
  returning id into v_safe_retry_pin;
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status
  ) values (
    v_user::text, v_safe_retry_pin, v_account_b, now() - interval '1 day',
    'UTC', 'board-b', 'failed'
  ) returning id into v_safe_retry_schedule;
  insert into public.pinterest_publish_attempts(
    user_id, pin_id, pinterest_account_id, pinterest_board_id, status
  ) values (
    v_user::text, v_safe_retry_pin, v_account_b, 'board-b', 'processing'
  );
  perform public.fail_pinterest_publish_v2(
    v_user::text,v_safe_retry_pin,v_account_b,'Pinterest rejected before creation',false
  );
  if (select status from public.pinterest_publish_attempts where pin_id=v_safe_retry_pin and pinterest_account_id=v_account_b) <> 'failed'
     or not (select retry_safe from public.pinterest_publish_attempts where pin_id=v_safe_retry_pin and pinterest_account_id=v_account_b) then
    raise exception 'confirmed pre-create failure did not persist retry_safe marker';
  end if;

  v_result := public.retry_failed_pin_schedule(v_user::text, v_safe_retry_schedule);
  if v_result->>'ok' <> 'true'
     or (select status from public.pin_schedules where id=v_safe_retry_schedule) <> 'scheduled' then
    raise exception 'explicitly safe failed attempt could not be manually retried: %',v_result;
  end if;

  v_result := public.begin_pinterest_publish_v2(
    v_user::text,v_safe_retry_pin,v_account_b,'board-b'
  );
  if v_result->>'status' <> 'started'
     or (select status from public.pinterest_publish_attempts where pin_id=v_safe_retry_pin and pinterest_account_id=v_account_b) <> 'processing'
     or (select retry_safe from public.pinterest_publish_attempts where pin_id=v_safe_retry_pin and pinterest_account_id=v_account_b) then
    raise exception 'direct/scheduled publish did not consume the same safe retry marker: %',v_result;
  end if;

  -- Omitting the outcome flag is conservative: unknown is the default.
  perform public.fail_pinterest_publish_v2(
    v_user::text,v_safe_retry_pin,v_account_b,'missing outcome classification'
  );
  if (select status from public.pinterest_publish_attempts where pin_id=v_safe_retry_pin and pinterest_account_id=v_account_b) <> 'unknown'
     or (select retry_safe from public.pinterest_publish_attempts where pin_id=v_safe_retry_pin and pinterest_account_id=v_account_b) then
    raise exception 'omitted failure outcome was not conservatively marked unknown';
  end if;
  v_result := public.begin_pinterest_publish_v2(v_user::text,v_safe_retry_pin,v_account_b,'board-b');
  if v_result->>'status' <> 'unknown' then
    raise exception 'ambiguous attempt was retried after failure classification was omitted: %',v_result;
  end if;

  -- Active schedules are also unique per pin + Pinterest account.
  insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id)
  values (v_user::text, v_pin, v_account_a, now() + interval '1 day', 'UTC', 'board-a');
  insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id)
  values (v_user::text, v_pin, v_account_b, now() + interval '1 day', 'UTC', 'board-b');

  select count(*) into v_schedule_count
    from public.pin_schedules
   where user_id = v_user::text and pin_id = v_pin
     and status = 'scheduled';
  if v_schedule_count <> 2 then
    raise exception 'same pin could not be scheduled independently for two accounts';
  end if;

  begin
    insert into public.pin_schedules(user_id, pin_id, pinterest_account_id, scheduled_at, timezone, pinterest_board_id)
    values (v_user::text, v_pin, v_account_a, now() + interval '2 days', 'UTC', 'board-a');
    raise exception 'duplicate active schedule for same account was accepted';
  exception when unique_violation then
    null;
  end;

  -- Disconnecting A must fail only A's future schedules; B remains queued.
  v_disconnected := public.disconnect_pinterest_account_v2(v_user::text, v_account_a);
  if v_disconnected is distinct from true then
    raise exception 'disconnecting account A failed';
  end if;
  if (select status from public.pin_schedules
       where user_id=v_user::text and pin_id=v_pin and pinterest_account_id=v_account_a) <> 'failed' then
    raise exception 'future schedule for disconnected account A was not failed';
  end if;
  if (select status from public.pin_schedules
       where user_id=v_user::text and pin_id=v_pin and pinterest_account_id=v_account_b) <> 'scheduled' then
    raise exception 'disconnecting account A changed account B schedule';
  end if;

  -- A claimed/in-flight job is not cancelled underneath its remote request.
  if (select status from public.pin_schedules
       where user_id=v_user::text and pin_id=v_inflight_pin
         and pinterest_account_id=v_account_a) <> 'publishing' then
    raise exception 'disconnecting account A rewrote an in-flight schedule';
  end if;

  -- Disconnecting A must not erase either account's already-published history.
  select count(*) into v_publication_count
    from public.pinterest_publications
   where user_id = v_user::text and pin_id = v_pin;
  if v_publication_count <> 2
     or not exists (
       select 1 from public.pinterest_publications
        where user_id=v_user::text and pin_id=v_pin
          and pinterest_account_id=v_account_a and pinterest_pin_id='remote-a'
     )
     or not exists (
       select 1 from public.pinterest_publications
        where user_id=v_user::text and pin_id=v_pin
          and pinterest_account_id=v_account_b and pinterest_pin_id='remote-b'
     ) then
    raise exception 'disconnecting account A changed published history for A or B';
  end if;

  -- Editing the live pin after scheduling must not rewrite the approved creative snapshot.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/snapshot-before.png', 'Snapshot before', 'Original copy', 'approved', 'flux-schnell', 0)
  returning id into v_delete_before_pin;
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status, snapshot_title, snapshot_description,
    snapshot_image_url, snapshot_destination_url
  ) values (
    v_user::text, v_delete_before_pin, v_account_a, now() + interval '1 day', 'UTC',
    'board-a', 'scheduled', 'Snapshot before', 'Original copy',
    'https://cdn.example.invalid/snapshot-before.png', 'https://example.invalid/original'
  ) returning id into v_delete_before_schedule;
  update public.pins
     set title='Edited after scheduling',
         description='Edited copy',
         image_url='https://cdn.example.invalid/snapshot-after.png'
   where id=v_delete_before_pin;
  if (select snapshot_title from public.pin_schedules where id=v_delete_before_schedule) <> 'Snapshot before'
     or (select snapshot_description from public.pin_schedules where id=v_delete_before_schedule) <> 'Original copy'
     or (select snapshot_image_url from public.pin_schedules where id=v_delete_before_schedule) <> 'https://cdn.example.invalid/snapshot-before.png' then
    raise exception 'editing a pin rewrote the immutable schedule snapshot';
  end if;

  -- Deleting the pin before the durable publication boundary cascades the
  -- queued schedule and leaves no publication attempt to send remotely.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/delete-before.png', 'Delete before', '', 'approved', 'flux-schnell', 0)
  returning id into v_delete_before_pin;
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status
  ) values (
    v_user::text, v_delete_before_pin, v_account_a, now() - interval '1 minute',
    'UTC', 'board-a', 'scheduled'
  ) returning id into v_delete_before_schedule;
  delete from public.pins where id=v_delete_before_pin;
  if exists (select 1 from public.pin_schedules where id=v_delete_before_schedule)
     or exists (select 1 from public.pinterest_publish_attempts where pin_id=v_delete_before_pin and pinterest_account_id=v_account_a) then
    raise exception 'deleting a pin before publish reservation left a queued schedule or attempt';
  end if;

  -- Once the durable attempt has begun, deleting the local pin cannot cancel
  -- an already-authorized external request. The attempt/publication ledger has
  -- no cascading pin FK and must retain the eventual remote result for audit.
  insert into public.pins(board_id, image_url, title, description, status, model_used, credits_cost)
  values (v_board, 'https://cdn.example.invalid/delete-after.png', 'Delete after', '', 'approved', 'flux-schnell', 0)
  returning id into v_delete_after_pin;
  v_delete_after_claim := gen_random_uuid();
  insert into public.pin_schedules(
    user_id, pin_id, pinterest_account_id, scheduled_at, timezone,
    pinterest_board_id, status, claim_token
  ) values (
    v_user::text, v_delete_after_pin, v_account_a, now() - interval '1 minute',
    'UTC', 'board-a', 'publishing', v_delete_after_claim
  ) returning id into v_delete_after_schedule;
  v_result := public.begin_scheduled_pinterest_publish(
    v_user::text, v_delete_after_schedule, v_delete_after_claim,
    v_delete_after_pin, v_account_a, 'board-a'
  );
  if v_result->>'status' <> 'started' then
    raise exception 'scheduled publish did not reserve its durable attempt before delete: %', v_result;
  end if;
  delete from public.pins where id=v_delete_after_pin;
  if exists (select 1 from public.pin_schedules where id=v_delete_after_schedule)
     or not exists (
       select 1 from public.pinterest_publish_attempts
        where pin_id=v_delete_after_pin and pinterest_account_id=v_account_a and status='processing'
     ) then
    raise exception 'deleting a pin after begin did not preserve the in-flight attempt journal';
  end if;
  perform public.complete_pinterest_publish_v2(
    v_user::text, v_delete_after_pin, v_account_a, 'remote-after-delete', 'board-a'
  );
  if not exists (
    select 1 from public.pinterest_publications
     where pin_id=v_delete_after_pin and pinterest_account_id=v_account_a
       and pinterest_pin_id='remote-after-delete'
  ) then
    raise exception 'remote publication result was lost after local pin deletion';
  end if;

  delete from public.pin_schedules where user_id = v_user::text;
  delete from public.pinterest_publish_attempts where user_id = v_user::text;
  delete from public.pinterest_publications where user_id = v_user::text;
  delete from public.pinterest_accounts where user_id = v_user::text;
  delete from public.pins where id in (v_pin, v_legacy_pin, v_inflight_pin, v_crash_pin, v_retry_pin, v_manual_retry_pin, v_attempt_retry_pin, v_safe_retry_pin, v_reconcile_pin);
  delete from public.boards where id = v_board;
  delete from public.projects where id = v_project;
  delete from public.users where id = v_user;

  raise notice 'Pinterest account-scoped publication and scheduling checks passed';
end;
$$;
