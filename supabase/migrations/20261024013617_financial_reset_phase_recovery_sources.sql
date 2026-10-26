-- Recovery sources are derived from immutable checked-phase output, never from
-- a caller's replacement archive. No recovery or reset is executed here.
BEGIN;
DROP TRIGGER financial_reset_rules_immutable ON app_private.financial_reset_relation_rules;
INSERT INTO app_private.financial_reset_relation_rules(relation_name,archive_remove,normalize_columns,generated_columns,restore_allowed) VALUES
 ('public.lease_terms',false,'{}',ARRAY['effective_range'],false),
 ('public.lease_billing_terms',false,'{}',ARRAY['effective_range'],false);
CREATE TRIGGER financial_reset_rules_immutable BEFORE INSERT OR UPDATE OR DELETE ON app_private.financial_reset_relation_rules
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE TABLE app_private.financial_reset_recovery_plans (
 operation_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 reset_operation_id uuid NOT NULL REFERENCES app_private.financial_reset_operations(operation_id),
 phase_binding jsonb NOT NULL,
 binding_sha256 text NOT NULL CHECK(binding_sha256 ~ '^[0-9a-f]{64}$'),
 sources_sha256 text NOT NULL CHECK(sources_sha256 ~ '^[0-9a-f]{64}$'),
 source_count integer NOT NULL CHECK(source_count>0),
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id)
);
CREATE TABLE app_private.financial_reset_recovery_sources (
 operation_id uuid NOT NULL REFERENCES app_private.financial_reset_recovery_plans(operation_id),
 organization_id uuid NOT NULL,
 relation_name text NOT NULL REFERENCES app_private.financial_reset_relation_rules(relation_name),
 primary_key jsonb NOT NULL,
 kind text NOT NULL CHECK(kind IN ('recovery-prune','recovery-repair')),
 before_row jsonb NOT NULL,
 after_row jsonb,
 before_sha256 text NOT NULL CHECK(before_sha256 ~ '^[0-9a-f]{64}$'),
 after_sha256 text CHECK(after_sha256 ~ '^[0-9a-f]{64}$'),
 provenance text NOT NULL CHECK(provenance IN ('known-zero','continuation')),
 PRIMARY KEY(operation_id,relation_name,primary_key),
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id),
 CHECK((kind='recovery-prune' AND after_row IS NULL AND after_sha256 IS NULL) OR
       (kind='recovery-repair' AND after_row IS NOT NULL AND after_sha256 IS NOT NULL))
);
ALTER TABLE app_private.financial_reset_recovery_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.financial_reset_recovery_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_recovery_plans,app_private.financial_reset_recovery_sources FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER financial_reset_recovery_plan_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_recovery_plans
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();
CREATE TRIGGER financial_reset_recovery_source_immutable BEFORE UPDATE OR DELETE ON app_private.financial_reset_recovery_sources
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();

