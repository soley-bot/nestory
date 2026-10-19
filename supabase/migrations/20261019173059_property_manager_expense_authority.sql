-- Operation-scoped private authority. No existing permission helper is broadened.
CREATE TABLE app_private.expense_operation_authority (
 xid bigint NOT NULL, actor uuid NOT NULL, organization_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('post','correct')),
 source_kind text CHECK(source_kind IN ('transaction','submission')),
 source_id uuid, target_id uuid, phase text NOT NULL CHECK(phase IN ('prepare','reverse','review')),
 properties uuid[] NOT NULL,
 PRIMARY KEY(xid,actor,organization_id)
);
REVOKE ALL ON app_private.expense_operation_authority FROM PUBLIC,anon,authenticated,service_role;

-- Unlike has_org_permission, explicit opt-in must never short-circuit for SA
-- or legacy roles, and must respect the ordinary-access transition gate.
CREATE FUNCTION app_private.has_explicit_expense_permission(p_org uuid,p_property uuid,p_key public.organization_permission_key)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_key IN ('finance.post_expenses','finance.correct_expenses') AND EXISTS (
 SELECT 1 FROM public.organization_members m
 JOIN public.organization_authorization_states a ON a.organization_id=m.organization_id AND a.ordinary_access_enabled
 JOIN public.organization_branches b ON b.organization_id=m.organization_id AND b.id=m.branch_id AND b.status='active' AND b.archived_at IS NULL
 JOIN public.organization_roles r ON r.organization_id=m.organization_id AND r.id=m.custom_role_id AND r.status='active' AND r.archived_at IS NULL
 JOIN public.organization_role_permissions rp ON rp.organization_id=r.organization_id AND rp.role_id=r.id AND rp.permission_key=p_key
 JOIN public.properties p ON p.organization_id=m.organization_id AND p.id=p_property AND p.branch_id=m.branch_id AND p.archived_at IS NULL
 WHERE m.organization_id=p_org AND m.user_id=auth.uid() AND m.role='custom');
$$;

