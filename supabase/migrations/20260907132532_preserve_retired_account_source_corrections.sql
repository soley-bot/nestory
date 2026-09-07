-- Retired sources remain unavailable for new money movements, but checked
-- reversals must be able to retain the original operational source identity.
CREATE OR REPLACE FUNCTION app_private.enforce_reconciliation_source_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_source public.financial_reconciliation_sources%ROWTYPE;
  v_original_matches boolean := false;
  v_reversal_id uuid := nullif(to_jsonb(NEW)->>'reversal_of_id', '')::uuid;
BEGIN
  IF NEW.reconciliation_source_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_source FROM public.financial_reconciliation_sources
  WHERE id = NEW.reconciliation_source_id AND organization_id = NEW.organization_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial reconciliation source is outside the organization' USING ERRCODE = '23503';
  END IF;
  IF v_source.archived_at IS NOT NULL THEN
    IF v_reversal_id IS NOT NULL AND TG_TABLE_SCHEMA = 'public'
      AND TG_TABLE_NAME IN ('finance_receipts', 'finance_payments', 'lease_deposit_events') THEN
      EXECUTE pg_catalog.format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND organization_id = $2 '
        'AND property_id = $3 AND currency = $4 AND reconciliation_source_id = $5 '
        'AND reversal_of_id IS NULL)', TG_TABLE_NAME
      ) INTO v_original_matches USING v_reversal_id, NEW.organization_id,
        NEW.property_id, NEW.currency, NEW.reconciliation_source_id;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.organization_id = OLD.organization_id
      AND NEW.property_id = OLD.property_id AND NEW.currency = OLD.currency
      AND NEW.reconciliation_source_id = OLD.reconciliation_source_id THEN
      v_original_matches := true;
    END IF;
    IF NOT v_original_matches THEN
      RAISE EXCEPTION 'Financial reconciliation source is archived' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_source.currency <> NEW.currency THEN
    RAISE EXCEPTION 'Financial reconciliation source currency does not match' USING ERRCODE = '22023';
  END IF;
  IF v_source.scope_kind = 'property_dedicated'
    AND v_source.property_id IS DISTINCT FROM NEW.property_id THEN
    RAISE EXCEPTION 'Dedicated financial reconciliation source does not match the property' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