CREATE FUNCTION app_private.financial_reset_recovery_candidate(p_reset uuid,p_relation text,p_before jsonb,p_after jsonb,p_provenance text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_pk jsonb; v_kind text; v_oid oid:=to_regclass(p_relation)::oid;
BEGIN
 SELECT organization_id INTO STRICT v_org FROM app_private.financial_reset_operations WHERE operation_id=p_reset AND operation_kind='reset' AND status='actions_complete';
 IF p_before->>'organization_id' IS DISTINCT FROM v_org::text OR (p_after IS NOT NULL AND p_after->>'organization_id' IS DISTINCT FROM v_org::text) THEN
   RAISE EXCEPTION 'financial_reset_recovery_source_scope_invalid' USING ERRCODE='23514';
 END IF;
 IF p_provenance='known-zero' THEN
   IF p_relation NOT IN ('public.owner_opening_balance_requests','public.owner_opening_balance_entries') OR p_after IS NOT NULL THEN
     RAISE EXCEPTION 'financial_reset_recovery_zero_source_invalid' USING ERRCODE='23514';
   END IF;
 ELSIF p_provenance IS DISTINCT FROM 'continuation' OR p_relation IS NULL OR p_relation NOT IN ('public.lease_terms','public.lease_billing_terms','public.finance_income_items','public.tenant_invoices',
   'public.tenant_invoice_lines','public.tenant_invoice_rent_segments','public.management_fee_occurrences','public.owner_invoices','public.owner_invoice_lines','public.rent_generation_exceptions') THEN
   RAISE EXCEPTION 'financial_reset_recovery_relation_not_allowed' USING ERRCODE='23514';
 END IF;
 IF p_after IS NOT NULL AND (p_relation<>'public.lease_terms' OR p_before->>'status' IS DISTINCT FROM 'expired' OR p_after->>'status' IS DISTINCT FROM 'active'
   OR (p_before-ARRAY['status','updated_at','updated_by']) IS DISTINCT FROM (p_after-ARRAY['status','updated_at','updated_by'])) THEN
   RAISE EXCEPTION 'financial_reset_recovery_repair_not_allowed' USING ERRCODE='23514';
 END IF;
 IF app_private.financial_reset_hash(app_private.financial_reset_typed_row(v_oid,p_before)) IS DISTINCT FROM app_private.financial_reset_hash(p_before)
   OR (p_after IS NOT NULL AND app_private.financial_reset_hash(app_private.financial_reset_typed_row(v_oid,p_after)) IS DISTINCT FROM app_private.financial_reset_hash(p_after)) THEN
   RAISE EXCEPTION 'financial_reset_recovery_source_not_typed' USING ERRCODE='23514';
 END IF;
 v_pk:=app_private.financial_reset_primary_key(v_oid,p_before);
 IF p_after IS NOT NULL AND v_pk IS DISTINCT FROM app_private.financial_reset_primary_key(v_oid,p_after) THEN
   RAISE EXCEPTION 'financial_reset_recovery_repair_identity_changed' USING ERRCODE='23514';
 END IF;
 IF p_after IS NULL AND EXISTS(SELECT 1 FROM app_private.financial_reset_archive_rows WHERE operation_id=p_reset AND relation_name=p_relation AND primary_key=v_pk) THEN
   RAISE EXCEPTION 'financial_reset_recovery_cannot_prune_original' USING ERRCODE='23514';
 END IF;
 v_kind:=CASE WHEN p_after IS NULL THEN 'recovery-prune' ELSE 'recovery-repair' END;
 RETURN jsonb_build_object('relation_name',p_relation,'primary_key',v_pk,'kind',v_kind,'before_row',p_before,'after_row',p_after,
   'before_sha256',app_private.financial_reset_hash(p_before),'after_sha256',app_private.financial_reset_hash(p_after),'provenance',p_provenance);
END;
$$;

CREATE FUNCTION app_private.financial_reset_recovery_candidates(p_reset_operation_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_zero app_private.financial_reset_zero_plans%ROWTYPE; v_phase app_private.financial_reset_continuation_plans%ROWTYPE;
 v_result jsonb:='[]'; v_item jsonb; v_table text; v_old jsonb; v_new jsonb; v_generation integer;
BEGIN
 SELECT * INTO STRICT v_zero FROM app_private.financial_reset_zero_plans WHERE operation_id=p_reset_operation_id AND status='complete';
 SELECT target_generation INTO STRICT v_generation FROM app_private.financial_reset_operations WHERE operation_id=p_reset_operation_id;
 IF app_private.financial_reset_hash(v_zero.result_json->'authority_rows') IS DISTINCT FROM v_zero.result_json->>'authority_sha256' THEN
   RAISE EXCEPTION 'financial_reset_recovery_zero_evidence_changed' USING ERRCODE='23514';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_zero.result_json->'authority_rows') LOOP
   IF app_private.financial_reset_hash(v_item->'row_json') IS DISTINCT FROM v_item->>'row_sha256' THEN
     RAISE EXCEPTION 'financial_reset_recovery_zero_row_hash_changed' USING ERRCODE='23514';
   END IF;
   v_result:=v_result||jsonb_build_array(app_private.financial_reset_recovery_candidate(p_reset_operation_id,v_item->>'relation_name',v_item->'row_json',NULL,'known-zero'));
 END LOOP;
 SELECT * INTO v_phase FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_reset_operation_id;
 IF FOUND THEN
   IF v_phase.status<>'complete' OR app_private.financial_reset_hash(v_phase.before_images) IS DISTINCT FROM v_phase.result_json->>'before_sha256'
     OR app_private.financial_reset_hash(v_phase.after_images) IS DISTINCT FROM v_phase.result_json->>'after_sha256' THEN
     RAISE EXCEPTION 'financial_reset_recovery_continuation_incomplete' USING ERRCODE='23514';
   END IF;
   FOR v_table IN SELECT key FROM jsonb_object_keys(v_phase.before_images||v_phase.after_images) key LOOP
     IF v_phase.before_images->v_table IS NOT DISTINCT FROM v_phase.after_images->v_table THEN CONTINUE; END IF;
     IF jsonb_typeof(v_phase.before_images->v_table) IS DISTINCT FROM 'array' OR jsonb_typeof(v_phase.after_images->v_table) IS DISTINCT FROM 'array' THEN
       RAISE EXCEPTION 'financial_reset_recovery_snapshot_shape_changed' USING ERRCODE='23514';
     END IF;
     FOR v_old IN SELECT value FROM jsonb_array_elements(v_phase.before_images->v_table) LOOP
       SELECT value INTO v_new FROM jsonb_array_elements(v_phase.after_images->v_table) WHERE value->'id'=v_old->'id';
       IF v_new IS NULL THEN RAISE EXCEPTION 'financial_reset_recovery_unexpected_phase_removal' USING ERRCODE='23514'; END IF;
       IF app_private.financial_reset_hash(v_old) IS DISTINCT FROM app_private.financial_reset_hash(v_new) THEN
         v_result:=v_result||jsonb_build_array(app_private.financial_reset_recovery_candidate(p_reset_operation_id,v_table,v_new,v_old,'continuation'));
       END IF;
     END LOOP;
     FOR v_new IN SELECT value FROM jsonb_array_elements(v_phase.after_images->v_table) a WHERE NOT EXISTS(
       SELECT 1 FROM jsonb_array_elements(v_phase.before_images->v_table) b WHERE b.value->'id'=a.value->'id') LOOP
       IF v_table='public.activity_logs' THEN CONTINUE; END IF;
       IF v_table='app_private.financial_idempotency_requests' THEN
         IF v_new->>'status' IS DISTINCT FROM 'completed' OR (v_new->>'financial_generation')::integer IS DISTINCT FROM v_generation THEN
           RAISE EXCEPTION 'financial_reset_recovery_unretirable_intent' USING ERRCODE='23514';
         END IF;
         CONTINUE;
       END IF;
       v_result:=v_result||jsonb_build_array(app_private.financial_reset_recovery_candidate(p_reset_operation_id,v_table,v_new,NULL,'continuation'));
     END LOOP;
   END LOOP;
 END IF;
 RETURN (SELECT coalesce(jsonb_agg(value ORDER BY value->>'relation_name',(value->'primary_key')::text),'[]') FROM jsonb_array_elements(v_result));
END;
$$;

CREATE FUNCTION app_private.prepare_financial_reset_recovery(p_operation_id uuid,p_phase_binding jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_original app_private.financial_reset_operations%ROWTYPE;
 v_zero app_private.financial_reset_zero_plans%ROWTYPE; v_phase app_private.financial_reset_continuation_plans%ROWTYPE;
 v_sources jsonb; v_source jsonb; v_actual jsonb; v_snapshot jsonb; v_existing app_private.financial_reset_recovery_plans%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id FOR UPDATE;
 SELECT * INTO STRICT v_original FROM app_private.financial_reset_operations WHERE operation_id=v_op.restore_of;
 SELECT * INTO STRICT v_zero FROM app_private.financial_reset_zero_plans WHERE operation_id=v_op.restore_of AND status='complete';
 SELECT * INTO v_phase FROM app_private.financial_reset_continuation_plans WHERE operation_id=v_op.restore_of;
 v_sources:=app_private.financial_reset_recovery_candidates(v_op.restore_of);
 v_snapshot:=app_private.financial_reset_continuation_snapshot(v_op.organization_id);
 IF v_op.operation_kind<>'restore' OR v_op.status<>'prepared' OR v_op.schema_sha256<>v_original.schema_sha256
   OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_phase_binding) key) IS DISTINCT FROM
     ARRAY['continuation_after_sha256','continuation_before_sha256','continuation_review_sha256','schema_sha256','source_sha256','sources_sha256','zero_authority_sha256','zero_review_sha256']::text[]
   OR p_phase_binding->>'schema_sha256' IS DISTINCT FROM v_op.schema_sha256
   OR p_phase_binding->>'zero_review_sha256' IS DISTINCT FROM v_zero.review_sha256
   OR p_phase_binding->>'zero_authority_sha256' IS DISTINCT FROM v_zero.result_json->>'authority_sha256'
   OR p_phase_binding->>'continuation_review_sha256' IS DISTINCT FROM v_phase.review_sha256
   OR p_phase_binding->>'continuation_before_sha256' IS DISTINCT FROM v_phase.result_json->>'before_sha256'
   OR p_phase_binding->>'continuation_after_sha256' IS DISTINCT FROM v_phase.result_json->>'after_sha256'
   OR p_phase_binding->>'sources_sha256' IS DISTINCT FROM app_private.financial_reset_hash(v_sources)
   OR p_phase_binding->>'source_sha256' IS DISTINCT FROM app_private.financial_reset_hash(v_snapshot)
   OR (v_phase.operation_id IS NOT NULL AND app_private.financial_reset_hash(v_snapshot) IS DISTINCT FROM v_phase.result_json->>'after_sha256') THEN
   RAISE EXCEPTION 'financial_reset_recovery_phase_binding_invalid' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_existing FROM app_private.financial_reset_recovery_plans WHERE operation_id=p_operation_id;
 IF FOUND THEN
   IF v_existing.phase_binding IS DISTINCT FROM p_phase_binding THEN RAISE EXCEPTION 'financial_reset_recovery_plan_id_reused' USING ERRCODE='23514'; END IF;
   RETURN;
 END IF;
 INSERT INTO app_private.financial_reset_recovery_plans(operation_id,organization_id,reset_operation_id,phase_binding,binding_sha256,sources_sha256,source_count)
 VALUES(p_operation_id,v_op.organization_id,v_op.restore_of,p_phase_binding,app_private.financial_reset_hash(p_phase_binding),app_private.financial_reset_hash(v_sources),jsonb_array_length(v_sources));
 FOR v_source IN SELECT value FROM jsonb_array_elements(v_sources) LOOP
   EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE app_private.financial_reset_primary_key($1,to_jsonb(t))=$2 AND organization_id=$3 FOR SHARE',
     split_part(v_source->>'relation_name','.',1),split_part(v_source->>'relation_name','.',2)) INTO v_actual
     USING to_regclass(v_source->>'relation_name')::oid,v_source->'primary_key',v_op.organization_id;
   IF app_private.financial_reset_hash(v_actual) IS DISTINCT FROM v_source->>'before_sha256' THEN
     RAISE EXCEPTION 'financial_reset_recovery_current_image_changed' USING ERRCODE='40001';
   END IF;
   INSERT INTO app_private.financial_reset_recovery_sources(operation_id,organization_id,relation_name,primary_key,kind,before_row,after_row,before_sha256,after_sha256,provenance)
   VALUES(p_operation_id,v_op.organization_id,v_source->>'relation_name',v_source->'primary_key',v_source->>'kind',v_source->'before_row',nullif(v_source->'after_row','null'::jsonb),
     v_source->>'before_sha256',v_source->>'after_sha256',v_source->>'provenance');
 END LOOP;
