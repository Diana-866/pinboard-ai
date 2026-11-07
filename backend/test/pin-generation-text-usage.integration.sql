-- Run after migrations 014, 044, 045, 046 and 069 in disposable PostgreSQL CI.
begin;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_key text;
  v_state jsonb;
  v_claim uuid;
  v_count integer;
begin
  insert into public.users(id,email,credits_balance)
  values(v_user,'text-usage-'||v_user||'@example.invalid',100);

  insert into public.projects(user_id,niche)
  values(v_user,'text-usage-ci') returning id into v_project;

  insert into public.boards(project_id,title)
  values(v_project,'text-usage-ci') returning id into v_board;

  v_key := 'text-usage-'||v_user;
  v_state := public.begin_pin_generation_request(
    v_user::text,v_board,v_key,repeat('b',64)
  );
  v_claim := (v_state->>'claim_token')::uuid;

  perform public.record_pin_generation_text_usage(
    v_user::text,v_key,v_claim,'chatcmpl-test-001','gpt-4o',
    '{"promptTokens":120,"completionTokens":40,"totalTokens":160,
      "cachedPromptTokens":12,"cacheWriteTokens":0,
      "promptCost":0.02,"completionCost":0.01}'::jsonb,
    0.03
  );

  perform public.record_pin_generation_text_usage(
    v_user::text,v_key,v_claim,'chatcmpl-test-001','gpt-4o',
    '{"promptTokens":120,"completionTokens":40,"totalTokens":160,
      "cachedPromptTokens":12,"cacheWriteTokens":0,
      "promptCost":0.02,"completionCost":0.01}'::jsonb,
    0.03
  );

  select count(*) into v_count from public.pin_generation_text_usage
   where user_id=v_user::text and idempotency_key=v_key
     and total_cost_rub=0.03 and cost_currency='RUB'
     and usage_status='recorded';
  if v_count<>1 then raise exception 'text usage replay was not idempotent'; end if;

  begin
    perform public.record_pin_generation_text_usage(
      v_user::text,v_key,gen_random_uuid(),'chatcmpl-test-001','gpt-4o',
      '{"promptTokens":120,"completionTokens":40,"totalTokens":160}'::jsonb,
      0.03
    );
    raise exception 'stale claim wrote text usage';
  exception when others then
    if sqlerrm <> 'generation claim token mismatch' then raise; end if;
  end;

  raise notice 'GPTunnel text usage ledger checks passed';
end;
$$;

rollback;
