-- 165_requeue_email_outbox.sql
-- Operator recovery for dead transactional email.
--
-- The outbox is durable and the dispatcher retries with backoff, but once a row reaches 'dead' the
-- only outcomes left are "the customer never receives the message" and "someone edits the table by
-- hand". A dead subscription-activation email means a paying customer never learns what they bought.
-- This adds a single operator action that puts one dead row back into the queue, and nothing else:
-- it cannot touch a pending or sent row, it does not raise max_attempts, and the caller must supply
-- the exact id.

create or replace function public.requeue_email_outbox(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.email_outbox%rowtype;
begin
  if p_id is null then
    return jsonb_build_object('requeued', false, 'reason', 'id_required');
  end if;

  select * into v_row
    from public.email_outbox
   where id = p_id
   for update;

  if not found then
    return jsonb_build_object('requeued', false, 'reason', 'not_found');
  end if;

  -- Only a dead row may be requeued. A 'sending' row may still be in flight; requeueing it would
  -- allow the same message to be claimed twice at once.
  if v_row.status <> 'dead' then
    return jsonb_build_object('requeued', false, 'reason', 'not_dead', 'status', v_row.status);
  end if;

  -- A sent row is the only state allowed to lose its recipient and payload. Without them there is
  -- nothing to send, so refuse instead of producing a permanently unclaimed row.
  if v_row.recipient_email is null or v_row.payload = '{}'::jsonb then
    return jsonb_build_object('requeued', false, 'reason', 'content_missing');
  end if;

  update public.email_outbox
     set status = 'pending',
         attempts = 0,
         next_attempt_at = now(),
         claim_token = null,
         locked_until = null,
         last_error_code = null,
         updated_at = now()
   where id = p_id;

  return jsonb_build_object(
    'requeued', true,
    'previous_attempts', v_row.attempts,
    'template_key', v_row.template_key
  );
end;
$$;

revoke all on function public.requeue_email_outbox(uuid) from public, anon, authenticated;
grant execute on function public.requeue_email_outbox(uuid) to service_role;
