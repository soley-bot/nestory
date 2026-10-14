-- Deposit rent settlement reclassifies an existing liability; it creates no
-- cash ledger entry. Resolve only the immutable, checked application evidence.
-- Public RPC authorization, bounds, cursor identity and every other source
-- projection remain unchanged. No write command or table privilege is added.
CREATE FUNCTION app_private.deposit_rent_cash_event_is_resolved(
  p_organization_id uuid, p_property_id uuid, p_application_id uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  target public.deposit_rent_applications%ROWTYPE;
  application public.deposit_rent_applications%ROWTYPE;
  bridge public.deposit_rent_owner_bridges%ROWTYPE;
  allocation public.owner_event_owner_allocations%ROWTYPE;
  expected_signed numeric;
  custody numeric;
  held numeric;
  movement_count integer;
BEGIN
  IF p_application_id IS NULL OR auth.uid() IS NULL
    OR app_private.can_read_finance_property(p_organization_id,p_property_id) IS NOT TRUE THEN
    RETURN false;
  END IF;
  SELECT * INTO target FROM public.deposit_rent_applications
  WHERE id=p_application_id AND organization_id=p_organization_id AND property_id=p_property_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Check both sides of a reversal, including the original event and account.
  -- Historical archived accounts remain valid; their identity must not change.
  FOR application IN SELECT a.* FROM public.deposit_rent_applications a
    WHERE a.organization_id=p_organization_id
      AND a.id IN (target.id,target.reversal_of_application_id)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.lease_deposit_events event
      JOIN public.lease_deposits deposit ON deposit.organization_id=application.organization_id
        AND deposit.id=application.lease_deposit_id AND deposit.currency=application.currency
      JOIN public.leases lease ON lease.organization_id=deposit.organization_id AND lease.id=deposit.lease_id
        AND lease.property_id=application.property_id AND lease.unit_id IS NOT DISTINCT FROM application.unit_id
      JOIN public.tenant_invoices invoice ON invoice.organization_id=application.organization_id
        AND invoice.id=application.invoice_id AND invoice.lease_id=lease.id
        AND invoice.property_id=application.property_id AND invoice.unit_id IS NOT DISTINCT FROM application.unit_id
        AND invoice.currency=application.currency
      JOIN public.finance_accounts account ON account.organization_id=application.organization_id
        AND account.id=application.liability_account_id AND account.account_class='liability'
        AND account.use_for_lease_deposits AND (account.property_id IS NULL OR account.property_id=application.property_id)
      LEFT JOIN public.deposit_rent_applications original ON original.organization_id=application.organization_id
        AND original.id=application.reversal_of_application_id
      WHERE event.organization_id=application.organization_id AND event.id=application.deposit_event_id
        AND event.property_id=application.property_id AND event.lease_deposit_id=application.lease_deposit_id
        AND event.amount=application.amount AND event.currency=application.currency
        AND event.event_date=application.settlement_date AND event.liability_account_id=application.liability_account_id
        AND event.ledger_entry_id IS NULL AND event.reconciliation_source_id IS NULL
        AND event.event_type=CASE WHEN application.reversal_of_application_id IS NULL THEN 'applied' ELSE 'reversed' END
        AND event.reversal_of_id IS NOT DISTINCT FROM original.deposit_event_id
        AND (application.reversal_of_application_id IS NULL OR (
          original.id IS NOT NULL AND original.reversal_of_application_id IS NULL
          AND original.liability_account_id=application.liability_account_id
          AND original.custody_confirmation_id=application.custody_confirmation_id
          AND original.owner_person_id IS NOT DISTINCT FROM application.owner_person_id
          AND original.settlement_date<=application.settlement_date))
    ) THEN RETURN false; END IF;

    SELECT * INTO bridge FROM public.deposit_rent_owner_bridges b
      WHERE b.organization_id=application.organization_id AND b.application_id=application.id;
    IF NOT FOUND THEN RETURN false; END IF;
    -- Reuse the existing read-only authority/fingerprint/owner/reversal validator.
    PERFORM app_private.deposit_statement_source(application.organization_id,application.property_id,
      bridge.owner_person_id,application.id,
      app_private.deposit_rent_owner_fingerprint(application.organization_id,application.id));

    IF (SELECT count(*) FROM public.owner_event_owner_allocations o
      WHERE o.organization_id=application.organization_id AND o.allocation_set_id=bridge.allocation_set_id)<>1 THEN
      RETURN false;
    END IF;
    SELECT * INTO allocation FROM public.owner_event_owner_allocations o
      WHERE o.organization_id=application.organization_id AND o.allocation_set_id=bridge.allocation_set_id;
    expected_signed:=CASE WHEN application.reversal_of_application_id IS NULL THEN application.amount ELSE -application.amount END;
    SELECT coalesce(sum(m.signed_amount) FILTER(WHERE m.component='security_deposit_custody'),0),
      coalesce(sum(m.signed_amount) FILTER(WHERE m.component='ips_held_owner_cash'),0),count(*)
      INTO custody,held,movement_count
      FROM public.owner_component_movements m WHERE m.organization_id=application.organization_id
        AND m.owner_event_owner_allocation_id=allocation.id;
    IF custody<>-expected_signed OR held<>(CASE WHEN application.custodian='ips' THEN expected_signed ELSE 0 END)
      OR bridge.custody_signed_amount<>custody OR bridge.ips_held_signed_amount<>held
      OR movement_count<>(CASE WHEN application.custodian='ips' THEN 2 ELSE 1 END)
      OR EXISTS (SELECT 1 FROM public.owner_component_movements m
        LEFT JOIN public.owner_component_movements original ON original.organization_id=m.organization_id
          AND original.id=m.reversal_of_movement_id
        LEFT JOIN public.owner_event_owner_allocations original_owner ON original_owner.organization_id=original.organization_id
          AND original_owner.id=original.owner_event_owner_allocation_id
        LEFT JOIN public.deposit_rent_owner_bridges original_bridge ON original_bridge.organization_id=original_owner.organization_id
          AND original_bridge.allocation_set_id=original_owner.allocation_set_id
        WHERE m.organization_id=application.organization_id AND m.owner_event_owner_allocation_id=allocation.id
          AND (m.property_id<>application.property_id OR m.owner_person_id<>bridge.owner_person_id
            OR m.currency<>application.currency OR m.event_date<>application.settlement_date
            OR (application.reversal_of_application_id IS NULL AND m.reversal_of_movement_id IS NOT NULL)
            OR (application.reversal_of_application_id IS NOT NULL AND (
              original.id IS NULL OR original_bridge.application_id IS DISTINCT FROM application.reversal_of_application_id
              OR original.signed_amount<>-m.signed_amount OR original.component<>m.component
              OR original.movement_order<>m.movement_order)))) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN check_violation THEN
  -- A missing or changed immutable source stays visible as unresolved evidence.
  RETURN false;
