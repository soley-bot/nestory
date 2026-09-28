DO $current_period$
DECLARE d text; old text := 'OR v_invoice.billing_period_end >= v_business_date THEN';
BEGIN
 d:=pg_get_functiondef('app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer)'::regprocedure);
 IF (length(d)-length(replace(d,old,'')))<>length(old) THEN RAISE EXCEPTION 'rent_preview_date_contract_changed'; END IF;
 EXECUTE replace(d,old,'OR v_invoice.billing_period_start > v_business_date THEN');
END;
$current_period$;

-- Allow effective-month rent edits. Issued rent uses the existing audited correction command.
-- The term and invoice changes commit together; financial custody and close checks remain.
CREATE OR REPLACE FUNCTION public.schedule_authoritative_lease_term(
  p_organization_id uuid,
  p_lease_id uuid,
  p_start_date date,
  p_end_date date,
  p_rent_amount numeric,
  p_rent_currency public.currency_code,
  p_rent_due_day integer,
  p_payment_frequency text,
  p_supersedes_term_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_lease public.leases%ROWTYPE;
  v_previous public.lease_terms%ROWTYPE;
  v_expected_term_end date;
  v_expected_term_start date;
  v_term_id uuid;
  v_claim record;
  v_invoice record;
  v_preview jsonb;
  v_today date := app_private.rent_business_date(p_organization_id, pg_catalog.statement_timestamp());
BEGIN
  PERFORM app_private.assert_lease_permission(
    p_organization_id, p_lease_id,
    'leases.change_terms'::public.organization_permission_key
  );

  -- Claim the complete command before changing the predecessor. Retries must
  -- work even after that term expires or the business date advances.
  SELECT * INTO v_claim
  FROM app_private.claim_financial_idempotency(
    p_organization_id, 'schedule_authoritative_lease_term', p_idempotency_key,
    v_actor_id, jsonb_build_object(
      'leaseId', p_lease_id, 'startDate', p_start_date, 'endDate', p_end_date,
      'rentAmount', p_rent_amount, 'rentCurrency', p_rent_currency,
      'rentDueDay', p_rent_due_day, 'paymentFrequency', p_payment_frequency,
      'supersedesTermId', p_supersedes_term_id
    )
  );
  IF v_claim.is_replay THEN
    RETURN (v_claim.result_ids ->> 'termId')::uuid;
  END IF;

  IF p_supersedes_term_id IS NOT NULL THEN
    SELECT terms.*
    INTO v_previous
    FROM public.lease_terms AS terms
    WHERE terms.id = p_supersedes_term_id
      AND terms.organization_id = p_organization_id
      AND terms.lease_id = p_lease_id
      AND terms.authority_kind = 'authoritative'
      AND terms.archived_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Scheduled term to supersede was not found'
        USING ERRCODE = '23503';
    END IF;

    IF v_previous.status = 'active' THEN
      v_expected_term_start := v_previous.start_date;
      v_expected_term_end := v_previous.end_date;

      IF p_start_date < v_previous.start_date THEN
        RAISE EXCEPTION 'rent_change_must_follow_term_start'
          USING ERRCODE = '22023';
      END IF;

      SELECT leases.*
      INTO v_lease
      FROM public.leases AS leases
      WHERE leases.id = p_lease_id
        AND leases.organization_id = p_organization_id
        AND leases.archived_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lease was not found' USING ERRCODE = '23503';
      END IF;

      IF p_start_date <= v_previous.end_date THEN
        PERFORM app_private.lock_open_lease_term_periods(
          p_organization_id,
          v_lease.property_id,
          p_rent_currency,
          p_start_date,
          v_previous.end_date
        );
      END IF;

      SELECT leases.*
      INTO v_lease
      FROM public.leases AS leases
      WHERE leases.id = p_lease_id
        AND leases.organization_id = p_organization_id
        AND leases.archived_at IS NULL
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Lease was not found' USING ERRCODE = '23503';
      END IF;

      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          pg_catalog.concat_ws(
            ':', 'lease_term_v1', p_organization_id, p_lease_id
          ),
          0
        )
      );

      SELECT terms.*
      INTO v_previous
      FROM public.lease_terms AS terms
      WHERE terms.id = p_supersedes_term_id
        AND terms.organization_id = p_organization_id
        AND terms.lease_id = p_lease_id
        AND terms.authority_kind = 'authoritative'
        AND terms.status = 'active'
        AND terms.archived_at IS NULL
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Active term changed while scheduling its replacement'
          USING ERRCODE = '40001';
      END IF;

      IF v_previous.start_date <> v_expected_term_start
        OR v_previous.end_date <> v_expected_term_end THEN
        RAISE EXCEPTION 'Active term changed while scheduling its replacement'
          USING ERRCODE = '40001';
      END IF;

      IF p_start_date <= v_previous.end_date
        AND EXISTS (
          SELECT 1
          FROM public.tenant_invoices AS invoice
          WHERE invoice.organization_id = p_organization_id
            AND invoice.lease_id = p_lease_id
            AND invoice.lifecycle = 'issued'
            AND (invoice.generation_source = 'lease_rules_v1' OR invoice.lease_term_id IS NOT NULL)
            AND invoice.billing_period_end >= p_start_date
            AND invoice.billing_period_start <= v_previous.end_date
        ) THEN
        IF p_payment_frequency <> 'monthly' OR v_previous.payment_frequency <> 'monthly'
          OR extract(day FROM p_start_date) <> 1 THEN
          RAISE EXCEPTION 'issued_rent_change_requires_month_start' USING ERRCODE='22023';
        END IF;
        FOR v_invoice IN SELECT invoice.* FROM public.tenant_invoices invoice
          WHERE invoice.organization_id=p_organization_id AND invoice.lease_id=p_lease_id
            AND invoice.lifecycle='issued'
            AND (invoice.generation_source='lease_rules_v1' OR invoice.lease_term_id IS NOT NULL)
            AND invoice.billing_period_end >= p_start_date
            AND invoice.billing_period_start <= v_previous.end_date
          ORDER BY invoice.billing_period_start,invoice.id
        LOOP
          IF v_invoice.billing_period_start < p_start_date OR v_invoice.billing_period_end > p_end_date THEN
            RAISE EXCEPTION 'issued_rent_change_period_mismatch' USING ERRCODE='22023';
          END IF;
          IF v_invoice.generation_source <> 'lease_rules_v1' THEN
            RAISE EXCEPTION 'issued_rent_change_source_unsupported' USING ERRCODE='22023';
          END IF;
          IF v_invoice.is_prorated THEN
            RAISE EXCEPTION 'issued_rent_change_prorated' USING ERRCODE='22023';
          END IF;
          -- This validates settlements, owner custody, closes, and current evidence.
          v_preview := app_private.build_historical_rent_correction_preview(p_organization_id,v_invoice.id,p_rent_amount,p_rent_due_day);
          IF (v_preview->>'rentDelta')::numeric = 0 AND v_preview->>'originalDueDate' = v_preview->>'correctedDueDate' THEN
            CONTINUE;
          END IF;
          IF NOT coalesce((v_preview->>'canApply')::boolean,false) THEN
            RAISE EXCEPTION 'rent_change_requires_linked_review' USING ERRCODE='23514', DETAIL=(v_preview->'blockers')::text;
          END IF;
          PERFORM app_private.correct_effective_month_rent(p_organization_id,v_invoice.id,p_rent_amount,p_rent_due_day,
            'Rent changed from effective date ' || p_start_date::text,
            v_preview->>'previewHash', 'rent-term:' || v_claim.request_id::text || ':' || v_invoice.id::text);
        END LOOP;
      END IF;

      IF p_start_date <= v_previous.end_date THEN
        UPDATE public.lease_terms
        SET
          end_date = CASE WHEN p_start_date = v_previous.start_date THEN end_date ELSE p_start_date - 1 END,
          -- Expire the predecessor before inserting an immediately active term.
          -- Its catch-up trigger must not generate rent from a half-applied split.
          status = CASE WHEN p_start_date = v_previous.start_date THEN 'superseded' WHEN p_start_date <= v_today THEN 'expired' ELSE status END,
          updated_at = pg_catalog.now(),
          updated_by = v_actor_id
        WHERE id = v_previous.id;

        INSERT INTO public.activity_logs (
          organization_id,
          actor_id,
          entity_type,
          entity_id,
          action,
          previous_values,
          new_values
        )
        SELECT
          p_organization_id,
          v_actor_id,
          'lease_term',
          terms.id,
          'authoritative_lease_term_future_range_shortened',
          pg_catalog.to_jsonb(v_previous),
          pg_catalog.to_jsonb(terms)
        FROM public.lease_terms AS terms
        WHERE terms.id = v_previous.id;
      END IF;

      v_term_id := public.create_authoritative_lease_term(
        p_organization_id,
        p_lease_id,
        p_start_date,
        p_end_date,
        p_rent_amount,
        p_rent_currency,
        p_rent_due_day,
        p_payment_frequency,
        CASE WHEN p_start_date <= v_today THEN 'active' ELSE 'upcoming' END,
        NULL,
        p_idempotency_key
      );

      UPDATE public.lease_terms
      SET supersedes_term_id = p_supersedes_term_id
      WHERE id = v_term_id
        AND supersedes_term_id IS NULL;

      PERFORM app_private.complete_financial_idempotency(
        v_claim.request_id, p_organization_id, v_actor_id,
        jsonb_build_object('termId', v_term_id)
      );
      RETURN v_term_id;
    END IF;
  END IF;

  v_term_id := public.create_authoritative_lease_term(
    p_organization_id,
    p_lease_id,
    p_start_date,
    p_end_date,
    p_rent_amount,
    p_rent_currency,
    p_rent_due_day,
    p_payment_frequency,
    'upcoming',
    p_supersedes_term_id,
    p_idempotency_key
  );
  PERFORM app_private.complete_financial_idempotency(
    v_claim.request_id, p_organization_id, v_actor_id,
    jsonb_build_object('termId', v_term_id)
  );
  RETURN v_term_id;