END;
$$;

CREATE FUNCTION app_private.financial_reset_recovery_source_rows(p_operation_id uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('relation_name',relation_name,'primary_key',primary_key,'kind',kind,
   'before_row_text',before_row::text,'after_row_text',after_row::text,'before_sha256',before_sha256,'after_sha256',after_sha256,'provenance',provenance)
   ORDER BY relation_name,primary_key::text),'[]') FROM app_private.financial_reset_recovery_sources WHERE operation_id=p_operation_id
$$;

CREATE FUNCTION app_private.validate_financial_reset_recovery_action(p_action app_private.financial_reset_actions)
 RETURNS app_private.financial_reset_actions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_source app_private.financial_reset_recovery_sources%ROWTYPE;
BEGIN
 PERFORM app_private.assert_financial_reset_frozen(p_action.operation_id);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_action.operation_id FOR UPDATE;
 SELECT * INTO v_source FROM app_private.financial_reset_recovery_sources WHERE operation_id=p_action.operation_id AND relation_name=p_action.relation_name AND primary_key=p_action.primary_key;
 IF NOT FOUND OR v_op.operation_kind<>'restore' OR v_op.status<>'prepared' OR p_action.applied_at IS NOT NULL
   OR (p_action.organization_id IS NOT NULL AND p_action.organization_id<>v_op.organization_id)
   OR p_action.relation_oid IS DISTINCT FROM to_regclass(p_action.relation_name)::oid OR p_action.kind<>v_source.kind
   OR p_action.before_sha256 IS DISTINCT FROM v_source.before_sha256 OR p_action.after_sha256 IS DISTINCT FROM v_source.after_sha256
   OR app_private.financial_reset_hash(p_action.before_row) IS DISTINCT FROM v_source.before_sha256
   OR app_private.financial_reset_hash(p_action.after_row) IS DISTINCT FROM v_source.after_sha256
   OR app_private.financial_reset_hash(app_private.financial_reset_typed_row(p_action.relation_oid,p_action.before_row)) IS DISTINCT FROM v_source.before_sha256
   OR (p_action.after_row IS NOT NULL AND app_private.financial_reset_hash(app_private.financial_reset_typed_row(p_action.relation_oid,p_action.after_row)) IS DISTINCT FROM v_source.after_sha256) THEN
   RAISE EXCEPTION 'financial_reset_recovery_action_source_mismatch' USING ERRCODE='23514';
 END IF;
 p_action.organization_id:=v_op.organization_id;
 RETURN p_action;