END;
$$;
ALTER FUNCTION app_private.deposit_rent_cash_event_is_resolved(uuid,uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.deposit_rent_cash_event_is_resolved(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the installed predecessor, including owner-distribution reversals.
ALTER FUNCTION app_private.get_property_cash_events_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)
  RENAME TO get_property_cash_events_page_before_deposit_reclassification;

CREATE FUNCTION app_private.get_property_cash_events_page(
  p_organization_id uuid,p_property_id uuid,p_currency public.currency_code,
  p_period_start date,p_period_end date,p_after_event_date date,
  p_after_source_type text,p_after_source_id uuid,p_page_size integer
) RETURNS TABLE(
  contract_version text,event_key text,organization_id uuid,property_id uuid,unit_id uuid,
  lease_id uuid,task_id uuid,owner_person_id uuid,tenant_person_id uuid,vendor_person_id uuid,
  event_date date,period_start date,currency public.currency_code,amount numeric,
  owner_cash_effect numeric,operating_cash_effect numeric,deposit_liability_effect numeric,
  management_fee_effect numeric,economic_class text,category_code text,description text,
  reference text,source_type text,source_id uuid,source_parent_type text,source_parent_id uuid,
  obligation_type text,obligation_id uuid,reversal_source_type text,reversal_source_id uuid,
  is_reversal boolean,resolution_state text,resolution_reason text,reconciliation_source_id uuid,
  ledger_entry_id uuid,cursor_event_date date,cursor_source_type text,cursor_source_id uuid
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH checked AS MATERIALIZED (
    SELECT event.*,application.id AS application_id,application.amount AS application_amount,
      application.reversal_of_application_id,
      app_private.deposit_rent_cash_event_is_resolved(event.organization_id,event.property_id,application.id) AS application_resolved
    FROM app_private.get_property_cash_events_page_before_deposit_reclassification(
      p_organization_id,p_property_id,p_currency,p_period_start,p_period_end,
      p_after_event_date,p_after_source_type,p_after_source_id,p_page_size
    ) event
    LEFT JOIN public.deposit_rent_applications application
      ON event.source_type='deposit_event' AND application.deposit_event_id=event.source_id
  )
  SELECT event.contract_version,event.event_key,event.organization_id,event.property_id,event.unit_id,
    event.lease_id,event.task_id,event.owner_person_id,event.tenant_person_id,event.vendor_person_id,
    event.event_date,event.period_start,event.currency,
    CASE WHEN event.application_resolved THEN 0::numeric ELSE event.amount END,
    CASE WHEN event.application_id IS NULL THEN event.owner_cash_effect
      WHEN event.application_resolved THEN 0::numeric ELSE NULL::numeric END,
    CASE WHEN event.application_id IS NULL THEN event.operating_cash_effect
      WHEN event.application_resolved THEN 0::numeric ELSE NULL::numeric END,
    CASE WHEN event.application_id IS NULL THEN event.deposit_liability_effect
      WHEN event.application_resolved THEN CASE WHEN event.reversal_of_application_id IS NULL
        THEN -event.application_amount ELSE event.application_amount END ELSE NULL::numeric END,
    CASE WHEN event.application_id IS NULL THEN event.management_fee_effect
      WHEN event.application_resolved THEN 0::numeric ELSE NULL::numeric END,
    event.economic_class,event.category_code,
    CASE WHEN event.application_resolved THEN CASE WHEN event.reversal_of_application_id IS NULL
      THEN 'Deposit applied to rent (no cash movement)' ELSE 'Reversal: deposit applied to rent (no cash movement)' END
      ELSE event.description END,
    event.reference,event.source_type,event.source_id,
    CASE WHEN event.application_resolved THEN 'deposit_rent_application' ELSE event.source_parent_type END,
    CASE WHEN event.application_resolved THEN event.application_id ELSE event.source_parent_id END,
    event.obligation_type,event.obligation_id,event.reversal_source_type,event.reversal_source_id,event.is_reversal,
    CASE WHEN event.application_id IS NULL THEN event.resolution_state
      WHEN event.application_resolved THEN 'resolved' ELSE 'unresolved' END,
    CASE WHEN event.application_id IS NULL THEN event.resolution_reason
      WHEN event.application_resolved THEN NULL::text ELSE 'Deposit rent application evidence is missing or inconsistent' END,
    event.reconciliation_source_id,event.ledger_entry_id,event.cursor_event_date,event.cursor_source_type,event.cursor_source_id
  FROM checked event
  ORDER BY event.cursor_event_date,event.cursor_source_type,event.cursor_source_id;
$$;
ALTER FUNCTION app_private.get_property_cash_events_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION app_private.get_property_cash_events_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer),
  app_private.get_property_cash_events_page_before_deposit_reclassification(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role;

-- Rebind the existing public wrapper without changing any authorization or ACL.
DO $$ BEGIN
  EXECUTE pg_get_functiondef('public.get_property_cash_events_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)'::regprocedure);
END; $$;