END;
$function$;

ALTER FUNCTION public.schedule_authoritative_lease_term(
  uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, uuid, text
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.schedule_authoritative_lease_term(
  uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, uuid, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_authoritative_lease_term(
  uuid, uuid, date, date, numeric, public.currency_code,
  integer, text, uuid, text
) TO authenticated;

DO $repeat_corrections$
DECLARE d text; signature text; clause text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer)',
  'public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)'
 ] LOOP
  d:=pg_get_functiondef(signature::regprocedure);
  FOREACH clause IN ARRAY ARRAY[
    '    AND line.supersedes_line_id IS NULL',
    '      AND other_line.supersedes_line_id IS NULL',
    '    AND income.supersedes_income_item_id IS NULL',
    '    AND fee.supersedes_occurrence_id IS NULL',
    '      AND owner_line.supersedes_line_id IS NULL'
  ] LOOP
    IF position(clause IN d)>0 THEN
      IF (length(d)-length(replace(d,clause,'')))<>length(clause) THEN
        RAISE EXCEPTION 'rent_successor_contract_changed: %', signature;
      END IF;
      d:=replace(d,clause,'');
    END IF;
  END LOOP;
  EXECUTE d;
 END LOOP;
END;
$repeat_corrections$;

DO $fee_successor$
DECLARE d text; old text := E'      AND original.supersedes_occurrence_id IS NULL\n    FOR KEY SHARE;';
BEGIN
 d:=replace(pg_get_functiondef('app_private.create_management_fee_owner_charge()'::regprocedure),chr(13),'');
 IF (length(d)-length(replace(d,old,'')))<>length(old) THEN RAISE EXCEPTION 'rent_fee_successor_contract_changed'; END IF;
 EXECUTE replace(d,old,'    FOR KEY SHARE;');