END;
$$;

CREATE FUNCTION app_private.assert_financial_reset_recovery_coverage(p_operation_id uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_plan app_private.financial_reset_recovery_plans%ROWTYPE;
 v_row record; v_expected jsonb; v_final jsonb; v_candidates jsonb;
BEGIN
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id;
 IF v_op.operation_kind<>'restore' OR NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans WHERE operation_id=v_op.restore_of AND status='complete') THEN RETURN; END IF;
 SELECT * INTO v_plan FROM app_private.financial_reset_recovery_plans WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'financial_reset_phase_recovery_plan_required' USING ERRCODE='23514'; END IF;
 v_candidates:=app_private.financial_reset_recovery_candidates(v_op.restore_of);
 IF app_private.financial_reset_hash(v_candidates)<>v_plan.sources_sha256
   OR jsonb_array_length(v_candidates)<>v_plan.source_count
   OR (SELECT count(*) FROM app_private.financial_reset_recovery_sources WHERE operation_id=p_operation_id)<>v_plan.source_count
   OR app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(v_op.organization_id)) IS DISTINCT FROM v_plan.phase_binding->>'source_sha256' THEN
   RAISE EXCEPTION 'financial_reset_recovery_preparation_changed' USING ERRCODE='40001';
 END IF;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_recovery_sources s WHERE s.operation_id=p_operation_id AND
   (SELECT count(*) FROM app_private.financial_reset_actions a WHERE a.operation_id=p_operation_id AND a.relation_name=s.relation_name AND a.primary_key=s.primary_key
     AND a.kind=s.kind AND a.before_sha256=s.before_sha256 AND a.after_sha256 IS NOT DISTINCT FROM s.after_sha256)<>1)
   OR EXISTS(SELECT 1 FROM app_private.financial_reset_actions a WHERE a.operation_id=p_operation_id AND a.kind IN ('recovery-prune','recovery-repair') AND
     NOT EXISTS(SELECT 1 FROM app_private.financial_reset_recovery_sources s WHERE s.operation_id=p_operation_id AND s.relation_name=a.relation_name AND s.primary_key=a.primary_key AND s.kind=a.kind)) THEN
   RAISE EXCEPTION 'financial_reset_recovery_sources_not_exactly_covered' USING ERRCODE='23514';
 END IF;
 -- Every original eligible archive row must end at its exact restored image;
 -- archive-only intent and cancelled outbox remain retired, never executable.
 FOR v_row IN SELECT r.* FROM app_private.financial_reset_archive_rows r JOIN app_private.financial_reset_relation_rules rule ON rule.relation_name=r.relation_name
   WHERE r.operation_id=v_op.restore_of AND rule.restore_allowed LOOP
   v_expected:=v_row.row_json;
   IF v_expected ? 'financial_generation' THEN v_expected:=jsonb_set(v_expected,'{financial_generation}',to_jsonb(v_op.target_generation)); END IF;
   SELECT after_row INTO v_final FROM app_private.financial_reset_actions WHERE operation_id=p_operation_id AND relation_name=v_row.relation_name AND primary_key=v_row.primary_key ORDER BY ordinal DESC LIMIT 1;
   IF NOT FOUND THEN
     EXECUTE format('SELECT to_jsonb(t) FROM %I.%I t WHERE app_private.financial_reset_primary_key($1,to_jsonb(t))=$2 AND organization_id=$3',
       split_part(v_row.relation_name,'.',1),split_part(v_row.relation_name,'.',2)) INTO v_final USING to_regclass(v_row.relation_name)::oid,v_row.primary_key,v_op.organization_id;
   END IF;
   IF app_private.financial_reset_hash(v_final) IS DISTINCT FROM app_private.financial_reset_hash(v_expected) THEN
     RAISE EXCEPTION 'financial_reset_recovery_original_archive_not_covered' USING ERRCODE='23514';
   END IF;
 END LOOP;
