-- Activity JSON can contain the full financial/lease record. Branch visibility
-- alone is not authority to read every domain's audit history.
DROP POLICY activity_logs_branch_scoped_select ON public.activity_logs;
CREATE POLICY activity_logs_branch_scoped_select ON public.activity_logs
FOR SELECT TO authenticated
USING (
  app_private.is_super_admin(organization_id)
  OR (
    branch_id IS NOT NULL
    AND branch_id = app_private.current_active_branch_id(organization_id)
    AND CASE
      WHEN entity_type IN ('property', 'unit') THEN
        app_private.has_org_permission(organization_id, 'properties.view')
      WHEN entity_type IN ('person', 'person_branch_relationship') THEN
        app_private.has_org_permission(organization_id, 'people.view')
      WHEN entity_type IN (
        'lease', 'lease_billing_term', 'lease_occupancy',
        'lease_occupancy_participant', 'lease_party', 'lease_term'
      ) THEN app_private.has_org_permission(organization_id, 'leases.view')
      WHEN entity_type IN ('task', 'tenant_request') THEN
        app_private.has_org_permission(organization_id, 'maintenance.view')
      WHEN entity_type IN (
        'ledger_entry', 'financial_month', 'finance_income_item', 'finance_expense_item',
        'finance_receipt', 'finance_receipt_allocation', 'finance_payment',
        'finance_payment_allocation', 'tenant_invoice', 'tenant_invoice_line',
        'tenant_invoice_payment', 'tenant_invoice_payment_allocation',
        'tenant_commercial_document_artifact', 'owner_collection_confirmation',
        'owner_collection_confirmation_allocation', 'owner_invoice', 'owner_invoice_line',
        'owner_payment', 'owner_payment_allocation', 'owner_charge_cash_allocation',
        'property_withdrawal', 'owner_cash_event', 'lease_deposit_event',
        'expense_submission', 'expense_transaction', 'expense_customer_adjustment',
        'management_fee_occurrence', 'fee_payment_date_correction',
        'owner_opening_balance_request', 'petty_cash_entry', 'petty_cash_account',
        'petty_cash_period', 'rent_policy_version'
      ) THEN app_private.has_org_permission(organization_id, 'finance.view')
      -- These polymorphic records inherit the source row's RLS, including its
      -- domain and property authority. Missing sources fail closed.
      WHEN entity_type = 'document' THEN EXISTS (
        SELECT 1 FROM public.documents AS document
        WHERE document.organization_id = activity_logs.organization_id
          AND document.id = activity_logs.entity_id
      )
      WHEN entity_type = 'timeline_event' THEN EXISTS (
        SELECT 1 FROM public.timeline_events AS event
        WHERE event.organization_id = activity_logs.organization_id
          AND event.id = activity_logs.entity_id
      )
      -- Workspace administration, imports, and new/unclassified entity types
      -- remain visible only to the organization's Super Admin.
      ELSE false
    END
    -- A legacy deposit action may be logged against its lease. It carries
    -- financial data even though the entity family is leases.
    AND (NOT (
        starts_with(action, 'lease_deposit_') OR starts_with(action, 'deposit_rent_')
        OR action IN ('apply_deposit_to_rent', 'reverse_deposit_rent_application')
      )
      OR app_private.has_org_permission(organization_id, 'finance.view'))
    -- Source links can change. Both old and new snapshots must remain within
    -- the reader's authority, even if the current source is now less restricted.
    AND (entity_type NOT IN ('timeline_event', 'document') OR NOT EXISTS (
      SELECT 1 FROM (VALUES (previous_values), (new_values)) AS history(snapshot)
      WHERE
        -- Old properties must resolve inside the same company and assigned
        -- branch. Validate JSON before casting so malformed history denies.
        ((snapshot ->> 'property_id') IS NOT NULL AND NOT CASE
          WHEN snapshot ->> 'property_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (
            app_private.can_access_property(organization_id, (snapshot ->> 'property_id')::uuid, 'properties.view')
            OR app_private.can_access_property(organization_id, (snapshot ->> 'property_id')::uuid, 'leases.view')
            OR app_private.can_access_property(organization_id, (snapshot ->> 'property_id')::uuid, 'finance.view')
            OR app_private.can_access_property(organization_id, (snapshot ->> 'property_id')::uuid, 'maintenance.view')
          )
          ELSE false
        END)
        OR ((snapshot ->> 'ledger_entry_id') IS NOT NULL
          AND NOT app_private.has_org_permission(organization_id, 'finance.view'))
        OR (((snapshot ->> 'lease_id') IS NOT NULL
          OR snapshot ->> 'event_type' IN (
            'Lease Started', 'Lease Ended', 'Tenant Move In', 'Tenant Move Out', 'Rent Increase'
          )) AND NOT app_private.has_org_permission(organization_id, 'leases.view'))
        OR (((snapshot ->> 'task_id') IS NOT NULL
          OR (snapshot ->> 'tenant_request_id') IS NOT NULL
          OR snapshot ->> 'event_type' IN ('Maintenance', 'Repair', 'Renovation', 'Inspection'))
          AND NOT app_private.has_org_permission(organization_id, 'maintenance.view'))
        -- General property history remains protected after a source changes
        -- domains (for example, General Note becomes Maintenance). Metadata-
        -- only snapshots have no independent domain and use the source RLS.
        OR ((snapshot ->> 'ledger_entry_id') IS NULL
          AND (snapshot ->> 'lease_id') IS NULL
          AND (snapshot ->> 'task_id') IS NULL
          AND (snapshot ->> 'tenant_request_id') IS NULL
          AND (snapshot ->> 'timeline_event_id') IS NULL
          AND (
            (entity_type = 'timeline_event'
              AND snapshot ->> 'event_type' IN ('General Note', 'Document Added'))
            OR (entity_type = 'document' AND (snapshot ->> 'property_id') IS NOT NULL)
          )
          AND NOT app_private.has_org_permission(organization_id, 'properties.view'))
        -- A document's historical timeline parent has no immutable domain
        -- snapshot of its own. Require all possible domains rather than infer
        -- the old domain from the parent's mutable current state.
        -- Legacy document updates omitted some parent links entirely. Their
        -- nonempty payload cannot prove its historical domain either.
        OR (entity_type = 'document' AND (
            (snapshot ->> 'timeline_event_id') IS NOT NULL
            OR (snapshot IS NOT NULL AND snapshot <> '{}'::jsonb
              AND NOT (snapshot ?& ARRAY['ledger_entry_id', 'lease_id', 'task_id', 'tenant_request_id', 'timeline_event_id']))
          )
          AND NOT (
            app_private.has_org_permission(organization_id, 'properties.view')
            AND app_private.has_org_permission(organization_id, 'leases.view')
            AND app_private.has_org_permission(organization_id, 'finance.view')
            AND app_private.has_org_permission(organization_id, 'maintenance.view')
          ))
    ))
  )
);
