-- Permit Super Admin self-approval only. Preserve the checked transaction
-- workflow, ordinary maker/checker separation, and self-rejection restriction.
DO $self_approval$
DECLARE
  v_definition text;
  v_old text := 'IF v_transaction.submitted_by = v_actor_id THEN';
  v_new text := 'IF v_transaction.submitted_by = v_actor_id
    AND NOT (v_decision = ''approve'' AND app_private.is_super_admin(p_organization_id)) THEN';
BEGIN
  v_definition := pg_catalog.pg_get_functiondef(
    'public.review_expense_transaction(uuid,uuid,text,text,text)'::regprocedure
  );
  IF (length(v_definition) - length(replace(v_definition, v_old, ''))) <> length(v_old) THEN
    RAISE EXCEPTION 'expense_transaction_self_approval_contract_changed';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$self_approval$;
