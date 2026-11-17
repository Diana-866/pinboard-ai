-- 151_fix_provider_refund_evidence_regex_repetition_limit.sql
-- PostgreSQL ARE finite repetition bounds cannot exceed 255. The evidence
-- reference length remains capped at 500 characters; use an open upper bound.
-- Migration 078 is historical and intentionally remains unchanged.

alter table public.provider_refund_operator_actions
  drop constraint provider_refund_operator_actions_shape_check;

alter table public.provider_refund_operator_actions
  add constraint provider_refund_operator_actions_shape_check check (
    (action_kind='reconcile_refund'
      and provider_refunded is not null
      and evidence_type is not null
      and evidence_type in ('provider_dashboard','provider_support','payment_statement','manual_review')
      and evidence_reference is not null
      and length(trim(evidence_reference)) between 8 and 500
      and trim(evidence_reference) ~ '^[A-Za-z0-9][A-Za-z0-9._/#:-]{7,}$'
      and position('://' in lower(trim(evidence_reference)))=0
      and lower(trim(evidence_reference)) !~ '^(www[.])?([a-z0-9-]+[.])+[a-z]{2,}(/|$)'
      and before_state='refund_unknown'
      and after_state in ('provider_refunded','provider_not_refunded')
      and ((request_kind='generation' and task_index between 1 and 10)
        or (request_kind='regeneration' and task_index=0)))
    or
    (action_kind='finalize_failure'
      and provider_refunded is null
      and evidence_type is null
      and evidence_reference is null
      and task_index=0
      and before_state='processing'
      and after_state='failed')
  );

do $migration$
declare
  v_definition text;
  v_corrected text;
begin
  v_definition := pg_get_functiondef(
    'public._admin_record_provider_refund_action(uuid,text,bigint,text,integer,boolean,text,text,uuid)'::regprocedure
  );
  v_corrected := replace(v_definition, '{7,499}', '{7,}');
  if v_corrected = v_definition then
    raise exception 'expected legacy evidence-reference repetition bound was not found';
  end if;
  execute v_corrected;
end;
$migration$;
