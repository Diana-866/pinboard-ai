-- 037_billing_webhook_currency_audit.sql
-- Record the currency alongside the amount selected from a signed Prodamus event.
alter table public.billing_webhook_exceptions
  add column if not exists received_currency text;

comment on column public.billing_webhook_exceptions.received_currency is
  'Currency reported by the signed Prodamus webhook; received_sum stores currency_sum when supplied.';
