-- 154_allow_paid_uncredited_credit_purchase_state.sql
-- A verified provider success whose credit fulfillment cannot complete must
-- remain explicitly distinguishable from an unpaid pending checkout.
begin;

alter table public.credit_purchases
  drop constraint if exists credit_purchases_status_check;

alter table public.credit_purchases
  add constraint credit_purchases_status_check
  check (status in ('pending', 'success', 'canceled', 'denied', 'paid_uncredited'));

commit;
