-- Unit attribution describes an owner contribution; cash authority remains property-wide.
ALTER TABLE public.owner_cash_events ADD COLUMN unit_id uuid;
ALTER TABLE public.owner_cash_events ADD CONSTRAINT owner_cash_events_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES public.units(organization_id, id);
CREATE INDEX owner_cash_events_unit_idx ON public.owner_cash_events(organization_id, unit_id) WHERE unit_id IS NOT NULL;

CREATE FUNCTION app_private.assign_owner_cash_unit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_unit uuid;
BEGIN
  IF NEW.reversal_of_id IS NOT NULL OR NEW.corrects_event_id IS NOT NULL THEN
    SELECT unit_id INTO v_unit FROM public.owner_cash_events
      WHERE organization_id = NEW.organization_id AND id = coalesce(NEW.corrects_event_id, NEW.reversal_of_id);
  ELSIF NEW.event_type = 'owner_contribution' THEN
    v_unit := nullif(pg_catalog.current_setting('app.owner_contribution_unit', true), '')::uuid;
  END IF;
  IF v_unit IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.units u
    WHERE u.organization_id = NEW.organization_id AND u.property_id = NEW.property_id AND u.id = v_unit) THEN
    RAISE EXCEPTION 'owner_contribution_unit_mismatch' USING ERRCODE = '23503';
  END IF;
  NEW.unit_id := v_unit;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_private.assign_owner_cash_unit() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.assign_owner_cash_unit() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER assign_owner_cash_unit BEFORE INSERT ON public.owner_cash_events
  FOR EACH ROW EXECUTE FUNCTION app_private.assign_owner_cash_unit();

CREATE FUNCTION public.record_owner_contribution(
  p_organization_id uuid, p_property_id uuid, p_owner_person_id uuid,
  p_currency public.currency_code, p_event_date date, p_amount numeric,
  p_reason text, p_idempotency_key text, p_unit_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb; v_unit uuid; v_previous text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR app_private.can_access_property(
    p_organization_id, p_property_id, 'finance.record_payments') IS NOT TRUE THEN
    RAISE EXCEPTION 'owner_contribution_forbidden' USING ERRCODE = '42501';
  END IF;
  -- Let the existing command validate and replay the original payload even if
  -- its unit has since been archived. New keys still require an active unit.
  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.owner_cash_events e
    WHERE e.organization_id = p_organization_id
      AND e.idempotency_key = pg_catalog.btrim(p_idempotency_key)
      AND e.unit_id = p_unit_id
  ) AND NOT EXISTS (SELECT 1 FROM public.units u
    WHERE u.organization_id = p_organization_id AND u.property_id = p_property_id
      AND u.id = p_unit_id AND u.archived_at IS NULL) THEN
    RAISE EXCEPTION 'owner_contribution_unit_mismatch' USING ERRCODE = '23503';
  END IF;
  v_previous := pg_catalog.current_setting('app.owner_contribution_unit', true);
  PERFORM pg_catalog.set_config('app.owner_contribution_unit', coalesce(p_unit_id::text, ''), true);
  v_result := public.record_owner_cash_event(p_organization_id, p_property_id, p_owner_person_id,
    p_currency, 'owner_contribution', p_event_date, p_amount, p_reason, p_idempotency_key);
  SELECT unit_id INTO STRICT v_unit FROM public.owner_cash_events
    WHERE organization_id = p_organization_id AND id = (v_result->>'owner_cash_event_id')::uuid;
  IF v_unit IS DISTINCT FROM p_unit_id THEN
    RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config('app.owner_contribution_unit', coalesce(v_previous, ''), true);
  RETURN v_result;
