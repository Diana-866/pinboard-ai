BEGIN;

-- The account-deletion worker must inventory these retained records, but both
-- tables intentionally deny direct access to service_role. Expose only counts
-- for one validated account through this narrowly scoped SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.get_account_deletion_retained_record_counts(
  p_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_oauth_count bigint;
  v_refund_audit_count bigint;
BEGIN
  IF p_user_id IS NULL
     OR p_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'valid account user id is required';
  END IF;

  SELECT count(*) INTO v_oauth_count
    FROM public.pinterest_oauth_connection_state
   WHERE user_id = p_user_id;

  SELECT count(*) INTO v_refund_audit_count
    FROM public.provider_refund_reconciliation_audit
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'pinterest_oauth_connection_state', v_oauth_count,
    'provider_refund_reconciliation_audit', v_refund_audit_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_account_deletion_retained_record_counts(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_deletion_retained_record_counts(text)
  TO service_role;

COMMIT;
