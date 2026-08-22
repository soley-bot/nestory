-- Remaining branch-scoped domain enforcement.

-- Establish the unforgeable finance-property context before predecessor
-- functions are reconciled to reference it later in this migration.
CREATE TABLE IF NOT EXISTS app_private.finance_branch_authority_capability (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  capability_token text NOT NULL CHECK (capability_token ~ '^[0-9a-f]{64}$')
);
INSERT INTO app_private.finance_branch_authority_capability(singleton,capability_token)
VALUES (true,encode(extensions.digest(gen_random_uuid()::text||clock_timestamp()::text,'sha256'),'hex'))
ON CONFLICT (singleton) DO NOTHING;
REVOKE ALL ON TABLE app_private.finance_branch_authority_capability
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.set_finance_branch_authority_context(
  p_organization_id uuid,
  p_branch_id uuid,
  p_permission_key public.organization_permission_key,
  p_enabled boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_token text;
BEGIN
  IF p_enabled THEN
    SELECT capability_token INTO STRICT v_token
    FROM app_private.finance_branch_authority_capability WHERE singleton;
    PERFORM pg_catalog.set_config('app.finance_branch_authority_token',v_token,true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_org',p_organization_id::text,true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_branch',p_branch_id::text,true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_permission',p_permission_key::text,true);
  ELSE
    PERFORM pg_catalog.set_config('app.finance_branch_authority_token','',true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_org','',true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_branch','',true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_permission','',true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.has_finance_branch_authority_context(
  p_organization_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT EXISTS(
    SELECT 1 FROM app_private.finance_branch_authority_capability AS capability
    WHERE capability.singleton
      AND capability.capability_token=pg_catalog.current_setting('app.finance_branch_authority_token',true)
      AND p_organization_id::text=pg_catalog.current_setting('app.finance_branch_authority_org',true)
      AND p_permission_key::text=pg_catalog.current_setting('app.finance_branch_authority_permission',true)
      AND (
        app_private.current_active_branch_id(p_organization_id)::text
          =pg_catalog.current_setting('app.finance_branch_authority_branch',true)
        OR EXISTS(
          SELECT 1 FROM public.organization_authorization_states AS authorization_state
          WHERE authorization_state.organization_id=p_organization_id
            AND NOT authorization_state.ordinary_access_enabled
            AND app_private.has_org_permission(p_organization_id,p_permission_key)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.begin_finance_property_authority(
  p_organization_id uuid,
  p_property_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_branch_id uuid;
BEGIN
  PERFORM app_private.assert_property_permission(
    p_organization_id,p_property_id,p_permission_key
  );
  IF app_private.is_super_admin(p_organization_id) THEN RETURN NULL; END IF;
  v_branch_id:=app_private.current_active_branch_id(p_organization_id);
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,v_branch_id,p_permission_key,true
  );
  RETURN v_branch_id;
END;
$$;

ALTER TABLE public.financial_month_locks
  ADD COLUMN branch_id uuid;
ALTER TABLE public.documents
  ADD COLUMN branch_id uuid;
ALTER TABLE public.activity_logs
  ADD COLUMN branch_id uuid;

ALTER TABLE public.financial_month_locks
  DROP CONSTRAINT financial_month_locks_organization_month_key;
ALTER TABLE public.financial_month_locks
  ADD CONSTRAINT financial_month_locks_organization_branch_fkey
  FOREIGN KEY (organization_id, branch_id)
  REFERENCES public.organization_branches(organization_id, id);
ALTER TABLE public.documents
  ADD CONSTRAINT documents_organization_branch_fkey
  FOREIGN KEY (organization_id, branch_id)
  REFERENCES public.organization_branches(organization_id, id);
ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_organization_branch_fkey
  FOREIGN KEY (organization_id, branch_id)
  REFERENCES public.organization_branches(organization_id, id);

CREATE UNIQUE INDEX financial_month_locks_global_month_uidx
  ON public.financial_month_locks(organization_id, month_start)
  WHERE branch_id IS NULL;
CREATE UNIQUE INDEX financial_month_locks_branch_month_uidx
  ON public.financial_month_locks(organization_id, branch_id, month_start)
  WHERE branch_id IS NOT NULL;
CREATE INDEX financial_month_locks_org_branch_state_idx
  ON public.financial_month_locks(organization_id, branch_id, month_start)
  WHERE is_locked;
CREATE INDEX documents_org_branch_active_idx
  ON public.documents(organization_id, branch_id, uploaded_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX activity_logs_org_branch_created_idx
  ON public.activity_logs(organization_id, branch_id, created_at DESC);

CREATE FUNCTION app_private.resolve_document_branch_id(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_timeline_event_id uuid,
  p_ledger_entry_id uuid,
  p_task_id uuid,
  p_tenant_request_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH expected AS (
    SELECT
      (p_property_id IS NOT NULL)::integer
      + (p_unit_id IS NOT NULL)::integer
      + (p_lease_id IS NOT NULL)::integer
      + (p_timeline_event_id IS NOT NULL)::integer
      + (p_ledger_entry_id IS NOT NULL)::integer
      + (p_task_id IS NOT NULL)::integer
      + (p_tenant_request_id IS NOT NULL)::integer AS count
  ), scopes AS (
    SELECT property.branch_id
    FROM public.properties AS property
    WHERE p_property_id IS NOT NULL
      AND property.organization_id = p_organization_id
      AND property.id = p_property_id
    UNION ALL
    SELECT property.branch_id
    FROM public.units AS unit_record
    JOIN public.properties AS property
      ON property.organization_id = unit_record.organization_id
     AND property.id = unit_record.property_id
    WHERE p_unit_id IS NOT NULL
      AND unit_record.organization_id = p_organization_id
      AND unit_record.id = p_unit_id
    UNION ALL
    SELECT property.branch_id
    FROM public.leases AS lease
    JOIN public.properties AS property
      ON property.organization_id = lease.organization_id
     AND property.id = lease.property_id
    WHERE p_lease_id IS NOT NULL
      AND lease.organization_id = p_organization_id
      AND lease.id = p_lease_id
    UNION ALL
    SELECT property.branch_id
    FROM public.timeline_events AS event
    JOIN public.properties AS property
      ON property.organization_id = event.organization_id
     AND property.id = event.property_id
    WHERE p_timeline_event_id IS NOT NULL
      AND event.organization_id = p_organization_id
      AND event.id = p_timeline_event_id
    UNION ALL
    SELECT property.branch_id
    FROM public.ledger_entries AS entry
    JOIN public.properties AS property
      ON property.organization_id = entry.organization_id
     AND property.id = entry.property_id
    WHERE p_ledger_entry_id IS NOT NULL
      AND entry.organization_id = p_organization_id
      AND entry.id = p_ledger_entry_id
    UNION ALL
    SELECT task.branch_id
    FROM public.tasks AS task
    JOIN public.properties AS property
      ON property.organization_id = task.organization_id
     AND property.id = task.property_id
     AND property.branch_id = task.branch_id
    WHERE p_task_id IS NOT NULL
      AND task.organization_id = p_organization_id
      AND task.id = p_task_id
    UNION ALL
    SELECT property.branch_id
    FROM public.tenant_requests AS request
    JOIN public.properties AS property
      ON property.organization_id = request.organization_id
     AND property.id = request.property_id
    WHERE p_tenant_request_id IS NOT NULL
      AND request.organization_id = p_organization_id
      AND request.id = p_tenant_request_id
  )
  SELECT CASE
    WHEN expected.count > 0
      AND pg_catalog.count(scopes.branch_id) = expected.count
      AND pg_catalog.count(DISTINCT scopes.branch_id) = 1
    THEN pg_catalog.min(scopes.branch_id::text)::uuid
    ELSE NULL::uuid
  END
  FROM expected
  LEFT JOIN scopes ON true
  GROUP BY expected.count;
$$;

CREATE FUNCTION app_private.document_branch_id(
  p_organization_id uuid,
  p_document_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT document.branch_id
  FROM public.documents AS document
  WHERE document.organization_id = p_organization_id
    AND document.id = p_document_id;
$$;

UPDATE public.documents AS document
SET branch_id = app_private.resolve_document_branch_id(
  document.organization_id,
  document.property_id,
  document.unit_id,
  document.lease_id,
  document.timeline_event_id,
  document.ledger_entry_id,
  document.task_id,
  document.tenant_request_id
)
WHERE document.branch_id IS NULL;

CREATE FUNCTION app_private.document_required_permission(
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_lease_id uuid,
  p_timeline_event_id uuid,
  p_ledger_entry_id uuid,
  p_task_id uuid,
  p_tenant_request_id uuid,
  p_operation text
)
RETURNS public.organization_permission_key
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_ledger_entry_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.timeline_events AS event
        WHERE event.organization_id=p_organization_id
          AND event.id=p_timeline_event_id
          AND event.ledger_entry_id IS NOT NULL
      )
    THEN CASE WHEN p_operation='read' THEN 'finance.view'::public.organization_permission_key
      ELSE 'finance.correct_records'::public.organization_permission_key END
    WHEN p_task_id IS NOT NULL OR p_tenant_request_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.timeline_events AS event
        WHERE event.organization_id=p_organization_id
          AND event.id=p_timeline_event_id
          AND event.event_type IN ('Maintenance','Repair','Renovation','Inspection')
      )
    THEN CASE WHEN p_operation='read' THEN 'maintenance.view'::public.organization_permission_key
      ELSE 'maintenance.create_assign'::public.organization_permission_key END
    WHEN p_lease_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.timeline_events AS event
        WHERE event.organization_id=p_organization_id
          AND event.id=p_timeline_event_id
          AND (event.lease_id IS NOT NULL OR event.event_type IN (
            'Lease Started','Lease Ended','Tenant Move In','Tenant Move Out','Rent Increase'
          ))
      )
    THEN CASE
      WHEN p_operation='read' THEN 'leases.view'::public.organization_permission_key
      WHEN p_operation='archive' THEN 'leases.archive'::public.organization_permission_key
      ELSE 'leases.change_terms'::public.organization_permission_key
    END
    ELSE CASE
      WHEN p_operation='read' THEN 'properties.view'::public.organization_permission_key
      WHEN p_operation='archive' THEN 'properties.archive'::public.organization_permission_key
      ELSE 'properties.write'::public.organization_permission_key
    END
  END;
$$;

CREATE FUNCTION app_private.can_access_document(
  p_organization_id uuid,
  p_document_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.documents AS document
        ON document.organization_id = member.organization_id
       AND document.id = p_document_id
      WHERE member.organization_id = p_organization_id
        AND member.user_id = (SELECT auth.uid())
        AND member.role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.documents AS document
      WHERE document.organization_id = p_organization_id
        AND document.id = p_document_id
        AND document.branch_id IS NOT NULL
        AND CASE
          WHEN EXISTS(
            SELECT 1 FROM public.expense_submissions AS submission
            WHERE submission.organization_id=document.organization_id
              AND submission.supporting_document_id=document.id
              AND app_private.property_branch_id(
                submission.organization_id,submission.property_id
              )=document.branch_id
          ) THEN p_permission_key='finance.view'
          ELSE p_permission_key=app_private.document_required_permission(
            document.organization_id,document.property_id,document.unit_id,document.lease_id,
            document.timeline_event_id,document.ledger_entry_id,document.task_id,
            document.tenant_request_id,
            CASE
              WHEN p_permission_key IN ('properties.view','leases.view','finance.view','maintenance.view')
                THEN 'read'
              WHEN p_permission_key IN ('properties.archive','leases.archive') THEN 'archive'
              ELSE 'write'
            END
          )
        END
        AND app_private.has_org_permission(p_organization_id, p_permission_key)
        AND app_private.can_access_branch(p_organization_id, document.branch_id)
    ),
    false
  );
$$;

CREATE FUNCTION app_private.guard_branch_scoped_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id uuid;
BEGIN
  v_branch_id := app_private.resolve_document_branch_id(
    NEW.organization_id,
    NEW.property_id,
    NEW.unit_id,
    NEW.lease_id,
    NEW.timeline_event_id,
    NEW.ledger_entry_id,
    NEW.task_id,
    NEW.tenant_request_id
  );

  IF NEW.branch_id IS NOT NULL
    AND NEW.branch_id IS DISTINCT FROM v_branch_id THEN
    RAISE EXCEPTION 'Document branch scope conflicts with its authoritative links'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.branch_id IS NOT NULL
    AND v_branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'Document branch snapshot cannot move between branches'
      USING ERRCODE = '22023';
  END IF;

  NEW.branch_id := v_branch_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_guard_branch_scope
  BEFORE INSERT OR UPDATE OF organization_id, property_id, unit_id, lease_id,
    timeline_event_id, ledger_entry_id, task_id, tenant_request_id, branch_id
  ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_branch_scoped_document();

CREATE FUNCTION app_private.activity_entity_branch_id(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id uuid;
BEGIN
  CASE pg_catalog.lower(pg_catalog.btrim(coalesce(p_entity_type, '')))
    WHEN 'property' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.properties AS property
      WHERE property.organization_id=p_organization_id AND property.id=p_entity_id;
    WHEN 'unit' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.units AS unit_record
      JOIN public.properties AS property
        ON property.organization_id=unit_record.organization_id
       AND property.id=unit_record.property_id
      WHERE unit_record.organization_id=p_organization_id AND unit_record.id=p_entity_id;
    WHEN 'lease' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.leases AS lease
      JOIN public.properties AS property
        ON property.organization_id=lease.organization_id
       AND property.id=lease.property_id
      WHERE lease.organization_id=p_organization_id AND lease.id=p_entity_id;
    WHEN 'document' THEN
      SELECT document.branch_id INTO v_branch_id
      FROM public.documents AS document
      WHERE document.organization_id=p_organization_id AND document.id=p_entity_id;
    WHEN 'task' THEN
      SELECT task.branch_id INTO v_branch_id
      FROM public.tasks AS task
      WHERE task.organization_id=p_organization_id AND task.id=p_entity_id;
    WHEN 'tenant_request' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.tenant_requests AS request
      JOIN public.properties AS property
        ON property.organization_id=request.organization_id
       AND property.id=request.property_id
      WHERE request.organization_id=p_organization_id AND request.id=p_entity_id;
    WHEN 'expense_submission' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.expense_submissions AS submission
      JOIN public.properties AS property
        ON property.organization_id=submission.organization_id
       AND property.id=submission.property_id
      WHERE submission.organization_id=p_organization_id AND submission.id=p_entity_id;
    WHEN 'finance_receipt_allocation' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.finance_receipt_allocations AS allocation
      JOIN public.properties AS property
        ON property.organization_id=allocation.organization_id
       AND property.id=allocation.property_id
      WHERE allocation.organization_id=p_organization_id AND allocation.id=p_entity_id;
    WHEN 'owner_collection_confirmation' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.owner_collection_confirmations AS confirmation
      JOIN public.owner_invoices AS invoice
        ON invoice.organization_id=confirmation.organization_id
       AND invoice.id=confirmation.invoice_id
      JOIN public.properties AS property
        ON property.organization_id=invoice.organization_id
       AND property.id=invoice.property_id
      WHERE confirmation.organization_id=p_organization_id AND confirmation.id=p_entity_id;
    WHEN 'owner_payment' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.owner_payments AS payment
      JOIN public.properties AS property
        ON property.organization_id=payment.organization_id
       AND property.id=payment.property_id
      WHERE payment.organization_id=p_organization_id AND payment.id=p_entity_id;
    WHEN 'owner_opening_balance_request' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.owner_opening_balance_requests AS request
      JOIN public.properties AS property
        ON property.organization_id=request.organization_id
       AND property.id=request.property_id
      WHERE request.organization_id=p_organization_id AND request.id=p_entity_id;
    WHEN 'petty_cash_entry' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.petty_cash_entries AS entry
      JOIN public.properties AS property
        ON property.organization_id=entry.organization_id
       AND property.id=entry.property_id
      WHERE entry.organization_id=p_organization_id AND entry.id=p_entity_id;
    WHEN 'property_withdrawal' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.property_withdrawals AS withdrawal
      JOIN public.properties AS property
        ON property.organization_id=withdrawal.organization_id
       AND property.id=withdrawal.property_id
      WHERE withdrawal.organization_id=p_organization_id AND withdrawal.id=p_entity_id;
    WHEN 'tenant_invoice' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.tenant_invoices AS invoice
      JOIN public.properties AS property
        ON property.organization_id=invoice.organization_id
       AND property.id=invoice.property_id
      WHERE invoice.organization_id=p_organization_id AND invoice.id=p_entity_id;
    WHEN 'tenant_invoice_payment' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.tenant_invoice_payments AS payment
      JOIN public.tenant_invoices AS invoice
        ON invoice.organization_id=payment.organization_id
       AND invoice.id=payment.invoice_id
      JOIN public.properties AS property
        ON property.organization_id=invoice.organization_id
       AND property.id=invoice.property_id
      WHERE payment.organization_id=p_organization_id AND payment.id=p_entity_id;
    WHEN 'lease_billing_term' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.lease_billing_terms AS term
      JOIN public.properties AS property
        ON property.organization_id=term.organization_id
       AND property.id=term.property_id
      WHERE term.organization_id=p_organization_id AND term.id=p_entity_id;
    WHEN 'lease_party' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.lease_parties AS party
      JOIN public.leases AS lease
        ON lease.organization_id=party.organization_id AND lease.id=party.lease_id
      JOIN public.properties AS property
        ON property.organization_id=lease.organization_id AND property.id=lease.property_id
      WHERE party.organization_id=p_organization_id AND party.id=p_entity_id;
    WHEN 'lease_term' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.lease_terms AS term
      JOIN public.leases AS lease
        ON lease.organization_id=term.organization_id AND lease.id=term.lease_id
      JOIN public.properties AS property
        ON property.organization_id=lease.organization_id AND property.id=lease.property_id
      WHERE term.organization_id=p_organization_id AND term.id=p_entity_id;
    WHEN 'lease_occupancy_participant' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.lease_occupancy_participants AS participant
      JOIN public.lease_occupancies AS occupancy
        ON occupancy.organization_id=participant.organization_id
       AND occupancy.id=participant.lease_occupancy_id
      JOIN public.properties AS property
        ON property.organization_id=occupancy.organization_id
       AND property.id=occupancy.property_id
      WHERE participant.organization_id=p_organization_id AND participant.id=p_entity_id;
    WHEN 'tenant_commercial_document_artifact' THEN
      SELECT property.branch_id INTO v_branch_id
      FROM public.tenant_commercial_document_artifacts AS artifact
      JOIN public.tenant_invoices AS invoice
        ON artifact.source_kind='invoice'
       AND invoice.organization_id=artifact.organization_id AND invoice.id=artifact.source_id
      JOIN public.properties AS property
        ON property.organization_id=invoice.organization_id AND property.id=invoice.property_id
      WHERE artifact.organization_id=p_organization_id AND artifact.id=p_entity_id
      UNION ALL
      SELECT property.branch_id
      FROM public.tenant_commercial_document_artifacts AS artifact
      JOIN public.tenant_invoice_payments AS payment
        ON artifact.source_kind='receipt'
       AND payment.organization_id=artifact.organization_id AND payment.id=artifact.source_id
      JOIN public.tenant_invoices AS invoice
        ON invoice.organization_id=payment.organization_id AND invoice.id=payment.invoice_id
      JOIN public.properties AS property
        ON property.organization_id=invoice.organization_id AND property.id=invoice.property_id
      WHERE artifact.organization_id=p_organization_id AND artifact.id=p_entity_id;
    WHEN 'financial_month' THEN
      SELECT month_lock.branch_id INTO v_branch_id
      FROM public.financial_month_locks AS month_lock
      WHERE month_lock.organization_id=p_organization_id AND month_lock.id=p_entity_id;
    WHEN 'person' THEN
      SELECT CASE WHEN count(DISTINCT relationship.branch_id)=1
        THEN min(relationship.branch_id::text)::uuid ELSE NULL::uuid END
      INTO v_branch_id
      FROM public.person_branch_relationships AS relationship
      WHERE relationship.organization_id=p_organization_id
        AND relationship.person_id=p_entity_id
        AND relationship.archived_at IS NULL;
    ELSE
      v_branch_id := NULL;
  END CASE;
  RETURN v_branch_id;
END;
$$;

UPDATE public.activity_logs AS activity
SET branch_id = app_private.activity_entity_branch_id(
  activity.organization_id,
  activity.entity_type,
  activity.entity_id
)
WHERE activity.branch_id IS NULL;

CREATE FUNCTION app_private.guard_activity_branch_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
      OR NEW.entity_id IS DISTINCT FROM OLD.entity_id THEN
      RAISE EXCEPTION 'Activity branch snapshot is immutable'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  v_branch_id := app_private.activity_entity_branch_id(
    NEW.organization_id,
    NEW.entity_type,
    NEW.entity_id
  );
  IF NEW.branch_id IS NOT NULL
    AND NEW.branch_id IS DISTINCT FROM v_branch_id THEN
    RAISE EXCEPTION 'Activity branch scope conflicts with its authoritative entity'
      USING ERRCODE = '22023';
  END IF;
  NEW.branch_id := v_branch_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER activity_logs_guard_branch_snapshot
  BEFORE INSERT OR UPDATE OF organization_id, branch_id, entity_type, entity_id
  ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_activity_branch_snapshot();

CREATE FUNCTION app_private.can_read_activity(
  p_organization_id uuid,
  p_activity_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    app_private.is_super_admin(p_organization_id)
    OR EXISTS(
      SELECT 1
      FROM public.activity_logs AS activity
      WHERE activity.organization_id=p_organization_id
        AND activity.id=p_activity_id
        AND activity.branch_id IS NOT NULL
        AND app_private.can_access_branch(activity.organization_id,activity.branch_id)
        AND CASE
          WHEN activity.entity_type='document' THEN
            app_private.can_access_document(activity.organization_id,activity.entity_id,'properties.view')
            OR app_private.can_access_document(activity.organization_id,activity.entity_id,'leases.view')
            OR app_private.can_access_document(activity.organization_id,activity.entity_id,'finance.view')
            OR app_private.can_access_document(activity.organization_id,activity.entity_id,'maintenance.view')
          WHEN activity.entity_type IN (
            'expense_submission','finance_receipt_allocation','financial_month',
            'owner_collection_confirmation','owner_payment','owner_opening_balance_request',
            'petty_cash_account','petty_cash_entry','petty_cash_period','property_withdrawal',
            'rent_policy_version','tenant_invoice','tenant_invoice_payment',
            'tenant_commercial_document_artifact'
          ) THEN app_private.has_org_permission(activity.organization_id,'finance.view')
          WHEN activity.entity_type IN ('task','tenant_request') THEN
            app_private.has_org_permission(activity.organization_id,'maintenance.view')
          WHEN activity.entity_type IN (
            'lease','lease_billing_term','lease_occupancy_participant','lease_party','lease_term'
          ) THEN app_private.has_org_permission(activity.organization_id,'leases.view')
          WHEN activity.entity_type IN ('person','person_branch_relationship') THEN
            app_private.has_org_permission(activity.organization_id,'people.view')
          WHEN activity.entity_type IN ('property','unit') THEN
            app_private.has_org_permission(activity.organization_id,'properties.view')
          ELSE false
        END
    ),false
  );
$$;

CREATE FUNCTION app_private.storage_object_branch_id(p_object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_object_name ~ '^[0-9a-fA-F-]{36}/branches/[0-9a-fA-F-]{36}/'
    THEN pg_catalog.split_part(p_object_name, '/', 3)::uuid
    ELSE NULL::uuid
  END;
$$;

CREATE FUNCTION app_private.can_access_storage_object(
  p_bucket_id text,
  p_object_name text,
  p_permission_key public.organization_permission_key
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid := app_private.storage_object_org_id(p_object_name);
  v_branch_id uuid := app_private.storage_object_branch_id(p_object_name);
  v_metadata_branch_id uuid;
  v_metadata_id uuid;
BEGIN
  IF p_bucket_id NOT IN ('nestory-documents','nestory-photos')
    OR v_organization_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_bucket_id = 'nestory-documents' THEN
    SELECT document.id,document.branch_id INTO v_metadata_id,v_metadata_branch_id
    FROM public.documents AS document
    WHERE document.organization_id=v_organization_id
      AND document.storage_path=p_object_name;
  ELSE
    SELECT photo.id,property.branch_id INTO v_metadata_id,v_metadata_branch_id
    FROM public.asset_photos AS photo
    JOIN public.properties AS property
      ON property.organization_id=photo.organization_id
     AND property.id=photo.property_id
    WHERE photo.organization_id=v_organization_id
      AND photo.storage_path=p_object_name;
  END IF;

  IF app_private.is_super_admin(v_organization_id) THEN
    RETURN true;
  END IF;

  IF v_metadata_id IS NULL OR v_metadata_branch_id IS NULL
    OR (
      v_branch_id IS NOT NULL
      AND v_metadata_branch_id IS DISTINCT FROM v_branch_id
    ) THEN
    RETURN false;
  END IF;
  IF p_bucket_id='nestory-documents' THEN
    RETURN app_private.can_access_document(
      v_organization_id,v_metadata_id,p_permission_key
    );
  END IF;
  RETURN app_private.can_access_property(
    v_organization_id,
    (SELECT photo.property_id FROM public.asset_photos AS photo
      WHERE photo.organization_id=v_organization_id AND photo.id=v_metadata_id),
    p_permission_key
  );
END;
$$;

CREATE FUNCTION app_private.can_access_storage_object(
  p_bucket_id text,
  p_object_name text,
  p_permission_key public.organization_permission_key,
  p_operation text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organization_id uuid := app_private.storage_object_org_id(p_object_name);
  v_branch_id uuid := app_private.storage_object_branch_id(p_object_name);
  v_operation text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_operation,'')));
BEGIN
  IF v_operation IN ('select','update') THEN
    RETURN app_private.can_access_storage_object(
      p_bucket_id,p_object_name,p_permission_key
    );
  END IF;
  IF v_operation NOT IN ('insert','delete')
    OR p_bucket_id NOT IN ('nestory-documents','nestory-photos')
    OR v_organization_id IS NULL THEN
    RETURN false;
  END IF;
  IF app_private.is_super_admin(v_organization_id) THEN
    RETURN true;
  END IF;
  IF v_branch_id IS NULL
    OR app_private.current_active_branch_id(v_organization_id) IS DISTINCT FROM v_branch_id
    OR NOT app_private.has_org_permission(v_organization_id,p_permission_key) THEN
    RETURN false;
  END IF;
  IF v_operation='insert' THEN
    RETURN true;
  END IF;
  RETURN app_private.can_access_storage_object(
    p_bucket_id,p_object_name,p_permission_key
  ) OR NOT EXISTS (
    SELECT 1 FROM public.documents AS document
    WHERE p_bucket_id='nestory-documents'
      AND document.organization_id=v_organization_id
      AND document.storage_path=p_object_name
    UNION ALL
    SELECT 1 FROM public.asset_photos AS photo
    WHERE p_bucket_id='nestory-photos'
      AND photo.organization_id=v_organization_id
      AND photo.storage_path=p_object_name
  );
END;
$$;

CREATE FUNCTION app_private.lock_financial_month_scope(
  p_organization_id uuid,
  p_branch_id uuid,
  p_effective_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month_start date := pg_catalog.date_trunc('month',p_effective_date)::date;
BEGIN
  -- The organization/month gate is always first so a global lock and every
  -- branch mutation share one serialization point. The optional branch gate
  -- remains second for deterministic same-branch ordering.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.concat_ws(':','financial_month_v2_gate',p_organization_id,v_month_start),0
  ));
  IF p_branch_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':','financial_month_v2_branch',p_organization_id,p_branch_id,v_month_start),0
    ));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.is_financial_month_locked(
  p_organization_id uuid,
  p_branch_id uuid,
  p_effective_date date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM app_private.lock_financial_month_scope(
    p_organization_id,p_branch_id,p_effective_date
  );
  RETURN EXISTS (
    SELECT 1
    FROM public.financial_month_locks AS month_lock
    WHERE month_lock.organization_id=p_organization_id
      AND month_lock.month_start=pg_catalog.date_trunc('month',p_effective_date)::date
      AND month_lock.is_locked
      AND (
        month_lock.branch_id IS NULL
        OR p_branch_id IS NULL
        OR month_lock.branch_id=p_branch_id
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.is_financial_month_locked(
  p_organization_id uuid,
  p_effective_date date
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.is_financial_month_locked(
    p_organization_id,NULL::uuid,p_effective_date
  );
$$;

CREATE OR REPLACE FUNCTION app_private.lock_open_financial_month(
  p_organization_id uuid,
  p_branch_id uuid,
  p_effective_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month_start date := pg_catalog.date_trunc('month',p_effective_date)::date;
BEGIN
  PERFORM app_private.lock_financial_month_scope(
    p_organization_id,p_branch_id,p_effective_date
  );
  PERFORM 1
  FROM public.financial_month_locks AS month_lock
  WHERE month_lock.organization_id=p_organization_id
    AND month_lock.month_start=v_month_start
    AND month_lock.is_locked
    AND (month_lock.branch_id IS NULL OR p_branch_id IS NULL OR month_lock.branch_id=p_branch_id)
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'Financial month is locked' USING ERRCODE='55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.lock_open_financial_month(
  p_organization_id uuid,
  p_effective_date date
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.lock_open_financial_month(
    p_organization_id,NULL::uuid,p_effective_date
  );
$$;

CREATE OR REPLACE FUNCTION app_private.lock_open_property_financial_month(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id uuid;
BEGIN
  SELECT property.branch_id INTO v_branch_id
  FROM public.properties AS property
  WHERE property.organization_id=p_organization_id
    AND property.id=p_property_id;
  IF NOT FOUND OR v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Property financial scope is unresolved'
      USING ERRCODE='23503';
  END IF;
  PERFORM app_private.lock_open_financial_month(
    p_organization_id,v_branch_id,p_effective_date
  );
  PERFORM app_private.lock_property_financial_month(
    p_organization_id,p_property_id,p_currency,p_effective_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_operate_finance(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id); $$;
CREATE OR REPLACE FUNCTION app_private.can_manage_petty_cash(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id); $$;
CREATE OR REPLACE FUNCTION app_private.can_retry_current_rent(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id); $$;
CREATE OR REPLACE FUNCTION app_private.can_lock_financial_month(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.has_org_permission(target_organization_id,'finance.close_periods'); $$;
CREATE OR REPLACE FUNCTION app_private.can_unlock_financial_month(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id); $$;
CREATE OR REPLACE FUNCTION app_private.can_read_finance_reports(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id); $$;
CREATE OR REPLACE FUNCTION app_private.can_correct_finance(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id); $$;
CREATE OR REPLACE FUNCTION app_private.can_read_finance(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id); $$;
CREATE OR REPLACE FUNCTION app_private.can_submit_expense(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id); $$;
CREATE OR REPLACE FUNCTION app_private.can_review_expense(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id); $$;

CREATE FUNCTION app_private.assert_unit_permission(
  p_organization_id uuid,
  p_unit_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_property_id uuid;
BEGIN
  SELECT unit_record.property_id INTO v_property_id
  FROM public.units AS unit_record
  WHERE unit_record.organization_id=p_organization_id
    AND unit_record.id=p_unit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  RETURN app_private.assert_property_permission(
    p_organization_id,v_property_id,p_permission_key
  );
END;
$$;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_anchor text := E'  IF NOT app_private.is_org_admin(p_organization_id) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
  v_replacement text := E'  PERFORM app_private.assert_unit_permission(\n    p_organization_id, p_unit_id,\n    ''properties.archive''::public.organization_permission_key\n  );';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.archive_unit(uuid,uuid)'::regprocedure,
    'public.restore_unit(uuid,uuid)'::regprocedure
  ] LOOP
    SELECT pg_catalog.replace(pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n')
    INTO v_definition;
    IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
      RAISE EXCEPTION 'Unexpected Unit lifecycle predecessor: %',v_signature;
    END IF;
    EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
  END LOOP;
END;
$migration$;

CREATE FUNCTION app_private.tenant_commercial_document_property_id(
  p_organization_id uuid,p_source_kind text,p_source_id uuid
)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT CASE pg_catalog.lower(pg_catalog.btrim(p_source_kind))
    WHEN 'invoice' THEN (
      SELECT invoice.property_id FROM public.tenant_invoices AS invoice
      WHERE invoice.organization_id=p_organization_id AND invoice.id=p_source_id
    )
    WHEN 'receipt' THEN (
      SELECT invoice.property_id
      FROM public.tenant_invoice_payments AS payment
      JOIN public.tenant_invoices AS invoice
        ON invoice.organization_id=payment.organization_id
       AND invoice.id=payment.invoice_id
      WHERE payment.organization_id=p_organization_id AND payment.id=p_source_id
    )
    WHEN 'artifact' THEN (
      SELECT app_private.tenant_commercial_document_property_id(
        artifact.organization_id,artifact.source_kind,artifact.source_id
      )
      FROM public.tenant_commercial_document_artifacts AS artifact
      WHERE artifact.organization_id=p_organization_id AND artifact.id=p_source_id
    )
    ELSE NULL
  END;
$$;

ALTER FUNCTION public.get_tenant_commercial_document_publication_source(uuid,text,uuid)
  RENAME TO get_tenant_commercial_document_publication_source_baseline_branch106;
ALTER FUNCTION public.get_tenant_commercial_document_publication_source_baseline_branch106(uuid,text,uuid)
  SET SCHEMA app_private;
ALTER FUNCTION public.register_tenant_commercial_document_artifact(uuid,text,uuid,text,text,bigint,text,text,jsonb)
  RENAME TO register_tenant_commercial_document_artifact_baseline_branch106;
ALTER FUNCTION public.register_tenant_commercial_document_artifact_baseline_branch106(uuid,text,uuid,text,text,bigint,text,text,jsonb)
  SET SCHEMA app_private;
ALTER FUNCTION public.mark_tenant_commercial_document_publication_failed(uuid,text,uuid,text)
  RENAME TO mark_tenant_commercial_document_publication_failed_baseline_branch106;
ALTER FUNCTION public.mark_tenant_commercial_document_publication_failed_baseline_branch106(uuid,text,uuid,text)
  SET SCHEMA app_private;
ALTER FUNCTION public.get_tenant_commercial_document_artifact_download(uuid,uuid)
  RENAME TO get_tenant_commercial_document_artifact_download_baseline_branch106;
ALTER FUNCTION public.get_tenant_commercial_document_artifact_download_baseline_branch106(uuid,uuid)
  SET SCHEMA app_private;

CREATE FUNCTION public.get_tenant_commercial_document_publication_source(
  p_organization_id uuid,p_source_kind text,p_source_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb; BEGIN
  IF pg_catalog.lower(pg_catalog.btrim(p_source_kind)) NOT IN ('invoice','receipt') THEN
    IF (SELECT auth.uid()) IS NULL
      OR NOT app_private.has_org_permission(p_organization_id,'finance.view') THEN
      RAISE EXCEPTION 'tenant_commercial_document_source_forbidden' USING ERRCODE='42501';
    END IF;
    RAISE EXCEPTION 'tenant_commercial_document_source_kind_invalid' USING ERRCODE='22023';
  END IF;
  v_property_id:=app_private.tenant_commercial_document_property_id(
    p_organization_id,p_source_kind,p_source_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'tenant_commercial_document_source_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.view');
  BEGIN v_result:=app_private.get_tenant_commercial_document_publication_source_baseline_branch106(
    p_organization_id,p_source_kind,p_source_id
  ); EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false);
  RETURN v_result;
END; $$;

CREATE FUNCTION public.register_tenant_commercial_document_artifact(
  p_organization_id uuid,p_source_kind text,p_source_id uuid,p_storage_path text,
  p_sha256 text,p_size_bytes bigint,p_renderer_version text,p_filename text,
  p_presentation_snapshot jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result uuid; BEGIN
  IF pg_catalog.lower(pg_catalog.btrim(p_source_kind)) NOT IN ('invoice','receipt') THEN
    IF (SELECT auth.uid()) IS NULL
      OR NOT app_private.has_org_permission(p_organization_id,'finance.record_payments') THEN
      RAISE EXCEPTION 'tenant_commercial_document_registration_forbidden' USING ERRCODE='42501';
    END IF;
    RAISE EXCEPTION 'tenant_commercial_document_source_kind_invalid' USING ERRCODE='22023';
  END IF;
  v_property_id:=app_private.tenant_commercial_document_property_id(
    p_organization_id,p_source_kind,p_source_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'tenant_commercial_document_registration_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.record_payments');
  BEGIN v_result:=app_private.register_tenant_commercial_document_artifact_baseline_branch106(
    p_organization_id,p_source_kind,p_source_id,p_storage_path,p_sha256,p_size_bytes,
    p_renderer_version,p_filename,p_presentation_snapshot
  ); EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.record_payments',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.record_payments',false);
  RETURN v_result;
END; $$;

CREATE FUNCTION public.mark_tenant_commercial_document_publication_failed(
  p_organization_id uuid,p_source_kind text,p_source_id uuid,p_failure_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result uuid; BEGIN
  IF pg_catalog.lower(pg_catalog.btrim(p_source_kind)) NOT IN ('invoice','receipt') THEN
    IF (SELECT auth.uid()) IS NULL
      OR NOT app_private.has_org_permission(p_organization_id,'finance.record_payments') THEN
      RAISE EXCEPTION 'tenant_commercial_document_failure_forbidden' USING ERRCODE='42501';
    END IF;
    RAISE EXCEPTION 'tenant_commercial_document_source_kind_invalid' USING ERRCODE='22023';
  END IF;
  v_property_id:=app_private.tenant_commercial_document_property_id(
    p_organization_id,p_source_kind,p_source_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'tenant_commercial_document_failure_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.record_payments');
  BEGIN v_result:=app_private.mark_tenant_commercial_document_publication_failed_baseline_branch106(
    p_organization_id,p_source_kind,p_source_id,p_failure_reason
  ); EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.record_payments',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.record_payments',false);
  RETURN v_result;
END; $$;

CREATE FUNCTION public.get_tenant_commercial_document_artifact_download(
  p_organization_id uuid,p_artifact_id uuid
) RETURNS TABLE(
  id uuid,source_kind text,source_id uuid,document_number text,filename text,
  storage_path text,content_type text,size_bytes bigint,sha256 text,
  renderer_version text,publication_status text,source_state text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid; BEGIN
  v_property_id:=app_private.tenant_commercial_document_property_id(
    p_organization_id,'artifact',p_artifact_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'tenant_commercial_document_download_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.view');
  BEGIN RETURN QUERY
    SELECT * FROM app_private.get_tenant_commercial_document_artifact_download_baseline_branch106(
      p_organization_id,p_artifact_id
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false);
  RETURN;
END; $$;

REVOKE ALL ON FUNCTION app_private.tenant_commercial_document_property_id(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.tenant_commercial_document_property_id(uuid,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION app_private.get_tenant_commercial_document_publication_source_baseline_branch106(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.register_tenant_commercial_document_artifact_baseline_branch106(uuid,text,uuid,text,text,bigint,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.mark_tenant_commercial_document_publication_failed_baseline_branch106(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.get_tenant_commercial_document_artifact_download_baseline_branch106(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_tenant_commercial_document_publication_source(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_commercial_document_publication_source(uuid,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.register_tenant_commercial_document_artifact(uuid,text,uuid,text,text,bigint,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.register_tenant_commercial_document_artifact(uuid,text,uuid,text,text,bigint,text,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_tenant_commercial_document_publication_failed(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_tenant_commercial_document_publication_failed(uuid,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_commercial_document_artifact_download(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_commercial_document_artifact_download(uuid,uuid) TO authenticated;

CREATE FUNCTION app_private.can_attest_tenant_commercial_document_source_as_actor(
  p_organization_id uuid,p_actor_id uuid,p_source_kind text,p_source_id uuid
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN
  RETURN EXISTS(
    SELECT 1
    FROM public.organization_members AS member
    JOIN public.organization_authorization_states AS authorization_state
      ON authorization_state.organization_id=member.organization_id
    JOIN public.properties AS property
      ON property.organization_id=member.organization_id
     AND property.id=app_private.tenant_commercial_document_property_id(
       p_organization_id,p_source_kind,p_source_id
     )
    LEFT JOIN public.organization_roles AS role_record
      ON role_record.organization_id=member.organization_id
     AND role_record.id=member.custom_role_id
     AND role_record.status='active' AND role_record.archived_at IS NULL
    WHERE member.organization_id=p_organization_id
      AND member.user_id=p_actor_id
      AND (
        member.role='super_admin'
        OR (NOT authorization_state.ordinary_access_enabled
          AND app_private.legacy_role_has_permission(
            member.role,'finance.record_payments'
          ))
        OR (authorization_state.ordinary_access_enabled
          AND member.role='custom' AND member.branch_id=property.branch_id
          AND EXISTS(
            SELECT 1 FROM public.organization_role_permissions AS permission_record
            WHERE permission_record.organization_id=member.organization_id
              AND permission_record.role_id=role_record.id
              AND permission_record.permission_key='finance.record_payments'
          ))
      )
  );
END; $$;

CREATE OR REPLACE FUNCTION app_private.is_tenant_commercial_document_registered(
  p_storage_path text,p_storage_object_id uuid,p_storage_object_version text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.tenant_commercial_document_artifacts AS artifact
    WHERE artifact.storage_path=p_storage_path
      AND artifact.storage_object_id=p_storage_object_id
      AND artifact.storage_object_version=p_storage_object_version
      AND artifact.publication_status='published'
      AND (SELECT auth.uid()) IS NOT NULL
      AND app_private.can_access_property(
        artifact.organization_id,
        app_private.tenant_commercial_document_property_id(
          artifact.organization_id,artifact.source_kind,artifact.source_id
        ),
        'finance.view'
      )
  );
$$;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.attest_tenant_commercial_document_upload(uuid,text,uuid,uuid,text,uuid,text,text,bigint,text,jsonb)'::regprocedure;
  v_definition text := pg_catalog.replace(
    pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n'
  );
  v_anchor text := E'app_private.can_attest_tenant_commercial_document_as_actor(\n    p_organization_id,\n    p_actor_id\n  )';
  v_replacement text := E'app_private.can_attest_tenant_commercial_document_source_as_actor(\n    p_organization_id,p_actor_id,p_source_kind,p_source_id\n  )';
BEGIN
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected tenant commercial attestation predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
END;
$migration$;

DROP POLICY IF EXISTS "Finance roles can read tenant commercial document artifacts"
  ON public.tenant_commercial_document_artifacts;
CREATE POLICY "Finance roles can read tenant commercial document artifacts"
  ON public.tenant_commercial_document_artifacts FOR SELECT TO authenticated
  USING (
    app_private.can_access_property(
      organization_id,
      app_private.tenant_commercial_document_property_id(
        organization_id,source_kind,source_id
      ),
      'finance.view'
    )
  );

DROP POLICY IF EXISTS "Finance roles can read registered tenant commercial documents"
  ON storage.objects;
CREATE POLICY "Finance roles can read registered tenant commercial documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id='tenant-commercial-documents'
    AND app_private.is_tenant_commercial_document_registered(name,id,version)
    AND pg_catalog.cardinality(pg_catalog.string_to_array(name,'/'))=4
    AND pg_catalog.split_part(name,'/',2) IN ('invoice','receipt')
    AND pg_catalog.split_part(name,'/',3)~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND app_private.can_access_property(
      app_private.storage_object_org_id(name),
      app_private.tenant_commercial_document_property_id(
        app_private.storage_object_org_id(name),
        pg_catalog.split_part(name,'/',2),
        pg_catalog.split_part(name,'/',3)::uuid
      ),
      'finance.view'
    )
  );

REVOKE ALL ON FUNCTION app_private.can_attest_tenant_commercial_document_source_as_actor(uuid,uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.owner_statement_property_id(
  p_organization_id uuid,p_target_kind text,p_target_id uuid
)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT CASE p_target_kind
    WHEN 'revision' THEN (
      SELECT revision.property_id FROM public.owner_close_revisions AS revision
      WHERE revision.organization_id=p_organization_id AND revision.id=p_target_id
    )
    WHEN 'publication' THEN (
      SELECT revision.property_id
      FROM public.owner_statement_publications AS publication
      JOIN public.owner_close_revisions AS revision
        ON revision.organization_id=publication.organization_id
       AND revision.id=publication.owner_close_revision_id
      WHERE publication.organization_id=p_organization_id AND publication.id=p_target_id
    )
    WHEN 'artifact' THEN (
      SELECT revision.property_id
      FROM public.owner_statement_artifacts AS artifact
      JOIN public.owner_statement_publications AS publication
        ON publication.organization_id=artifact.organization_id
       AND publication.id=artifact.publication_id
      JOIN public.owner_close_revisions AS revision
        ON revision.organization_id=publication.organization_id
       AND revision.id=publication.owner_close_revision_id
      WHERE artifact.organization_id=p_organization_id AND artifact.id=p_target_id
    )
    WHEN 'series' THEN (
      SELECT series.property_id FROM public.owner_close_series AS series
      WHERE series.organization_id=p_organization_id AND series.id=p_target_id
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_read_owner_balance_authority(
  target_organization_id uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN RETURN app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(
    target_organization_id,'finance.view'
  )
  OR EXISTS(
    SELECT 1 FROM public.organization_authorization_states AS authorization_state
    WHERE authorization_state.organization_id=target_organization_id
      AND NOT authorization_state.ordinary_access_enabled
      AND app_private.has_org_permission(target_organization_id,'finance.view')
  ); END; $$;

CREATE OR REPLACE FUNCTION app_private.can_publish_owner_statement(
  target_organization_id uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$ BEGIN RETURN app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(
    target_organization_id,'finance.publish'
  )
  OR EXISTS(
    SELECT 1 FROM public.organization_authorization_states AS authorization_state
    WHERE authorization_state.organization_id=target_organization_id
      AND NOT authorization_state.ordinary_access_enabled
      AND app_private.has_org_permission(target_organization_id,'finance.publish')
  ); END; $$;

ALTER FUNCTION public.get_owner_statement_readiness(uuid,uuid)
  RENAME TO get_owner_statement_readiness_baseline_branch106;
ALTER FUNCTION public.get_owner_statement_readiness_baseline_branch106(uuid,uuid)
  SET SCHEMA app_private;
ALTER FUNCTION public.publish_owner_statement(uuid,uuid,text)
  RENAME TO publish_owner_statement_baseline_branch106;
ALTER FUNCTION public.publish_owner_statement_baseline_branch106(uuid,uuid,text)
  SET SCHEMA app_private;
ALTER FUNCTION public.resume_owner_statement_publication(uuid,uuid,text)
  RENAME TO resume_owner_statement_publication_baseline_branch106;
ALTER FUNCTION public.resume_owner_statement_publication_baseline_branch106(uuid,uuid,text)
  SET SCHEMA app_private;
ALTER FUNCTION public.get_owner_statement_publication(uuid,uuid)
  RENAME TO get_owner_statement_publication_baseline_branch106;
ALTER FUNCTION public.get_owner_statement_publication_baseline_branch106(uuid,uuid)
  SET SCHEMA app_private;
ALTER FUNCTION public.get_owner_statement_artifact_download(uuid,uuid)
  RENAME TO get_owner_statement_artifact_download_baseline_branch106;
ALTER FUNCTION public.get_owner_statement_artifact_download_baseline_branch106(uuid,uuid)
  SET SCHEMA app_private;
ALTER FUNCTION public.get_owner_statement_publications_for_series(uuid,uuid)
  RENAME TO get_owner_statement_publications_for_series_baseline_branch106;
ALTER FUNCTION public.get_owner_statement_publications_for_series_baseline_branch106(uuid,uuid)
  SET SCHEMA app_private;

CREATE FUNCTION public.get_owner_statement_readiness(
  p_organization_id uuid,p_owner_close_revision_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb; BEGIN
  v_property_id:=app_private.owner_statement_property_id(
    p_organization_id,'revision',p_owner_close_revision_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'owner_statement_readiness_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.view');
  BEGIN v_result:=app_private.get_owner_statement_readiness_baseline_branch106(
    p_organization_id,p_owner_close_revision_id
  ); EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false);
  RETURN v_result;
END; $$;

CREATE FUNCTION public.publish_owner_statement(
  p_organization_id uuid,p_owner_close_revision_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb; BEGIN
  v_property_id:=app_private.owner_statement_property_id(
    p_organization_id,'revision',p_owner_close_revision_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'owner_statement_publish_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.publish');
  BEGIN v_result:=app_private.publish_owner_statement_baseline_branch106(
    p_organization_id,p_owner_close_revision_id,p_idempotency_key
  ); EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.publish',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.publish',false);
  RETURN v_result;
END; $$;

CREATE FUNCTION public.resume_owner_statement_publication(
  p_organization_id uuid,p_publication_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb; BEGIN
  v_property_id:=app_private.owner_statement_property_id(
    p_organization_id,'publication',p_publication_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'owner_statement_resume_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.publish');
  BEGIN v_result:=app_private.resume_owner_statement_publication_baseline_branch106(
    p_organization_id,p_publication_id,p_idempotency_key
  ); EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.publish',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.publish',false);
  RETURN v_result;
END; $$;

CREATE FUNCTION public.get_owner_statement_publication(
  p_organization_id uuid,p_publication_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb; BEGIN
  v_property_id:=app_private.owner_statement_property_id(
    p_organization_id,'publication',p_publication_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'owner_statement_publication_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.view');
  BEGIN v_result:=app_private.get_owner_statement_publication_baseline_branch106(
    p_organization_id,p_publication_id
  ); EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false);
  RETURN v_result;
END; $$;

CREATE FUNCTION public.get_owner_statement_artifact_download(
  p_organization_id uuid,p_artifact_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb; BEGIN
  v_property_id:=app_private.owner_statement_property_id(
    p_organization_id,'artifact',p_artifact_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'owner_statement_download_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.view');
  BEGIN v_result:=app_private.get_owner_statement_artifact_download_baseline_branch106(
    p_organization_id,p_artifact_id
  ); EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false);
  RETURN v_result;
END; $$;

CREATE FUNCTION public.get_owner_statement_publications_for_series(
  p_organization_id uuid,p_owner_close_series_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb; BEGIN
  v_property_id:=app_private.owner_statement_property_id(
    p_organization_id,'series',p_owner_close_series_id
  );
  IF v_property_id IS NULL THEN RAISE EXCEPTION 'owner_statement_publication_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.view');
  BEGIN v_result:=app_private.get_owner_statement_publications_for_series_baseline_branch106(
    p_organization_id,p_owner_close_series_id
  ); EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.view',false);
  RETURN v_result;
END; $$;

CREATE FUNCTION app_private.can_access_owner_statement_publication_as_actor(
  p_organization_id uuid,
  p_actor_id uuid,
  p_publication_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.owner_statement_publications AS publication
    JOIN public.owner_close_revisions AS revision
      ON revision.organization_id=publication.organization_id
     AND revision.id=publication.owner_close_revision_id
    JOIN public.properties AS property
      ON property.organization_id=revision.organization_id
     AND property.id=revision.property_id
    JOIN public.organization_members AS member
      ON member.organization_id=publication.organization_id
     AND member.user_id=p_actor_id
    JOIN public.organization_authorization_states AS authorization_state
      ON authorization_state.organization_id=member.organization_id
    WHERE publication.organization_id=p_organization_id
      AND publication.id=p_publication_id
      AND (
        member.role='super_admin'
        OR (
          NOT authorization_state.ordinary_access_enabled
          AND app_private.legacy_role_has_permission(
            member.role,p_permission_key
          )
        )
        OR (
          authorization_state.ordinary_access_enabled
          AND member.role='custom'
          AND member.branch_id=property.branch_id
          AND EXISTS (
            SELECT 1
            FROM public.organization_branches AS branch
            JOIN public.organization_roles AS role_record
              ON role_record.organization_id=branch.organization_id
             AND role_record.id=member.custom_role_id
             AND role_record.status='active'
             AND role_record.archived_at IS NULL
            JOIN public.organization_role_permissions AS permission_record
              ON permission_record.organization_id=role_record.organization_id
             AND permission_record.role_id=role_record.id
             AND permission_record.permission_key=p_permission_key
            WHERE branch.organization_id=member.organization_id
              AND branch.id=member.branch_id
              AND branch.status='active'
              AND branch.archived_at IS NULL
          )
        )
      )
  );
END;
$$;

CREATE FUNCTION app_private.owner_statement_publication_id_from_path(
  p_storage_path text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT CASE
    WHEN pg_catalog.cardinality(pg_catalog.string_to_array(p_storage_path,'/'))=4
      AND pg_catalog.split_part(p_storage_path,'/',2)
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN pg_catalog.split_part(p_storage_path,'/',2)::uuid
    ELSE NULL
  END;
$$;

CREATE FUNCTION app_private.can_create_owner_statement_artifact_path(
  p_storage_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.owner_statement_publications AS publication
    WHERE publication.organization_id=app_private.storage_object_org_id(p_storage_path)
      AND publication.id=app_private.owner_statement_publication_id_from_path(p_storage_path)
      AND pg_catalog.split_part(p_storage_path,'/',3) IN ('pdf','xlsx')
      AND p_storage_path=app_private.owner_statement_storage_path(
        publication.organization_id,
        publication.id,
        publication.statement_number,
        pg_catalog.split_part(p_storage_path,'/',3)
      )
      AND app_private.can_access_owner_statement_publication_as_actor(
        publication.organization_id,
        (SELECT auth.uid()),
        publication.id,
        'finance.publish'
      )
  );
$$;

CREATE FUNCTION app_private.can_read_owner_statement_artifact_path(
  p_storage_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT app_private.can_access_owner_statement_publication_as_actor(
    app_private.storage_object_org_id(p_storage_path),
    (SELECT auth.uid()),
    app_private.owner_statement_publication_id_from_path(p_storage_path),
    'finance.view'
  );
$$;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_anchor text := E'  IF NOT app_private.can_publish_owner_statement_as_actor(\n    p_organization_id, p_actor_id\n  ) THEN';
  v_replacement text := E'  IF NOT app_private.can_access_owner_statement_publication_as_actor(\n    p_organization_id, p_actor_id, p_publication_id, ''finance.publish''\n  ) THEN';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_owner_statement_artifact_object(uuid,uuid,uuid,text,text)'::regprocedure,
    'public.register_owner_statement_artifact_verified(uuid,uuid,uuid,text,text,uuid,text,text,text,bigint,text)'::regprocedure
  ] LOOP
    v_definition:=pg_catalog.replace(
      pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n'
    );
    IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
      RAISE EXCEPTION 'Unexpected Owner Statement artifact predecessor: %',v_signature;
    END IF;
    EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
  END LOOP;
END;
$migration$;

REVOKE ALL ON FUNCTION app_private.can_access_owner_statement_publication_as_actor(
  uuid,uuid,uuid,public.organization_permission_key
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.owner_statement_publication_id_from_path(text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.can_create_owner_statement_artifact_path(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.can_create_owner_statement_artifact_path(text)
  TO authenticated;
REVOKE ALL ON FUNCTION app_private.can_read_owner_statement_artifact_path(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.can_read_owner_statement_artifact_path(text)
  TO authenticated;
REVOKE ALL ON FUNCTION app_private.can_create_owner_statement_artifact(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

DROP POLICY IF EXISTS "Finance Manager or Super Admin can create owner statement artifacts"
  ON storage.objects;
CREATE POLICY "Finance Manager or Super Admin can create owner statement artifacts"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='owner-statements'
    AND app_private.can_create_owner_statement_artifact_path(name)
  );

DROP POLICY IF EXISTS "Finance roles can read retained owner statements"
  ON storage.objects;
CREATE POLICY "Finance roles can read retained owner statements"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id='owner-statements'
    AND app_private.can_read_owner_statement_artifact_path(name)
  );

REVOKE ALL ON FUNCTION app_private.owner_statement_property_id(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.get_owner_statement_readiness_baseline_branch106(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.publish_owner_statement_baseline_branch106(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.resume_owner_statement_publication_baseline_branch106(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.get_owner_statement_publication_baseline_branch106(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.get_owner_statement_artifact_download_baseline_branch106(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.get_owner_statement_publications_for_series_baseline_branch106(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_owner_statement_readiness(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_readiness(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.publish_owner_statement(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_owner_statement(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.resume_owner_statement_publication(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resume_owner_statement_publication(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_owner_statement_publication(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_publication(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_owner_statement_artifact_download(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_artifact_download(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_owner_statement_publications_for_series(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_statement_publications_for_series(uuid,uuid) TO authenticated;

-- Preserve the released tenant/owner settlement implementations behind
-- property-scoped checked wrappers. The baseline functions continue to own
-- validation, idempotency, maker-checker, month-lock, and audit behavior.
ALTER FUNCTION public.record_tenant_invoice_payment(
  uuid,uuid,numeric,date,uuid,text,jsonb,text
) RENAME TO record_tenant_invoice_payment_branch106;

ALTER FUNCTION public.reverse_tenant_invoice_payment(
  uuid,uuid,date,text,text
) RENAME TO reverse_tenant_invoice_payment_branch106;

ALTER FUNCTION public.confirm_owner_collected_rent(
  uuid,uuid,numeric,date,text,jsonb,text
) RENAME TO confirm_owner_collected_rent_branch106;

ALTER FUNCTION public.reverse_owner_collection_confirmation(
  uuid,uuid,date,text,text
) RENAME TO reverse_owner_collection_confirmation_branch106;

ALTER FUNCTION public.allocate_owner_event(
  uuid,text,uuid,text
) RENAME TO allocate_owner_event_branch106;

CREATE FUNCTION public.record_tenant_invoice_payment(
  p_organization_id uuid,p_invoice_id uuid,p_amount numeric,
  p_received_date date,p_reconciliation_source_id uuid,p_reference text,
  p_allocations jsonb,p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_property_id uuid;v_result uuid;
BEGIN
  SELECT invoice.property_id INTO v_property_id
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id=p_organization_id AND invoice.id=p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,'finance.record_payments'
  );
  BEGIN
    v_result:=public.record_tenant_invoice_payment_branch106(
      p_organization_id,p_invoice_id,p_amount,p_received_date,
      p_reconciliation_source_id,p_reference,p_allocations,p_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,'finance.record_payments',false
    );
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,'finance.record_payments',false
  );
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.reverse_tenant_invoice_payment(
  p_organization_id uuid,p_payment_id uuid,p_reversal_date date,
  p_reason text,p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_property_id uuid;v_result uuid;
BEGIN
  SELECT invoice.property_id INTO v_property_id
  FROM public.tenant_invoice_payments AS payment
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id=payment.organization_id
   AND invoice.id=payment.invoice_id
  WHERE payment.organization_id=p_organization_id AND payment.id=p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,'finance.correct_records'
  );
  BEGIN
    v_result:=public.reverse_tenant_invoice_payment_branch106(
      p_organization_id,p_payment_id,p_reversal_date,p_reason,p_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,'finance.correct_records',false
    );
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,'finance.correct_records',false
  );
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.confirm_owner_collected_rent(
  p_organization_id uuid,p_invoice_id uuid,p_amount numeric,
  p_confirmed_date date,p_reference text,p_allocations jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_property_id uuid;v_result uuid;
BEGIN
  SELECT invoice.property_id INTO v_property_id
  FROM public.tenant_invoices AS invoice
  WHERE invoice.organization_id=p_organization_id AND invoice.id=p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,'finance.record_payments'
  );
  BEGIN
    v_result:=public.confirm_owner_collected_rent_branch106(
      p_organization_id,p_invoice_id,p_amount,p_confirmed_date,p_reference,
      p_allocations,p_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,'finance.record_payments',false
    );
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,'finance.record_payments',false
  );
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.reverse_owner_collection_confirmation(
  p_organization_id uuid,p_confirmation_id uuid,p_reversal_date date,
  p_reason text,p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_property_id uuid;v_result uuid;
BEGIN
  SELECT invoice.property_id INTO v_property_id
  FROM public.owner_collection_confirmations AS confirmation
  JOIN public.tenant_invoices AS invoice
    ON invoice.organization_id=confirmation.organization_id
   AND invoice.id=confirmation.invoice_id
  WHERE confirmation.organization_id=p_organization_id
    AND confirmation.id=p_confirmation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,'finance.correct_records'
  );
  BEGIN
    v_result:=public.reverse_owner_collection_confirmation_branch106(
      p_organization_id,p_confirmation_id,p_reversal_date,p_reason,p_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,'finance.correct_records',false
    );
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,'finance.correct_records',false
  );
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.allocate_owner_event(
  p_organization_id uuid,p_source_type text,p_source_line_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_property_id uuid;v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'owner_event_allocation_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT source.property_id INTO v_property_id
  FROM app_private.resolve_owner_event_source(
    p_organization_id,pg_catalog.btrim(p_source_type),p_source_line_id
  ) AS source;
  IF NOT FOUND OR v_property_id IS NULL THEN
    RAISE EXCEPTION 'owner_event_allocation_forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,'finance.record_payments'
  );
  BEGIN
    v_result:=public.allocate_owner_event_branch106(
      p_organization_id,p_source_type,p_source_line_id,p_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,'finance.record_payments',false
    );
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,'finance.record_payments',false
  );
  RETURN v_result;
END;
$$;

ALTER FUNCTION public.reverse_owner_invoice_payment(
  uuid,uuid,date,text,text
) RENAME TO reverse_owner_invoice_payment_branch106;

CREATE FUNCTION public.reverse_owner_invoice_payment(
  p_organization_id uuid,p_owner_payment_id uuid,p_reversal_date date,
  p_reason text,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_property_id uuid;v_result jsonb;
BEGIN
  SELECT payment.property_id INTO v_property_id
  FROM public.owner_payments AS payment
  WHERE payment.organization_id=p_organization_id
    AND payment.id=p_owner_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner_payment_reversal_forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,'finance.correct_records'
  );
  BEGIN
    v_result:=public.reverse_owner_invoice_payment_branch106(
      p_organization_id,p_owner_payment_id,p_reversal_date,p_reason,
      p_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,'finance.correct_records',false
    );
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,'finance.correct_records',false
  );
  RETURN v_result;
END;
$$;

ALTER FUNCTION public.reverse_property_withdrawal(
  uuid,uuid,date,text,text
) RENAME TO reverse_property_withdrawal_branch106;

CREATE FUNCTION public.reverse_property_withdrawal(
  p_organization_id uuid,p_withdrawal_id uuid,p_reversal_date date,
  p_reason text,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_property_id uuid;v_result jsonb;
BEGIN
  SELECT withdrawal.property_id INTO v_property_id
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id=p_organization_id
    AND withdrawal.id=p_withdrawal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner_distribution_reversal_forbidden' USING ERRCODE='42501';
  END IF;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,'finance.correct_records'
  );
  BEGIN
    v_result:=public.reverse_property_withdrawal_branch106(
      p_organization_id,p_withdrawal_id,p_reversal_date,p_reason,
      p_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,'finance.correct_records',false
    );
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,'finance.correct_records',false
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment(
  uuid,uuid,numeric,date,uuid,text,jsonb,text
) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.reverse_tenant_invoice_payment(
  uuid,uuid,date,text,text
) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent(
  uuid,uuid,numeric,date,text,jsonb,text
) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.reverse_owner_collection_confirmation(
  uuid,uuid,date,text,text
) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.allocate_owner_event(
  uuid,text,uuid,text
) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.reverse_owner_invoice_payment(
  uuid,uuid,date,text,text
) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.reverse_property_withdrawal(
  uuid,uuid,date,text,text
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.record_tenant_invoice_payment(
  uuid,uuid,numeric,date,uuid,text,jsonb,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_tenant_invoice_payment(
  uuid,uuid,date,text,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_owner_collected_rent(
  uuid,uuid,numeric,date,text,jsonb,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_owner_collection_confirmation(
  uuid,uuid,date,text,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_owner_event(
  uuid,text,uuid,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_owner_invoice_payment(
  uuid,uuid,date,text,text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_property_withdrawal(
  uuid,uuid,date,text,text
) TO authenticated;

REVOKE ALL ON FUNCTION public.record_tenant_invoice_payment_branch106(
  uuid,uuid,numeric,date,uuid,text,jsonb,text
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reverse_tenant_invoice_payment_branch106(
  uuid,uuid,date,text,text
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.confirm_owner_collected_rent_branch106(
  uuid,uuid,numeric,date,text,jsonb,text
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reverse_owner_collection_confirmation_branch106(
  uuid,uuid,date,text,text
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.allocate_owner_event_branch106(
  uuid,text,uuid,text
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reverse_owner_invoice_payment_branch106(
  uuid,uuid,date,text,text
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reverse_property_withdrawal_branch106(
  uuid,uuid,date,text,text
) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.legacy_role_has_permission(
  p_role text,
  p_permission_key public.organization_permission_key
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path=''
AS $$
  SELECT CASE p_role
    WHEN 'finance_manager' THEN p_permission_key=ANY(ARRAY[
      'leases.view','leases.prepare','leases.activate','leases.change_terms',
      'leases.close','leases.archive','finance.view','finance.record_payments',
      'finance.approve_expenses','finance.correct_records',
      'finance.close_periods','finance.publish'
    ]::public.organization_permission_key[])
    WHEN 'finance_member' THEN p_permission_key=ANY(ARRAY[
      'leases.view','finance.view','finance.submit_expenses'
    ]::public.organization_permission_key[])
    WHEN 'operations_manager' THEN p_permission_key=ANY(ARRAY[
      'maintenance.view','maintenance.create_assign',
      'maintenance.complete','maintenance.review'
    ]::public.organization_permission_key[])
    WHEN 'operations_member' THEN p_permission_key=ANY(ARRAY[
      'maintenance.view','maintenance.complete'
    ]::public.organization_permission_key[])
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION app_private.has_org_permission(
  p_organization_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT
    app_private.is_super_admin(p_organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.organization_authorization_states AS authorization_state
        ON authorization_state.organization_id=member.organization_id
       AND authorization_state.ordinary_access_enabled
      JOIN public.organization_branches AS branch
        ON branch.organization_id=member.organization_id
       AND branch.id=member.branch_id
       AND branch.status='active'
       AND branch.archived_at IS NULL
      JOIN public.organization_roles AS role_record
        ON role_record.organization_id=member.organization_id
       AND role_record.id=member.custom_role_id
       AND role_record.status='active'
       AND role_record.archived_at IS NULL
      JOIN public.organization_role_permissions AS permission_record
        ON permission_record.organization_id=role_record.organization_id
       AND permission_record.role_id=role_record.id
       AND permission_record.permission_key=p_permission_key
      WHERE member.organization_id=p_organization_id
        AND member.user_id=(SELECT auth.uid())
        AND member.role='custom'
        AND member.branch_id IS NOT NULL
        AND member.custom_role_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.organization_authorization_states AS authorization_state
        ON authorization_state.organization_id=member.organization_id
       AND NOT authorization_state.ordinary_access_enabled
      WHERE member.organization_id=p_organization_id
        AND member.user_id=(SELECT auth.uid())
        AND member.role IN (
          'finance_manager','finance_member',
          'operations_manager','operations_member'
        )
        AND app_private.legacy_role_has_permission(
          member.role,p_permission_key
        )
    );
$$;

CREATE OR REPLACE FUNCTION app_private.can_access_property(
  p_organization_id uuid,
  p_property_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT coalesce(
    app_private.is_super_admin(p_organization_id)
    OR (
      p_property_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.properties AS property
        WHERE property.organization_id=p_organization_id
          AND property.id=p_property_id
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.organization_authorization_states AS authorization_state
          WHERE authorization_state.organization_id=p_organization_id
            AND NOT authorization_state.ordinary_access_enabled
        )
        OR app_private.current_active_branch_id(p_organization_id)
          =app_private.property_branch_id(p_organization_id,p_property_id)
      )
      AND app_private.has_org_permission(
        p_organization_id,p_permission_key
      )
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION app_private.lock_open_property_financial_month(
  p_organization_id uuid,
  p_property_id uuid,
  p_currency public.currency_code,
  p_effective_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_branch_id uuid;
  v_ordinary_access_enabled boolean;
BEGIN
  SELECT property.branch_id
  INTO v_branch_id
  FROM public.properties AS property
  WHERE property.organization_id=p_organization_id
    AND property.id=p_property_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property financial scope is unresolved'
      USING ERRCODE='23503';
  END IF;

  SELECT authorization_state.ordinary_access_enabled
  INTO v_ordinary_access_enabled
  FROM public.organization_authorization_states AS authorization_state
  WHERE authorization_state.organization_id=p_organization_id;

  IF v_branch_id IS NULL AND coalesce(v_ordinary_access_enabled,false) THEN
    RAISE EXCEPTION 'Property financial scope is unresolved'
      USING ERRCODE='23503';
  END IF;

  PERFORM app_private.lock_open_financial_month(
    p_organization_id,v_branch_id,p_effective_date
  );
  PERFORM app_private.lock_property_financial_month(
    p_organization_id,p_property_id,p_currency,p_effective_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION app_private.assert_person_in_property_branch(
  p_organization_id uuid,
  p_property_id uuid,
  p_person_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_branch_id uuid;
  v_ordinary_access_enabled boolean;
BEGIN
  IF p_person_id IS NULL THEN RETURN; END IF;

  SELECT property.branch_id
  INTO v_branch_id
  FROM public.properties AS property
  WHERE property.organization_id=p_organization_id
    AND property.id=p_property_id;

  SELECT authorization_state.ordinary_access_enabled
  INTO v_ordinary_access_enabled
  FROM public.organization_authorization_states AS authorization_state
  WHERE authorization_state.organization_id=p_organization_id;

  IF app_private.is_super_admin(p_organization_id)
    OR (
      NOT coalesce(v_ordinary_access_enabled,false)
      AND EXISTS (
        SELECT 1 FROM public.people AS person
        WHERE person.organization_id=p_organization_id
          AND person.id=p_person_id
      )
    )
    OR (
      v_branch_id IS NOT NULL
      AND app_private.current_active_branch_id(p_organization_id)=v_branch_id
      AND EXISTS (
        SELECT 1
        FROM public.person_branch_relationships AS relationship
        WHERE relationship.organization_id=p_organization_id
          AND relationship.person_id=p_person_id
          AND relationship.branch_id=v_branch_id
          AND relationship.archived_at IS NULL
      )
    ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
END;
$$;

REVOKE ALL ON FUNCTION app_private.legacy_role_has_permission(
  text,public.organization_permission_key
) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_maintenance_vendor_options(
  p_organization_id uuid
)
RETURNS TABLE(id uuid,label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_is_super_admin boolean:=app_private.is_super_admin(p_organization_id);
  v_ordinary_access_enabled boolean:=coalesce((
    SELECT state.ordinary_access_enabled
    FROM public.organization_authorization_states AS state
    WHERE state.organization_id=p_organization_id
  ),false);
  v_actor_role text:=app_private.current_workspace_role(p_organization_id);
  v_actor_branch_id uuid;
BEGIN
  v_actor_branch_id:=CASE
    WHEN v_ordinary_access_enabled
      THEN app_private.current_active_branch_id(p_organization_id)
    ELSE app_private.current_org_branch_id(p_organization_id)
  END;

  IF NOT v_is_super_admin AND NOT (
    (v_ordinary_access_enabled
      AND v_actor_branch_id IS NOT NULL
      AND app_private.has_org_permission(
        p_organization_id,
        'maintenance.create_assign'
      ))
    OR (NOT v_ordinary_access_enabled
      AND v_actor_role='operations_manager'
      AND v_actor_branch_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT person.id,person.display_name
  FROM public.people AS person
  JOIN public.person_roles AS person_role
    ON person_role.organization_id=person.organization_id
   AND person_role.person_id=person.id
   AND person_role.role='vendor'
   AND person_role.status='active'
   AND person_role.archived_at IS NULL
  WHERE person.organization_id=p_organization_id
    AND person.archived_at IS NULL
    AND (
      v_is_super_admin
      OR NOT v_ordinary_access_enabled
      OR EXISTS (
        SELECT 1
        FROM public.person_branch_relationships AS relationship
        WHERE relationship.organization_id=person.organization_id
          AND relationship.person_id=person.id
          AND relationship.branch_id=v_actor_branch_id
          AND relationship.archived_at IS NULL
      )
    )
  ORDER BY lower(person.display_name),person.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_maintenance_execution_members(
  p_organization_id uuid
)
RETURNS TABLE(person_id uuid,branch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_is_super_admin boolean:=app_private.is_super_admin(p_organization_id);
  v_ordinary_access_enabled boolean:=coalesce((
    SELECT state.ordinary_access_enabled
    FROM public.organization_authorization_states AS state
    WHERE state.organization_id=p_organization_id
  ),false);
  v_actor_role text:=app_private.current_workspace_role(p_organization_id);
  v_actor_branch_id uuid;
BEGIN
  v_actor_branch_id:=CASE
    WHEN v_ordinary_access_enabled
      THEN app_private.current_active_branch_id(p_organization_id)
    ELSE app_private.current_org_branch_id(p_organization_id)
  END;

  IF NOT v_is_super_admin AND NOT (
    (v_ordinary_access_enabled
      AND v_actor_branch_id IS NOT NULL
      AND app_private.has_org_permission(
        p_organization_id,
        'maintenance.create_assign'
      ))
    OR (NOT v_ordinary_access_enabled
      AND v_actor_role='operations_manager'
      AND v_actor_branch_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT membership.person_id,membership.branch_id
  FROM public.organization_members AS membership
  WHERE membership.organization_id=p_organization_id
    AND membership.person_id IS NOT NULL
    AND (
      (v_ordinary_access_enabled
        AND membership.role='custom'
        AND EXISTS (
          SELECT 1
          FROM public.organization_roles AS role_record
          JOIN public.organization_role_permissions AS permission_record
            ON permission_record.organization_id=role_record.organization_id
           AND permission_record.role_id=role_record.id
           AND permission_record.permission_key='maintenance.complete'
          WHERE role_record.organization_id=membership.organization_id
            AND role_record.id=membership.custom_role_id
            AND role_record.status='active'
            AND role_record.archived_at IS NULL
        ))
      OR (NOT v_ordinary_access_enabled
        AND membership.role='operations_member')
    )
    AND (v_is_super_admin OR membership.branch_id=v_actor_branch_id)
  ORDER BY membership.branch_id NULLS FIRST,membership.person_id;
END;
$$;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'app_private.assign_maintenance_task_internal(uuid,uuid,uuid,uuid)'::regprocedure;
  v_definition text := pg_catalog.replace(
    pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n'
  );
  v_authority_anchor text := E'  SELECT membership.role, membership.branch_id\n  INTO actor_role, actor_branch_id\n  FROM public.organization_members AS membership\n  WHERE membership.organization_id = p_organization_id\n    AND membership.user_id = actor_id\n  LIMIT 1;\n\n  IF actor_role NOT IN (''super_admin'', ''operations_manager'') OR actor_role IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF actor_role = ''operations_manager'' AND actor_branch_id IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
  v_authority_replacement text := E'  actor_branch_id := app_private.current_active_branch_id(p_organization_id);\n\n  IF NOT app_private.is_super_admin(p_organization_id)\n    AND NOT app_private.has_org_permission(\n      p_organization_id,''maintenance.create_assign''\n    ) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF NOT app_private.is_super_admin(p_organization_id) AND actor_branch_id IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
  v_branch_anchor text := E'  IF actor_role = ''operations_manager''\n    AND actor_branch_id IS NOT NULL\n    AND (\n      old_task.branch_id IS DISTINCT FROM actor_branch_id\n      OR p_branch_id IS DISTINCT FROM actor_branch_id\n    ) THEN';
  v_branch_replacement text := E'  IF NOT app_private.is_super_admin(p_organization_id)\n    AND actor_branch_id IS NOT NULL\n    AND (\n      old_task.branch_id IS DISTINCT FROM actor_branch_id\n      OR p_branch_id IS DISTINCT FROM actor_branch_id\n    ) THEN';
  v_assignee_anchor text := E'  IF p_assignee_person_id IS NOT NULL AND EXISTS (\n    SELECT 1\n    FROM public.organization_members AS assignee_membership\n    WHERE assignee_membership.organization_id = p_organization_id\n      AND assignee_membership.person_id = p_assignee_person_id\n      AND assignee_membership.role = ''operations_member''\n      AND assignee_membership.branch_id IS DISTINCT FROM p_branch_id\n  ) THEN\n    RAISE EXCEPTION ''Assignee branch does not match the task branch''\n      USING ERRCODE = ''22023'';\n  END IF;';
  v_assignee_replacement text := E'  IF p_assignee_person_id IS NOT NULL\n    AND NOT app_private.is_executable_maintenance_assignee(\n      p_organization_id,p_branch_id,p_assignee_person_id\n    ) THEN\n    RAISE EXCEPTION ''Assignee must be an executable linked member for the selected branch''\n      USING ERRCODE = ''23503'';\n  END IF;';
BEGIN
  IF pg_catalog.strpos(v_definition,v_authority_anchor)=0
    OR pg_catalog.strpos(v_definition,v_branch_anchor)=0
    OR pg_catalog.strpos(v_definition,v_assignee_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected maintenance assignment predecessor: %',v_signature;
  END IF;
  v_definition:=pg_catalog.replace(v_definition,v_authority_anchor,v_authority_replacement);
  v_definition:=pg_catalog.replace(v_definition,v_branch_anchor,v_branch_replacement);
  v_definition:=pg_catalog.replace(v_definition,v_assignee_anchor,v_assignee_replacement);
  EXECUTE v_definition;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.assign_maintenance_task(
  p_organization_id uuid,
  p_task_id uuid,
  p_branch_id uuid,
  p_assignee_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_actor_branch_id uuid:=app_private.current_active_branch_id(p_organization_id);
BEGIN
  IF NOT app_private.is_super_admin(p_organization_id)
    AND (
      v_actor_branch_id IS NULL
      OR NOT app_private.has_org_permission(
        p_organization_id,'maintenance.create_assign'
      )
      OR p_branch_id IS DISTINCT FROM v_actor_branch_id
    ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  IF p_assignee_person_id IS NOT NULL
    AND NOT app_private.is_executable_maintenance_assignee(
      p_organization_id,p_branch_id,p_assignee_person_id
    ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.people AS person
      JOIN public.person_roles AS person_role
        ON person_role.organization_id=person.organization_id
       AND person_role.person_id=person.id
       AND person_role.role='staff'
       AND person_role.status='active'
       AND person_role.archived_at IS NULL
      WHERE person.organization_id=p_organization_id
        AND person.id=p_assignee_person_id
        AND person.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Assignee not found' USING ERRCODE='23503';
    END IF;
    RAISE EXCEPTION 'Assignee must be an executable linked member for the selected branch'
      USING ERRCODE='23503';
  END IF;

  RETURN app_private.assign_maintenance_task_internal(
    p_organization_id,p_task_id,p_branch_id,p_assignee_person_id
  );
END;
$$;

CREATE FUNCTION app_private.assert_document_branch_permission(
  p_organization_id uuid,
  p_document_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE v_actor_id uuid:=(SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
  IF NOT app_private.can_access_document(p_organization_id,p_document_id,p_permission_key) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  RETURN v_actor_id;
END;
$$;

CREATE FUNCTION app_private.assert_new_document_branch_permission(
  p_organization_id uuid,
  p_property_id uuid,p_unit_id uuid,p_lease_id uuid,p_timeline_event_id uuid,
  p_ledger_entry_id uuid,p_task_id uuid,p_tenant_request_id uuid,
  p_storage_path text
)
RETURNS public.organization_permission_key
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_branch_id uuid;
  v_permission_key public.organization_permission_key;
BEGIN
  v_branch_id:=app_private.resolve_document_branch_id(
    p_organization_id,p_property_id,p_unit_id,p_lease_id,p_timeline_event_id,
    p_ledger_entry_id,p_task_id,p_tenant_request_id
  );
  v_permission_key:=app_private.document_required_permission(
    p_organization_id,p_property_id,p_unit_id,p_lease_id,p_timeline_event_id,
    p_ledger_entry_id,p_task_id,p_tenant_request_id,'write'
  );
  IF v_branch_id IS NOT NULL
    AND app_private.storage_object_branch_id(p_storage_path) IS DISTINCT FROM v_branch_id THEN
    RAISE EXCEPTION 'Document branch scope is unresolved or conflicts with its Storage path'
      USING ERRCODE='42501';
  END IF;
  IF app_private.is_super_admin(p_organization_id) THEN RETURN v_permission_key; END IF;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Document branch scope is unresolved or conflicts with its Storage path'
      USING ERRCODE='42501';
  END IF;
  PERFORM app_private.assert_branch_permission(p_organization_id,v_branch_id,v_permission_key);
  RETURN v_permission_key;
END;
$$;

ALTER FUNCTION public.create_document(uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,jsonb)
  RENAME TO create_document_baseline_branch106;
ALTER FUNCTION public.create_document_baseline_branch106(uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,jsonb)
  SET SCHEMA app_private;
ALTER FUNCTION public.replace_document(uuid,uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid)
  RENAME TO replace_document_baseline_branch106;
ALTER FUNCTION public.replace_document_baseline_branch106(uuid,uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid)
  SET SCHEMA app_private;
ALTER FUNCTION public.update_document(uuid,uuid,text,uuid,uuid,uuid,uuid)
  RENAME TO update_document_baseline_branch106;
ALTER FUNCTION public.update_document_baseline_branch106(uuid,uuid,text,uuid,uuid,uuid,uuid)
  SET SCHEMA app_private;
ALTER FUNCTION public.archive_document(uuid,uuid) RENAME TO archive_document_baseline_branch106;
ALTER FUNCTION public.archive_document_baseline_branch106(uuid,uuid) SET SCHEMA app_private;
ALTER FUNCTION public.restore_document(uuid,uuid) RENAME TO restore_document_baseline_branch106;
ALTER FUNCTION public.restore_document_baseline_branch106(uuid,uuid) SET SCHEMA app_private;

DO $migration$
DECLARE v_signature regprocedure;v_definition text;
  v_anchor text:=E'  IF NOT app_private.is_org_admin(p_organization_id) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'app_private.create_document_baseline_branch106(uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,jsonb)'::regprocedure,
    'app_private.replace_document_baseline_branch106(uuid,uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid)'::regprocedure,
    'app_private.update_document_baseline_branch106(uuid,uuid,text,uuid,uuid,uuid,uuid)'::regprocedure,
    'app_private.archive_document_baseline_branch106(uuid,uuid)'::regprocedure,
    'app_private.restore_document_baseline_branch106(uuid,uuid)'::regprocedure
  ] LOOP
    SELECT pg_catalog.replace(pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n') INTO v_definition;
    IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'Unexpected Document predecessor: %',v_signature; END IF;
    EXECUTE pg_catalog.replace(v_definition,v_anchor,'  NULL; -- authorization is owned by the checked public wrapper');
  END LOOP;
END;
$migration$;

CREATE FUNCTION public.create_document(
  p_organization_id uuid,p_category text,p_file_name text,p_storage_path text,p_mime_type text,
  p_size_bytes bigint,p_content_sha256 text,p_property_id uuid,p_unit_id uuid DEFAULT NULL,
  p_lease_id uuid DEFAULT NULL,p_timeline_event_id uuid DEFAULT NULL,p_ledger_entry_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,p_tenant_request_id uuid DEFAULT NULL,p_activity_entity_type text DEFAULT 'document',
  p_activity_entity_id uuid DEFAULT NULL,p_activity_action text DEFAULT 'created',p_activity_new_values jsonb DEFAULT '{}'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  PERFORM app_private.assert_new_document_branch_permission(
    p_organization_id,p_property_id,p_unit_id,p_lease_id,p_timeline_event_id,p_ledger_entry_id,
    p_task_id,p_tenant_request_id,p_storage_path
  );
  RETURN app_private.create_document_baseline_branch106(
    p_organization_id,p_category,p_file_name,p_storage_path,p_mime_type,p_size_bytes,p_content_sha256,
    p_property_id,p_unit_id,p_lease_id,p_timeline_event_id,p_ledger_entry_id,p_task_id,p_tenant_request_id,
    p_activity_entity_type,p_activity_entity_id,p_activity_action,p_activity_new_values
  );
END; $$;

CREATE FUNCTION public.update_document(
  p_document_id uuid,p_organization_id uuid,p_category text,p_property_id uuid,
  p_unit_id uuid DEFAULT NULL,p_lease_id uuid DEFAULT NULL,p_task_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_document public.documents%ROWTYPE;v_key public.organization_permission_key;
BEGIN
  SELECT * INTO v_document FROM public.documents WHERE organization_id=p_organization_id AND id=p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_key:=app_private.document_required_permission(
    p_organization_id,v_document.property_id,v_document.unit_id,v_document.lease_id,
    v_document.timeline_event_id,v_document.ledger_entry_id,v_document.task_id,
    v_document.tenant_request_id,'write'
  );
  PERFORM app_private.assert_document_branch_permission(p_organization_id,p_document_id,v_key);
  PERFORM app_private.assert_new_document_branch_permission(
    p_organization_id,p_property_id,p_unit_id,p_lease_id,v_document.timeline_event_id,
    v_document.ledger_entry_id,p_task_id,v_document.tenant_request_id,v_document.storage_path
  );
  RETURN app_private.update_document_baseline_branch106(
    p_document_id,p_organization_id,p_category,p_property_id,p_unit_id,p_lease_id,p_task_id
  );
END; $$;

CREATE FUNCTION public.replace_document(
  p_document_id uuid,p_organization_id uuid,p_category text,p_file_name text,p_storage_path text,
  p_mime_type text,p_size_bytes bigint,p_content_sha256 text,p_property_id uuid,p_unit_id uuid DEFAULT NULL,
  p_lease_id uuid DEFAULT NULL,p_task_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_document public.documents%ROWTYPE;v_key public.organization_permission_key;
BEGIN
  SELECT * INTO v_document FROM public.documents WHERE organization_id=p_organization_id AND id=p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_key:=app_private.document_required_permission(
    p_organization_id,v_document.property_id,v_document.unit_id,v_document.lease_id,
    v_document.timeline_event_id,v_document.ledger_entry_id,v_document.task_id,
    v_document.tenant_request_id,'write'
  );
  PERFORM app_private.assert_document_branch_permission(p_organization_id,p_document_id,v_key);
  PERFORM app_private.assert_new_document_branch_permission(
    p_organization_id,p_property_id,p_unit_id,p_lease_id,v_document.timeline_event_id,
    v_document.ledger_entry_id,p_task_id,v_document.tenant_request_id,p_storage_path
  );
  RETURN app_private.replace_document_baseline_branch106(
    p_document_id,p_organization_id,p_category,p_file_name,p_storage_path,p_mime_type,p_size_bytes,
    p_content_sha256,p_property_id,p_unit_id,p_lease_id,p_task_id
  );
END; $$;

CREATE FUNCTION public.archive_document(p_document_id uuid,p_organization_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_document public.documents%ROWTYPE;v_key public.organization_permission_key; BEGIN
  SELECT * INTO v_document FROM public.documents WHERE organization_id=p_organization_id AND id=p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_key:=app_private.document_required_permission(
    p_organization_id,v_document.property_id,v_document.unit_id,v_document.lease_id,
    v_document.timeline_event_id,v_document.ledger_entry_id,v_document.task_id,
    v_document.tenant_request_id,'archive'
  );
  PERFORM app_private.assert_document_branch_permission(p_organization_id,p_document_id,v_key);
  RETURN app_private.archive_document_baseline_branch106(p_document_id,p_organization_id);
END; $$;
CREATE FUNCTION public.restore_document(p_document_id uuid,p_organization_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_document public.documents%ROWTYPE;v_key public.organization_permission_key; BEGIN
  SELECT * INTO v_document FROM public.documents WHERE organization_id=p_organization_id AND id=p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_key:=app_private.document_required_permission(
    p_organization_id,v_document.property_id,v_document.unit_id,v_document.lease_id,
    v_document.timeline_event_id,v_document.ledger_entry_id,v_document.task_id,
    v_document.tenant_request_id,'archive'
  );
  PERFORM app_private.assert_document_branch_permission(p_organization_id,p_document_id,v_key);
  RETURN app_private.restore_document_baseline_branch106(p_document_id,p_organization_id);
END; $$;

DO $migration$
DECLARE v_definition text;v_signature constant regprocedure:='public.fingerprint_document_content(uuid,uuid,text)'::regprocedure;
BEGIN
  SELECT pg_catalog.replace(pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n') INTO v_definition;
  IF pg_catalog.strpos(v_definition,'app_private.is_org_admin(p_organization_id)')=0 THEN
    RAISE EXCEPTION 'Unexpected fingerprint predecessor';
  END IF;
  EXECUTE pg_catalog.replace(v_definition,'app_private.is_org_admin(p_organization_id)','app_private.is_super_admin(p_organization_id)');
END;
$migration$;

REVOKE ALL ON FUNCTION app_private.assert_document_branch_permission(uuid,uuid,public.organization_permission_key) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.assert_new_document_branch_permission(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.document_required_permission(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.create_document_baseline_branch106(uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.replace_document_baseline_branch106(uuid,uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.update_document_baseline_branch106(uuid,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.archive_document_baseline_branch106(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.restore_document_baseline_branch106(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.create_document(uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_document(uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,uuid,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.replace_document(uuid,uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.replace_document(uuid,uuid,text,text,text,text,bigint,text,uuid,uuid,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.update_document(uuid,uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_document(uuid,uuid,text,uuid,uuid,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.archive_document(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.archive_document(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.restore_document(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.restore_document(uuid,uuid) TO authenticated;

CREATE TABLE app_private.maintenance_branch_authority_capability(
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  capability_token text NOT NULL CHECK(capability_token~'^[0-9a-f]{64}$')
);
INSERT INTO app_private.maintenance_branch_authority_capability(singleton,capability_token)
VALUES(true,encode(extensions.digest(gen_random_uuid()::text||clock_timestamp()::text,'sha256'),'hex'));
REVOKE ALL ON TABLE app_private.maintenance_branch_authority_capability FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.set_maintenance_branch_authority_context(
  p_organization_id uuid,p_branch_id uuid,p_permission_key public.organization_permission_key,p_enabled boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_token text; BEGIN
  IF p_enabled THEN
    SELECT capability_token INTO STRICT v_token FROM app_private.maintenance_branch_authority_capability WHERE singleton;
    PERFORM set_config('app.maintenance_branch_authority_token',v_token,true);
    PERFORM set_config('app.maintenance_branch_authority_org',p_organization_id::text,true);
    PERFORM set_config('app.maintenance_branch_authority_branch',p_branch_id::text,true);
    PERFORM set_config('app.maintenance_branch_authority_permission',p_permission_key::text,true);
  ELSE
    PERFORM set_config('app.maintenance_branch_authority_token','',true);
    PERFORM set_config('app.maintenance_branch_authority_org','',true);
    PERFORM set_config('app.maintenance_branch_authority_branch','',true);
    PERFORM set_config('app.maintenance_branch_authority_permission','',true);
  END IF;
END; $$;
CREATE FUNCTION app_private.has_maintenance_branch_authority_context(p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(
  SELECT 1 FROM app_private.maintenance_branch_authority_capability AS capability
  WHERE capability.singleton
    AND capability.capability_token=current_setting('app.maintenance_branch_authority_token',true)
    AND p_organization_id::text=current_setting('app.maintenance_branch_authority_org',true)
    AND current_setting('app.maintenance_branch_authority_permission',true) IN(
      'maintenance.create_assign','maintenance.complete','maintenance.review')
    AND app_private.current_active_branch_id(p_organization_id)::text
      =current_setting('app.maintenance_branch_authority_branch',true)
); $$;
CREATE OR REPLACE FUNCTION app_private.can_manage_operations(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_maintenance_branch_authority_context(target_organization_id); $$;

CREATE OR REPLACE FUNCTION app_private.has_maintenance_member_identity(
  p_organization_id uuid,p_branch_id uuid,p_person_id uuid
) RETURNS boolean LANGUAGE sql STABLE SET search_path=''
AS $$
  SELECT p_person_id IS NOT NULL AND EXISTS(
    SELECT 1
    FROM public.organization_members AS member
    JOIN public.organization_authorization_states AS authorization_state
      ON authorization_state.organization_id=member.organization_id
    LEFT JOIN public.organization_roles AS role_record
      ON role_record.organization_id=member.organization_id
     AND role_record.id=member.custom_role_id
     AND role_record.status='active'
     AND role_record.archived_at IS NULL
    WHERE member.organization_id=p_organization_id
      AND member.person_id=p_person_id
      AND member.branch_id IS NOT DISTINCT FROM p_branch_id
      AND (
        (NOT authorization_state.ordinary_access_enabled
          AND member.role='operations_member')
        OR
        (authorization_state.ordinary_access_enabled
          AND member.role='custom'
          AND EXISTS(
            SELECT 1
            FROM public.organization_role_permissions AS permission_record
            WHERE permission_record.organization_id=member.organization_id
              AND permission_record.role_id=role_record.id
              AND permission_record.permission_key='maintenance.complete'
          ))
      )
  );
$$;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'app_private.create_maintenance_task_baseline_track10(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_anchor text := E'DECLARE\n  actor_role text := app_private.current_workspace_role(p_organization_id);\n  actor_branch_id uuid := app_private.current_org_branch_id(p_organization_id);\nBEGIN\n  IF actor_role NOT IN (''super_admin'', ''operations_manager'') OR actor_role IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF actor_role = ''operations_manager''\n    AND actor_branch_id IS NOT NULL\n    AND p_branch_id IS DISTINCT FROM actor_branch_id THEN\n    RAISE EXCEPTION ''Manager can only manage tasks in their branch''\n      USING ERRCODE = ''42501'';\n  END IF;';
  v_replacement text := E'DECLARE\n  actor_branch_id uuid := app_private.current_active_branch_id(p_organization_id);\nBEGIN\n  IF NOT app_private.is_super_admin(p_organization_id)\n    AND NOT app_private.has_maintenance_branch_authority_context(p_organization_id) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF NOT app_private.is_super_admin(p_organization_id)\n    AND actor_branch_id IS NOT NULL\n    AND p_branch_id IS DISTINCT FROM actor_branch_id THEN\n    RAISE EXCEPTION ''Manager can only manage tasks in their branch''\n      USING ERRCODE = ''42501'';\n  END IF;';
BEGIN
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected maintenance creation predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);

END;
$migration$;

CREATE OR REPLACE FUNCTION public.get_owner_close_readiness(
  p_organization_id uuid,p_property_id uuid,p_owner_person_id uuid,
  p_currency public.currency_code,p_month_start date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT app_private.can_read_finance_property(
      p_organization_id,p_property_id
    ) THEN
    RAISE EXCEPTION 'owner_close_readiness_forbidden' USING ERRCODE='42501';
  END IF;
  RETURN app_private.build_owner_close_readiness(
    p_organization_id,p_property_id,p_owner_person_id,p_currency,p_month_start
  );
END;
$$;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_anchor text;
  v_replacement text;
BEGIN
  v_signature :=
    'public.get_owner_close_history(uuid,uuid,uuid,public.currency_code,date)'::regprocedure;
  v_definition := pg_catalog.replace(
    pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n'
  );
  v_anchor := E'    OR NOT app_private.can_inspect_owner_close_readiness(p_organization_id) THEN';
  v_replacement := E'    OR NOT app_private.can_read_finance_property(\n      p_organization_id,p_property_id\n    ) THEN';
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected owner close history predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);

  v_signature :=
    'public.close_owner_month(uuid,uuid,uuid,public.currency_code,date,text,text)'::regprocedure;
  v_definition := pg_catalog.replace(
    pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n'
  );
  v_anchor := E'    OR NOT app_private.can_close_owner_month(p_organization_id) THEN';
  v_replacement := E'    OR NOT app_private.can_access_property(\n      p_organization_id,p_property_id,''finance.close_periods''\n    ) THEN';
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected owner close predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
END;
$migration$;

CREATE OR REPLACE FUNCTION public.get_maintenance_notification_feed(
  p_organization_id uuid,p_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,event_type text,title text,scheduled_for timestamptz,
  status text,href text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_super_admin boolean:=app_private.is_super_admin(p_organization_id);
  v_branch_id uuid:=app_private.current_active_branch_id(p_organization_id);
  v_person_id uuid:=app_private.current_org_person_id(p_organization_id);
  v_can_manage boolean:=app_private.has_org_permission(
    p_organization_id,'maintenance.create_assign'
  ) OR app_private.has_org_permission(p_organization_id,'maintenance.review');
  v_can_execute boolean:=app_private.has_org_permission(
    p_organization_id,'maintenance.complete'
  );
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT (v_super_admin OR v_can_manage OR v_can_execute) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid notification limit' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  SELECT outbox.id,outbox.event_type,outbox.payload->>'title',
    outbox.scheduled_for,outbox.status,outbox.payload->>'href'
  FROM public.notification_outbox AS outbox
  WHERE outbox.organization_id=p_organization_id
    AND outbox.status='delivered'
    AND (
      v_super_admin
      OR (v_can_manage AND outbox.branch_id=v_branch_id)
      OR (
        NOT v_can_manage AND v_can_execute AND v_person_id IS NOT NULL
        AND outbox.recipient_person_id=v_person_id
        AND (outbox.branch_id IS NULL OR outbox.branch_id=v_branch_id)
      )
    )
  ORDER BY outbox.scheduled_for DESC,outbox.id DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_maintenance_task_documents(
  p_organization_id uuid,p_task_ids uuid[]
)
RETURNS TABLE(
  id uuid,task_id uuid,category text,file_name text,storage_path text,
  mime_type text,size_bytes bigint,uploaded_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT (
    app_private.is_super_admin(p_organization_id)
    OR app_private.has_org_permission(p_organization_id,'maintenance.view')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF coalesce(cardinality(p_task_ids),0)=0 THEN RETURN; END IF;
  IF cardinality(p_task_ids)>1000 THEN
    RAISE EXCEPTION 'Maintenance document query is limited to 1000 tasks'
      USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  SELECT document.id,document.task_id,document.category,document.file_name,
    document.storage_path,document.mime_type,document.size_bytes,document.uploaded_at
  FROM public.documents AS document
  WHERE document.organization_id=p_organization_id
    AND document.task_id=ANY(p_task_ids)
    AND document.archived_at IS NULL
    AND app_private.storage_object_org_id(document.storage_path)=document.organization_id
    AND EXISTS(
      SELECT 1 FROM storage.objects AS object
      WHERE object.bucket_id='nestory-documents' AND object.name=document.storage_path
    )
    AND app_private.can_read_maintenance_task(document.organization_id,document.task_id)
  ORDER BY document.uploaded_at DESC,document.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_maintenance_cost_statuses(
  p_organization_id uuid,p_task_ids uuid[]
)
RETURNS TABLE(
  task_id uuid,submission_id uuid,status text,review_reason text,
  submitted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT (
    app_private.is_super_admin(p_organization_id)
    OR app_private.has_org_permission(p_organization_id,'maintenance.review')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF coalesce(cardinality(p_task_ids),0)=0 THEN RETURN; END IF;
  IF cardinality(p_task_ids)>1000 THEN
    RAISE EXCEPTION 'Maintenance cost status query is limited to 1000 tasks'
      USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (submission.source_id)
    submission.source_id,submission.id,submission.status,
    submission.review_reason,submission.submitted_at
  FROM public.expense_submissions AS submission
  JOIN public.tasks AS task
    ON task.organization_id=submission.organization_id
   AND task.id=submission.source_id
  WHERE submission.organization_id=p_organization_id
    AND submission.source_type='maintenance_task'
    AND submission.source_id=ANY(p_task_ids)
    AND app_private.can_read_maintenance_task(task.organization_id,task.id)
  ORDER BY submission.source_id,submission.submitted_at DESC,submission.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_expense_submission_evidence(
  p_organization_id uuid,p_submission_ids uuid[]
)
RETURNS TABLE(
  submission_id uuid,document_id uuid,file_name text,storage_path text,
  mime_type text,size_bytes bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT (
    app_private.is_super_admin(p_organization_id)
    OR app_private.has_org_permission(p_organization_id,'finance.view')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF coalesce(cardinality(p_submission_ids),0)=0 THEN RETURN; END IF;
  IF cardinality(p_submission_ids)>500 THEN
    RAISE EXCEPTION 'Expense evidence query is limited to 500 submissions'
      USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  SELECT submission.id,document.id,document.file_name,document.storage_path,
    document.mime_type,document.size_bytes
  FROM public.expense_submissions AS submission
  JOIN public.documents AS document
    ON document.organization_id=submission.organization_id
   AND document.id=submission.supporting_document_id
  WHERE submission.organization_id=p_organization_id
    AND submission.id=ANY(p_submission_ids)
    AND app_private.can_read_finance_property(
      submission.organization_id,submission.property_id
    )
    AND document.archived_at IS NULL
    AND app_private.storage_object_org_id(document.storage_path)=document.organization_id
    AND EXISTS(
      SELECT 1 FROM storage.objects AS object
      WHERE object.bucket_id='nestory-documents' AND object.name=document.storage_path
    );
END;
$$;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_anchor text:='OR NOT app_private.can_read_finance(p_organization_id)';
  v_replacement text:=E'OR NOT app_private.can_read_finance_property(\n      p_organization_id,p_property_id\n    )';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_owner_event_allocation_queue(uuid,uuid,public.currency_code,date,date)'::regprocedure,
    'app_private.get_owner_event_allocation_queue_baseline(uuid,uuid,public.currency_code,date,date)'::regprocedure
  ] LOOP
    v_definition:=pg_catalog.pg_get_functiondef(v_signature);
    IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
      RAISE EXCEPTION 'Unexpected owner allocation queue predecessor: %',v_signature;
    END IF;
    EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.recover_rent_generation_exception(
  p_organization_id uuid,p_exception_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor_id uuid:=(SELECT auth.uid());
  v_exception public.rent_generation_exceptions%ROWTYPE;
  v_property_id uuid;
  v_business_date date;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  SELECT exception.*
  INTO v_exception
  FROM public.rent_generation_exceptions AS exception
  WHERE exception.organization_id=p_organization_id
    AND exception.id=p_exception_id
  FOR UPDATE OF exception;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rent generation exception not found' USING ERRCODE='23503';
  END IF;
  SELECT lease_record.property_id INTO v_property_id
  FROM public.leases AS lease_record
  WHERE lease_record.organization_id=p_organization_id
    AND lease_record.id=v_exception.lease_id;
  IF NOT app_private.can_access_property(
    p_organization_id,v_property_id,'finance.record_payments'
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  v_business_date:=app_private.rent_business_date(
    p_organization_id,pg_catalog.now()
  );
  IF NOT app_private.is_super_admin(p_organization_id)
    AND v_exception.billing_period_start<>
      pg_catalog.date_trunc('month',v_business_date)::date THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF NOT app_private.is_super_admin(p_organization_id)
    AND v_exception.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status','already_generated','invoiceId',v_exception.resolved_invoice_id,
      'exceptionId',v_exception.id
    );
  END IF;
  IF app_private.is_super_admin(p_organization_id) THEN
    RETURN app_private.try_generate_lease_rent_invoice(
      p_organization_id,v_exception.lease_id,v_exception.billing_period_start,
      v_business_date,'manual_recovery',v_actor_id
    );
  END IF;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,'finance.record_payments'
  );
  BEGIN
    v_result:=app_private.try_generate_current_rent_retry(
      p_organization_id,p_exception_id,v_actor_id
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,'finance.record_payments',false
    );
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,'finance.record_payments',false
  );
  RETURN v_result;
END;
$$;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'app_private.try_generate_current_rent_retry(uuid,uuid,uuid)'::regprocedure;
  v_definition text:=pg_catalog.pg_get_functiondef(v_signature);
  v_anchor text:='OR NOT app_private.can_retry_current_rent(p_organization_id)';
  v_replacement text:=E'OR NOT (\n      app_private.can_retry_current_rent(p_organization_id)\n      OR app_private.has_finance_branch_authority_context(\n        p_organization_id,''finance.record_payments''\n      )\n    )';
BEGIN
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected current-rent retry predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
END;
$migration$;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'app_private.is_checked_current_rent_retry_generation(uuid,uuid,date,date,text,uuid)'::regprocedure;
  v_definition text:=pg_catalog.pg_get_functiondef(v_signature);
  v_anchor text:='AND app_private.can_retry_current_rent(p_organization_id)';
  v_replacement text:=E'AND (\n      app_private.can_retry_current_rent(p_organization_id)\n      OR app_private.has_finance_branch_authority_context(\n        p_organization_id,''finance.record_payments''\n      )\n    )';
BEGIN
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected checked current-rent predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
END;
$migration$;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_anchor text;
  v_replacement text;
BEGIN
  v_anchor:='OR NOT app_private.can_operate_finance(p_organization_id)';
  v_replacement:=E'OR NOT app_private.can_access_property(\n      p_organization_id,p_property_id,''finance.record_payments''\n    )';
  FOREACH v_signature IN ARRAY ARRAY[
    'public.record_owner_cash_event(uuid,uuid,uuid,public.currency_code,text,date,numeric,text,text)'::regprocedure,
    'app_private.record_owner_cash_event_baseline(uuid,uuid,uuid,public.currency_code,text,date,numeric,text,text)'::regprocedure,
    'public.record_owner_distribution(uuid,uuid,uuid,public.currency_code,numeric,date,text,text)'::regprocedure,
    'app_private.record_owner_distribution_baseline(uuid,uuid,uuid,public.currency_code,numeric,date,text,text)'::regprocedure
  ] LOOP
    v_definition:=pg_catalog.pg_get_functiondef(v_signature);
    IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
      RAISE EXCEPTION 'Unexpected owner cash operation predecessor: %',v_signature;
    END IF;
    EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
  END LOOP;

  v_signature:=
    'app_private.get_owner_available_withdrawal_baseline(uuid,uuid,uuid,public.currency_code,date)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_signature);
  v_anchor:='OR NOT app_private.can_read_finance(p_organization_id)';
  v_replacement:=E'OR NOT app_private.can_read_finance_property(\n      p_organization_id,p_property_id\n    )';
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected owner withdrawal read predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);

  v_signature:=
    'public.get_owner_balance_ledger(uuid,uuid,uuid,public.currency_code,date,date)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_signature);
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected owner ledger read predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);

  v_signature:=
    'public.get_owner_balance_source_ledger(uuid,uuid,uuid,public.currency_code,date,date)'::regprocedure;
  v_definition:=pg_catalog.pg_get_functiondef(v_signature);
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected owner source-ledger read predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
END;
$migration$;

CREATE FUNCTION app_private.rent_generation_exception_property_id(
  p_organization_id uuid,p_exception_id uuid
)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT lease_record.property_id
  FROM public.rent_generation_exceptions AS exception
  JOIN public.leases AS lease_record
    ON lease_record.organization_id=exception.organization_id
   AND lease_record.id=exception.lease_id
  WHERE exception.organization_id=p_organization_id
    AND exception.id=p_exception_id
$$;

CREATE POLICY rent_generation_exceptions_branch_select
ON public.rent_generation_exceptions
FOR SELECT TO authenticated
USING (
  app_private.can_access_property(
    organization_id,
    app_private.rent_generation_exception_property_id(organization_id,id),
    'finance.record_payments'
  )
);

REVOKE ALL ON FUNCTION app_private.rent_generation_exception_property_id(
  uuid,uuid
) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.rent_generation_exception_property_id(
  uuid,uuid
) TO authenticated;

CREATE FUNCTION app_private.owner_cash_source_property_id(
  p_organization_id uuid,p_source_movement_id uuid,
  p_consumer_movement_id uuid,p_source_opening_entry_id uuid
)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT coalesce(
    (SELECT source_movement.property_id
     FROM public.owner_component_movements AS source_movement
     WHERE source_movement.organization_id=p_organization_id
       AND source_movement.id=p_source_movement_id),
    (SELECT consumer_movement.property_id
     FROM public.owner_component_movements AS consumer_movement
     WHERE consumer_movement.organization_id=p_organization_id
       AND consumer_movement.id=p_consumer_movement_id),
    (SELECT opening_entry.property_id
     FROM public.owner_opening_balance_entries AS opening_entry
     WHERE opening_entry.organization_id=p_organization_id
       AND opening_entry.id=p_source_opening_entry_id)
  )
$$;

REVOKE ALL ON FUNCTION app_private.owner_cash_source_property_id(uuid,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.owner_cash_source_property_id(uuid,uuid,uuid,uuid)
  TO authenticated;

CREATE FUNCTION app_private.owner_allocation_property_id(
  p_organization_id uuid,p_allocation_set_id uuid
)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT allocation_set.property_id
  FROM public.owner_event_allocation_sets AS allocation_set
  WHERE allocation_set.organization_id=p_organization_id
    AND allocation_set.id=p_allocation_set_id
$$;

REVOKE ALL ON FUNCTION app_private.owner_allocation_property_id(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.owner_allocation_property_id(uuid,uuid)
  TO authenticated;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_anchor text:='OR NOT app_private.can_operate_finance(p_organization_id)';
  v_replacement text:=E'OR NOT app_private.can_access_property(\n      p_organization_id,p_property_id,''finance.close_periods''\n    )';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.generate_owner_balance_period(uuid,uuid,uuid,public.currency_code,date,text)'::regprocedure,
    'app_private.generate_owner_balance_period(uuid,uuid,uuid,public.currency_code,date,text)'::regprocedure
  ] LOOP
    v_definition:=pg_catalog.pg_get_functiondef(v_signature);
    IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
      RAISE EXCEPTION 'Unexpected owner-balance generation predecessor: %',v_signature;
    END IF;
    EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
  END LOOP;
END;
$migration$;

ALTER FUNCTION public.record_owner_invoice_payment(
  uuid,uuid,numeric,date,text,text
) RENAME TO record_owner_invoice_payment_branch106;

CREATE FUNCTION public.record_owner_invoice_payment(
  p_organization_id uuid,p_owner_invoice_id uuid,p_amount numeric,
  p_received_date date,p_reference text,p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_property_id uuid;v_currency public.currency_code;v_result uuid;
BEGIN
  SELECT invoice.property_id,invoice.currency
  INTO v_property_id,v_currency
  FROM public.owner_invoices AS invoice
  WHERE invoice.organization_id=p_organization_id
    AND invoice.id=p_owner_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,'finance.record_payments'
  );
  BEGIN
    PERFORM app_private.lock_open_property_financial_month(
      p_organization_id,v_property_id,v_currency,p_received_date
    );
    v_result:=public.record_owner_invoice_payment_branch106(
      p_organization_id,p_owner_invoice_id,p_amount,p_received_date,
      p_reference,p_idempotency_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,'finance.record_payments',false
    );
    RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,'finance.record_payments',false
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_owner_invoice_payment(
  uuid,uuid,numeric,date,text,text
) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.record_owner_invoice_payment(
  uuid,uuid,numeric,date,text,text
) TO authenticated;
REVOKE ALL ON FUNCTION public.record_owner_invoice_payment_branch106(
  uuid,uuid,numeric,date,text,text
) FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'app_private.create_maintenance_task_internal(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_authority_anchor text := E'  SELECT membership.role, membership.branch_id\n  INTO actor_role, actor_branch_id\n  FROM public.organization_members AS membership\n  WHERE membership.organization_id = p_organization_id\n    AND membership.user_id = actor_id\n  LIMIT 1;\n\n  IF actor_role NOT IN (''super_admin'', ''operations_manager'') OR actor_role IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF actor_role = ''operations_manager'' AND actor_branch_id IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF actor_role = ''operations_manager''\n    AND actor_branch_id IS NOT NULL\n    AND p_branch_id IS DISTINCT FROM actor_branch_id THEN\n    RAISE EXCEPTION ''Manager can only manage tasks in their branch''\n      USING ERRCODE = ''42501'';\n  END IF;';
  v_authority_replacement text := E'  actor_branch_id := app_private.current_active_branch_id(p_organization_id);\n\n  IF NOT app_private.is_super_admin(p_organization_id)\n    AND NOT app_private.has_maintenance_branch_authority_context(p_organization_id) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF NOT app_private.is_super_admin(p_organization_id) AND actor_branch_id IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF NOT app_private.is_super_admin(p_organization_id)\n    AND actor_branch_id IS NOT NULL\n    AND p_branch_id IS DISTINCT FROM actor_branch_id THEN\n    RAISE EXCEPTION ''Manager can only manage tasks in their branch''\n      USING ERRCODE = ''42501'';\n  END IF;';
  v_assignee_anchor text := E'  IF p_assignee_person_id IS NOT NULL AND EXISTS (\n    SELECT 1\n    FROM public.organization_members AS assignee_membership\n    WHERE assignee_membership.organization_id = p_organization_id\n      AND assignee_membership.person_id = p_assignee_person_id\n      AND assignee_membership.role = ''operations_member''\n      AND assignee_membership.branch_id IS DISTINCT FROM p_branch_id\n  ) THEN';
  v_assignee_replacement text := E'  IF p_assignee_person_id IS NOT NULL\n    AND NOT app_private.is_executable_maintenance_assignee(\n      p_organization_id,p_branch_id,p_assignee_person_id\n    ) THEN';
BEGIN
  IF pg_catalog.strpos(v_definition,v_authority_anchor)=0
    OR pg_catalog.strpos(v_definition,v_assignee_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected maintenance internal predecessor: %',v_signature;
  END IF;
  v_definition:=pg_catalog.replace(v_definition,v_authority_anchor,v_authority_replacement);
  v_definition:=pg_catalog.replace(v_definition,v_assignee_anchor,v_assignee_replacement);
  EXECUTE v_definition;
END;
$migration$;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'app_private.update_maintenance_task_baseline_track10(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_anchor text := E'DECLARE\n  actor_role text := app_private.current_workspace_role(p_organization_id);\n  old_task public.tasks%ROWTYPE;\n  normalized_status text := lower(trim(coalesce(p_status, '''')));\nBEGIN\n  IF actor_role NOT IN (''super_admin'', ''operations_manager'') OR actor_role IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
  v_replacement text := E'DECLARE\n  old_task public.tasks%ROWTYPE;\n  normalized_status text := lower(trim(coalesce(p_status, '''')));\nBEGIN\n  IF NOT app_private.is_super_admin(p_organization_id)\n    AND NOT app_private.has_maintenance_branch_authority_context(p_organization_id) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
BEGIN
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected maintenance update predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
END;
$migration$;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'app_private.update_maintenance_task_internal(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_authority_anchor text := E'  SELECT membership.role, membership.branch_id\n  INTO actor_role, actor_branch_id\n  FROM public.organization_members AS membership\n  WHERE membership.organization_id = p_organization_id\n    AND membership.user_id = actor_id\n  LIMIT 1;\n\n  IF actor_role NOT IN (''super_admin'', ''operations_manager'') OR actor_role IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF actor_role = ''operations_manager'' AND actor_branch_id IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
  v_authority_replacement text := E'  actor_branch_id := app_private.current_active_branch_id(p_organization_id);\n\n  IF NOT app_private.is_super_admin(p_organization_id)\n    AND NOT app_private.has_maintenance_branch_authority_context(p_organization_id) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n  IF NOT app_private.is_super_admin(p_organization_id) AND actor_branch_id IS NULL THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
  v_branch_anchor text := E'  IF actor_role = ''operations_manager''\n    AND actor_branch_id IS NOT NULL\n    AND (\n      old_task.branch_id IS DISTINCT FROM actor_branch_id\n      OR p_branch_id IS DISTINCT FROM actor_branch_id\n    ) THEN';
  v_branch_replacement text := E'  IF NOT app_private.is_super_admin(p_organization_id)\n    AND actor_branch_id IS NOT NULL\n    AND (\n      old_task.branch_id IS DISTINCT FROM actor_branch_id\n      OR p_branch_id IS DISTINCT FROM actor_branch_id\n    ) THEN';
  v_assignee_anchor text := E'    AND EXISTS (\n    SELECT 1\n    FROM public.organization_members AS assignee_membership\n    WHERE assignee_membership.organization_id = p_organization_id\n      AND assignee_membership.person_id = p_assignee_person_id\n      AND assignee_membership.role = ''operations_member''\n      AND assignee_membership.branch_id IS DISTINCT FROM p_branch_id\n  ) THEN';
  v_assignee_replacement text := E'    AND NOT app_private.is_executable_maintenance_assignee(\n      p_organization_id,p_branch_id,p_assignee_person_id\n    ) THEN';
BEGIN
  IF pg_catalog.strpos(v_definition,v_authority_anchor)=0
    OR pg_catalog.strpos(v_definition,v_branch_anchor)=0
    OR pg_catalog.strpos(v_definition,v_assignee_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected maintenance update internal predecessor: %',v_signature;
  END IF;
  v_definition:=pg_catalog.replace(v_definition,v_authority_anchor,v_authority_replacement);
  v_definition:=pg_catalog.replace(v_definition,v_branch_anchor,v_branch_replacement);
  v_definition:=pg_catalog.replace(v_definition,v_assignee_anchor,v_assignee_replacement);
  EXECUTE v_definition;
END;
$migration$;

CREATE FUNCTION app_private.begin_maintenance_property_authority(
  p_organization_id uuid,p_property_id uuid,p_permission_key public.organization_permission_key
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_branch_id uuid; BEGIN
  PERFORM app_private.assert_property_permission(p_organization_id,p_property_id,p_permission_key);
  IF app_private.is_super_admin(p_organization_id) THEN RETURN NULL; END IF;
  v_branch_id:=app_private.current_active_branch_id(p_organization_id);
  PERFORM app_private.set_maintenance_branch_authority_context(
    p_organization_id,v_branch_id,p_permission_key,true);
  RETURN v_branch_id;
END; $$;

CREATE FUNCTION app_private.guard_task_branch_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_branch_id uuid; BEGIN
  SELECT property.branch_id INTO v_branch_id FROM public.properties AS property
  WHERE property.organization_id=NEW.organization_id AND property.id=NEW.property_id;
  IF NOT FOUND OR v_branch_id IS NULL OR NEW.branch_id IS DISTINCT FROM v_branch_id THEN
    RAISE EXCEPTION 'Maintenance task branch must match its Property' USING ERRCODE='22023';
  END IF;
  IF TG_OP='UPDATE' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'Maintenance task branch snapshot is immutable' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tasks_guard_branch_scope
  BEFORE INSERT OR UPDATE OF organization_id,property_id,branch_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_task_branch_scope();
CREATE FUNCTION app_private.guard_recurrence_branch_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_branch_id uuid; BEGIN
  SELECT property.branch_id INTO v_branch_id FROM public.properties AS property
  WHERE property.organization_id=NEW.organization_id AND property.id=NEW.property_id;
  IF NOT FOUND OR v_branch_id IS NULL OR NEW.branch_id IS DISTINCT FROM v_branch_id THEN
    RAISE EXCEPTION 'Maintenance recurrence branch must match its Property' USING ERRCODE='22023';
  END IF;
  IF TG_OP='UPDATE' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
    RAISE EXCEPTION 'Maintenance recurrence branch snapshot is immutable' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER maintenance_recurrence_series_guard_branch_scope
  BEFORE INSERT OR UPDATE OF organization_id,property_id,branch_id ON public.maintenance_recurrence_series
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_recurrence_branch_scope();

ALTER FUNCTION public.create_maintenance_task(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)
  RENAME TO create_maintenance_task_baseline_branch106;
ALTER FUNCTION public.create_maintenance_task_baseline_branch106(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid)
  SET SCHEMA app_private;
CREATE FUNCTION public.create_maintenance_task(
  p_organization_id uuid,p_property_id uuid,p_unit_id uuid,p_title text,p_description text,p_category text,
  p_priority text,p_status text,p_due_date date,p_due_time time without time zone,p_reminder_date date,
  p_reminder_time time without time zone,p_vendor_person_id uuid,p_cost_estimate_amount numeric,
  p_cost_estimate_currency public.currency_code,p_checklist jsonb,p_recurrence_frequency text,
  p_branch_id uuid DEFAULT NULL,p_assignee_person_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_result uuid;v_branch uuid; BEGIN
  v_branch:=app_private.begin_maintenance_property_authority(p_organization_id,p_property_id,'maintenance.create_assign');
  IF v_branch IS NOT NULL AND p_branch_id IS DISTINCT FROM v_branch THEN
    PERFORM app_private.set_maintenance_branch_authority_context(p_organization_id,NULL,'maintenance.create_assign',false);
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  BEGIN v_result:=app_private.create_maintenance_task_baseline_branch106(
    p_organization_id,p_property_id,p_unit_id,p_title,p_description,p_category,p_priority,p_status,
    p_due_date,p_due_time,p_reminder_date,p_reminder_time,p_vendor_person_id,p_cost_estimate_amount,
    p_cost_estimate_currency,p_checklist,p_recurrence_frequency,p_branch_id,p_assignee_person_id);
  EXCEPTION WHEN OTHERS THEN PERFORM app_private.set_maintenance_branch_authority_context(p_organization_id,NULL,'maintenance.create_assign',false);RAISE;END;
  PERFORM app_private.set_maintenance_branch_authority_context(p_organization_id,NULL,'maintenance.create_assign',false);RETURN v_result;
END; $$;

ALTER FUNCTION public.update_maintenance_task(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)
  RENAME TO update_maintenance_task_baseline_branch106;
ALTER FUNCTION public.update_maintenance_task_baseline_branch106(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid)
  SET SCHEMA app_private;
CREATE FUNCTION public.update_maintenance_task(
  p_task_id uuid,p_organization_id uuid,p_property_id uuid,p_unit_id uuid,p_title text,p_description text,
  p_category text,p_priority text,p_status text,p_due_date date,p_due_time time without time zone,
  p_reminder_date date,p_reminder_time time without time zone,p_vendor_person_id uuid,p_cost_estimate_amount numeric,
  p_cost_estimate_currency public.currency_code,p_actual_cost_amount numeric,p_actual_cost_currency public.currency_code,
  p_checklist jsonb,p_recurrence_frequency text,p_branch_id uuid DEFAULT NULL,p_assignee_person_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_old public.tasks%ROWTYPE;v_result uuid;v_branch uuid;
  v_permission_key public.organization_permission_key; BEGIN
  SELECT * INTO v_old FROM public.tasks WHERE organization_id=p_organization_id AND id=p_task_id;
  IF NOT FOUND OR v_old.property_id IS DISTINCT FROM p_property_id THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_permission_key:=CASE
    WHEN pg_catalog.lower(pg_catalog.btrim(coalesce(p_status,''))) IN ('ready_for_review','completed')
      OR v_old.status='ready_for_review'
    THEN 'maintenance.review'::public.organization_permission_key
    ELSE 'maintenance.create_assign'::public.organization_permission_key
  END;
  v_branch:=app_private.begin_maintenance_property_authority(p_organization_id,p_property_id,v_permission_key);
  IF v_branch IS NOT NULL AND (v_old.branch_id IS DISTINCT FROM v_branch OR p_branch_id IS DISTINCT FROM v_branch) THEN
    PERFORM app_private.set_maintenance_branch_authority_context(p_organization_id,NULL,v_permission_key,false);
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  BEGIN v_result:=app_private.update_maintenance_task_baseline_branch106(
    p_task_id,p_organization_id,p_property_id,p_unit_id,p_title,p_description,p_category,p_priority,p_status,
    p_due_date,p_due_time,p_reminder_date,p_reminder_time,p_vendor_person_id,p_cost_estimate_amount,
    p_cost_estimate_currency,p_actual_cost_amount,p_actual_cost_currency,p_checklist,p_recurrence_frequency,
    p_branch_id,p_assignee_person_id);
  EXCEPTION WHEN OTHERS THEN PERFORM app_private.set_maintenance_branch_authority_context(p_organization_id,NULL,v_permission_key,false);RAISE;END;
  PERFORM app_private.set_maintenance_branch_authority_context(p_organization_id,NULL,v_permission_key,false);RETURN v_result;
END; $$;

ALTER FUNCTION public.submit_maintenance_cost(uuid,uuid,date,uuid,text,text)
  RENAME TO submit_maintenance_cost_baseline_branch106;
ALTER FUNCTION public.submit_maintenance_cost_baseline_branch106(uuid,uuid,date,uuid,text,text) SET SCHEMA app_private;
CREATE FUNCTION public.submit_maintenance_cost(
  p_organization_id uuid,p_task_id uuid,p_expense_date date,p_supporting_document_id uuid,
  p_reference text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb; BEGIN
  SELECT property_id INTO v_property_id FROM public.tasks WHERE organization_id=p_organization_id AND id=p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_maintenance_property_authority(p_organization_id,v_property_id,'maintenance.complete');
  BEGIN v_result:=app_private.submit_maintenance_cost_baseline_branch106(
    p_organization_id,p_task_id,p_expense_date,p_supporting_document_id,p_reference,p_idempotency_key);
  EXCEPTION WHEN OTHERS THEN PERFORM app_private.set_maintenance_branch_authority_context(p_organization_id,NULL,'maintenance.complete',false);RAISE;END;
  PERFORM app_private.set_maintenance_branch_authority_context(p_organization_id,NULL,'maintenance.complete',false);RETURN v_result;
END; $$;

DO $migration$
DECLARE v_signature regprocedure;v_definition text;v_anchor text:=E'  IF NOT app_private.is_org_admin(p_organization_id) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.archive_maintenance_task(uuid,uuid)'::regprocedure,
    'public.restore_maintenance_task(uuid,uuid)'::regprocedure
  ] LOOP
    SELECT replace(pg_get_functiondef(v_signature),E'\r\n',E'\n') INTO v_definition;
    IF strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'Unexpected maintenance lifecycle predecessor: %',v_signature;END IF;
    EXECUTE replace(v_definition,v_anchor,E'  PERFORM app_private.assert_property_permission(\n    p_organization_id,(SELECT property_id FROM public.tasks WHERE organization_id=p_organization_id AND id=p_task_id),\n    ''maintenance.create_assign''\n  );');
  END LOOP;
END;
$migration$;

DO $migration$
DECLARE v_definition text;v_signature regprocedure;
BEGIN
  v_signature:='public.execute_assigned_maintenance_task(uuid,uuid,text,text,boolean,text)'::regprocedure;
  SELECT replace(pg_get_functiondef(v_signature),E'\r\n',E'\n') INTO v_definition;
  v_definition:=replace(v_definition,
    E'  IF actor_role <> ''operations_member'' OR actor_role IS NULL OR actor_person_id IS NULL OR actor_branch_id IS NULL THEN',
    E'  actor_branch_id := app_private.current_active_branch_id(p_organization_id);\n\n  IF NOT app_private.has_org_permission(p_organization_id,''maintenance.complete'') OR actor_person_id IS NULL OR actor_branch_id IS NULL THEN');
  IF v_definition NOT LIKE '%maintenance.complete%' THEN RAISE EXCEPTION 'Unexpected assigned execution predecessor';END IF;
  EXECUTE v_definition;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.execute_coordinated_maintenance_task(uuid,uuid,text,text)'::regprocedure,
    'public.review_maintenance_task_completion(uuid,uuid,text,text)'::regprocedure
  ] LOOP
    SELECT replace(pg_get_functiondef(v_signature),E'\r\n',E'\n') INTO v_definition;
    v_definition:=replace(v_definition,
      E'  IF actor_role NOT IN (''super_admin'', ''operations_manager'') OR actor_role IS NULL THEN',
      CASE WHEN v_signature::text LIKE 'review_%' THEN
        E'  IF NOT app_private.has_org_permission(p_organization_id,''maintenance.review'') THEN'
      ELSE E'  IF NOT app_private.has_org_permission(p_organization_id,''maintenance.complete'') THEN' END);
    v_definition:=replace(v_definition,
      E'  IF actor_role = ''operations_manager'' AND actor_branch_id IS NULL THEN',
      E'  actor_branch_id := app_private.current_active_branch_id(p_organization_id);\n\n  IF NOT app_private.is_super_admin(p_organization_id) AND actor_branch_id IS NULL THEN');
    v_definition:=replace(v_definition,E'  IF actor_role = ''operations_manager''\n    AND actor_branch_id IS NOT NULL',
      E'  IF NOT app_private.is_super_admin(p_organization_id)\n    AND actor_branch_id IS NOT NULL');
    IF v_definition NOT LIKE '%maintenance.%' THEN RAISE EXCEPTION 'Unexpected coordinated/review predecessor: %',v_signature;END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$migration$;

REVOKE ALL ON FUNCTION app_private.set_maintenance_branch_authority_context(uuid,uuid,public.organization_permission_key,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.has_maintenance_branch_authority_context(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.begin_maintenance_property_authority(uuid,uuid,public.organization_permission_key) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.guard_task_branch_scope() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.guard_recurrence_branch_scope() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.create_maintenance_task_baseline_branch106(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.update_maintenance_task_baseline_branch106(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.submit_maintenance_cost_baseline_branch106(uuid,uuid,date,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.create_maintenance_task(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_maintenance_task(uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,jsonb,text,uuid,uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.update_maintenance_task(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_maintenance_task(uuid,uuid,uuid,uuid,text,text,text,text,text,date,time without time zone,date,time without time zone,uuid,numeric,public.currency_code,numeric,public.currency_code,jsonb,text,uuid,uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.submit_maintenance_cost(uuid,uuid,date,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_maintenance_cost(uuid,uuid,date,uuid,text,text) TO authenticated,service_role;

CREATE FUNCTION public.set_financial_month_lock(
  p_organization_id uuid,
  p_branch_id uuid,
  p_month_start date,
  p_locked boolean,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_month_start date := pg_catalog.date_trunc('month',p_month_start)::date;
  v_reason text := NULLIF(pg_catalog.btrim(coalesce(p_reason,'')),'');
  v_lock_id uuid;
  v_is_locked boolean;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;
  IF p_organization_id IS NULL OR p_month_start IS NULL OR p_locked IS NULL THEN
    RAISE EXCEPTION 'Financial month lock details are required' USING ERRCODE='22023';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.organization_branches AS branch
    WHERE branch.organization_id=p_organization_id AND branch.id=p_branch_id
      AND branch.status='active' AND branch.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Choose an active branch in this organization.' USING ERRCODE='23503';
  END IF;
  IF p_locked THEN
    IF NOT app_private.can_lock_financial_month(p_organization_id)
      OR (NOT app_private.is_super_admin(p_organization_id)
        AND app_private.current_active_branch_id(p_organization_id) IS DISTINCT FROM p_branch_id) THEN
      RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
    END IF;
  ELSIF NOT app_private.can_unlock_financial_month(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF v_reason IS NOT NULL AND pg_catalog.char_length(v_reason)>400 THEN
    RAISE EXCEPTION 'Reason is too long' USING ERRCODE='22023';
  END IF;
  IF p_locked AND NOT app_private.is_super_admin(p_organization_id) THEN
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'Enter a reason to lock this month.' USING ERRCODE='22023';
    END IF;
    IF v_month_start IS DISTINCT FROM pg_catalog.date_trunc(
      'month',app_private.rent_business_date(p_organization_id,pg_catalog.now())
    )::date THEN
      RAISE EXCEPTION 'Choose the current operational month.'
        USING ERRCODE='22023';
    END IF;
  END IF;
  PERFORM app_private.lock_financial_month_scope(
    p_organization_id,p_branch_id,v_month_start
  );
  SELECT month_lock.id,month_lock.is_locked INTO v_lock_id,v_is_locked
  FROM public.financial_month_locks AS month_lock
  WHERE month_lock.organization_id=p_organization_id
    AND month_lock.branch_id IS NOT DISTINCT FROM p_branch_id
    AND month_lock.month_start=v_month_start
  FOR UPDATE;
  IF FOUND THEN
    IF p_locked AND v_is_locked THEN
      RAISE EXCEPTION 'Financial month is already locked' USING ERRCODE='22023';
    END IF;
    UPDATE public.financial_month_locks
    SET is_locked=p_locked,reason=v_reason,
      locked_at=CASE WHEN p_locked THEN pg_catalog.now() ELSE locked_at END,
      locked_by=CASE WHEN p_locked THEN v_actor_id ELSE locked_by END,
      unlocked_at=CASE WHEN p_locked THEN NULL ELSE pg_catalog.now() END,
      unlocked_by=CASE WHEN p_locked THEN NULL ELSE v_actor_id END,
      updated_at=pg_catalog.now()
    WHERE id=v_lock_id;
  ELSE
    INSERT INTO public.financial_month_locks(
      organization_id,branch_id,month_start,is_locked,reason,locked_at,locked_by,
      unlocked_at,unlocked_by,updated_at
    ) VALUES (
      p_organization_id,p_branch_id,v_month_start,p_locked,v_reason,pg_catalog.now(),v_actor_id,
      CASE WHEN p_locked THEN NULL ELSE pg_catalog.now() END,
      CASE WHEN p_locked THEN NULL ELSE v_actor_id END,pg_catalog.now()
    ) RETURNING id INTO v_lock_id;
  END IF;
  INSERT INTO public.activity_logs(
    organization_id,branch_id,actor_id,entity_type,entity_id,action,new_values
  ) VALUES (
    p_organization_id,p_branch_id,v_actor_id,'financial_month',v_lock_id,
    CASE WHEN p_locked THEN 'locked' ELSE 'unlocked' END,
    pg_catalog.jsonb_build_object('month_start',v_month_start,'branch_id',p_branch_id,'reason',v_reason)
  );
  RETURN v_lock_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_financial_month_lock(
  p_organization_id uuid,
  p_month_start date,
  p_locked boolean,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_branch_id uuid;
BEGIN
  IF app_private.is_super_admin(p_organization_id) THEN
    v_branch_id := NULL;
  ELSE
    v_branch_id := app_private.current_active_branch_id(p_organization_id);
  END IF;
  RETURN public.set_financial_month_lock(
    p_organization_id,v_branch_id,p_month_start,p_locked,p_reason
  );
END;
$$;

DROP POLICY IF EXISTS "Admins can read documents" ON public.documents;
DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;
CREATE POLICY documents_branch_scoped_select ON public.documents
  FOR SELECT TO authenticated
  USING (
    app_private.can_access_document(organization_id,id,'properties.view')
    OR app_private.can_access_document(organization_id,id,'leases.view')
    OR app_private.can_access_document(organization_id,id,'finance.view')
    OR app_private.can_access_document(organization_id,id,'maintenance.view')
  );

DROP POLICY IF EXISTS "Admins can read activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins can manage activity logs" ON public.activity_logs;
CREATE POLICY activity_logs_branch_scoped_select ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    app_private.is_super_admin(organization_id)
    OR (
      branch_id IS NOT NULL
      AND app_private.can_access_branch(organization_id,branch_id)
      AND (
        app_private.has_org_permission(organization_id,'properties.view')
        OR app_private.has_org_permission(organization_id,'people.view')
        OR app_private.has_org_permission(organization_id,'leases.view')
        OR app_private.has_org_permission(organization_id,'finance.view')
        OR app_private.has_org_permission(organization_id,'maintenance.view')
      )
    )
  );

DROP POLICY IF EXISTS "Admins can delete Nestory documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete Nestory photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read Nestory documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update Nestory documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update Nestory photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload Nestory documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload Nestory photos" ON storage.objects;
DROP POLICY IF EXISTS "Finance roles can read submitted expense evidence" ON storage.objects;
DROP POLICY IF EXISTS "Maintenance roles can read scoped task evidence" ON storage.objects;
DROP POLICY IF EXISTS "Members can read Nestory photos" ON storage.objects;

CREATE POLICY nestory_documents_branch_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id='nestory-documents'
    AND (
      app_private.can_access_storage_object(bucket_id,name,'properties.view')
      OR app_private.can_access_storage_object(bucket_id,name,'leases.view')
      OR app_private.can_access_storage_object(bucket_id,name,'finance.view')
      OR app_private.can_access_storage_object(bucket_id,name,'maintenance.view')
    )
  );
CREATE POLICY nestory_documents_branch_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='nestory-documents'
    AND name NOT LIKE app_private.storage_object_org_id(name)::text||'/paid-cost-evidence/%'
    AND (
      app_private.can_access_storage_object(bucket_id,name,'properties.write','insert')
      OR app_private.can_access_storage_object(bucket_id,name,'leases.prepare','insert')
      OR app_private.can_access_storage_object(bucket_id,name,'finance.correct_records','insert')
      OR app_private.can_access_storage_object(bucket_id,name,'maintenance.create_assign','insert')
      OR app_private.can_access_storage_object(bucket_id,name,'maintenance.complete','insert')
    )
  );
CREATE POLICY nestory_documents_branch_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id='nestory-documents'
    AND NOT app_private.is_financial_evidence_object_locked(name)
    AND (
      app_private.can_access_storage_object(bucket_id,name,'properties.write','update')
      OR app_private.can_access_storage_object(bucket_id,name,'finance.correct_records','update')
      OR app_private.can_access_storage_object(bucket_id,name,'maintenance.create_assign','update')
    )
  )
  WITH CHECK (
    bucket_id='nestory-documents'
    AND NOT app_private.is_financial_evidence_object_locked(name)
    AND (
      app_private.can_access_storage_object(bucket_id,name,'properties.write','update')
      OR app_private.can_access_storage_object(bucket_id,name,'finance.correct_records','update')
      OR app_private.can_access_storage_object(bucket_id,name,'maintenance.create_assign','update')
    )
  );
CREATE POLICY nestory_documents_branch_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id='nestory-documents'
    AND NOT app_private.is_financial_evidence_object_locked(name)
    AND (
      app_private.is_super_admin(app_private.storage_object_org_id(name))
      OR owner_id=(SELECT auth.uid())::text
    )
    AND (
      app_private.can_access_storage_object(bucket_id,name,'properties.archive','delete')
      OR app_private.can_access_storage_object(bucket_id,name,'finance.correct_records','delete')
      OR app_private.can_access_storage_object(bucket_id,name,'maintenance.create_assign','delete')
    )
  );
CREATE POLICY nestory_photos_branch_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id='nestory-photos'
    AND app_private.can_access_storage_object(bucket_id,name,'properties.view')
  );
CREATE POLICY nestory_photos_branch_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='nestory-photos'
    AND app_private.can_access_storage_object(bucket_id,name,'properties.write','insert')
  );
CREATE POLICY nestory_photos_branch_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id='nestory-photos'
    AND app_private.can_access_storage_object(bucket_id,name,'properties.write','update')
  )
  WITH CHECK (
    bucket_id='nestory-photos'
    AND app_private.can_access_storage_object(bucket_id,name,'properties.write','update')
  );
CREATE POLICY nestory_photos_branch_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id='nestory-photos'
    AND (
      app_private.is_super_admin(app_private.storage_object_org_id(name))
      OR owner_id=(SELECT auth.uid())::text
    )
    AND app_private.can_access_storage_object(bucket_id,name,'properties.archive','delete')
  );

REVOKE INSERT,UPDATE,DELETE ON TABLE public.financial_month_locks,
  public.documents,public.activity_logs,public.tasks,public.maintenance_recurrence_series,
  public.maintenance_recurrence_revisions,public.import_runs,public.import_rows,
  public.import_mappings
FROM anon,authenticated;

REVOKE ALL ON FUNCTION app_private.resolve_document_branch_id(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.document_branch_id(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.can_access_document(uuid,uuid,public.organization_permission_key)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.guard_branch_scoped_document()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.activity_entity_branch_id(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.guard_activity_branch_snapshot()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.storage_object_branch_id(text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.can_access_storage_object(text,text,public.organization_permission_key)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.can_access_storage_object(text,text,public.organization_permission_key,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.is_financial_month_locked(uuid,uuid,date)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.lock_financial_month_scope(uuid,uuid,date)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.lock_open_financial_month(uuid,uuid,date)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.assert_unit_permission(uuid,uuid,public.organization_permission_key)
  FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.set_financial_month_lock(uuid,uuid,date,boolean,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_financial_month_lock(uuid,uuid,date,boolean,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.set_financial_month_lock(uuid,date,boolean,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_financial_month_lock(uuid,date,boolean,text)
  TO authenticated;

CREATE TABLE IF NOT EXISTS app_private.finance_branch_authority_capability (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  capability_token text NOT NULL CHECK (capability_token ~ '^[0-9a-f]{64}$')
);
INSERT INTO app_private.finance_branch_authority_capability(singleton,capability_token)
VALUES (true,encode(extensions.digest(gen_random_uuid()::text||clock_timestamp()::text,'sha256'),'hex'))
ON CONFLICT (singleton) DO NOTHING;
REVOKE ALL ON TABLE app_private.finance_branch_authority_capability
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.set_finance_branch_authority_context(
  p_organization_id uuid,
  p_branch_id uuid,
  p_permission_key public.organization_permission_key,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_token text;
BEGIN
  IF p_enabled THEN
    SELECT capability_token INTO STRICT v_token
    FROM app_private.finance_branch_authority_capability
    WHERE singleton;
    PERFORM pg_catalog.set_config('app.finance_branch_authority_token',v_token,true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_org',p_organization_id::text,true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_branch',p_branch_id::text,true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_permission',p_permission_key::text,true);
  ELSE
    PERFORM pg_catalog.set_config('app.finance_branch_authority_token','',true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_org','',true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_branch','',true);
    PERFORM pg_catalog.set_config('app.finance_branch_authority_permission','',true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.has_finance_branch_authority_context(
  p_organization_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM app_private.finance_branch_authority_capability AS capability
    WHERE capability.singleton
      AND capability.capability_token=pg_catalog.current_setting('app.finance_branch_authority_token',true)
      AND p_organization_id::text=pg_catalog.current_setting('app.finance_branch_authority_org',true)
      AND p_permission_key::text=pg_catalog.current_setting('app.finance_branch_authority_permission',true)
      AND (
        app_private.current_active_branch_id(p_organization_id)::text
          =pg_catalog.current_setting('app.finance_branch_authority_branch',true)
        OR EXISTS (
          SELECT 1
          FROM public.organization_authorization_states AS authorization_state
          WHERE authorization_state.organization_id=p_organization_id
            AND NOT authorization_state.ordinary_access_enabled
            AND app_private.has_org_permission(p_organization_id,p_permission_key)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.begin_finance_property_authority(
  p_organization_id uuid,
  p_property_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_branch_id uuid;
BEGIN
  PERFORM app_private.assert_property_permission(
    p_organization_id,p_property_id,p_permission_key
  );
  IF app_private.is_super_admin(p_organization_id) THEN
    RETURN NULL;
  END IF;
  v_branch_id:=app_private.current_active_branch_id(p_organization_id);
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,v_branch_id,p_permission_key,true
  );
  RETURN v_branch_id;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_operate_finance(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.record_payments'); $$;
CREATE OR REPLACE FUNCTION app_private.can_read_finance(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.view'); $$;
CREATE OR REPLACE FUNCTION app_private.can_manage_petty_cash(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.submit_expenses')
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.approve_expenses')
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.correct_records'); $$;
CREATE OR REPLACE FUNCTION app_private.can_submit_expense(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.submit_expenses'); $$;
CREATE OR REPLACE FUNCTION app_private.can_review_expense(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.approve_expenses'); $$;
CREATE OR REPLACE FUNCTION app_private.can_correct_finance(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.correct_records'); $$;

CREATE FUNCTION app_private.can_submit_paid_cost_for_property_as_actor(
  p_organization_id uuid,p_actor_id uuid,p_property_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.organization_members AS member
    JOIN public.organization_authorization_states AS authorization_state
      ON authorization_state.organization_id=member.organization_id
    JOIN public.properties AS property
      ON property.organization_id=member.organization_id
     AND property.id=p_property_id
     AND property.archived_at IS NULL
    LEFT JOIN public.organization_roles AS role_record
      ON role_record.organization_id=member.organization_id
     AND role_record.id=member.custom_role_id
     AND role_record.status='active'
     AND role_record.archived_at IS NULL
    WHERE member.organization_id=p_organization_id
      AND member.user_id=p_actor_id
      AND (
        member.role='super_admin'
        OR (NOT authorization_state.ordinary_access_enabled
          AND member.role='finance_member')
        OR (authorization_state.ordinary_access_enabled
          AND member.role='custom'
          AND member.branch_id=property.branch_id
          AND EXISTS(
            SELECT 1 FROM public.organization_role_permissions AS permission_record
            WHERE permission_record.organization_id=member.organization_id
              AND permission_record.role_id=role_record.id
              AND (
                permission_record.permission_key='finance.submit_expenses'
                OR (current_setting('app.paid_cost_task_service_context',true)='verified'
                  AND permission_record.permission_key IN(
                    'maintenance.create_assign','maintenance.complete'
                  ))
              )
          ))
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.assert_paid_cost_task_actor_scope(
  p_organization_id uuid,p_actor_id uuid,p_property_id uuid,p_task_id uuid
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1
    FROM public.tasks AS task
    JOIN public.organization_members AS member
      ON member.organization_id=task.organization_id AND member.user_id=p_actor_id
    JOIN public.organization_authorization_states AS authorization_state
      ON authorization_state.organization_id=member.organization_id
    LEFT JOIN public.organization_roles AS role_record
      ON role_record.organization_id=member.organization_id
     AND role_record.id=member.custom_role_id
     AND role_record.status='active' AND role_record.archived_at IS NULL
    WHERE task.organization_id=p_organization_id
      AND task.property_id=p_property_id AND task.id=p_task_id AND task.archived_at IS NULL
      AND (
        member.role='super_admin'
        OR (NOT authorization_state.ordinary_access_enabled
          AND (member.role='finance_member'
            OR (member.role='operations_manager' AND member.branch_id=task.branch_id)))
        OR (authorization_state.ordinary_access_enabled
          AND member.role='custom' AND member.branch_id=task.branch_id
          AND EXISTS(
            SELECT 1 FROM public.organization_role_permissions AS permission_record
            WHERE permission_record.organization_id=member.organization_id
              AND permission_record.role_id=role_record.id
              AND permission_record.permission_key IN(
                'finance.submit_expenses','maintenance.create_assign','maintenance.complete'
              )
          ))
      )
  ) THEN
    RAISE EXCEPTION 'paid_cost_evidence_forbidden' USING ERRCODE='42501';
  END IF;
END;
$$;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_anchor text := E'app_private.can_submit_paid_cost_as_actor(\n    p_organization_id,\n    p_actor_id\n  )';
  v_replacement text := E'app_private.can_submit_paid_cost_for_property_as_actor(\n    p_organization_id,\n    p_actor_id,\n    p_property_id\n  )';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_paid_cost_evidence_object(uuid,uuid,uuid,text)'::regprocedure,
    'app_private.register_paid_cost_evidence_verified_baseline_track6_registrar(uuid,uuid,uuid,text,text,text,bigint,text,uuid,text,text)'::regprocedure
  ] LOOP
    v_definition:=pg_catalog.pg_get_functiondef(v_signature);
    IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
      RAISE EXCEPTION 'Unexpected paid-cost evidence predecessor: %',v_signature;
    END IF;
    EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
  END LOOP;
END;
$migration$;

REVOKE ALL ON FUNCTION app_private.can_submit_paid_cost_for_property_as_actor(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.can_submit_owner_opening_balance(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.submit_expenses')
  OR EXISTS(
    SELECT 1 FROM public.organization_authorization_states AS authorization_state
    WHERE authorization_state.organization_id=target_organization_id
      AND NOT authorization_state.ordinary_access_enabled
      AND app_private.has_org_permission(target_organization_id,'finance.submit_expenses')
  ); $$;
CREATE OR REPLACE FUNCTION app_private.can_request_owner_opening_balance_correction(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.submit_expenses')
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.correct_records')
  OR EXISTS(
    SELECT 1 FROM public.organization_authorization_states AS authorization_state
    WHERE authorization_state.organization_id=target_organization_id
      AND NOT authorization_state.ordinary_access_enabled
      AND (
        app_private.has_org_permission(target_organization_id,'finance.submit_expenses')
        OR app_private.has_org_permission(target_organization_id,'finance.correct_records')
      )
  ); $$;
CREATE OR REPLACE FUNCTION app_private.can_review_owner_opening_balance(target_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT app_private.is_super_admin(target_organization_id)
  OR app_private.has_finance_branch_authority_context(target_organization_id,'finance.approve_expenses')
  OR EXISTS(
    SELECT 1 FROM public.organization_authorization_states AS authorization_state
    WHERE authorization_state.organization_id=target_organization_id
      AND NOT authorization_state.ordinary_access_enabled
      AND app_private.has_org_permission(target_organization_id,'finance.approve_expenses')
  ); $$;

ALTER FUNCTION public.submit_owner_opening_balance(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)
  RENAME TO submit_owner_opening_balance_baseline_branch106;
ALTER FUNCTION public.submit_owner_opening_balance_baseline_branch106(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text)
  SET SCHEMA app_private;
CREATE FUNCTION public.submit_owner_opening_balance(
  p_organization_id uuid,p_property_id uuid,p_owner_person_id uuid,p_currency public.currency_code,
  p_effective_date date,p_component public.owner_balance_component,p_amount numeric,p_reason text,
  p_source_reference text,p_supporting_document_id uuid,p_evidence_sha256 text,
  p_resubmission_of_request_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_result jsonb; BEGIN
  PERFORM app_private.begin_finance_property_authority(p_organization_id,p_property_id,'finance.submit_expenses');
  BEGIN v_result:=app_private.submit_owner_opening_balance_baseline_branch106(
    p_organization_id,p_property_id,p_owner_person_id,p_currency,p_effective_date,p_component,p_amount,
    p_reason,p_source_reference,p_supporting_document_id,p_evidence_sha256,p_resubmission_of_request_id,p_idempotency_key);
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.submit_expenses',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.submit_expenses',false);
  RETURN v_result;
END; $$;

ALTER FUNCTION public.submit_owner_opening_balance_correction(uuid,uuid,numeric,text,text,uuid,text,uuid,text)
  RENAME TO submit_owner_opening_balance_correction_baseline_branch106;
ALTER FUNCTION public.submit_owner_opening_balance_correction_baseline_branch106(uuid,uuid,numeric,text,text,uuid,text,uuid,text)
  SET SCHEMA app_private;
CREATE FUNCTION public.submit_owner_opening_balance_correction(
  p_organization_id uuid,p_entry_id uuid,p_replacement_amount numeric,p_reason text,p_source_reference text,
  p_supporting_document_id uuid,p_evidence_sha256 text,p_resubmission_of_request_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE
  v_property_id uuid;
  v_result jsonb;
  v_permission_key public.organization_permission_key;
BEGIN
  SELECT entry.property_id INTO v_property_id FROM public.owner_opening_balance_entries AS entry
  WHERE entry.organization_id=p_organization_id AND entry.id=p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  v_permission_key:=CASE
    WHEN app_private.has_org_permission(p_organization_id,'finance.correct_records')
      THEN 'finance.correct_records'::public.organization_permission_key
    ELSE 'finance.submit_expenses'::public.organization_permission_key
  END;
  PERFORM app_private.begin_finance_property_authority(
    p_organization_id,v_property_id,v_permission_key
  );
  BEGIN v_result:=app_private.submit_owner_opening_balance_correction_baseline_branch106(
    p_organization_id,p_entry_id,p_replacement_amount,p_reason,p_source_reference,p_supporting_document_id,
    p_evidence_sha256,p_resubmission_of_request_id,p_idempotency_key);
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(
      p_organization_id,NULL,v_permission_key,false
    ); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(
    p_organization_id,NULL,v_permission_key,false
  );
  RETURN v_result;
END; $$;

ALTER FUNCTION public.review_owner_opening_balance(uuid,uuid,text,text,text)
  RENAME TO review_owner_opening_balance_baseline_branch106;
ALTER FUNCTION public.review_owner_opening_balance_baseline_branch106(uuid,uuid,text,text,text)
  SET SCHEMA app_private;
CREATE FUNCTION public.review_owner_opening_balance(
  p_organization_id uuid,p_request_id uuid,p_decision text,p_review_reason text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result jsonb; BEGIN
  SELECT request.property_id INTO v_property_id FROM public.owner_opening_balance_requests AS request
  WHERE request.organization_id=p_organization_id AND request.id=p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.approve_expenses');
  BEGIN v_result:=app_private.review_owner_opening_balance_baseline_branch106(
    p_organization_id,p_request_id,p_decision,p_review_reason,p_idempotency_key);
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.approve_expenses',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.approve_expenses',false);
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION app_private.submit_owner_opening_balance_baseline_branch106(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.submit_owner_opening_balance_correction_baseline_branch106(uuid,uuid,numeric,text,text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.review_owner_opening_balance_baseline_branch106(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.submit_owner_opening_balance(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_owner_opening_balance(uuid,uuid,uuid,public.currency_code,date,public.owner_balance_component,numeric,text,text,uuid,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_owner_opening_balance_correction(uuid,uuid,numeric,text,text,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_owner_opening_balance_correction(uuid,uuid,numeric,text,text,uuid,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.review_owner_opening_balance(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_owner_opening_balance(uuid,uuid,text,text,text) TO authenticated;

ALTER FUNCTION public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)
  RENAME TO submit_expense_baseline_branch106;
ALTER FUNCTION public.submit_expense_baseline_branch106(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)
  SET SCHEMA app_private;
CREATE FUNCTION public.submit_expense(
  p_organization_id uuid,p_property_id uuid,p_unit_id uuid,p_source_type text,p_source_id uuid,
  p_customer_category text,p_vendor_label text,p_expense_date date,p_internal_cost_amount numeric,
  p_internal_markup_amount numeric,p_currency public.currency_code,p_responsibility text,
  p_tenant_invoice_id uuid,p_reconciliation_source_id uuid,p_supporting_document_id uuid,
  p_vendor_person_id uuid,p_reference text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM app_private.begin_finance_property_authority(p_organization_id,p_property_id,'finance.submit_expenses');
  BEGIN
    v_result:=app_private.submit_expense_baseline_branch106(
      p_organization_id,p_property_id,p_unit_id,p_source_type,p_source_id,p_customer_category,
      p_vendor_label,p_expense_date,p_internal_cost_amount,p_internal_markup_amount,p_currency,
      p_responsibility,p_tenant_invoice_id,p_reconciliation_source_id,p_supporting_document_id,
      p_vendor_person_id,p_reference,p_idempotency_key);
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.submit_expenses',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.submit_expenses',false);
  RETURN v_result;
END; $$;

ALTER FUNCTION public.review_expense(uuid,uuid,text,text,text,uuid)
  RENAME TO review_expense_baseline_branch106;
ALTER FUNCTION public.review_expense_baseline_branch106(uuid,uuid,text,text,text,uuid)
  SET SCHEMA app_private;
CREATE FUNCTION public.review_expense(
  p_organization_id uuid,p_submission_id uuid,p_decision text,p_reason text,
  p_idempotency_key text,p_reconciliation_source_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_property_id uuid; v_result jsonb;
BEGIN
  SELECT submission.property_id INTO v_property_id FROM public.expense_submissions AS submission
  WHERE submission.organization_id=p_organization_id AND submission.id=p_submission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.approve_expenses');
  BEGIN
    v_result:=app_private.review_expense_baseline_branch106(
      p_organization_id,p_submission_id,p_decision,p_reason,p_idempotency_key,p_reconciliation_source_id);
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.approve_expenses',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.approve_expenses',false);
  RETURN v_result;
END; $$;

ALTER FUNCTION public.create_petty_cash_entry(uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric,text)
  RENAME TO create_petty_cash_entry_baseline_branch106;
ALTER FUNCTION public.create_petty_cash_entry_baseline_branch106(uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric,text)
  SET SCHEMA app_private;
CREATE FUNCTION public.create_petty_cash_entry(
  p_organization_id uuid,p_account_id uuid,p_period_id uuid,p_property_id uuid,p_unit_id uuid,
  p_invoice_date date,p_clear_date date,p_entry_kind text,p_status text,p_category text,p_supplier text,
  p_description text,p_amount numeric,p_counterparty_person_id uuid DEFAULT NULL,p_receipt_reference text DEFAULT NULL,
  p_remark text DEFAULT NULL,p_economic_scope text DEFAULT 'property_expense',p_owner_bill_status text DEFAULT 'not_billable',
  p_owner_reimbursable_amount numeric DEFAULT 0,p_owner_reimbursed_amount numeric DEFAULT 0,
  p_company_loss_amount numeric DEFAULT 0,p_idempotency_key text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_result uuid;
BEGIN
  PERFORM app_private.begin_finance_property_authority(p_organization_id,p_property_id,'finance.submit_expenses');
  BEGIN
    v_result:=app_private.create_petty_cash_entry_baseline_branch106(
      p_organization_id,p_account_id,p_period_id,p_property_id,p_unit_id,p_invoice_date,p_clear_date,
      p_entry_kind,p_status,p_category,p_supplier,p_description,p_amount,p_counterparty_person_id,
      p_receipt_reference,p_remark,p_economic_scope,p_owner_bill_status,p_owner_reimbursable_amount,
      p_owner_reimbursed_amount,p_company_loss_amount,p_idempotency_key);
  EXCEPTION WHEN OTHERS THEN
    PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.submit_expenses',false); RAISE;
  END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.submit_expenses',false);
  RETURN v_result;
END; $$;

ALTER FUNCTION public.post_petty_cash_entry(uuid,uuid) RENAME TO post_petty_cash_entry_baseline_branch106;
ALTER FUNCTION public.post_petty_cash_entry_baseline_branch106(uuid,uuid) SET SCHEMA app_private;
CREATE FUNCTION public.post_petty_cash_entry(p_organization_id uuid,p_entry_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result uuid; BEGIN
  SELECT entry.property_id INTO v_property_id FROM public.petty_cash_entries AS entry
  WHERE entry.organization_id=p_organization_id AND entry.id=p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.approve_expenses');
  BEGIN v_result:=app_private.post_petty_cash_entry_baseline_branch106(p_organization_id,p_entry_id);
  EXCEPTION WHEN OTHERS THEN PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.approve_expenses',false); RAISE; END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.approve_expenses',false); RETURN v_result;
END; $$;

ALTER FUNCTION public.update_petty_cash_entry(uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric)
  RENAME TO update_petty_cash_entry_baseline_branch106;
ALTER FUNCTION public.update_petty_cash_entry_baseline_branch106(uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric)
  SET SCHEMA app_private;
CREATE FUNCTION public.update_petty_cash_entry(
  p_organization_id uuid,p_entry_id uuid,p_property_id uuid,p_unit_id uuid,p_invoice_date date,p_clear_date date,
  p_entry_kind text,p_status text,p_category text,p_supplier text,p_description text,p_amount numeric,
  p_counterparty_person_id uuid DEFAULT NULL,p_receipt_reference text DEFAULT NULL,p_remark text DEFAULT NULL,
  p_economic_scope text DEFAULT 'property_expense',p_owner_bill_status text DEFAULT 'not_billable',
  p_owner_reimbursable_amount numeric DEFAULT 0,p_owner_reimbursed_amount numeric DEFAULT 0,p_company_loss_amount numeric DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_existing_property_id uuid;v_result jsonb; BEGIN
  SELECT entry.property_id INTO v_existing_property_id FROM public.petty_cash_entries AS entry
  WHERE entry.organization_id=p_organization_id AND entry.id=p_entry_id;
  IF NOT FOUND OR v_existing_property_id IS DISTINCT FROM p_property_id THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,p_property_id,'finance.correct_records');
  BEGIN v_result:=app_private.update_petty_cash_entry_baseline_branch106(
    p_organization_id,p_entry_id,p_property_id,p_unit_id,p_invoice_date,p_clear_date,p_entry_kind,p_status,
    p_category,p_supplier,p_description,p_amount,p_counterparty_person_id,p_receipt_reference,p_remark,
    p_economic_scope,p_owner_bill_status,p_owner_reimbursable_amount,p_owner_reimbursed_amount,p_company_loss_amount);
  EXCEPTION WHEN OTHERS THEN PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.correct_records',false); RAISE; END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.correct_records',false); RETURN v_result;
END; $$;

ALTER FUNCTION public.void_petty_cash_entry(uuid,uuid,text) RENAME TO void_petty_cash_entry_baseline_branch106;
ALTER FUNCTION public.void_petty_cash_entry_baseline_branch106(uuid,uuid,text) SET SCHEMA app_private;
CREATE FUNCTION public.void_petty_cash_entry(p_organization_id uuid,p_entry_id uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_property_id uuid;v_result uuid; BEGIN
  SELECT entry.property_id INTO v_property_id FROM public.petty_cash_entries AS entry
  WHERE entry.organization_id=p_organization_id AND entry.id=p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,'finance.correct_records');
  BEGIN v_result:=app_private.void_petty_cash_entry_baseline_branch106(p_organization_id,p_entry_id,p_reason);
  EXCEPTION WHEN OTHERS THEN PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.correct_records',false); RAISE; END;
  PERFORM app_private.set_finance_branch_authority_context(p_organization_id,NULL,'finance.correct_records',false); RETURN v_result;
END; $$;

REVOKE ALL ON TABLE app_private.finance_branch_authority_capability FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.set_finance_branch_authority_context(uuid,uuid,public.organization_permission_key,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.has_finance_branch_authority_context(uuid,public.organization_permission_key)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.begin_finance_property_authority(uuid,uuid,public.organization_permission_key)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.submit_expense_baseline_branch106(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.review_expense_baseline_branch106(uuid,uuid,text,text,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.create_petty_cash_entry_baseline_branch106(uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.post_petty_cash_entry_baseline_branch106(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.update_petty_cash_entry_baseline_branch106(uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.void_petty_cash_entry_baseline_branch106(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.review_expense(uuid,uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.review_expense(uuid,uuid,text,text,text,uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.create_petty_cash_entry(uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_petty_cash_entry(uuid,uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.post_petty_cash_entry(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.post_petty_cash_entry(uuid,uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.update_petty_cash_entry(uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_petty_cash_entry(uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.void_petty_cash_entry(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.void_petty_cash_entry(uuid,uuid,text) TO authenticated,service_role;

CREATE FUNCTION app_private.can_read_finance_property(
  p_organization_id uuid,p_property_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT app_private.can_access_property(
    p_organization_id,p_property_id,'finance.view'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_paid_cost_submission_evidence(
  p_organization_id uuid,
  p_submission_ids uuid[]
)
RETURNS TABLE(
  submission_id uuid,
  document_id uuid,
  file_name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  content_sha256 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000';
  END IF;

  IF NOT app_private.is_super_admin(p_organization_id)
    AND NOT app_private.has_org_permission(p_organization_id,'finance.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;

  IF coalesce(pg_catalog.cardinality(p_submission_ids),0)=0 THEN
    RETURN;
  END IF;
  IF pg_catalog.cardinality(p_submission_ids)>500 THEN
    RAISE EXCEPTION 'Paid-cost evidence query is limited to 500 submissions'
      USING ERRCODE='22023';
  END IF;

  RETURN QUERY
  SELECT
    submission.id,
    document.id,
    document.file_name,
    document.storage_path,
    document.mime_type,
    document.size_bytes,
    document.content_sha256
  FROM public.expense_submissions AS submission
  JOIN public.properties AS property
    ON property.organization_id=submission.organization_id
   AND property.id=submission.property_id
  JOIN public.documents AS document
    ON document.organization_id=submission.organization_id
   AND document.id=submission.supporting_document_id
  WHERE submission.organization_id=p_organization_id
    AND submission.id=ANY(p_submission_ids)
    AND app_private.can_read_finance_property(
      submission.organization_id,submission.property_id
    )
    AND document.archived_at IS NULL
    AND document.content_sha256 IS NOT NULL
    AND (
      app_private.is_super_admin(p_organization_id)
      OR (
        document.branch_id=property.branch_id
        AND app_private.storage_object_branch_id(document.storage_path)=property.branch_id
      )
    )
    AND EXISTS(
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id='nestory-documents'
        AND object.name=document.storage_path
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_paid_cost_submission_evidence(uuid,uuid[])
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_paid_cost_submission_evidence(uuid,uuid[])
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_finance_submission_actor_labels(
  p_organization_id uuid,
  p_user_ids uuid[]
)
RETURNS TABLE(user_id uuid,label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR (
      NOT app_private.is_super_admin(p_organization_id)
      AND NOT app_private.has_org_permission(p_organization_id,'finance.view')
    ) THEN
    RAISE EXCEPTION 'Finance access is required' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    membership.user_id,
    coalesce(
      nullif(pg_catalog.btrim(account.email::text),''),
      pg_catalog.initcap(pg_catalog.replace(membership.role,'_',' '))
    ) AS label
  FROM public.organization_members AS membership
  JOIN auth.users AS account
    ON account.id=membership.user_id
  JOIN public.expense_submissions AS submission
    ON submission.organization_id=membership.organization_id
   AND submission.submitted_by=membership.user_id
  WHERE membership.organization_id=p_organization_id
    AND membership.user_id=ANY(coalesce(p_user_ids,ARRAY[]::uuid[]))
    AND app_private.can_read_finance_property(
      submission.organization_id,submission.property_id
    )
  ORDER BY membership.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_finance_submission_actor_labels(uuid,uuid[])
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_submission_actor_labels(uuid,uuid[])
  TO authenticated;

CREATE OR REPLACE FUNCTION app_private.can_read_maintenance_task(
  p_organization_id uuid,p_task_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
  SELECT coalesce(
    app_private.is_super_admin(p_organization_id)
    OR EXISTS(
      SELECT 1
      FROM public.tasks AS task
      JOIN public.properties AS property
        ON property.organization_id=task.organization_id
       AND property.id=task.property_id
       AND property.branch_id=task.branch_id
      WHERE task.organization_id=p_organization_id
        AND task.id=p_task_id
        AND task.branch_id=app_private.current_active_branch_id(p_organization_id)
        AND app_private.has_org_permission(p_organization_id,'maintenance.view')
    ),false
  );
$$;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_anchor text:=E'  IF NOT app_private.is_org_admin(p_organization_id) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
  v_replacement text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.create_timeline_event(uuid,uuid,uuid,date,public.timeline_event_type,text,text,numeric,public.currency_code)'::regprocedure,
    'public.update_timeline_event(uuid,uuid,uuid,uuid,date,public.timeline_event_type,text,text,numeric,public.currency_code)'::regprocedure,
    'public.archive_timeline_event(uuid,uuid)'::regprocedure,
    'public.restore_timeline_event(uuid,uuid)'::regprocedure
  ] LOOP
    SELECT pg_catalog.replace(pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n') INTO v_definition;
    v_replacement:=CASE
      WHEN v_signature::text LIKE 'create_timeline_event%'
        THEN E'  PERFORM app_private.assert_property_permission(\n    p_organization_id,p_property_id,''properties.write''\n  );'
      WHEN v_signature::text LIKE 'update_timeline_event%'
        THEN E'  PERFORM app_private.assert_property_permission(\n    p_organization_id,(SELECT property_id FROM public.timeline_events WHERE organization_id=p_organization_id AND id=p_event_id),''properties.write''\n  );\n  PERFORM app_private.assert_property_permission(\n    p_organization_id,p_property_id,''properties.write''\n  );'
      ELSE E'  PERFORM app_private.assert_property_permission(\n    p_organization_id,(SELECT property_id FROM public.timeline_events WHERE organization_id=p_organization_id AND id=p_event_id),''properties.archive''\n  );'
    END;
    IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
      RAISE EXCEPTION 'Unexpected Timeline lifecycle predecessor: %',v_signature;
    END IF;
    EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
  END LOOP;
END;
$migration$;

DO $migration$
DECLARE v_table text;v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'activity_logs','documents','expense_customer_adjustments',
    'expense_submissions','finance_expense_items',
    'finance_payment_allocations','finance_receipt_allocations',
    'ips_expense_responsibilities',
    'finance_income_items','finance_payments','finance_receipts','financial_month_locks',
    'financial_reconciliation_sources','leases','property_owners',
    'ledger_entries','owner_balance_periods','owner_component_movements',
    'owner_event_allocation_sets','owner_event_owner_allocations',
    'owner_balance_period_components','owner_cash_events',
    'owner_cash_source_consumptions','owner_charge_cash_allocations',
    'owner_close_corrections','owner_close_line_sources','owner_close_lines',
    'owner_close_revisions','owner_close_series',
    'owner_collection_confirmation_allocations','owner_collection_confirmations',
    'owner_component_transfer_instructions','owner_component_transfer_lines',
    'owner_opening_balance_entries','owner_opening_balance_requests',
    'owner_statement_artifacts','owner_statement_publications',
    'owner_invoice_lines','owner_invoices','owner_payment_allocations',
    'owner_payments','property_withdrawals','petty_cash_entries','tenant_invoice_lines',
    'tenant_invoice_payment_allocations','tenant_invoice_payments','tenant_invoices',
    'tasks','tenant_requests','maintenance_recurrence_series','maintenance_recurrence_revisions',
    'timeline_events'
  ] LOOP
    FOR v_policy IN
      SELECT policyname FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND tablename=v_table
    LOOP
      EXECUTE pg_catalog.format('DROP POLICY %I ON public.%I',v_policy.policyname,v_table);
    END LOOP;
  END LOOP;
END;
$migration$;

CREATE POLICY documents_branch_scoped_select ON public.documents
  FOR SELECT TO authenticated
  USING (
    app_private.can_access_document(organization_id,id,'properties.view')
    OR app_private.can_access_document(organization_id,id,'leases.view')
    OR app_private.can_access_document(organization_id,id,'finance.view')
    OR app_private.can_access_document(organization_id,id,'maintenance.view')
  );
CREATE POLICY activity_logs_branch_scoped_select ON public.activity_logs
  FOR SELECT TO authenticated
  USING (
    app_private.is_super_admin(organization_id)
    OR (branch_id IS NOT NULL
      AND branch_id=app_private.current_active_branch_id(organization_id)
      AND (app_private.has_org_permission(organization_id,'properties.view')
        OR app_private.has_org_permission(organization_id,'people.view')
        OR app_private.has_org_permission(organization_id,'leases.view')
        OR app_private.has_org_permission(organization_id,'finance.view')
        OR app_private.has_org_permission(organization_id,'maintenance.view')))
  );

CREATE POLICY expense_submissions_branch_select ON public.expense_submissions
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY expense_customer_adjustments_branch_select
  ON public.expense_customer_adjustments
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY finance_expense_items_branch_select ON public.finance_expense_items
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY finance_income_items_branch_select ON public.finance_income_items
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY finance_payments_branch_select ON public.finance_payments
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY finance_payment_allocations_branch_select
  ON public.finance_payment_allocations
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY finance_receipts_branch_select ON public.finance_receipts
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY finance_receipt_allocations_branch_select
  ON public.finance_receipt_allocations
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY ips_expense_responsibilities_branch_select
  ON public.ips_expense_responsibilities
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY ledger_entries_branch_select ON public.ledger_entries
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_balance_periods_branch_select ON public.owner_balance_periods
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_component_movements_branch_select ON public.owner_component_movements
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_event_allocation_sets_branch_select ON public.owner_event_allocation_sets
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_event_owner_allocations_branch_select
  ON public.owner_event_owner_allocations
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(
    organization_id,
    app_private.owner_allocation_property_id(organization_id,allocation_set_id)
  ));
CREATE POLICY owner_balance_period_components_branch_select
  ON public.owner_balance_period_components
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.owner_balance_periods AS period
    WHERE period.organization_id=owner_balance_period_components.organization_id
      AND period.id=owner_balance_period_components.owner_balance_period_id
      AND app_private.can_read_finance_property(period.organization_id,period.property_id)
  ));
CREATE POLICY owner_cash_events_branch_select ON public.owner_cash_events
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_cash_source_consumptions_branch_select
  ON public.owner_cash_source_consumptions
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(
    organization_id,
    app_private.owner_cash_source_property_id(
      organization_id,source_movement_id,consumer_movement_id,
      source_opening_entry_id
    )
  ));
CREATE POLICY owner_charge_cash_allocations_branch_select
  ON public.owner_charge_cash_allocations
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_close_corrections_branch_select ON public.owner_close_corrections
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_close_revisions_branch_select ON public.owner_close_revisions
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_close_series_branch_select ON public.owner_close_series
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_close_lines_branch_select ON public.owner_close_lines
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.owner_close_revisions AS revision
    WHERE revision.organization_id=owner_close_lines.organization_id
      AND revision.id=owner_close_lines.owner_close_revision_id
      AND app_private.can_read_finance_property(revision.organization_id,revision.property_id)
  ));
CREATE POLICY owner_close_line_sources_branch_select ON public.owner_close_line_sources
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.owner_close_revisions AS revision
    WHERE revision.organization_id=owner_close_line_sources.organization_id
      AND revision.id=owner_close_line_sources.owner_close_revision_id
      AND app_private.can_read_finance_property(revision.organization_id,revision.property_id)
  ));
CREATE POLICY owner_collection_confirmation_allocations_branch_select
  ON public.owner_collection_confirmation_allocations
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_collection_confirmations_branch_select
  ON public.owner_collection_confirmations
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id=owner_collection_confirmations.organization_id
      AND invoice.id=owner_collection_confirmations.invoice_id
      AND app_private.can_read_finance_property(invoice.organization_id,invoice.property_id)
  ));
CREATE POLICY owner_component_transfer_instructions_branch_select
  ON public.owner_component_transfer_instructions
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_component_transfer_lines_branch_select
  ON public.owner_component_transfer_lines
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.owner_component_transfer_instructions AS instruction
    WHERE instruction.organization_id=owner_component_transfer_lines.organization_id
      AND instruction.id=owner_component_transfer_lines.transfer_instruction_id
      AND app_private.can_read_finance_property(instruction.organization_id,instruction.property_id)
  ));
CREATE POLICY owner_opening_balance_entries_branch_select
  ON public.owner_opening_balance_entries
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_opening_balance_requests_branch_select
  ON public.owner_opening_balance_requests
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_statement_publications_branch_select
  ON public.owner_statement_publications
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.owner_close_revisions AS revision
    WHERE revision.organization_id=owner_statement_publications.organization_id
      AND revision.id=owner_statement_publications.owner_close_revision_id
      AND app_private.can_read_finance_property(revision.organization_id,revision.property_id)
  ));
CREATE POLICY owner_statement_artifacts_branch_select ON public.owner_statement_artifacts
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.owner_statement_publications AS publication
    JOIN public.owner_close_revisions AS revision
      ON revision.organization_id=publication.organization_id
     AND revision.id=publication.owner_close_revision_id
    WHERE publication.organization_id=owner_statement_artifacts.organization_id
      AND publication.id=owner_statement_artifacts.publication_id
      AND app_private.can_read_finance_property(revision.organization_id,revision.property_id)
  ));
CREATE POLICY property_withdrawals_branch_select ON public.property_withdrawals
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_invoice_lines_branch_select ON public.owner_invoice_lines
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_invoices_branch_select ON public.owner_invoices
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY owner_payments_branch_select ON public.owner_payments
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY petty_cash_entries_branch_select ON public.petty_cash_entries
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY tenant_invoices_branch_select ON public.tenant_invoices
  FOR SELECT TO authenticated USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY financial_reconciliation_sources_branch_select
  ON public.financial_reconciliation_sources
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY leases_branch_finance_select ON public.leases
  FOR SELECT TO authenticated
  USING(
    app_private.can_access_property(organization_id,property_id,'leases.view')
    OR app_private.can_read_finance_property(organization_id,property_id)
  );
CREATE POLICY property_owners_branch_finance_select ON public.property_owners
  FOR SELECT TO authenticated
  USING(app_private.can_read_finance_property(organization_id,property_id));
CREATE POLICY financial_month_locks_branch_select ON public.financial_month_locks
  FOR SELECT TO authenticated USING(
    app_private.is_super_admin(organization_id)
    OR (branch_id IS NOT NULL
      AND branch_id=app_private.current_active_branch_id(organization_id)
      AND app_private.has_org_permission(organization_id,'finance.view'))
  );
CREATE POLICY tenant_invoice_lines_branch_select ON public.tenant_invoice_lines
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id=tenant_invoice_lines.organization_id
      AND invoice.id=tenant_invoice_lines.invoice_id
      AND app_private.can_read_finance_property(invoice.organization_id,invoice.property_id)
  ));
CREATE POLICY tenant_invoice_payments_branch_select ON public.tenant_invoice_payments
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id=tenant_invoice_payments.organization_id
      AND invoice.id=tenant_invoice_payments.invoice_id
      AND app_private.can_read_finance_property(invoice.organization_id,invoice.property_id)
  ));
CREATE POLICY tenant_payment_allocations_branch_select ON public.tenant_invoice_payment_allocations
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.tenant_invoices AS invoice
    WHERE invoice.organization_id=tenant_invoice_payment_allocations.organization_id
      AND invoice.id=tenant_invoice_payment_allocations.invoice_id
      AND app_private.can_read_finance_property(invoice.organization_id,invoice.property_id)
  ));
CREATE POLICY owner_payment_allocations_branch_select ON public.owner_payment_allocations
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.owner_payments AS payment
    WHERE payment.organization_id=owner_payment_allocations.organization_id
      AND payment.id=owner_payment_allocations.owner_payment_id
      AND app_private.can_read_finance_property(payment.organization_id,payment.property_id)
  ));

CREATE POLICY tasks_branch_select ON public.tasks
  FOR SELECT TO authenticated USING(app_private.can_read_maintenance_task(organization_id,id));
CREATE POLICY tenant_requests_branch_select ON public.tenant_requests
  FOR SELECT TO authenticated USING(
    app_private.is_super_admin(organization_id)
    OR app_private.can_access_property(organization_id,property_id,'maintenance.view')
  );
CREATE POLICY maintenance_series_branch_select ON public.maintenance_recurrence_series
  FOR SELECT TO authenticated USING(
    app_private.is_super_admin(organization_id)
    OR (branch_id IS NOT NULL
      AND branch_id=app_private.current_active_branch_id(organization_id)
      AND app_private.has_org_permission(organization_id,'maintenance.view')
      AND branch_id=app_private.property_branch_id(organization_id,property_id))
  );
CREATE POLICY maintenance_revisions_branch_select ON public.maintenance_recurrence_revisions
  FOR SELECT TO authenticated USING(EXISTS(
    SELECT 1 FROM public.maintenance_recurrence_series AS series
    WHERE series.organization_id=maintenance_recurrence_revisions.organization_id
      AND series.id=maintenance_recurrence_revisions.series_id
      AND (app_private.is_super_admin(series.organization_id)
        OR (series.branch_id=app_private.current_active_branch_id(series.organization_id)
          AND app_private.has_org_permission(series.organization_id,'maintenance.view')
          AND series.branch_id=app_private.property_branch_id(series.organization_id,series.property_id)))
  ));

CREATE POLICY timeline_events_branch_select ON public.timeline_events
  FOR SELECT TO authenticated USING(
    app_private.is_super_admin(organization_id)
    OR (property_id IS NOT NULL AND CASE
      WHEN ledger_entry_id IS NOT NULL THEN
        app_private.can_access_property(organization_id,property_id,'finance.view')
      WHEN event_type IN ('Maintenance','Repair','Renovation','Inspection') THEN
        app_private.can_access_property(organization_id,property_id,'maintenance.view')
      WHEN lease_id IS NOT NULL OR event_type IN (
        'Lease Started','Lease Ended','Tenant Move In','Tenant Move Out','Rent Increase'
      ) THEN app_private.can_access_property(organization_id,property_id,'leases.view')
      ELSE app_private.can_access_property(organization_id,property_id,'properties.view')
    END)
  );

REVOKE ALL ON FUNCTION app_private.can_read_finance_property(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.can_read_finance_property(uuid,uuid)
  TO authenticated,service_role;
REVOKE ALL ON FUNCTION app_private.can_read_maintenance_task(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.can_read_maintenance_task(uuid,uuid)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_document(uuid,uuid,public.organization_permission_key)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_storage_object(text,text,public.organization_permission_key)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION app_private.can_access_storage_object(text,text,public.organization_permission_key,text)
  TO authenticated,service_role;

DO $migration$
DECLARE v_signature regprocedure;v_definition text;
  v_anchor text:=E'app_private.is_org_admin(p_organization_id)';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.stage_import_run_v1(uuid,text,text,bigint,text,jsonb,jsonb,jsonb)'::regprocedure,
    'public.commit_generic_import_run(uuid,uuid)'::regprocedure,
    'public.commit_unit_import_run(uuid,uuid)'::regprocedure
  ] LOOP
    SELECT pg_catalog.replace(pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n') INTO v_definition;
    IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
      RAISE EXCEPTION 'Unexpected import predecessor: %',v_signature;
    END IF;
    EXECUTE pg_catalog.replace(v_definition,v_anchor,'app_private.is_super_admin(p_organization_id)');
  END LOOP;
END;
$migration$;

DO $migration$
DECLARE v_table text;v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['import_runs','import_rows','import_mappings'] LOOP
    FOR v_policy IN SELECT policyname FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND tablename=v_table
    LOOP
      EXECUTE pg_catalog.format('DROP POLICY %I ON public.%I',v_policy.policyname,v_table);
    END LOOP;
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (app_private.is_super_admin(organization_id))',
      v_table||'_super_admin_select',v_table
    );
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION app_private.has_finance_branch_authority_context(
  p_organization_id uuid,
  p_permission_key public.organization_permission_key
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM app_private.finance_branch_authority_capability AS capability
    WHERE capability.singleton
      AND capability.capability_token=
        pg_catalog.current_setting('app.finance_branch_authority_token',true)
      AND p_organization_id::text=
        pg_catalog.current_setting('app.finance_branch_authority_org',true)
      AND p_permission_key::text=
        pg_catalog.current_setting('app.finance_branch_authority_permission',true)
      AND (
        app_private.current_active_branch_id(p_organization_id)::text=
          pg_catalog.current_setting('app.finance_branch_authority_branch',true)
        OR (
          EXISTS (
            SELECT 1
            FROM public.organization_authorization_states AS authorization_state
            WHERE authorization_state.organization_id=p_organization_id
              AND NOT authorization_state.ordinary_access_enabled
          )
          AND app_private.has_org_permission(
            p_organization_id,p_permission_key
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.has_maintenance_branch_authority_context(
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM app_private.maintenance_branch_authority_capability AS capability
    WHERE capability.singleton
      AND capability.capability_token=
        pg_catalog.current_setting('app.maintenance_branch_authority_token',true)
      AND p_organization_id::text=
        pg_catalog.current_setting('app.maintenance_branch_authority_org',true)
      AND (
        app_private.current_active_branch_id(p_organization_id)::text=
          pg_catalog.current_setting('app.maintenance_branch_authority_branch',true)
        OR EXISTS (
          SELECT 1
          FROM public.organization_authorization_states AS authorization_state
          WHERE authorization_state.organization_id=p_organization_id
            AND NOT authorization_state.ordinary_access_enabled
            AND (
              app_private.has_org_permission(
                p_organization_id,'maintenance.create_assign'
              )
              OR app_private.has_org_permission(
                p_organization_id,'maintenance.complete'
              )
              OR app_private.has_org_permission(
                p_organization_id,'maintenance.review'
              )
            )
        )
      )
  );
$$;

DO $migration$
DECLARE
  v_signature regprocedure :=
    'public.get_property_cash_events_page(uuid,uuid,public.currency_code,date,date,date,text,uuid,integer)'::regprocedure;
  v_definition text := pg_catalog.replace(
    pg_catalog.pg_get_functiondef(v_signature),E'\r\n',E'\n'
  );
  v_anchor text := E'  IF NOT app_private.can_read_finance(p_organization_id) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
  v_replacement text := E'  IF NOT app_private.can_read_finance_property(\n    p_organization_id,p_property_id\n  ) THEN\n    RAISE EXCEPTION ''Not authorized'' USING ERRCODE = ''42501'';\n  END IF;';
BEGIN
  IF pg_catalog.strpos(v_definition,v_anchor)=0 THEN
    RAISE EXCEPTION 'Unexpected property cash events predecessor: %',v_signature;
  END IF;
  EXECUTE pg_catalog.replace(v_definition,v_anchor,v_replacement);
END;
$migration$;