END;
$$;
ALTER FUNCTION public.record_owner_contribution(uuid,uuid,uuid,public.currency_code,date,numeric,text,text,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_owner_contribution(uuid,uuid,uuid,public.currency_code,date,numeric,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_contribution(uuid,uuid,uuid,public.currency_code,date,numeric,text,text,uuid) TO authenticated;

-- Complete the indexed path from bounded invoice-line IDs to expense names.
CREATE INDEX ips_expense_responsibilities_owner_line_idx
  ON public.ips_expense_responsibilities(organization_id, owner_invoice_line_id)
  WHERE owner_invoice_line_id IS NOT NULL;

-- Bounded display-name enrichment. Amounts and dates still come solely from the canonical P&L events.
CREATE FUNCTION public.get_owner_profit_loss_names(p_organization_id uuid, p_property_id uuid, p_event_keys text[])
RETURNS TABLE(event_key text, party_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR app_private.can_read_finance_property(p_organization_id,p_property_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_event_keys IS NULL OR cardinality(p_event_keys) > 200 THEN
    RAISE EXCEPTION 'Bounded event keys required' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
    WITH requested_keys AS MATERIALIZED (
      SELECT DISTINCT pg_catalog.split_part(k, ':', 1) AS source_type,
        CASE WHEN pg_catalog.split_part(k, ':', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN pg_catalog.split_part(k, ':', 2)::uuid END AS source_id
      FROM pg_catalog.unnest(p_event_keys) AS input(k)
    )
    SELECT 'tenant_invoice_line:' || l.id::text, i.recipient_label
    FROM requested_keys k JOIN public.tenant_invoice_lines l ON k.source_type='tenant_invoice_line' AND l.id=k.source_id JOIN public.tenant_invoices i ON i.organization_id=l.organization_id AND i.id=l.invoice_id
    WHERE l.organization_id=p_organization_id AND l.property_id=p_property_id
    UNION ALL
    SELECT 'management_fee_occurrence:'||f.id::text, o.name
    FROM requested_keys k JOIN public.management_fee_occurrences f ON k.source_type='management_fee_occurrence' AND f.id=k.source_id JOIN public.organizations o ON o.id=f.organization_id
    WHERE f.organization_id=p_organization_id AND f.property_id=p_property_id
    UNION ALL
    SELECT 'owner_invoice_line:'||l.id::text, e.vendor_label
    FROM requested_keys k JOIN public.owner_invoice_lines l ON k.source_type='owner_invoice_line' AND l.id=k.source_id
    JOIN public.ips_expense_responsibilities r ON r.organization_id=l.organization_id AND r.owner_invoice_line_id=coalesce(l.reversal_of_id,l.id) AND r.responsibility='owner'
    JOIN public.finance_expense_items e ON e.organization_id=r.organization_id AND e.id=r.finance_expense_item_id
    WHERE l.organization_id=p_organization_id AND l.property_id=p_property_id
    UNION ALL
    SELECT 'expense_customer_adjustment:'||a.id::text, e.vendor_label
    FROM requested_keys k JOIN public.expense_customer_adjustments a ON k.source_type='expense_customer_adjustment' AND a.id=k.source_id
    JOIN public.ips_expense_responsibilities r ON r.organization_id=a.organization_id AND r.id=a.responsibility_id
    JOIN public.finance_expense_items e ON e.organization_id=r.organization_id AND e.id=r.finance_expense_item_id
    WHERE a.organization_id=p_organization_id AND a.property_id=p_property_id;
END;
$$;
ALTER FUNCTION public.get_owner_profit_loss_names(uuid,uuid,text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_owner_profit_loss_names(uuid,uuid,text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_profit_loss_names(uuid,uuid,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION app_private.owner_account_read_context(
  p_organization_id uuid, p_requested_property_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (app_private.is_super_admin(p_organization_id)
    OR app_private.has_org_permission(p_organization_id, 'finance.view')) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_requested_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties property
    WHERE property.organization_id=p_organization_id AND property.id=p_requested_property_id
      AND app_private.can_access_property(p_organization_id,property.id,'finance.view')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  -- The requested property is checked above, but selectors retain every allowed
  -- property so selecting one account does not remove other authorized choices.
  WITH allowed_properties AS MATERIALIZED (
    SELECT property.id,property.code,property.name
    FROM public.properties property
    WHERE property.organization_id=p_organization_id AND property.archived_at IS NULL
      AND app_private.can_access_property(p_organization_id,property.id,'finance.view')
  ), assignments AS MATERIALIZED (
    SELECT assignment.id,assignment.property_id,assignment.person_id,
      assignment.started_on,assignment.ended_on
    FROM public.property_owners assignment
    JOIN allowed_properties property ON property.id=assignment.property_id
    JOIN public.people person ON person.id=assignment.person_id
      AND person.organization_id=assignment.organization_id AND person.archived_at IS NULL
    WHERE assignment.organization_id=p_organization_id AND assignment.archived_at IS NULL
    -- Deliberately no current-date, share-total or active-owner-role filter:
    -- historical account inspection and remediation must remain discoverable.
  ), owners AS (
    SELECT person.id,person.display_name FROM public.people person
    WHERE person.organization_id=p_organization_id AND person.archived_at IS NULL
      AND EXISTS (SELECT 1 FROM assignments assignment WHERE assignment.person_id=person.id)
  )
  SELECT jsonb_build_object(
    'units',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'property_id',u.property_id,'unit_number',u.unit_number) ORDER BY u.unit_number,u.id) FROM public.units u JOIN allowed_properties p ON p.id=u.property_id WHERE u.organization_id=p_organization_id AND u.archived_at IS NULL),'[]'::jsonb),
    'properties',coalesce((SELECT jsonb_agg(to_jsonb(property) ORDER BY property.code,property.id)
      FROM allowed_properties property),'[]'::jsonb),
    'people',coalesce((SELECT jsonb_agg(to_jsonb(person) ORDER BY person.display_name,person.id)
      FROM owners person),'[]'::jsonb),
    'assignments',coalesce((SELECT jsonb_agg(to_jsonb(assignment) ORDER BY assignment.started_on,assignment.id)
      FROM assignments assignment),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

