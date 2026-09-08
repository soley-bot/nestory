-- Reject direct child commands before legacy entry points acquire a child row
-- or financial lock. The row trigger remains independent defense in depth.
CREATE FUNCTION app_private.assert_expense_transaction_child_command(
  p_organization_id uuid, p_submission_id uuid, p_operation text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transaction_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT line.transaction_id INTO v_transaction_id
  FROM public.expense_transaction_lines AS line
  WHERE line.organization_id = p_organization_id
    AND line.submission_id = p_submission_id;
  IF v_transaction_id IS NOT NULL AND NOT app_private.has_expense_transaction_context(
    p_organization_id, v_transaction_id, p_operation
  ) THEN
    RAISE EXCEPTION 'Review or reverse the complete expense transaction'
      USING ERRCODE = '42501', DETAIL = 'expense_transaction_parent_required';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.assert_expense_transaction_child_command(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $guard_transaction_child_entry$
DECLARE
  v_target record;
  v_definition text;
  v_marker text := E'\nBEGIN\n';
  v_position integer;
BEGIN
  FOR v_target IN SELECT * FROM (VALUES
    ('public.review_expense(uuid,uuid,text,text,text,uuid)', 'review'),
    ('public.review_expense_with_account(uuid,uuid,text,text,text,uuid)', 'review'),
    ('public.reverse_expense(uuid,uuid,date,text,text)', 'reverse')
  ) AS target(signature, operation)
  LOOP
    SELECT pg_catalog.pg_get_functiondef(v_target.signature::regprocedure) INTO v_definition;
    v_definition := replace(v_definition, E'\r\n', E'\n');
    v_position := strpos(v_definition, v_marker);
    IF v_position = 0 OR strpos(v_definition, 'assert_expense_transaction_child_command') > 0 THEN
      RAISE EXCEPTION 'expense_transaction_child_entry_contract_changed: %', v_target.signature;
    END IF;
    v_definition := overlay(v_definition PLACING
      v_marker || format(E'  PERFORM app_private.assert_expense_transaction_child_command(\n    p_organization_id, p_submission_id, %L\n  );\n', v_target.operation)
      FROM v_position FOR length(v_marker));
    EXECUTE v_definition;
  END LOOP;
END;
$guard_transaction_child_entry$;

CREATE OR REPLACE FUNCTION app_private.guard_paid_cost_approval_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'approved'
    AND OLD.status IS DISTINCT FROM 'approved'
    AND (
      NEW.supporting_document_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.documents AS document
        JOIN app_private.paid_cost_evidence_registrations AS registration
          ON registration.document_id = document.id
         AND registration.organization_id = document.organization_id
        WHERE document.organization_id = NEW.organization_id
          AND (
            document.property_id = NEW.property_id
            OR (
              NEW.source_type = 'general'
              AND app_private.expense_transaction_evidence_covers_property(
                NEW.organization_id, NEW.property_id, document.id
              )
            )
          )
          AND document.id = NEW.supporting_document_id
          AND document.archived_at IS NULL
          AND (
            NEW.source_type <> 'maintenance_task'
            OR document.task_id = NEW.source_id
          )
      )
    ) THEN
    RAISE EXCEPTION 'Paid cost approval requires exclusive registered evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_paid_cost_approval_evidence()
  FROM PUBLIC, anon, authenticated, service_role;
