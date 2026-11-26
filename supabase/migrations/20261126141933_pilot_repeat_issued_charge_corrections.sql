BEGIN;

-- Revision identity is still unique per idempotency key. The invoice lock
-- serializes new corrections, and each confirmation hashes the latest evidence.
DROP INDEX public.tenant_invoice_management_fee_correction_once;
CREATE UNIQUE INDEX tenant_invoice_management_fee_correction_once
  ON public.tenant_invoice_corrections (organization_id, tenant_invoice_id)
  WHERE action = 'management_fee' AND organization_id <> '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid;
CREATE INDEX pilot_invoice_fee_correction_history
  ON public.tenant_invoice_corrections (tenant_invoice_id, id)
  WHERE action = 'management_fee' AND organization_id = '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid;

DO $migration$
DECLARE
  entry record;
  change record;
  definition text;
  invoice_name text;
  anchor text;
  lock_period text := $body$  IF p_organization_id = '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid THEN
    PERFORM app_private.lock_open_property_financial_month(p_organization_id, issued.property_id, issued.currency, period.month_start)
      FROM (SELECT DISTINCT date_trunc('month', d)::date AS month_start FROM unnest(ARRAY[
        issued.billing_period_start, issued.issue_date, app_private.rent_business_date(p_organization_id)]) d ORDER BY 1) period;
    PERFORM app_private.lock_owner_balance_lifecycle(p_organization_id, issued.property_id, roster.person_id, issued.currency)
      FROM (SELECT DISTINCT ownership.person_id FROM public.property_owners ownership
        WHERE ownership.organization_id=p_organization_id AND ownership.property_id=issued.property_id AND ownership.archived_at IS NULL
          AND (ownership.started_on IS NULL OR ownership.started_on<=issued.billing_period_start)
          AND (ownership.ended_on IS NULL OR ownership.ended_on>=issued.billing_period_start) ORDER BY 1) roster;
  END IF;
$body$;
  check_period text := $body$  IF p_organization_id = '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid THEN
    IF app_private.is_financial_month_locked(p_organization_id,v_invoice.property_id,v_invoice.billing_period_start)
       AND NOT v_blockers @> '[{"code":"financial_month_locked"}]'::jsonb THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','financial_month_locked',
        'detail',jsonb_build_object('monthStart',v_invoice.billing_period_start)));
    END IF;
    IF NOT v_blockers @> '[{"code":"historical_rent_owner_close_reopen_required"}]'::jsonb THEN
      v_blockers := v_blockers || coalesce((SELECT jsonb_agg(jsonb_build_object('code','historical_rent_owner_close_reopen_required',
        'detail',jsonb_build_object('ownerPersonId',series.owner_person_id,'monthStart',series.month_start,'state',series.state))
        ORDER BY series.month_start,series.owner_person_id) FROM public.owner_close_series series
        WHERE series.organization_id=p_organization_id AND series.property_id=v_invoice.property_id AND series.currency=v_invoice.currency
          AND series.state IN ('closed','stale') AND series.current_closed_revision_id IS NOT NULL AND series.month_start>=v_invoice.billing_period_start
          AND EXISTS (SELECT 1 FROM public.property_owners o WHERE o.organization_id=series.organization_id AND o.property_id=series.property_id
            AND o.person_id=series.owner_person_id AND o.archived_at IS NULL AND (o.started_on IS NULL OR o.started_on<=v_invoice.billing_period_start)
            AND (o.ended_on IS NULL OR o.ended_on>=v_invoice.billing_period_start))), '[]'::jsonb);
    END IF;
  END IF;
