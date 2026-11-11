-- 143_account_deletion_wait_for_financial_outcomes.sql
-- Keep deletion fenced while payment, credit, or email side effects are unresolved.
begin;

create or replace function public.erase_account_deletion_content(
  p_job_id uuid,
  p_claim_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_request_id uuid;
  v_account_status text;
  v_request_state text;
  v_job public.account_deletion_jobs%rowtype;
  v_preflight_status text;
  v_preflight_inventory_recorded_at timestamptz;
  v_preflight_manifest_recorded_at timestamptz;
  v_schedules integer := 0;
  v_review integer := 0;
  v_publications integer := 0;
  v_generation_tasks integer := 0;
  v_regenerations integer := 0;
  v_generation_requests integer := 0;
  v_auth_tokens integer := 0;
  v_pinterest_accounts integer := 0;
  v_publish_attempts integer := 0;
  v_refresh_leases integer := 0;
  v_oauth_state integer := 0;
  v_account_refresh_leases integer := 0;
  v_email_outbox integer := 0;
  v_projects integer := 0;
begin
  if p_job_id is null or p_claim_token is null then
    raise exception 'invalid account content erasure claim';
  end if;

  select r.user_id,r.id into v_user_id,v_request_id
    from public.account_deletion_jobs j
    join public.account_deletion_requests r on r.id=j.request_id
   where j.id=p_job_id;
  if not found then return jsonb_build_object('erased',false,'reason','job_missing'); end if;

  -- Keep the same lock order used by request/claim/finalize RPCs.
  select u.account_status into v_account_status
    from public.users u where u.id=v_user_id for update;
  if not found or v_account_status <> 'deletion_pending' then
    return jsonb_build_object('erased',false,'reason','account_not_pending');
  end if;

  select r.state into v_request_state
    from public.account_deletion_requests r where r.id=v_request_id for update;
  if not found or v_request_state <> 'pending' then
    return jsonb_build_object('erased',false,'reason','request_not_pending');
  end if;

  select * into v_job from public.account_deletion_jobs
   where id=p_job_id for update;
  if not found or v_job.step_key <> 'erase_content' or v_job.status <> 'running'
     or v_job.claim_token is distinct from p_claim_token
     or v_job.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('erased',false,'reason','claim_or_manifest_lost');
  end if;

  select status,inventory_recorded_at,storage_manifest_recorded_at
    into v_preflight_status,v_preflight_inventory_recorded_at,v_preflight_manifest_recorded_at
    from public.account_deletion_jobs
   where request_id=v_request_id and step_key='preflight';
  if not found or v_preflight_status <> 'succeeded'
     or v_preflight_inventory_recorded_at is null
     or v_preflight_manifest_recorded_at is null then
    return jsonb_build_object('erased',false,'reason','preflight_not_complete');
  end if;

  -- Do not erase while any payment, credit reservation, or outbound email
  -- operation can still settle asynchronously.
  if exists (
    select 1 from public.credit_purchases
     where user_id=v_user_id::text and status='pending'
  ) or exists (
    select 1 from public.subscriptions
     where user_id=v_user_id::text and status='pending'
  ) then
    return jsonb_build_object('erased',false,'reason','payment_outcome_unresolved');
  end if;

  if exists (
    select 1 from public.pin_generation_credit_reservations
     where user_id=v_user_id::text and status in ('reserved','settling')
  ) then
    return jsonb_build_object('erased',false,'reason','credit_reservation_unresolved');
  end if;

  if exists (
    select 1 from public.email_outbox e
    join public.subscriptions s on s.id=e.subscription_id
    where s.user_id=v_user_id::text and e.status='sending'
      and e.locked_until > clock_timestamp()
  ) then
    return jsonb_build_object('erased',false,'reason','email_delivery_in_progress');
  end if;

  -- Do not erase provider journals while a paid generation or remote
  -- publication may still be in flight. Those outcomes must first become
  -- definitive; otherwise a retryable deletion job remains fenced for review.
  if exists (
    select 1 from public.pin_generation_requests
     where user_id=v_user_id::text and status='processing'
  ) or exists (
    select 1 from public.pin_generation_tasks
     where user_id=v_user_id::text and status in ('submitting','queued','running','unknown')
  ) or exists (
    select 1 from public.pin_regeneration_requests
     where user_id=v_user_id::text and status in ('processing','unknown')
  ) then
    return jsonb_build_object('erased',false,'reason','provider_tasks_unresolved');
  end if;

  if exists (
    select 1 from public.pinterest_publish_attempts
     where user_id=v_user_id::text and status in ('processing','unknown')
  ) or exists (
    select 1 from public.pin_schedules
     where user_id=v_user_id::text and status in ('publishing','unknown')
  ) then
    return jsonb_build_object('erased',false,'reason','pinterest_publication_unresolved');
  end if;

  -- Remove local operational/user content in dependency order. The durable
  -- Storage manifest was committed before any source rows are removed.
  delete from public.pin_schedules where user_id=v_user_id::text;
  get diagnostics v_schedules = row_count;

  delete from public.pin_review_queue where user_id=v_user_id::text;
  get diagnostics v_review = row_count;

  delete from public.pinterest_publish_attempts where user_id=v_user_id::text;
  get diagnostics v_publish_attempts = row_count;

  delete from public.pinterest_publications where user_id=v_user_id::text;
  get diagnostics v_publications = row_count;

  delete from public.pinterest_token_refresh_leases where user_id=v_user_id::text;
  get diagnostics v_refresh_leases = row_count;

  delete from public.pinterest_oauth_connection_state where user_id=v_user_id::text;
  get diagnostics v_oauth_state = row_count;

  delete from public.pinterest_account_refresh_leases where user_id=v_user_id::text;
  get diagnostics v_account_refresh_leases = row_count;

  -- Email outbox rows contain the recipient address and event payload. Keep
  -- subscription/payment evidence, but remove queued/sent message content.
  delete from public.email_outbox e
   using public.subscriptions s
   where e.subscription_id=s.id and s.user_id=v_user_id::text;
  get diagnostics v_email_outbox = row_count;

  delete from public.pin_generation_tasks where user_id=v_user_id::text;
  get diagnostics v_generation_tasks = row_count;

  delete from public.pin_regeneration_requests where user_id=v_user_id::text;
  get diagnostics v_regenerations = row_count;

  delete from public.pin_generation_requests where user_id=v_user_id::text;
  get diagnostics v_generation_requests = row_count;

  delete from public.auth_tokens where user_id=v_user_id::text;
  get diagnostics v_auth_tokens = row_count;

  delete from public.pinterest_accounts where user_id=v_user_id::text;
  get diagnostics v_pinterest_accounts = row_count;

  delete from public.projects where user_id=v_user_id;
  get diagnostics v_projects = row_count;

  insert into public.account_deletion_events(request_id,event_key,actor_class,reason_code)
  values (v_request_id,'content_erasure_'||v_job.attempts::text,'worker','local_content_erased')
  on conflict (request_id,event_key) do nothing;

  return jsonb_build_object(
    'erased',true,
    'schedules',v_schedules,
    'review_items',v_review,
    'publications',v_publications,
    'generation_tasks',v_generation_tasks,
    'regenerations',v_regenerations,
    'generation_requests',v_generation_requests,
    'auth_tokens',v_auth_tokens,
    'pinterest_accounts',v_pinterest_accounts,
    'pinterest_publish_attempts',v_publish_attempts,
    'token_refresh_leases',v_refresh_leases,
    'oauth_connection_state',v_oauth_state,
    'account_refresh_leases',v_account_refresh_leases,
    'email_outbox',v_email_outbox,
    'projects',v_projects,
    'financial_records_retained',true
  );
end;
$function$;

revoke all on function public.erase_account_deletion_content(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.erase_account_deletion_content(uuid,uuid)
  to service_role;

commit;
