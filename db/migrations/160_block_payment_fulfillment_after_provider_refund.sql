-- 160_block_payment_fulfillment_after_provider_refund.sql
-- A duplicate success webhook must never fulfill a payment after an operator
-- has recorded provider-confirmed refund evidence.
begin;

create or replace function public.prevent_fulfillment_after_provider_refund()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_table_name='credit_purchases' then
    if old.provider_refunded_at is not null
       and (
         new.balance_credited_at is distinct from old.balance_credited_at
         or (new.status='success' and old.status is distinct from 'success')
       ) then
      raise exception 'provider refund confirmed; credit fulfillment is forbidden';
    end if;
  elsif tg_table_name='subscriptions' then
    if old.provider_refunded_at is not null
       and (
         new.status='success'
         or new.period_start is distinct from old.period_start
         or new.period_end is distinct from old.period_end
       ) then
      raise exception 'provider refund confirmed; subscription activation is forbidden';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.prevent_fulfillment_after_provider_refund()
  from public,anon,authenticated,service_role;

drop trigger if exists credit_purchases_provider_refund_fulfillment_guard
  on public.credit_purchases;
create trigger credit_purchases_provider_refund_fulfillment_guard
before update of status,balance_credited_at on public.credit_purchases
for each row execute function public.prevent_fulfillment_after_provider_refund();

drop trigger if exists subscriptions_provider_refund_fulfillment_guard
  on public.subscriptions;
create trigger subscriptions_provider_refund_fulfillment_guard
before update of status,period_start,period_end on public.subscriptions
for each row execute function public.prevent_fulfillment_after_provider_refund();

commit;
