-- Maintenance keeps operational cost capture separate from Finance approval.
-- Operations submits an immutable task snapshot; Finance supplies the checked
-- funding source only when it approves the already-paid cost.

ALTER TABLE public.tasks
  ADD COLUMN actual_cost_date date,
  ADD COLUMN actual_cost_document_id uuid,
  ADD COLUMN actual_cost_reference text,
  ADD CONSTRAINT tasks_actual_cost_document_fkey
    FOREIGN KEY (actual_cost_document_id)
    REFERENCES public.documents(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tasks_actual_cost_details_check
    CHECK (
      actual_cost_amount IS NOT NULL
      OR (
        actual_cost_date IS NULL
        AND actual_cost_document_id IS NULL
        AND actual_cost_reference IS NULL
      )
    ),
  ADD CONSTRAINT tasks_actual_cost_reference_check
    CHECK (
      actual_cost_reference IS NULL
      OR length(trim(actual_cost_reference)) BETWEEN 1 AND 160
    );

ALTER TABLE public.expense_submissions
  ALTER COLUMN reconciliation_source_id DROP NOT NULL,
  ADD CONSTRAINT expense_submissions_funding_source_state_check
    CHECK (
      (
        source_type = 'general'
        AND reconciliation_source_id IS NOT NULL
      )
      OR (
        source_type = 'maintenance_task'
        AND (
          status IN ('submitted', 'rejected')
          OR reconciliation_source_id IS NOT NULL
        )
      )
    );

CREATE OR REPLACE FUNCTION app_private.guard_maintenance_cost_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.actual_cost_document_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.documents AS document
      WHERE document.id = NEW.actual_cost_document_id
        AND document.organization_id = NEW.organization_id
        AND document.task_id = NEW.id
        AND document.archived_at IS NULL
    ) THEN
    RAISE EXCEPTION 'Maintenance cost document must belong to this task'
      USING ERRCODE = '23503';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.ledger_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Direct maintenance cost posting is retired; submit the cost to Finance'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.ledger_entry_id IS DISTINCT FROM OLD.ledger_entry_id
      AND NEW.ledger_entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'Direct maintenance cost posting is retired; submit the cost to Finance'
        USING ERRCODE = '22023';
    END IF;

    IF (
      NEW.actual_cost_amount IS DISTINCT FROM OLD.actual_cost_amount
      OR NEW.actual_cost_currency IS DISTINCT FROM OLD.actual_cost_currency
      OR NEW.property_id IS DISTINCT FROM OLD.property_id
      OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
      OR NEW.actual_cost_date IS DISTINCT FROM OLD.actual_cost_date
      OR NEW.actual_cost_document_id IS DISTINCT FROM OLD.actual_cost_document_id
      OR NEW.actual_cost_reference IS DISTINCT FROM OLD.actual_cost_reference
      OR NEW.vendor_person_id IS DISTINCT FROM OLD.vendor_person_id
    ) AND EXISTS (
      SELECT 1
      FROM public.expense_submissions AS submission
      WHERE submission.organization_id = OLD.organization_id
        AND submission.source_type = 'maintenance_task'
        AND submission.source_id = OLD.id
        AND submission.status = 'submitted'
    ) THEN
      RAISE EXCEPTION 'Submitted maintenance cost fields are locked'
        USING ERRCODE = '22023';
    END IF;

    IF (
      NEW.actual_cost_currency IS DISTINCT FROM OLD.actual_cost_currency
      OR NEW.property_id IS DISTINCT FROM OLD.property_id
      OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
      OR NEW.vendor_person_id IS DISTINCT FROM OLD.vendor_person_id
    ) AND EXISTS (
      SELECT 1
      FROM public.expense_submissions AS submission
      WHERE submission.organization_id = OLD.organization_id
        AND submission.source_type = 'maintenance_task'
        AND submission.source_id = OLD.id
        AND submission.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Approved maintenance cost scope requires reversal before changing property, unit, currency, or vendor'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_maintenance_cost_statuses(
  p_organization_id uuid,
  p_task_ids uuid[]
)
RETURNS TABLE (
  task_id uuid,
  submission_id uuid,
  status text,
  review_reason text,
  submitted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_actor_role text := app_private.current_workspace_role(p_organization_id);
  v_actor_branch_id uuid := app_private.current_org_branch_id(p_organization_id);
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_actor_role NOT IN ('super_admin', 'operations_manager') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_actor_role = 'operations_manager' AND v_actor_branch_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(cardinality(p_task_ids), 0) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(p_task_ids) > 1000 THEN
    RAISE EXCEPTION 'Maintenance cost status query is limited to 1000 tasks'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (submission.source_id)
    submission.source_id,
    submission.id,
    submission.status,
    submission.review_reason,
    submission.submitted_at
  FROM public.expense_submissions AS submission
  JOIN public.tasks AS task
    ON task.organization_id = submission.organization_id
   AND task.id = submission.source_id
  WHERE submission.organization_id = p_organization_id
    AND submission.source_type = 'maintenance_task'
    AND submission.source_id = ANY(p_task_ids)
    AND (
      v_actor_role = 'super_admin'
      OR task.branch_id IS NOT DISTINCT FROM v_actor_branch_id
    )
  ORDER BY submission.source_id, submission.submitted_at DESC, submission.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_read_maintenance_task(
  p_organization_id uuid,
  p_task_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tasks AS task
    JOIN public.organization_members AS membership
      ON membership.organization_id = task.organization_id
     AND membership.user_id = (SELECT auth.uid())
    WHERE task.organization_id = p_organization_id
      AND task.id = p_task_id
      AND (
        membership.role = 'super_admin'
        OR (
          membership.role = 'operations_manager'
          AND membership.branch_id IS NOT NULL
          AND membership.branch_id IS NOT DISTINCT FROM task.branch_id
        )
        OR (
          membership.role = 'operations_member'
          AND membership.branch_id IS NOT NULL
          AND membership.person_id IS NOT NULL
          AND membership.branch_id IS NOT DISTINCT FROM task.branch_id
          AND membership.person_id = task.assignee_person_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_maintenance_task_documents(
  p_organization_id uuid,
  p_task_ids uuid[]
)
RETURNS TABLE (
  id uuid,
  task_id uuid,
  category text,
  file_name text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role text := app_private.current_workspace_role(p_organization_id);
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF v_actor_role NOT IN (
    'super_admin',
    'operations_manager',
    'operations_member'
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(cardinality(p_task_ids), 0) = 0 THEN
    RETURN;
  END IF;

  IF cardinality(p_task_ids) > 1000 THEN
    RAISE EXCEPTION 'Maintenance document query is limited to 1000 tasks'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    document.id,
    document.task_id,
    document.category,
    document.file_name,
    document.storage_path,
    document.mime_type,
    document.size_bytes,
    document.uploaded_at
  FROM public.documents AS document
  WHERE document.organization_id = p_organization_id
    AND document.task_id = ANY(p_task_ids)
    AND document.archived_at IS NULL
    AND app_private.storage_object_org_id(document.storage_path) =
      document.organization_id
    AND EXISTS (
      SELECT 1
      FROM storage.objects AS object
      WHERE object.bucket_id = 'nestory-documents'
        AND object.name = document.storage_path
    )
    AND app_private.can_read_maintenance_task(
      document.organization_id,
      document.task_id
    )
  ORDER BY document.uploaded_at DESC, document.id DESC;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.can_read_maintenance_evidence_object(
  p_storage_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents AS document
    WHERE document.storage_path = p_storage_path
      AND document.task_id IS NOT NULL
      AND document.archived_at IS NULL
      AND app_private.storage_object_org_id(document.storage_path) =
        document.organization_id
      AND app_private.can_read_maintenance_task(
        document.organization_id,
        document.task_id
      )
  );
$$;

REVOKE ALL ON FUNCTION app_private.can_read_maintenance_task(uuid, uuid)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_maintenance_task_documents(uuid, uuid[])
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_read_maintenance_evidence_object(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION app_private.can_read_maintenance_task(uuid, uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_maintenance_task_documents(uuid, uuid[])
TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_read_maintenance_evidence_object(text)
TO authenticated;

DROP POLICY IF EXISTS "Maintenance roles can read scoped task evidence"
ON storage.objects;
CREATE POLICY "Maintenance roles can read scoped task evidence"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'nestory-documents'
  AND app_private.can_read_maintenance_evidence_object(name)
);

COMMENT ON FUNCTION public.get_maintenance_task_documents(uuid, uuid[]) IS
  'Returns only active document metadata linked to maintenance tasks visible to the current workspace role.';

CREATE OR REPLACE FUNCTION app_private.is_expense_evidence_object_locked(
  p_storage_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_submissions AS submission
    JOIN public.documents AS document
      ON document.id = submission.supporting_document_id
    WHERE document.storage_path = p_storage_path
      AND app_private.storage_object_org_id(document.storage_path) =
        document.organization_id
  );
$$;

REVOKE ALL ON FUNCTION
  app_private.is_expense_evidence_object_locked(text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  app_private.is_expense_evidence_object_locked(text)
TO authenticated;

DROP POLICY IF EXISTS "Admins can update Nestory documents"
ON storage.objects;
CREATE POLICY "Admins can update Nestory documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
  AND NOT app_private.is_expense_evidence_object_locked(name)
)
WITH CHECK (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
  AND NOT app_private.is_expense_evidence_object_locked(name)
);

DROP POLICY IF EXISTS "Admins can delete Nestory documents"
ON storage.objects;
CREATE POLICY "Admins can delete Nestory documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'nestory-documents'
  AND app_private.is_org_admin(app_private.storage_object_org_id(name))
  AND NOT app_private.is_expense_evidence_object_locked(name)
);

CREATE OR REPLACE FUNCTION app_private.guard_document_storage_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path THEN
    RETURN NEW;
  END IF;

  IF app_private.storage_object_org_id(NEW.storage_path) IS DISTINCT FROM
    NEW.organization_id THEN
    RAISE EXCEPTION 'Document storage path must belong to its organization'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_document_storage_organization
BEFORE INSERT OR UPDATE OF organization_id, storage_path
ON public.documents
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_document_storage_organization();

REVOKE ALL ON FUNCTION app_private.guard_document_storage_organization()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.guard_expense_evidence_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expense_submissions AS submission
    WHERE submission.supporting_document_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Expense submission evidence is immutable'
      USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_expense_evidence_document
BEFORE UPDATE OR DELETE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_expense_evidence_document();

REVOKE ALL ON FUNCTION app_private.guard_expense_evidence_document()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER guard_maintenance_cost_fields
BEFORE INSERT OR UPDATE OF
  actual_cost_amount,
  actual_cost_currency,
  property_id,
  unit_id,
  actual_cost_date,
  actual_cost_document_id,
  actual_cost_reference,
  vendor_person_id,
  ledger_entry_id
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_maintenance_cost_fields();

REVOKE ALL ON FUNCTION app_private.guard_maintenance_cost_fields()
FROM PUBLIC, anon, authenticated, service_role;

-- Keep the existing checked maintenance-update contract for compatibility,
-- but permanently force the retired direct-Ledger flag off.
CREATE OR REPLACE FUNCTION public.update_maintenance_task(
  p_task_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_unit_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_priority text,
  p_status text,
  p_due_date date,
  p_due_time time,
  p_reminder_date date,
  p_reminder_time time,
  p_vendor_person_id uuid,
  p_cost_estimate_amount numeric,
  p_cost_estimate_currency public.currency_code,
  p_actual_cost_amount numeric,
  p_actual_cost_currency public.currency_code,
  p_checklist jsonb,
  p_recurrence_frequency text,
  p_link_actual_cost_to_ledger boolean,
  p_branch_id uuid DEFAULT NULL,
  p_assignee_person_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text := app_private.current_org_role(p_organization_id);
  old_task public.tasks%ROWTYPE;
  normalized_status text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_link_actual_cost_to_ledger, false) THEN
    RAISE EXCEPTION 'Direct maintenance cost posting is retired; submit the cost to Finance'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO old_task
  FROM public.tasks
  WHERE id = p_task_id
    AND organization_id = p_organization_id
    AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance task not found' USING ERRCODE = '23503';
  END IF;

  IF normalized_status IS DISTINCT FROM old_task.status THEN
    IF old_task.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Terminal maintenance tasks cannot change status'
        USING ERRCODE = '22023';
    ELSIF normalized_status = 'ready_for_review' THEN
      RAISE EXCEPTION 'Use the member execution RPC to submit work for review'
        USING ERRCODE = '22023';
    ELSIF normalized_status = 'completed' THEN
      RAISE EXCEPTION 'Use the completion review RPC to complete submitted work'
        USING ERRCODE = '22023';
    ELSIF old_task.status = 'ready_for_review' THEN
      RAISE EXCEPTION 'Use the completion review RPC for submitted work'
        USING ERRCODE = '22023';
    ELSIF normalized_status = 'cancelled' THEN
      NULL;
    ELSIF NOT (
      (old_task.status = 'pending' AND normalized_status = 'scheduled')
      OR (old_task.status = 'scheduled' AND normalized_status = 'pending')
    ) THEN
      RAISE EXCEPTION 'Use the assigned-member or coordinated execution RPC for execution status changes'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_assignee_person_id IS NOT NULL
    AND (
      p_assignee_person_id IS DISTINCT FROM old_task.assignee_person_id
      OR p_branch_id IS DISTINCT FROM old_task.branch_id
    )
    AND NOT app_private.is_executable_maintenance_assignee(
      p_organization_id,
      p_branch_id,
      p_assignee_person_id
    ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.people AS person
      JOIN public.person_roles AS person_role
        ON person_role.organization_id = person.organization_id
       AND person_role.person_id = person.id
       AND person_role.role = 'staff'
       AND person_role.status = 'active'
       AND person_role.archived_at IS NULL
      WHERE person.organization_id = p_organization_id
        AND person.id = p_assignee_person_id
        AND person.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Assignee not found' USING ERRCODE = '23503';
    END IF;

    RAISE EXCEPTION 'Assignee must be an executable linked member for the selected branch'
      USING ERRCODE = '23503';
  END IF;

  RETURN app_private.update_maintenance_task_legacy_checked(
    p_task_id,
    p_organization_id,
    p_property_id,
    p_unit_id,
    p_title,
    p_description,
    p_category,
    p_priority,
    p_status,
    p_due_date,
    p_due_time,
    p_reminder_date,
    p_reminder_time,
    p_vendor_person_id,
    p_cost_estimate_amount,
    p_cost_estimate_currency,
    p_actual_cost_amount,
    p_actual_cost_currency,
    p_checklist,
    p_recurrence_frequency,
    false,
    p_branch_id,
    p_assignee_person_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_maintenance_cost(
  p_organization_id uuid,
  p_task_id uuid,
  p_expense_date date,
  p_supporting_document_id uuid,
  p_reference text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_actor_role text := app_private.current_workspace_role(p_organization_id);
  v_actor_branch_id uuid := app_private.current_org_branch_id(p_organization_id);
  v_reference text := NULLIF(trim(coalesce(p_reference, '')), '');
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_task public.tasks%ROWTYPE;
  v_vendor_label text;
  v_payload jsonb;
  v_payload_hash text;
  v_approved_total numeric(14, 2) := 0;
  v_submission_amount numeric(14, 2);
  v_adjusts_submission_id uuid;
  v_request_id uuid;
  v_is_replay boolean;
  v_replay_result jsonb;
  v_submission_id uuid;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT app_private.can_manage_operations(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Choose the maintenance cost date'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'Idempotency key must contain between 8 and 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_reference IS NOT NULL AND length(v_reference) > 160 THEN
    RAISE EXCEPTION 'Reference must contain at most 160 characters'
      USING ERRCODE = '22023';
  END IF;

  IF p_supporting_document_id IS NULL AND v_reference IS NULL THEN
    RAISE EXCEPTION 'Add a supporting document or receipt reference'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        ':',
        'maintenance_cost_workflow_v1',
        p_organization_id,
        p_task_id
      ),
      0
    )
  );

  SELECT task.*
  INTO v_task
  FROM public.tasks AS task
  WHERE task.organization_id = p_organization_id
    AND task.id = p_task_id
    AND task.archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Maintenance task not found' USING ERRCODE = '23503';
  END IF;

  IF v_actor_role = 'operations_manager'
    AND v_task.branch_id IS DISTINCT FROM v_actor_branch_id THEN
    RAISE EXCEPTION 'Not authorized for this maintenance task'
      USING ERRCODE = '42501';
  END IF;

  IF v_task.actual_cost_amount IS NULL
    OR v_task.actual_cost_currency IS NULL
    OR v_task.actual_cost_amount <= 0
    OR v_task.actual_cost_amount <> round(v_task.actual_cost_amount, 2) THEN
    RAISE EXCEPTION 'Record an exact positive actual cost before submission'
      USING ERRCODE = '22023';
  END IF;

  IF v_task.ledger_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Historical Ledger-linked maintenance cost requires Super Admin reconciliation before Finance submission'
      USING ERRCODE = '22023';
  END IF;

  IF v_task.vendor_person_id IS NULL THEN
    RAISE EXCEPTION 'Choose the maintenance vendor before submission'
      USING ERRCODE = '22023';
  END IF;

  SELECT person.display_name
  INTO v_vendor_label
  FROM public.people AS person
  JOIN public.person_roles AS person_role
    ON person_role.organization_id = person.organization_id
   AND person_role.person_id = person.id
   AND person_role.role = 'vendor'
   AND person_role.status = 'active'
   AND person_role.archived_at IS NULL
  WHERE person.organization_id = p_organization_id
    AND person.id = v_task.vendor_person_id
    AND person.archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active maintenance vendor before submission'
      USING ERRCODE = '23503';
  END IF;

  IF p_supporting_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.documents AS document
    WHERE document.organization_id = p_organization_id
      AND document.id = p_supporting_document_id
      AND document.task_id = p_task_id
      AND document.archived_at IS NULL
      AND app_private.storage_object_org_id(document.storage_path) =
        document.organization_id
      AND EXISTS (
        SELECT 1
        FROM storage.objects AS object
        WHERE object.bucket_id = 'nestory-documents'
          AND object.name = document.storage_path
      )
  ) THEN
    RAISE EXCEPTION 'Maintenance cost document must belong to this task'
      USING ERRCODE = '23503';
  END IF;

  PERFORM app_private.resolve_property_owner(
    p_organization_id,
    v_task.property_id,
    p_expense_date
  );

  IF EXISTS (
    SELECT 1
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = p_organization_id
      AND submission.source_type = 'maintenance_task'
      AND submission.source_id = p_task_id
      AND submission.status = 'approved'
      AND (
        submission.property_id IS DISTINCT FROM v_task.property_id
        OR submission.unit_id IS DISTINCT FROM v_task.unit_id
        OR submission.currency IS DISTINCT FROM v_task.actual_cost_currency
        OR submission.vendor_person_id IS DISTINCT FROM v_task.vendor_person_id
      )
  ) THEN
    RAISE EXCEPTION 'Approved maintenance cost scope changed; reverse it before submitting an adjustment'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    coalesce(sum(submission.internal_cost_amount), 0)::numeric(14, 2)
  INTO v_approved_total
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.source_type = 'maintenance_task'
    AND submission.source_id = p_task_id
    AND submission.status = 'approved';

  SELECT submission.id
  INTO v_adjusts_submission_id
  FROM public.expense_submissions AS submission
  WHERE submission.organization_id = p_organization_id
    AND submission.source_type = 'maintenance_task'
    AND submission.source_id = p_task_id
    AND submission.status = 'approved'
  ORDER BY submission.reviewed_at DESC, submission.submitted_at DESC,
    submission.id DESC
  LIMIT 1;

  v_submission_amount :=
    (v_task.actual_cost_amount - v_approved_total)::numeric(14, 2);

  IF v_approved_total > 0 AND v_submission_amount <= 0 THEN
    RAISE EXCEPTION 'Reduced or unchanged approved maintenance cost must be reversed before resubmission'
      USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'property_id', v_task.property_id,
    'unit_id', v_task.unit_id,
    'source_type', 'maintenance_task',
    'source_id', v_task.id,
    'customer_category', 'repairs_maintenance',
    'vendor_label', v_vendor_label,
    'expense_date', p_expense_date,
    'internal_cost_amount', v_submission_amount,
    'recorded_total_amount', v_task.actual_cost_amount,
    'previously_approved_amount', v_approved_total,
    'adjusts_submission_id', v_adjusts_submission_id,
    'internal_markup_amount', 0,
    'currency', v_task.actual_cost_currency,
    'responsibility', 'owner',
    'tenant_invoice_id', NULL,
    'reconciliation_source_id', NULL,
    'supporting_document_id', p_supporting_document_id,
    'vendor_person_id', v_task.vendor_person_id,
    'reference', v_reference
  );

  v_replay_result := app_private.get_financial_idempotency_replay(
    p_organization_id,
    'submit_maintenance_cost',
    v_idempotency_key,
    v_actor_id,
    v_payload
  );

  IF v_replay_result IS NOT NULL THEN
    RETURN v_replay_result;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expense_submissions AS submission
    WHERE submission.organization_id = p_organization_id
      AND submission.source_type = 'maintenance_task'
      AND submission.source_id = p_task_id
      AND submission.status = 'submitted'
  ) THEN
    RAISE EXCEPTION 'This maintenance cost is already awaiting Finance review'
      USING ERRCODE = '22023';
  END IF;

  v_payload_hash :=
    app_private.canonical_financial_payload_hash(v_payload);

  SELECT claim.request_id, claim.is_replay, claim.result_ids
  INTO STRICT v_request_id, v_is_replay, v_replay_result
  FROM app_private.claim_financial_idempotency(
    p_organization_id,
    'submit_maintenance_cost',
    v_idempotency_key,
    v_actor_id,
    v_payload
  ) AS claim;

  IF v_is_replay THEN
    RETURN v_replay_result;
  END IF;

  UPDATE public.tasks
  SET actual_cost_date = p_expense_date,
      actual_cost_document_id = p_supporting_document_id,
      actual_cost_reference = v_reference,
      updated_by = v_actor_id
  WHERE organization_id = p_organization_id
    AND id = p_task_id;

  INSERT INTO public.expense_submissions (
    organization_id,
    property_id,
    unit_id,
    source_type,
    source_id,
    adjusts_submission_id,
    customer_category,
    vendor_label,
    expense_date,
    internal_cost_amount,
    internal_markup_amount,
    recorded_total_amount,
    previously_approved_amount,
    currency,
    responsibility,
    tenant_invoice_id,
    reconciliation_source_id,
    supporting_document_id,
    vendor_person_id,
    reference,
    idempotency_key,
    request_payload_hash,
    submitted_by
  )
  VALUES (
    p_organization_id,
    v_task.property_id,
    v_task.unit_id,
    'maintenance_task',
    v_task.id,
    v_adjusts_submission_id,
    'repairs_maintenance',
    v_vendor_label,
    p_expense_date,
    v_submission_amount,
    0,
    v_task.actual_cost_amount,
    v_approved_total,
    v_task.actual_cost_currency,
    'owner',
    NULL,
    NULL,
    p_supporting_document_id,
    v_task.vendor_person_id,
    v_reference,
    v_idempotency_key,
    v_payload_hash,
    v_actor_id
  )
  RETURNING id INTO v_submission_id;

  INSERT INTO public.activity_logs (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    new_values
  )
  VALUES
    (
      p_organization_id,
      v_actor_id,
      'expense_submission',
      v_submission_id,
      'submitted',
      v_payload
    ),
    (
      p_organization_id,
      v_actor_id,
      'task',
      p_task_id,
      CASE
        WHEN v_adjusts_submission_id IS NULL
          THEN 'cost_submitted_to_finance'
        ELSE 'cost_adjustment_submitted_to_finance'
      END,
      jsonb_build_object(
        'submission_id', v_submission_id,
        'adjusts_submission_id', v_adjusts_submission_id,
        'expense_date', p_expense_date,
        'amount', v_submission_amount,
        'recorded_total_amount', v_task.actual_cost_amount,
        'currency', v_task.actual_cost_currency
      )
    );

  v_result := jsonb_build_object(
    'submission_id', v_submission_id,
    'status', 'submitted'
  );

  RETURN app_private.complete_financial_idempotency(
    v_request_id,
    p_organization_id,
    v_actor_id,
    v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_maintenance_cost(
  uuid, uuid, date, uuid, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_maintenance_cost_statuses(
  uuid, uuid[]
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_expense(
  uuid, uuid, text, text, text, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_maintenance_cost(
  uuid, uuid, date, uuid, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_maintenance_cost_statuses(
  uuid, uuid[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_expense(
  uuid, uuid, text, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.submit_maintenance_cost(
  uuid, uuid, date, uuid, text, text
) IS
  'Operations Manager or Super Admin snapshots recorded maintenance cost into Finance review without financial effects.';
COMMENT ON FUNCTION public.get_maintenance_cost_statuses(
  uuid, uuid[]
) IS
  'Returns only branch-scoped maintenance task cost status, safe review reason, and submission time to Operations.';
COMMENT ON FUNCTION public.review_expense(
  uuid, uuid, text, text, text, uuid
) IS
  'Finance Manager or Super Admin reviews one expense; maintenance approval also selects its checked funding source.';
