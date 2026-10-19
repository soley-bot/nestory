-- Preserve the legacy source; corrections create a separately audited transaction.
CREATE TABLE public.expense_legacy_replacements (
 organization_id uuid NOT NULL,
 submission_id uuid NOT NULL,
 transaction_id uuid NOT NULL,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
 idempotency_key text NOT NULL,
 payload_hash text NOT NULL,
 PRIMARY KEY (organization_id,submission_id),
 UNIQUE (organization_id,transaction_id),
 FOREIGN KEY (organization_id,submission_id) REFERENCES public.expense_submissions(organization_id,id),
 FOREIGN KEY (organization_id,transaction_id) REFERENCES public.expense_transactions(organization_id,id)
);
ALTER TABLE public.expense_legacy_replacements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expense_legacy_replacements FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.expense_legacy_replacements TO authenticated;
CREATE POLICY "Read accessible legacy replacement history" ON public.expense_legacy_replacements
 FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.expense_submissions s WHERE s.organization_id=expense_legacy_replacements.organization_id AND s.id=expense_legacy_replacements.submission_id)
 AND app_private.can_read_expense_transaction(organization_id,transaction_id));
CREATE FUNCTION app_private.guard_legacy_expense_replacement() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Legacy expense replacement history is immutable' USING ERRCODE='55000';
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_legacy_expense_replacement() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_legacy_expense_replacement BEFORE UPDATE OR DELETE ON public.expense_legacy_replacements
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_legacy_expense_replacement();