END;
$fee_successor$;

-- Read the predecessor due date from the live rent line, preserving the issued snapshot.
DO $repeat_due_date$
DECLARE d text; old text;
BEGIN
 d:=replace(pg_get_functiondef('app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer)'::regprocedure),chr(13),'');
 old:='  v_original_due_day := extract(day FROM v_invoice.due_date)::integer;';
 IF (length(d)-length(replace(d,old,'')))<>length(old) THEN RAISE EXCEPTION 'rent_due_preview_contract_changed'; END IF;
 EXECUTE replace(d,old,$patch$
  IF v_line.correction_occurrence_id IS NOT NULL THEN
    SELECT correction.corrected_due_date INTO STRICT v_invoice.due_date
    FROM public.tenant_invoice_corrections correction
    WHERE correction.organization_id=p_organization_id
      AND correction.id=v_line.correction_occurrence_id
      AND correction.action='historical_rent';
  END IF;
  v_original_due_day := extract(day FROM v_invoice.due_date)::integer;$patch$);
 d:=replace(pg_get_functiondef('public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)'::regprocedure),chr(13),'');
 old:=E'    v_invoice.due_date,\n    (v_preview->>''correctedDueDate'')::date,';
 IF (length(d)-length(replace(d,old,'')))<>length(old) THEN RAISE EXCEPTION 'rent_due_execution_contract_changed'; END IF;
 EXECUTE replace(d,old,E'    (v_preview->>''originalDueDate'')::date,\n    (v_preview->>''correctedDueDate'')::date,');
