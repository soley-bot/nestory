BEGIN;

-- Freeze the owner statement presentation at publication so that interrupted
-- publications can still reproduce exactly the bytes of the original version.
ALTER TABLE public.owner_statement_publications ADD COLUMN presentation_version smallint NOT NULL DEFAULT 1
  CHECK (presentation_version IN (1, 2));
ALTER TABLE public.owner_statement_publications ALTER COLUMN presentation_version SET DEFAULT
  CASE WHEN current_setting('app.owner_statement_presentation',true)='2' THEN 2 ELSE 1 END;

-- A client on the previous deployment may still be finishing a publication.
-- Only the renderer that understands the new layout requests version two.
CREATE FUNCTION public.publish_owner_statement_v2(p_organization_id uuid, p_owner_close_revision_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  previous text := current_setting('app.owner_statement_presentation',true);
  result jsonb;
BEGIN
  PERFORM set_config('app.owner_statement_presentation','2',true);
  result := public.publish_owner_statement(p_organization_id,p_owner_close_revision_id,p_idempotency_key);
  PERFORM set_config('app.owner_statement_presentation',coalesce(previous,''),true);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_owner_statement_v2(uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.publish_owner_statement_v2(uuid,uuid,text) TO authenticated;

-- Keep the fee within rent issuance and preserve every original posting and
-- reversal. Existing owner allocations and published statements stay frozen.
DO $migration$
DECLARE
  definition text;
  change record;
  pilot_date text := $sql$CASE WHEN v_invoice.organization_id = '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid
      AND v_invoice.generation_source = 'lease_rules_v1' THEN v_invoice.billing_period_start ELSE v_invoice.issue_date END$sql$;
BEGIN
  definition := replace(pg_get_functiondef('app_private.create_management_fee_owner_charge()'::regprocedure), chr(13), '');
  IF encode(extensions.digest(definition, 'sha256'), 'hex') <> '90afa506e9dec9885a5b7c29920b9257c351e79808256a7e59cc409e98ae99f5'
    OR cardinality(string_to_array(definition, 'NEW.fee_date := v_invoice.issue_date;')) <> 3 THEN
    RAISE EXCEPTION 'Unexpected linked management fee trigger definition';
  END IF;
  EXECUTE replace(definition, 'NEW.fee_date := v_invoice.issue_date;', 'NEW.fee_date := ' || pilot_date || ';');

  -- The preview and applied accounting date must agree when adding a missing
  -- fee. A correction of an existing fee retains its original evidence date.
  definition := replace(pg_get_functiondef('app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer,numeric)'::regprocedure), chr(13), '');
  IF encode(extensions.digest(definition, 'sha256'), 'hex') <> '9d97d451704885de1bb039475aac6dc2438589bee121e6abc5341959f0596f21'
    OR cardinality(string_to_array(definition, 'coalesce(v_fee.fee_date, v_invoice.issue_date)')) <> 2 THEN
    RAISE EXCEPTION 'Unexpected linked management fee preview definition';
  END IF;
  EXECUTE replace(definition, 'coalesce(v_fee.fee_date, v_invoice.issue_date)', 'coalesce(v_fee.fee_date, ' || pilot_date || ')');

  -- The public reporting authority already restricts p_rental_month to Pilot.
  -- Cash reconciliation and the transaction audit still read the source dates.
  definition := replace(pg_get_functiondef('app_private.get_owner_profit_loss_events_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer,boolean)'::regprocedure), chr(13), '');
  IF encode(extensions.digest(definition, 'sha256'), 'hex') <> '5f960d00ea7cc679ed422c422be669f7f2b66360da4ef9fb5e36c569d5c8b4dc' THEN
    RAISE EXCEPTION 'Unexpected owner P&L event definition';
  END IF;
  FOR change IN SELECT * FROM (VALUES
    ($sql$AND pg_catalog.date_trunc('month', line.recognized_on)::date <> invoice.billing_period_start$sql$,
     $sql$AND (invoice.generation_source = 'lease_rules_v1' OR pg_catalog.date_trunc('month', line.recognized_on)::date <> invoice.billing_period_start)$sql$),
    ($sql$AND pg_catalog.date_trunc('month', fee.fee_date)::date <> invoice.billing_period_start$sql$,
     $sql$AND (invoice.generation_source = 'lease_rules_v1' OR pg_catalog.date_trunc('month', fee.fee_date)::date <> invoice.billing_period_start)$sql$),
    ($sql$CASE WHEN basis.report_date <> line.recognized_on
        THEN coalesce(line.description, line.customer_label)$sql$,
     $sql$CASE WHEN p_rental_month AND (line.correction_occurrence_id IS NOT NULL OR line.reversal_of_id IS NOT NULL OR line.supersedes_line_id IS NOT NULL)
        THEN coalesce(original_line.customer_label, line.customer_label, 'Charge')
        WHEN basis.report_date <> line.recognized_on
        THEN coalesce(line.description, line.customer_label)$sql$),
    ($sql$coalesce(line.description, line.customer_label),
      'owner_responsibility_obligation'$sql$,
     $sql$CASE WHEN p_rental_month AND (line.correction_occurrence_id IS NOT NULL OR line.reversal_of_id IS NOT NULL OR line.supersedes_line_id IS NOT NULL)
        THEN coalesce(responsibility.customer_label, line.customer_label, 'Property expense')
        ELSE coalesce(line.description, line.customer_label) END,
      'owner_responsibility_obligation'$sql$),
    ($sql$      adjustment.reason,
      'owner_expense_adjustment'$sql$,
     $sql$      CASE WHEN p_rental_month THEN coalesce(responsibility.customer_label, category.display_label, 'Property expense')
        ELSE adjustment.reason END,
      'owner_expense_adjustment'$sql$)
  ) AS changes(needle, replacement) LOOP
    IF cardinality(string_to_array(definition, change.needle)) <> 2 THEN
      RAISE EXCEPTION 'Unexpected owner P&L expression: %', change.needle;
    END IF;
    definition := replace(definition, change.needle, change.replacement);
  END LOOP;
  EXECUTE definition;

  definition := replace(pg_get_functiondef('public.get_owner_statement_publication(uuid,uuid)'::regprocedure), chr(13), '');
  IF encode(extensions.digest(definition, 'sha256'), 'hex') <> 'bfd1fe7a6cade0fd4eb8e10f6a82fd1c1ab81bdfac1ffff238a4f52a3e3cb322'
    OR cardinality(string_to_array(definition, 'RETURN v_result;')) <> 2 THEN
    RAISE EXCEPTION 'Unexpected owner statement reader definition';
  END IF;
  EXECUTE replace(definition, 'RETURN v_result;', $sql$RETURN v_result || jsonb_build_object('presentation_version',
    (SELECT publication.presentation_version FROM public.owner_statement_publications AS publication
     WHERE publication.organization_id = p_organization_id AND publication.id = p_publication_id));$sql$);
END
$migration$;

COMMIT;