CREATE FUNCTION app_private.expense_operation_parent(p_org uuid,p_parent uuid,p_phase text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_parent IS NOT NULL AND EXISTS (
 SELECT 1 FROM app_private.expense_operation_authority c WHERE c.xid=txid_current()
 AND c.actor=auth.uid() AND c.organization_id=p_org AND c.target_id=p_parent AND c.phase=p_phase
 AND ((p_phase='reverse' AND c.operation='correct' AND c.source_kind='transaction' AND c.source_id=p_parent) OR p_phase='review')
 AND NOT EXISTS(SELECT 1 FROM public.expense_transaction_scopes s WHERE s.organization_id=p_org AND s.transaction_id=p_parent
 AND (NOT s.property_id=ANY(c.properties) OR NOT app_private.has_explicit_expense_permission(p_org,s.property_id,
 CASE c.operation WHEN 'post' THEN 'finance.post_expenses'::public.organization_permission_key ELSE 'finance.correct_expenses'::public.organization_permission_key END)))
 AND EXISTS(SELECT 1 FROM public.expense_transaction_scopes s WHERE s.organization_id=p_org AND s.transaction_id=p_parent));
$$;
CREATE FUNCTION app_private.expense_operation_submission(p_org uuid,p_submission uuid,p_phase text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_submission IS NOT NULL AND (
 EXISTS(SELECT 1 FROM public.expense_transaction_lines l WHERE l.organization_id=p_org AND l.submission_id=p_submission
 AND app_private.expense_operation_parent(p_org,l.transaction_id,p_phase))
 OR EXISTS(SELECT 1 FROM app_private.expense_operation_authority c JOIN public.expense_submissions s
 ON s.organization_id=c.organization_id AND s.id=c.source_id WHERE c.xid=txid_current() AND c.actor=auth.uid() AND c.organization_id=p_org
 AND c.operation='correct' AND c.source_kind='submission' AND c.source_id=p_submission AND c.phase='reverse' AND p_phase='reverse'
 AND s.property_id=ANY(c.properties) AND app_private.has_explicit_expense_permission(p_org,s.property_id,'finance.correct_expenses')));
$$;
REVOKE ALL ON FUNCTION app_private.has_explicit_expense_permission(uuid,uuid,public.organization_permission_key),
 app_private.expense_operation_parent(uuid,uuid,text),app_private.expense_operation_submission(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION app_private.begin_expense_operation(p_org uuid,p_operation text,p_kind text,p_source uuid,p_lines jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE props uuid[]; old_props uuid[]; p uuid; key public.organization_permission_key;
BEGIN
 IF auth.uid() IS NULL OR p_operation NOT IN ('post','correct') THEN RETURN false; END IF;
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 SELECT array_agg(DISTINCT (v->>'property_id')::uuid) INTO props FROM jsonb_array_elements(p_lines) v;
 IF cardinality(props) IS NULL OR array_position(props,NULL) IS NOT NULL THEN RETURN false; END IF;
 IF p_operation='correct' THEN
   IF p_kind='transaction' THEN
     SELECT array_agg(property_id) INTO old_props FROM public.expense_transaction_scopes WHERE organization_id=p_org AND transaction_id=p_source;
   ELSIF p_kind='submission' THEN
     SELECT ARRAY[property_id] INTO old_props FROM public.expense_submissions WHERE organization_id=p_org AND id=p_source;
   ELSE RETURN false; END IF;
   IF cardinality(old_props) IS NULL THEN RETURN false; END IF;
   SELECT array_agg(DISTINCT x) INTO props FROM unnest(props||old_props) x;
 END IF;
 key:=CASE p_operation WHEN 'post' THEN 'finance.post_expenses'::public.organization_permission_key ELSE 'finance.correct_expenses'::public.organization_permission_key END;
 FOREACH p IN ARRAY props LOOP
   IF NOT app_private.has_explicit_expense_permission(p_org,p,key) THEN RETURN false; END IF;
   PERFORM app_private.assert_property_permission(p_org,p,'finance.submit_expenses');
 END LOOP;
 INSERT INTO app_private.expense_operation_authority VALUES(txid_current(),auth.uid(),p_org,p_operation,p_kind,p_source,
 CASE WHEN p_kind='transaction' THEN p_source END,CASE p_operation WHEN 'post' THEN 'prepare' ELSE 'reverse' END,props);
 RETURN true;
END; $$;
CREATE FUNCTION app_private.finish_expense_operation(p_org uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 DELETE FROM app_private.expense_operation_authority WHERE xid=txid_current() AND actor=auth.uid() AND organization_id=p_org;
$$;
CREATE FUNCTION app_private.advance_expense_operation(p_org uuid,p_parent uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE app_private.expense_operation_authority SET target_id=p_parent,phase='review'
 WHERE xid=txid_current() AND actor=auth.uid() AND organization_id=p_org;
END; $$;
REVOKE ALL ON FUNCTION app_private.begin_expense_operation(uuid,text,text,uuid,jsonb),
 app_private.finish_expense_operation(uuid),app_private.advance_expense_operation(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;

-- Keep the audited implementations as private cores, and install outer cleanup
-- boundaries. A failed command rolls back its capability and financial writes.
DO $wrap$
DECLARE f record; d text; arguments text; call_args text; body text; initializer text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
 ('post_expense_transaction','post',NULL::text,NULL::text),
 ('replace_expense_transaction','correct','transaction','p_transaction_id'),
 ('replace_legacy_expense_submission','correct','submission','p_submission_id')) v(name,operation,kind,source_arg)
 LOOP
 SELECT pg_get_functiondef(p.oid),pg_get_function_arguments(p.oid),array_to_string(p.proargnames,',') INTO STRICT d,arguments,call_args
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f.name;
 EXECUTE replace(d,'public.'||f.name||'(', 'app_private.'||f.name||'_scoped_core(');
 EXECUTE format('REVOKE ALL ON FUNCTION app_private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',f.name||'_scoped_core',
 (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f.name));
 initializer:=format('app_private.begin_expense_operation(p_organization_id,%L,%L,%s,p_lines)',f.operation,f.kind,coalesce(f.source_arg,'NULL'));
 -- A pending edit keeps the existing maker-review boundary; correction-only
 -- authority must not grant pending edit or cancellation of another maker.
 IF f.name='replace_expense_transaction' THEN initializer:='CASE WHEN p_expected_status=''approved'' THEN '||initializer||' ELSE false END'; END IF;
 body:=format('DECLARE scoped boolean; result jsonb; BEGIN scoped := %s; result := app_private.%I(%s); IF scoped THEN PERFORM app_private.finish_expense_operation(p_organization_id); END IF; RETURN result; EXCEPTION WHEN OTHERS THEN IF scoped THEN PERFORM app_private.finish_expense_operation(p_organization_id); END IF; RAISE; END;',initializer,f.name||'_scoped_core',call_args);
 EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='''' AS %L',f.name,arguments,body);
 END LOOP;
END; $wrap$;

-- Fail closed if an audited function changes instead of applying a partial patch.
CREATE FUNCTION pg_temp.patch_expense_authority(signature text,old_text text,new_text text)
RETURNS void LANGUAGE plpgsql AS $$ DECLARE d text; BEGIN
 d:=replace(pg_get_functiondef(signature::regprocedure),E'\r\n',E'\n');
 IF (length(d)-length(replace(d,old_text,'')))<>length(old_text) THEN
 RAISE EXCEPTION 'expense_authority_contract_changed: % / %',signature,left(old_text,100); END IF;
 EXECUTE replace(d,old_text,new_text);
END; $$;
DO $patches$
DECLARE post_sig text:='app_private.post_expense_transaction_scoped_core(uuid,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)';
 repl_sig text:='app_private.replace_expense_transaction_scoped_core(uuid,uuid,text,text,date,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)';
 legacy_sig text:='app_private.replace_legacy_expense_submission_scoped_core(uuid,uuid,text,date,uuid,text,date,public.currency_code,uuid,text,uuid,text,jsonb,text)';
 review_sig text:='public.review_expense_transaction(uuid,uuid,text,text,text)';
 reverse_sig text:='public.reverse_expense_transaction(uuid,uuid,date,text,text)';
 child_sig text:='public.reverse_expense(uuid,uuid,date,text,text)'; sig text; needle text;
BEGIN
 PERFORM pg_temp.patch_expense_authority(post_sig,'IF NOT app_private.is_super_admin(p_organization_id) AND NOT (',
 'IF NOT EXISTS(SELECT 1 FROM app_private.expense_operation_authority c WHERE c.xid=txid_current() AND c.actor=auth.uid() AND c.organization_id=p_organization_id AND c.operation=''post'' AND c.phase=''prepare'') AND NOT app_private.is_super_admin(p_organization_id) AND NOT (');
 PERFORM pg_temp.patch_expense_authority(post_sig,'IF lower(btrim(coalesce(p_responsibility, ''''))) <> ''owner'' THEN',
 'IF lower(btrim(coalesce(p_responsibility, ''''))) <> ''owner'' AND NOT EXISTS(SELECT 1 FROM app_private.expense_operation_authority c WHERE c.xid=txid_current() AND c.actor=auth.uid() AND c.organization_id=p_organization_id AND c.operation=''post'' AND c.phase=''prepare'') THEN');
 PERFORM pg_temp.patch_expense_authority(post_sig,'  FOR v_property IN',E'  PERFORM app_private.advance_expense_operation(p_organization_id,(v_result->>''transaction_id'')::uuid);\n  FOR v_property IN');
 PERFORM pg_temp.patch_expense_authority(post_sig,'PERFORM app_private.assert_property_permission(p_organization_id, v_property, ''finance.correct_records'');',
 'IF NOT app_private.expense_operation_parent(p_organization_id,(v_result->>''transaction_id'')::uuid,''review'') THEN PERFORM app_private.assert_property_permission(p_organization_id, v_property, ''finance.correct_records''); END IF;');
 PERFORM pg_temp.patch_expense_authority(repl_sig,'IF p_expected_status=''approved'' AND NOT app_private.can_reverse_expense(p_organization_id) THEN',
 'IF p_expected_status=''approved'' AND NOT (app_private.can_reverse_expense(p_organization_id) OR app_private.expense_operation_parent(p_organization_id,p_transaction_id,''reverse'')) THEN');
 PERFORM pg_temp.patch_expense_authority(repl_sig,'v_new_id := (v_result->>''transaction_id'')::uuid;',
 'v_new_id := (v_result->>''transaction_id'')::uuid; PERFORM app_private.advance_expense_operation(p_organization_id,v_new_id);');
 PERFORM pg_temp.patch_expense_authority(legacy_sig,'IF NOT app_private.can_reverse_expense(p_organization_id) OR NOT (',
 'IF NOT (app_private.can_reverse_expense(p_organization_id) OR app_private.expense_operation_submission(p_organization_id,p_submission_id,''reverse'')) OR NOT (');
 PERFORM pg_temp.patch_expense_authority(legacy_sig,'PERFORM app_private.assert_property_permission(p_organization_id,v_original.property_id,''finance.correct_records'');',
 'IF NOT app_private.expense_operation_submission(p_organization_id,p_submission_id,''reverse'') THEN PERFORM app_private.assert_property_permission(p_organization_id,v_original.property_id,''finance.correct_records''); END IF;');
 PERFORM pg_temp.patch_expense_authority(legacy_sig,'PERFORM app_private.assert_property_permission(p_organization_id,v_original.property_id,''finance.approve_expenses'');',
 'IF NOT app_private.expense_operation_submission(p_organization_id,p_submission_id,''reverse'') THEN PERFORM app_private.assert_property_permission(p_organization_id,v_original.property_id,''finance.approve_expenses''); END IF;');
 PERFORM pg_temp.patch_expense_authority(legacy_sig,'v_id := (v_result->>''transaction_id'')::uuid;',
 'v_id := (v_result->>''transaction_id'')::uuid; PERFORM app_private.advance_expense_operation(p_organization_id,v_id);');
 PERFORM pg_temp.patch_expense_authority(review_sig,'IF NOT app_private.is_super_admin(p_organization_id)',
 'IF NOT (v_decision=''approve'' AND app_private.expense_operation_parent(p_organization_id,p_transaction_id,''review'')) AND NOT app_private.is_super_admin(p_organization_id)');
 needle:=E'    PERFORM app_private.assert_property_permission(\n      p_organization_id,\n      v_line_property_id,\n      ''finance.approve_expenses''\n    );';
 PERFORM pg_temp.patch_expense_authority(review_sig,needle,'IF NOT (v_decision=''approve'' AND app_private.expense_operation_parent(p_organization_id,p_transaction_id,''review'')) THEN '||needle||' END IF;');
 PERFORM pg_temp.patch_expense_authority(review_sig,'v_decision = ''approve'' AND app_private.can_reverse_expense(p_organization_id)',
 'v_decision = ''approve'' AND (app_private.can_reverse_expense(p_organization_id) OR app_private.expense_operation_parent(p_organization_id,p_transaction_id,''review''))');
 PERFORM pg_temp.patch_expense_authority(reverse_sig,'IF NOT app_private.can_reverse_expense(p_organization_id) THEN',
 'IF NOT (app_private.can_reverse_expense(p_organization_id) OR app_private.expense_operation_parent(p_organization_id,p_transaction_id,''reverse'')) THEN');
 FOREACH needle IN ARRAY ARRAY[
 E'  PERFORM app_private.assert_property_permission(p_organization_id,scope.property_id,''finance.correct_records'')\n    FROM public.expense_transaction_scopes scope WHERE scope.organization_id=p_organization_id AND scope.transaction_id=p_transaction_id;',
 E'  PERFORM app_private.assert_property_permission(p_organization_id,scope.property_id,''finance.approve_expenses'')\n    FROM public.expense_transaction_scopes scope WHERE scope.organization_id=p_organization_id AND scope.transaction_id=p_transaction_id;'] LOOP
 PERFORM pg_temp.patch_expense_authority(reverse_sig,needle,'IF NOT app_private.expense_operation_parent(p_organization_id,p_transaction_id,''reverse'') THEN '||needle||' END IF;'); END LOOP;
 PERFORM pg_temp.patch_expense_authority(child_sig,'IF NOT app_private.can_reverse_expense(p_organization_id) THEN',
 'IF NOT (app_private.can_reverse_expense(p_organization_id) OR app_private.expense_operation_submission(p_organization_id,p_submission_id,''reverse'')) THEN');
 FOREACH needle IN ARRAY ARRAY[
 'PERFORM app_private.assert_property_permission(p_organization_id,v_snapshot.property_id,''finance.correct_records'');',
 'PERFORM app_private.assert_property_permission(p_organization_id,v_snapshot.property_id,''finance.approve_expenses'');'] LOOP
 PERFORM pg_temp.patch_expense_authority(child_sig,needle,'IF NOT app_private.expense_operation_submission(p_organization_id,p_submission_id,''reverse'') THEN '||needle||' END IF;'); END LOOP;
 FOREACH sig IN ARRAY ARRAY[
 'app_private.review_expense_baseline_branch106(uuid,uuid,text,text,text,uuid)',
 'app_private.review_expense_baseline_track6_evidence(uuid,uuid,text,text,text,uuid)'] LOOP
 PERFORM pg_temp.patch_expense_authority(sig,'IF NOT app_private.can_review_expense(p_organization_id) THEN',
 'IF NOT (app_private.can_review_expense(p_organization_id) OR (v_decision=''approve'' AND app_private.expense_operation_submission(p_organization_id,p_submission_id,''review''))) THEN'); END LOOP;
 -- The branch adapter is private after category wrapping. Skip its broad
 -- context mint only for the exact already-authorized expense child.
 PERFORM pg_temp.patch_expense_authority('app_private.review_expense_before_category_connection(uuid,uuid,text,text,text,uuid)',
 'PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,''finance.approve_expenses'');',
 'IF NOT (lower(btrim(p_decision))=''approve'' AND app_private.expense_operation_submission(p_organization_id,p_submission_id,''review'')) THEN PERFORM app_private.begin_finance_property_authority(p_organization_id,v_property_id,''finance.approve_expenses''); END IF;');
END; $patches$;