$body$;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer)', 'preview_rent','b91cc3833e8c850621a5650d1b24203278eec7e64a1e76be10172fa7438b9c67'),
    ('app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer,numeric)', 'preview_fee','fb954efdec4eaa389a9021e52f9c2b8ab2fe5eba403f2822d375b5fb90da792c'),
    ('public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text)', 'apply_rent','baf7e1c03160c98c1df92199a8dd8696269956ac6c9299c12a0ea9be70159b0e'),
    ('public.correct_historical_rent(uuid,uuid,numeric,integer,text,text,text,numeric)', 'apply_fee','b0ca7c3d65fae3059bac5417f6f45aa08ca33971be62eb336838a77cdd278f0c')
  ) AS entries(signature,kind,digest) LOOP
    definition := replace(pg_get_functiondef(entry.signature::regprocedure),chr(13),'');
    IF encode(extensions.digest(definition,'sha256'),'hex') <> entry.digest THEN
      RAISE EXCEPTION 'Unexpected issued charge correction authority: %',entry.signature;
    END IF;
    IF entry.kind IN ('preview_rent','preview_fee') THEN
      anchor := '  v_preview := pg_catalog.jsonb_build_object(';
      definition := replace(definition,anchor,check_period || anchor);
    ELSE
      invoice_name := CASE WHEN entry.kind='apply_rent' THEN 'v_invoice' ELSE 'invoice' END;
      anchor := CASE WHEN entry.kind='apply_rent' THEN '  v_preview := app_private.build_historical_rent_correction_preview('
        ELSE '  preview := app_private.build_historical_rent_correction_preview(' END;
      -- The fee authority recomputes its preview after taking its allocation locks.
      -- Acquire period and owner locks once, ahead of the first checked preview.
      definition := overlay(definition placing replace(lock_period,'issued.',invoice_name || '.') || anchor
        from strpos(definition,anchor) for length(anchor));
    END IF;
    IF entry.kind='preview_fee' THEN
      FOR change IN SELECT * FROM (VALUES
        ('  v_fee public.management_fee_occurrences%ROWTYPE;',E'  v_fee public.management_fee_occurrences%ROWTYPE;\n  last_removed_fee public.management_fee_occurrences%ROWTYPE;'),
        ($sql$      AND c.action = 'management_fee') THEN$sql$,
         $sql$      AND c.action = 'management_fee' AND p_organization_id <> '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid) THEN$sql$),
        ('  v_replacement_fee := p_corrected_management_fee_amount;', $sql$  IF p_organization_id='752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid AND v_fee.id IS NULL THEN
    SELECT f.* INTO last_removed_fee FROM public.management_fee_occurrences f
    WHERE f.organization_id=p_organization_id AND f.tenant_invoice_id=p_invoice_id AND f.reversal_of_id IS NULL
      AND EXISTS (SELECT 1 FROM public.management_fee_occurrences r WHERE r.organization_id=f.organization_id AND r.reversal_of_id=f.id)
      AND NOT EXISTS (SELECT 1 FROM public.management_fee_occurrences successor WHERE successor.organization_id=f.organization_id AND successor.supersedes_occurrence_id=f.id);
  END IF;
  v_replacement_fee := p_corrected_management_fee_amount;$sql$),
        ($sql$'feeRecognizedOn', coalesce(v_fee.fee_date,$sql$, $sql$'feePredecessorId', last_removed_fee.id,
    'feeRecognizedOn', coalesce(v_fee.fee_date, last_removed_fee.fee_date,$sql$)
      ) AS fee_preview(needle,replacement) LOOP
        IF cardinality(string_to_array(definition,change.needle))<>2 THEN RAISE EXCEPTION 'Unexpected fee preview: %',change.needle; END IF;
        definition := replace(definition,change.needle,change.replacement);
      END LOOP;
    ELSIF entry.kind='apply_fee' THEN
      FOR change IN SELECT * FROM (VALUES
        (E'  IF fee.id IS NOT NULL THEN\n    SELECT l.* INTO STRICT owner_line',E'  IF fee.id IS NOT NULL OR preview->>''feePredecessorId'' IS NOT NULL THEN\n    SELECT l.* INTO STRICT owner_line'),
        ('l.source_id=fee.id FOR UPDATE;', $sql$l.source_id=coalesce(fee.id,(preview->>'feePredecessorId')::uuid) FOR UPDATE;$sql$),
        ($sql$'originalFeeId',fee.id,$sql$, $sql$'originalFeeId',coalesce(fee.id,(preview->>'feePredecessorId')::uuid),$sql$),
        ($sql$'owner_due',actor,correction_id,fee.id);$sql$, $sql$'owner_due',actor,correction_id,coalesce(fee.id,(preview->>'feePredecessorId')::uuid));$sql$),
        (E'    IF fee.id IS NOT NULL THEN\n      INSERT INTO public.owner_invoice_lines',E'    IF owner_line.id IS NOT NULL THEN\n      INSERT INTO public.owner_invoice_lines')
      ) AS fee_apply(needle,replacement) LOOP
        IF cardinality(string_to_array(definition,change.needle))<>2 THEN RAISE EXCEPTION 'Unexpected fee confirmation: %',change.needle; END IF;
        definition := replace(definition,change.needle,change.replacement);
      END LOOP;
    END IF;
    EXECUTE definition;
  END LOOP;
END
$migration$;
COMMIT;
