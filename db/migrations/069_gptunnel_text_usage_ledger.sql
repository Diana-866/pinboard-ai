-- 069_gptunnel_text_usage_ledger.sql
-- Persist text-generation usage independently from user credit transactions.
-- GPTunneL documents usage.total_cost as the amount charged in RUB.

create table if not exists public.pin_generation_text_usage (
  id bigserial primary key,
  user_id text not null,
  idempotency_key varchar(128) not null,
  provider text not null default 'gptunnel' check (provider='gptunnel'),
  provider_request_id text,
  provider_model text not null,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cached_prompt_tokens integer,
  cache_write_tokens integer,
  prompt_cost_rub numeric,
  completion_cost_rub numeric,
  total_cost_rub numeric,
  cost_currency text not null default 'RUB' check (cost_currency='RUB'),
  usage_status text not null check (usage_status in ('recorded','cost_missing')),
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,idempotency_key),
  check (prompt_tokens is null or prompt_tokens>=0),
  check (completion_tokens is null or completion_tokens>=0),
  check (total_tokens is null or total_tokens>=0),
  check (cached_prompt_tokens is null or cached_prompt_tokens>=0),
  check (cache_write_tokens is null or cache_write_tokens>=0),
  check (prompt_cost_rub is null or (prompt_cost_rub>=0 and prompt_cost_rub::text not in ('NaN','Infinity','-Infinity'))),
  check (completion_cost_rub is null or (completion_cost_rub>=0 and completion_cost_rub::text not in ('NaN','Infinity','-Infinity'))),
  check (total_cost_rub is null or (total_cost_rub>=0 and total_cost_rub::text not in ('NaN','Infinity','-Infinity'))),
  check ((usage_status='recorded' and total_cost_rub is not null)
      or (usage_status='cost_missing' and total_cost_rub is null))
);

create index if not exists pin_generation_text_usage_user_created_idx
  on public.pin_generation_text_usage(user_id,created_at desc);

alter table public.pin_generation_text_usage enable row level security;
revoke all on public.pin_generation_text_usage from public,anon,authenticated;
grant select,insert,update,delete on public.pin_generation_text_usage to service_role;
grant usage,select on sequence public.pin_generation_text_usage_id_seq to service_role;

create or replace function public.record_pin_generation_text_usage(
  p_user_id text,
  p_idempotency_key text,
  p_claim_token uuid,
  p_provider_request_id text,
  p_provider_model text,
  p_usage jsonb,
  p_total_cost_rub numeric
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_request public.pin_generation_requests%rowtype;
  v_status text;
  v_existing public.pin_generation_text_usage%rowtype;
  v_prompt integer;
  v_completion integer;
  v_total integer;
  v_cached integer;
  v_cache_write integer;
  v_prompt_cost numeric;
  v_completion_cost numeric;
begin
  if p_user_id is null or p_idempotency_key is null or p_claim_token is null
     or p_provider_model is null or length(p_provider_model)>100
     or p_usage is null or jsonb_typeof(p_usage)<>'object'
     or (p_total_cost_rub is not null and
         (p_total_cost_rub<0 or p_total_cost_rub::text in ('NaN','Infinity','-Infinity'))) then
    raise exception 'invalid text provider usage';
  end if;

  select * into v_request
    from public.pin_generation_requests
   where user_id=p_user_id and idempotency_key=p_idempotency_key
   for update;
  if not found or v_request.status<>'processing'
     or v_request.claim_token is distinct from p_claim_token then
    raise exception 'generation claim token mismatch';
  end if;

  v_prompt := nullif(p_usage->>'promptTokens','')::integer;
  v_completion := nullif(p_usage->>'completionTokens','')::integer;
  v_total := nullif(p_usage->>'totalTokens','')::integer;
  v_cached := nullif(p_usage->>'cachedPromptTokens','')::integer;
  v_cache_write := nullif(p_usage->>'cacheWriteTokens','')::integer;
  v_prompt_cost := nullif(p_usage->>'promptCost','')::numeric;
  v_completion_cost := nullif(p_usage->>'completionCost','')::numeric;

  if v_prompt<0 or v_completion<0 or v_total<0 or v_cached<0 or v_cache_write<0
     or v_prompt_cost<0 or v_completion_cost<0 then
    raise exception 'negative text provider usage value';
  end if;
  v_status := case when p_total_cost_rub is null then 'cost_missing' else 'recorded' end;

  select * into v_existing from public.pin_generation_text_usage
   where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.provider_request_id is distinct from p_provider_request_id
       or v_existing.provider_model is distinct from p_provider_model
       or v_existing.prompt_tokens is distinct from v_prompt
       or v_existing.completion_tokens is distinct from v_completion
       or v_existing.total_tokens is distinct from v_total
       or v_existing.cached_prompt_tokens is distinct from v_cached
       or v_existing.cache_write_tokens is distinct from v_cache_write
       or v_existing.prompt_cost_rub is distinct from v_prompt_cost
       or v_existing.completion_cost_rub is distinct from v_completion_cost
       or v_existing.total_cost_rub is distinct from p_total_cost_rub
       or v_existing.usage_status is distinct from v_status then
      raise exception 'conflicting text usage replay';
    end if;
    return true;
  end if;

  insert into public.pin_generation_text_usage(
    user_id,idempotency_key,provider_request_id,provider_model,
    prompt_tokens,completion_tokens,total_tokens,cached_prompt_tokens,cache_write_tokens,
    prompt_cost_rub,completion_cost_rub,total_cost_rub,cost_currency,usage_status
  ) values (
    p_user_id,p_idempotency_key,p_provider_request_id,p_provider_model,
    v_prompt,v_completion,v_total,v_cached,v_cache_write,
    v_prompt_cost,v_completion_cost,p_total_cost_rub,'RUB',v_status
  );
  return true;
end;
$$;

revoke all on function public.record_pin_generation_text_usage(text,text,uuid,text,text,jsonb,numeric)
  from public,anon,authenticated;
grant execute on function public.record_pin_generation_text_usage(text,text,uuid,text,text,jsonb,numeric)
  to service_role;
