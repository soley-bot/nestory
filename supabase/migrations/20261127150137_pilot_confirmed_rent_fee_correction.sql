BEGIN;

-- A paid charge confirmed as monthly rent keeps its manual invoice source.
-- Its originally posted fee identifies the fee that staff can correct.
DO $migration$
DECLARE
  definition text := replace(pg_get_functiondef(
    'app_private.build_historical_rent_correction_preview(uuid,uuid,numeric,integer,numeric)'::regprocedure), chr(13), '');
  source_check text := $sql$    OR v_invoice.generation_source <> 'lease_rules_v1'$sql$;
  fee_assignment text := '  v_replacement_fee := p_corrected_management_fee_amount;';
BEGIN
  IF encode(extensions.digest(definition, 'sha256'), 'hex') <>
     '5c473ec5689706b9c74d8b2fbe4b737466e6f94246ff8f1ea73e96e6dd1372e1'
     OR cardinality(string_to_array(definition, source_check)) <> 2
     OR cardinality(string_to_array(definition, fee_assignment)) <> 2 THEN
    RAISE EXCEPTION 'Unexpected issued management fee preview';
  END IF;

  definition := replace(definition, source_check, source_check || $sql$
    OR (p_organization_id = '752a87b8-bd04-4a45-9cb8-00687af66e73'::uuid
        AND v_invoice.generation_source IS NULL AND NOT EXISTS (
          SELECT 1
          FROM public.activity_logs confirmation
          JOIN public.management_fee_occurrences original_fee
            ON original_fee.organization_id = confirmation.organization_id
           AND original_fee.tenant_invoice_id = confirmation.entity_id
           AND original_fee.lease_id = v_invoice.lease_id
           AND original_fee.id::text = confirmation.new_values->>'feeId'
          WHERE confirmation.organization_id = p_organization_id
            AND confirmation.entity_type = 'tenant_invoice'
            AND confirmation.entity_id = v_invoice.id
            AND confirmation.action = 'confirmed_monthly_rent'
        ))$sql$);
  -- The fee-only command never reschedules the tenant's invoice.
  EXECUTE replace(definition, fee_assignment, '  v_corrected_due_date := v_invoice.due_date;'
    || chr(10) || fee_assignment);
END;
$migration$;

COMMIT;
