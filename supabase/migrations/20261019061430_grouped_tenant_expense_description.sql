-- Populate grouped tenant descriptions while creating the authoritative charge.
-- Do not update an approval-owned income row after its immutable guard engages.
DO $patch$
DECLARE d text; old_text text; new_text text;
BEGIN
 d:=replace(pg_get_functiondef('app_private.approve_expense_submission(uuid,uuid,uuid)'::regprocedure),E'\r\n',E'\n');
 old_text:=E'      v_customer_label,\n      v_submission.reference,\n      p_actor_id,\n      p_actor_id\n    )\n    RETURNING id INTO v_income_item_id;';
 new_text:=$new$      coalesce((SELECT line.description FROM public.expense_transaction_lines line
        WHERE line.organization_id=p_organization_id AND line.submission_id=v_submission.id
          AND app_private.has_expense_transaction_context(p_organization_id,line.transaction_id,'review')),v_customer_label),
      v_submission.reference,
      p_actor_id,
      p_actor_id
    )
    RETURNING id INTO v_income_item_id;$new$;
 IF (length(d)-length(replace(d,old_text,'')))<>length(old_text) THEN
   RAISE EXCEPTION 'tenant_expense_description_insert_contract_changed'; END IF;
 EXECUTE replace(d,old_text,new_text);
 d:=replace(pg_get_functiondef('public.review_expense_transaction(uuid,uuid,text,text,text)'::regprocedure),E'\r\n',E'\n');
 old_text:=$old$        UPDATE public.finance_income_items AS income
        SET description = v_line.description,
            updated_by = v_actor_id
        WHERE income.organization_id = p_organization_id
          AND income.id = (
            SELECT tenant_line.income_item_id
            FROM public.tenant_invoice_lines AS tenant_line
            WHERE tenant_line.organization_id = p_organization_id
              AND tenant_line.id = nullif(
                v_result->>'tenant_invoice_line_id',
                ''
              )::uuid
          );$old$;
 IF (length(d)-length(replace(d,old_text,'')))<>length(old_text) THEN
   RAISE EXCEPTION 'tenant_expense_description_update_contract_changed'; END IF;
 EXECUTE replace(d,old_text,'        -- Income description was set during authoritative charge creation.');
END;
$patch$;