END;
$$;

-- Extend only the two closed action kinds. All existing image pairing and
-- metadata permissions remain enforced; the private verifier already binds
-- phase to each action's kind and current backend/top-level transaction.
DO $checks$
DECLARE r record; v_count integer:=0;
BEGIN
 FOR r IN SELECT conname FROM pg_constraint WHERE conrelid='app_private.financial_reset_actions'::regclass AND contype='c'
   AND pg_get_expr(conbin,conrelid) LIKE '%kind%' LOOP
   EXECUTE format('ALTER TABLE app_private.financial_reset_actions DROP CONSTRAINT %I',r.conname); v_count:=v_count+1;
 END LOOP;
 IF v_count<>2 THEN RAISE EXCEPTION 'financial_reset_recovery_action_checks_changed'; END IF;
END;
$checks$;
ALTER TABLE app_private.financial_reset_actions ADD CONSTRAINT financial_reset_actions_kind_check
 CHECK(kind IN ('archive-delete','normalization','restore','recovery-prune','recovery-repair'));
ALTER TABLE app_private.financial_reset_actions ADD CONSTRAINT financial_reset_actions_images_check CHECK(
 (kind IN ('archive-delete','recovery-prune') AND before_row IS NOT NULL AND after_row IS NULL) OR
 (kind IN ('normalization','recovery-repair') AND before_row IS NOT NULL AND after_row IS NOT NULL) OR
 (kind='restore' AND after_row IS NOT NULL));
