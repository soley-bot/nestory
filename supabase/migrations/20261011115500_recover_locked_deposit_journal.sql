-- Preserve unknown original outcomes while releasing a checked locked-month
-- rollback. Existing journal grants and strict authority checks are unchanged.
CREATE OR REPLACE FUNCTION public.execute_deposit_rent_journal(p_org uuid,p_lease uuid,p_token uuid,p_key uuid,p_payload_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $journal$
DECLARE authority jsonb; r app_private.deposit_rent_journal_intents%ROWTYPE; result_uuid uuid; message text; failure_code text; failure_message text;
BEGIN
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease);
  r:=app_private.deposit_rent_journal_locked(p_org,p_lease,p_token,p_key,p_payload_hash);
  authority:=app_private.deposit_rent_journal_authority(p_org,p_lease,r.payload->>'operation');
  PERFORM app_private.deposit_rent_journal_scope(r,authority);
  IF r.state='preview' THEN RAISE EXCEPTION 'Attempt must be durably recorded first' USING ERRCODE='55000'; END IF;
  IF r.state IN ('resolved','rejected') THEN RETURN app_private.deposit_rent_journal_packet(r); END IF;
  -- The checked command runs in a subtransaction. A returned business rejection
  -- rolls back all its writes before persisting a terminal rejection. Unknown
  -- outcomes, authorization failures and serialization errors retain the attempt.
  BEGIN
  IF r.payload->>'operation'='apply' THEN
    result_uuid:=public.apply_deposit_to_rent(p_org,r.deposit_id,r.invoice_id,(r.payload->>'date')::date,
      jsonb_build_array(jsonb_build_object('lineId',r.payload->>'lineId','amount',r.payload->>'amount')),r.payload->>'reason',r.idempotency_key::text);
    message:='Deposit applied to rent. No new bank payment was recorded.';
  ELSE
    result_uuid:=public.reverse_deposit_rent_application(p_org,(r.payload->>'applicationId')::uuid,(r.payload->>'date')::date,r.payload->>'reason',r.idempotency_key::text);
    message:='The full deposit application was reversed. No new bank payment was recorded.';
  END IF;
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '23514' OR SQLSTATE '23503' OR SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS failure_code=RETURNED_SQLSTATE,failure_message=MESSAGE_TEXT;
    -- Only the released locked-month conflict is a known business rejection.
    -- Other prerequisite/service errors retain original attempted recovery.
    IF failure_code='55000' AND failure_message IS DISTINCT FROM 'Financial month is locked' THEN RAISE; END IF;
    -- Existing idempotency evidence may represent a committed original outcome;
    -- never relabel that outcome as rejected or release its slot.
    IF EXISTS(SELECT 1 FROM app_private.financial_idempotency_requests f
      WHERE f.organization_id=p_org AND f.idempotency_key=r.idempotency_key::text) THEN RAISE; END IF;
    UPDATE app_private.deposit_rent_journal_intents
      SET state='rejected',revision=revision+1,
        result_message='The saved action was rejected because its financial details changed. No changes from this attempt were saved. Review current details and prepare a new preview.'
      WHERE token=r.token RETURNING * INTO r;
    RETURN app_private.deposit_rent_journal_packet(r);
  END;
  IF result_uuid IS NULL OR NOT EXISTS(SELECT 1 FROM public.deposit_rent_applications a WHERE a.organization_id=p_org AND a.id=result_uuid
    AND a.property_id=r.property_id AND a.unit_id IS NOT DISTINCT FROM r.unit_id AND a.lease_deposit_id=r.deposit_id AND a.invoice_id=r.invoice_id
    AND a.reversal_of_application_id IS NOT DISTINCT FROM (CASE WHEN r.payload->>'operation'='reverse' THEN (r.payload->>'applicationId')::uuid ELSE NULL END)) THEN
    RAISE EXCEPTION 'Checked command result could not be verified' USING ERRCODE='23514'; END IF;
  UPDATE app_private.deposit_rent_journal_intents SET state='resolved',revision=revision+1,result_id=result_uuid,result_message=message
    WHERE token=r.token RETURNING * INTO r;
  RETURN app_private.deposit_rent_journal_packet(r);
END $journal$;