END;
$repeat_due_date$;

-- Choose the live successor rather than relying on timestamp ordering.
DO $live_due_date$
DECLARE d text; old text := 'WHERE correction.action = ''historical_rent''::text';
BEGIN
 d:=pg_get_viewdef('public.tenant_invoice_balances'::regclass,true);
 IF (length(d)-length(replace(d,old,'')))<>length(old) THEN RAISE EXCEPTION 'rent_due_balance_contract_changed'; END IF;
 d:=replace(d,old,old || $patch$ AND EXISTS (
   SELECT 1 FROM public.tenant_invoice_lines live_line
   WHERE live_line.organization_id=correction.organization_id
     AND live_line.correction_occurrence_id=correction.id
     AND live_line.line_type='rent' AND live_line.reversal_of_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.tenant_invoice_lines reversal
       WHERE reversal.organization_id=live_line.organization_id AND reversal.reversal_of_id=live_line.id)
 )$patch$);
 EXECUTE 'CREATE OR REPLACE VIEW public.tenant_invoice_balances WITH (security_invoker=true) AS ' || d;
END;
$live_due_date$;

-- Private executor for the checked lease command. Direct historical correction
-- retains its existing admin-only API; staff must enter through lease authority.
DO $lease_correction_authority$
DECLARE d text; old text := $old$  IF v_actor_id IS NULL
    OR NOT app_private.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'historical_rent_correction_forbidden'
      USING ERRCODE = '42501';
  END IF;$old$;
BEGIN
 old:=replace(old,chr(13),'');
 d:=replace(pg_get_functiondef('public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)'::regprocedure),chr(13),'');
 IF (length(d)-length(replace(d,old,'')))<>length(old) THEN RAISE EXCEPTION 'rent_authority_contract_changed'; END IF;
 d:=replace(d,'public.correct_historical_rent(', 'app_private.correct_effective_month_rent(');
 d:=replace(d,old,$patch$  PERFORM app_private.assert_lease_permission(
    p_organization_id,
    (SELECT invoice.lease_id FROM public.tenant_invoices invoice
      WHERE invoice.organization_id=p_organization_id AND invoice.id=p_invoice_id),
    'leases.change_terms'::public.organization_permission_key
  );$patch$);
 EXECUTE d;
END;
$lease_correction_authority$;
ALTER FUNCTION app_private.correct_effective_month_rent(uuid,uuid,numeric,integer,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.correct_effective_month_rent(uuid,uuid,numeric,integer,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