ALTER TABLE app_private.financial_reset_transaction_capabilities DROP CONSTRAINT financial_reset_transaction_capabilities_phase_check;
ALTER TABLE app_private.financial_reset_transaction_capabilities ADD CONSTRAINT financial_reset_transaction_capabilities_phase_check
 CHECK(phase IN ('archive-delete','normalization','restore','recovery-prune','recovery-repair'));

DO $integration$
DECLARE v_definition text; v_source text; v_anchor text;
BEGIN
 SELECT prosrc INTO v_source FROM pg_proc WHERE oid='app_private.guard_financial_reset_action()'::regprocedure;
 IF encode(extensions.digest(v_source,'sha256'),'hex')<>'4cb25ccc556e13ceb5465cabad4651136efd992043fd2898b539403f28df228b' THEN
   RAISE EXCEPTION 'financial_reset_recovery_action_guard_predecessor_changed';
 END IF;
 v_definition:=pg_get_functiondef('app_private.guard_financial_reset_action()'::regprocedure);
 v_anchor:=' PERFORM app_private.assert_financial_reset_frozen(NEW.operation_id);';
 IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_recovery_action_guard_anchor_changed'; END IF;
 v_definition:=replace(v_definition,v_anchor,E' IF NEW.kind IN (''recovery-prune'',''recovery-repair'') THEN\n   RETURN app_private.validate_financial_reset_recovery_action(NEW);\n END IF;\n'||v_anchor);
 EXECUTE v_definition;

 SELECT prosrc INTO v_source FROM pg_proc WHERE oid='app_private.seal_financial_reset_operation(uuid)'::regprocedure;
 IF encode(extensions.digest(v_source,'sha256'),'hex')<>'5a6b3a487dfefeea38a16132a2a9d8aeff531825a2836f9ddeb9658476386290' THEN
   RAISE EXCEPTION 'financial_reset_recovery_seal_predecessor_changed';
 END IF;
 v_definition:=pg_get_functiondef('app_private.seal_financial_reset_operation(uuid)'::regprocedure);
 v_anchor:=E'     SELECT row_json INTO STRICT v_original FROM app_private.financial_reset_archive_rows WHERE operation_id=coalesce(v_op.restore_of,p_operation_id)\n       AND relation_name=v_action.relation_name AND primary_key=v_action.primary_key;';
 IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_recovery_seal_source_anchor_changed'; END IF;
 v_definition:=replace(v_definition,v_anchor,E'     IF v_action.kind IN (''recovery-prune'',''recovery-repair'') THEN\n       SELECT before_row INTO STRICT v_original FROM app_private.financial_reset_recovery_sources WHERE operation_id=p_operation_id AND relation_name=v_action.relation_name AND primary_key=v_action.primary_key;\n     ELSE\n'||v_anchor||E'\n     END IF;');
 v_anchor:=' UPDATE app_private.financial_reset_operations SET status=''sealed'' WHERE operation_id=p_operation_id;';
 IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_recovery_seal_coverage_anchor_changed'; END IF;
 v_definition:=replace(v_definition,v_anchor,E' PERFORM app_private.assert_financial_reset_recovery_coverage(p_operation_id);\n'||v_anchor);
 EXECUTE v_definition;
END;
$integration$;

REVOKE ALL ON FUNCTION app_private.financial_reset_recovery_candidate(uuid,text,jsonb,jsonb,text),
 app_private.financial_reset_recovery_candidates(uuid),app_private.prepare_financial_reset_recovery(uuid,jsonb),
 app_private.financial_reset_recovery_source_rows(uuid),app_private.validate_financial_reset_recovery_action(app_private.financial_reset_actions),
 app_private.assert_financial_reset_recovery_coverage(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