CREATE FUNCTION public.replace_legacy_expense_submission(
 p_organization_id uuid,p_submission_id uuid,p_reason text,p_reversal_date date,
 p_payee_person_id uuid,p_external_payee_label text,p_expense_date date,
 p_currency public.currency_code,p_pay_from_account_id uuid,p_reference text,
 p_supporting_document_id uuid,p_responsibility text,p_lines jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_actor uuid := (SELECT auth.uid());
 v_original public.expense_submissions%ROWTYPE;
 v_link public.expense_legacy_replacements%ROWTYPE;
 v_key text := btrim(coalesce(p_idempotency_key,''));
 v_reason text := btrim(coalesce(p_reason,''));
 v_hash text;
 v_result jsonb;
 v_id uuid;
 v_line jsonb;
 v_before jsonb;
 v_after jsonb;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
 IF NOT app_private.can_reverse_expense(p_organization_id) OR NOT (
 app_private.is_super_admin(p_organization_id) OR app_private.has_org_permission(p_organization_id,'finance.submit_expenses')) THEN
 RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_submission_id IS NULL OR p_reversal_date IS NULL OR length(v_reason) NOT BETWEEN 3 AND 500
 OR length(v_key) NOT BETWEEN 8 AND 160 THEN
 RAISE EXCEPTION 'Legacy expense correction request is invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_original FROM public.expense_submissions WHERE organization_id=p_organization_id AND id=p_submission_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expense submission not found' USING ERRCODE='23503'; END IF;
 PERFORM app_private.assert_property_permission(p_organization_id,v_original.property_id,'finance.submit_expenses');
 PERFORM app_private.assert_property_permission(p_organization_id,v_original.property_id,'finance.correct_records');
 PERFORM app_private.assert_property_permission(p_organization_id,v_original.property_id,'finance.approve_expenses');
 IF v_original.source_type <> 'general' OR EXISTS (SELECT 1 FROM public.expense_transaction_lines WHERE organization_id=p_organization_id AND submission_id=p_submission_id) THEN
 RAISE EXCEPTION 'Use the original maintenance or complete transaction workflow' USING ERRCODE='22023'; END IF;
 v_hash := app_private.canonical_financial_payload_hash(jsonb_build_object(
 'submission',p_submission_id,'reason',v_reason,'reversal_date',p_reversal_date,'payee',p_payee_person_id,
 'label',p_external_payee_label,'date',p_expense_date,'currency',p_currency,'account',p_pay_from_account_id,
 'reference',p_reference,'document',p_supporting_document_id,'responsibility',p_responsibility,'lines',p_lines));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(concat_ws(':','legacy_expense_correction_v1',p_organization_id,p_submission_id),0));
 SELECT * INTO v_link FROM public.expense_legacy_replacements WHERE organization_id=p_organization_id AND submission_id=p_submission_id;
 IF FOUND THEN
 IF v_link.created_by=v_actor AND v_link.idempotency_key=v_key AND v_link.payload_hash=v_hash THEN
 RETURN jsonb_build_object('transaction_id',v_link.transaction_id,'replaces_submission_id',p_submission_id,
 'status',(SELECT status FROM public.expense_transactions WHERE organization_id=p_organization_id AND id=v_link.transaction_id));
 END IF;
 RAISE EXCEPTION 'Conflicting legacy expense correction request' USING ERRCODE='22023'; END IF;
 IF v_original.status <> 'approved' THEN RAISE EXCEPTION 'Only an approved legacy expense can be corrected' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) <> 1 THEN
 RAISE EXCEPTION 'A legacy correction requires exactly one expense line' USING ERRCODE='22023'; END IF;
 v_line := p_lines->0;
 IF p_currency IS DISTINCT FROM v_original.currency OR p_responsibility IS DISTINCT FROM v_original.responsibility
 OR (v_line->>'property_id')::uuid IS DISTINCT FROM v_original.property_id
 OR nullif(v_line->>'unit_id','')::uuid IS DISTINCT FROM v_original.unit_id
 OR nullif(v_line->>'tenant_invoice_id','')::uuid IS DISTINCT FROM v_original.tenant_invoice_id THEN
 RAISE EXCEPTION 'Keep the original expense property, unit, currency and customer attribution' USING ERRCODE='22023'; END IF;
 IF v_original.supporting_document_id IS NOT NULL AND (p_supporting_document_id IS NULL OR p_supporting_document_id=v_original.supporting_document_id) THEN
 RAISE EXCEPTION 'Upload a new receipt for the replacement; the original receipt remains in its history' USING ERRCODE='22023'; END IF;
 -- Existing reversal preserves exact payment and customer allocations and rejects
 -- settled customer charges. No parent-row lock is acquired ahead of its locks.
 PERFORM public.reverse_expense(p_organization_id,p_submission_id,p_reversal_date,v_reason,'legacy-correction:'||p_submission_id::text);
 v_result := public.submit_expense_transaction(p_organization_id,p_payee_person_id,p_external_payee_label,p_expense_date,
 p_currency,p_pay_from_account_id,p_reference,p_supporting_document_id,p_responsibility,p_lines,'legacy-replacement:'||gen_random_uuid()::text);
 v_id := (v_result->>'transaction_id')::uuid;
 v_result := public.review_expense_transaction(p_organization_id,v_id,'approve',v_reason,'legacy-correction-approve:'||v_id::text);
 INSERT INTO public.expense_legacy_replacements(organization_id,submission_id,transaction_id,created_by,reason,idempotency_key,payload_hash)
 VALUES(p_organization_id,p_submission_id,v_id,v_actor,v_reason,v_key,v_hash);
 v_before := jsonb_build_object('expense',to_jsonb(v_original)||jsonb_build_object('payee_label',v_original.vendor_label),
 'lines',jsonb_build_array(to_jsonb(v_original)||jsonb_build_object('amount',v_original.internal_cost_amount,
 'customer_total',v_original.customer_total_amount,'description',coalesce(v_original.reference,v_original.customer_category))));
 v_after := jsonb_build_object('reason',v_reason,'replacement_transaction_id',v_id,'replaces_submission_id',p_submission_id,
 'expense',(SELECT to_jsonb(t) FROM public.expense_transactions t WHERE t.organization_id=p_organization_id AND t.id=v_id),
 'lines',(SELECT jsonb_agg(to_jsonb(l)||jsonb_build_object('amount',s.internal_cost_amount,'customer_total',s.customer_total_amount,
 'property_id',s.property_id,'unit_id',s.unit_id,'tenant_invoice_id',s.tenant_invoice_id) ORDER BY l.sort_order)
 FROM public.expense_transaction_lines l JOIN public.expense_submissions s ON s.organization_id=l.organization_id AND s.id=l.submission_id
 WHERE l.organization_id=p_organization_id AND l.transaction_id=v_id));
 INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,previous_values,new_values)
 VALUES(p_organization_id,v_actor,'expense_submission',p_submission_id,'corrected',v_before,v_after);
 INSERT INTO public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,new_values)
 VALUES(p_organization_id,v_actor,'expense_transaction',v_id,'created',v_after);
 RETURN v_result||jsonb_build_object('replaces_submission_id',p_submission_id);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_legacy_expense_submission(uuid,uuid,text,date,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.replace_legacy_expense_submission(uuid,uuid,text,date,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text) TO authenticated;

-- Every descendant retains the legacy origin, not just the first replacement.
CREATE OR REPLACE FUNCTION public.get_expense_transaction_history(p_organization_id uuid,p_transaction_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ids uuid[]; v_property uuid; v_result jsonb; v_legacy_ids uuid[];
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
 IF NOT app_private.can_read_expense_transaction(p_organization_id,p_transaction_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 WITH RECURSIVE versions AS (
 SELECT id,replaces_transaction_id,replacement_transaction_id FROM public.expense_transactions WHERE organization_id=p_organization_id AND id=p_transaction_id
 UNION
 SELECT t.id,t.replaces_transaction_id,t.replacement_transaction_id FROM public.expense_transactions t JOIN versions v ON t.id IN(v.replaces_transaction_id,v.replacement_transaction_id) WHERE t.organization_id=p_organization_id
 ) SELECT array_agg(id) INTO v_ids FROM versions;
 IF v_ids IS NULL THEN RAISE EXCEPTION 'Expense transaction not found' USING ERRCODE='23503'; END IF;
 FOR v_property IN SELECT DISTINCT property_id FROM public.expense_transaction_scopes WHERE organization_id=p_organization_id AND transaction_id=ANY(v_ids)
 LOOP PERFORM app_private.assert_property_permission(p_organization_id,v_property,'finance.view'); END LOOP;
 SELECT array_agg(submission_id) INTO v_legacy_ids FROM public.expense_legacy_replacements WHERE organization_id=p_organization_id AND transaction_id=ANY(v_ids);
 FOR v_property IN SELECT DISTINCT property_id FROM public.expense_submissions WHERE organization_id=p_organization_id AND id=ANY(v_legacy_ids)
 LOOP PERFORM app_private.assert_property_permission(p_organization_id,v_property,'finance.view'); END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(history) ORDER BY history.created_at DESC,history.id),'[]'::jsonb) INTO v_result FROM (
 SELECT id,actor_id,action,created_at,previous_values,new_values FROM public.activity_logs WHERE organization_id=p_organization_id
 AND ((entity_type='expense_transaction' AND entity_id=ANY(v_ids)) OR (entity_type='expense_submission' AND entity_id=ANY(v_legacy_ids)))
 ORDER BY created_at DESC,id LIMIT 100) history;
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_legacy_expense_history(p_organization_id uuid,p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_property uuid; v_transaction uuid; v_result jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='28000'; END IF;
 SELECT property_id INTO v_property FROM public.expense_submissions WHERE organization_id=p_organization_id AND id=p_submission_id;
 IF v_property IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 PERFORM app_private.assert_property_permission(p_organization_id,v_property,'finance.view');
 SELECT transaction_id INTO v_transaction FROM public.expense_legacy_replacements WHERE organization_id=p_organization_id AND submission_id=p_submission_id;
 IF v_transaction IS NOT NULL THEN RETURN public.get_expense_transaction_history(p_organization_id,v_transaction); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(history) ORDER BY history.created_at DESC,history.id),'[]'::jsonb) INTO v_result FROM (
 SELECT id,actor_id,action,created_at,previous_values,new_values FROM public.activity_logs WHERE organization_id=p_organization_id AND entity_type='expense_submission' AND entity_id=p_submission_id
 ORDER BY created_at DESC,id LIMIT 100) history;
 RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_legacy_expense_history(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_legacy_expense_history(uuid,uuid) TO authenticated;



