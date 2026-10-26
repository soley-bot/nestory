-- Inactive private report/recovery authority. No hosted organization is enrolled.
-- Ordinary commands retain their permission, lifecycle and accounting checks.
BEGIN;

CREATE TABLE app_private.financial_reset_verification_checkpoints (
 operation_id uuid PRIMARY KEY,
 organization_id uuid NOT NULL,
 checkpoint_kind text NOT NULL CHECK(checkpoint_kind IN ('checked-reports','phase-recovery')),
 generation integer NOT NULL,
 before_images jsonb NOT NULL CHECK(jsonb_typeof(before_images)='object'),
 after_images jsonb NOT NULL CHECK(jsonb_typeof(after_images)='object'),
 result_json jsonb NOT NULL CHECK(jsonb_typeof(result_json)='object'),
 checkpoint_sha256 text NOT NULL CHECK(checkpoint_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 execution_backend integer NOT NULL DEFAULT pg_backend_pid(),
 execution_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 FOREIGN KEY(operation_id,organization_id) REFERENCES app_private.financial_reset_operations(operation_id,organization_id) ON DELETE RESTRICT,
 CHECK(checkpoint_sha256=app_private.financial_reset_hash(result_json))
);
ALTER TABLE app_private.financial_reset_verification_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.financial_reset_verification_checkpoints FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER financial_reset_verification_checkpoint_immutable BEFORE UPDATE OR DELETE
 ON app_private.financial_reset_verification_checkpoints FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_immutable();
ALTER TABLE app_private.financial_reset_phase_fences DROP CONSTRAINT financial_reset_phase_fences_phase_check;
ALTER TABLE app_private.financial_reset_phase_fences ADD CONSTRAINT financial_reset_phase_fences_phase_check
 CHECK(phase IN ('known-zero','continuation','reports'));
ALTER TABLE app_private.financial_reset_recovery_sources DROP CONSTRAINT financial_reset_recovery_sources_provenance_check;
ALTER TABLE app_private.financial_reset_recovery_sources ADD CONSTRAINT financial_reset_recovery_sources_provenance_check
 CHECK(provenance IN ('known-zero','continuation','reports'));

-- A successful checkpoint seals the remainder of its own transaction. Deferred
-- checks can be flushed early, so they alone cannot prevent later row changes.
-- This seal expires with the transaction; future normal writes remain governed
-- by the ordinary lifecycle and make subsequent old-checkpoint recovery refuse.
CREATE FUNCTION app_private.guard_financial_reset_checkpoint_row() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_before jsonb; v_after jsonb; v_column text; v_org uuid;
BEGIN
 v_before:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 v_after:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 IF v_before IS NOT DISTINCT FROM v_after THEN RETURN NULL; END IF;
 v_column:=CASE WHEN TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='organizations' THEN 'id' ELSE 'organization_id' END;
 PERFORM app_private.assert_financial_lifecycle_isolation();
 -- Row triggers may already hold a tuple lock. Never wait for the lifecycle
 -- lock here: a conflicting reset must cause an atomic statement retry, not
 -- a row-lock/lifecycle-lock inversion. Successful writers retain their
 -- shared transaction lock until commit, before a reset can take its image.
 FOR v_org IN SELECT DISTINCT value::uuid FROM unnest(ARRAY[v_before->>v_column,v_after->>v_column]) value
   WHERE value IS NOT NULL ORDER BY value::uuid LOOP
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('financial_write_lifecycle_v1:'||v_org::text,0)) THEN
   RAISE EXCEPTION 'financial_reset_checkpoint_writer_conflict' USING ERRCODE='40001';
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c
   WHERE c.execution_backend=pg_backend_pid() AND c.execution_xid=pg_current_xact_id()
   AND c.organization_id::text IN (v_before->>v_column,v_after->>v_column)) THEN
  RAISE EXCEPTION 'financial_reset_checkpoint_transaction_sealed' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END;
$$;
DO $seals$
DECLARE r record;
BEGIN
 FOR r IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app_private')
 AND NOT (n.nspname='app_private' AND (c.relname LIKE 'financial_reset_%' OR c.relname IN ('financial_write_controls','financial_report_source_revisions')))
 AND ((n.nspname='public' AND c.relname='organizations') OR EXISTS(SELECT 1 FROM pg_attribute a
   WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped)) LOOP
  EXECUTE format('CREATE TRIGGER zzzzz_financial_reset_checkpoint_seal AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_reset_checkpoint_row()',r.nspname,r.relname);
 END LOOP;
END;
$seals$;

CREATE FUNCTION app_private.assert_financial_reset_checkpoint_coverage() RETURNS void
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app_private')
 AND NOT (n.nspname='app_private' AND (c.relname LIKE 'financial_reset_%' OR c.relname IN ('financial_write_controls','financial_report_source_revisions')))
 AND ((n.nspname='public' AND c.relname='organizations') OR EXISTS(SELECT 1 FROM pg_attribute a
   WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped))
 AND NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='zzzzz_financial_reset_checkpoint_seal'
   AND t.tgenabled='O' AND t.tgtype=29 AND t.tgfoid='app_private.guard_financial_reset_checkpoint_row()'::regprocedure)) THEN
  RAISE EXCEPTION 'financial_reset_checkpoint_table_coverage_changed' USING ERRCODE='55000';
 END IF;
END;
$$;

CREATE FUNCTION app_private.apply_financial_reset_reports(p_operation uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE;
 v_zero app_private.financial_reset_zero_plans%ROWTYPE; v_phase app_private.financial_reset_continuation_plans%ROWTYPE;
 v_existing app_private.financial_reset_verification_checkpoints%ROWTYPE;
 v_before jsonb; v_after jsonb; v_scope jsonb; v_row jsonb; v_old jsonb; v_table text; v_queue record;
 v_actor uuid; v_period date; v_generated jsonb; v_ledger jsonb; v_readiness jsonb;
 v_scopes jsonb:='[]'; v_allocations jsonb:='[]'; v_result jsonb;
 v_headers text:=current_setting('request.headers',true);
BEGIN
 PERFORM app_private.assert_financial_reset_checkpoint_coverage();
 PERFORM app_private.assert_financial_reset_frozen(p_operation);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation FOR UPDATE;
 SELECT * INTO v_zero FROM app_private.financial_reset_zero_plans WHERE operation_id=p_operation AND status='complete';
 SELECT * INTO v_phase FROM app_private.financial_reset_continuation_plans WHERE operation_id=p_operation AND status='complete';
 IF v_op.operation_kind<>'reset' OR v_op.status<>'actions_complete' OR v_zero.operation_id IS NULL OR v_phase.operation_id IS NULL
 OR EXISTS(SELECT 1 FROM app_private.financial_reset_actions WHERE operation_id=p_operation AND applied_at IS NULL)
 OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE operation_id=p_operation) THEN
  RAISE EXCEPTION 'financial_reset_report_checked_phases_required' USING ERRCODE='55000';
 END IF;
 v_actor:=(v_phase.plan_json->>'actor_id')::uuid; v_period:=(v_phase.plan_json->>'billing_period_start')::date;
 IF auth.uid() IS DISTINCT FROM v_actor OR NOT EXISTS(SELECT 1 FROM public.organization_members
   WHERE organization_id=v_op.organization_id AND user_id=v_actor AND role='super_admin') THEN
  RAISE EXCEPTION 'financial_reset_report_actor_required' USING ERRCODE='42501';
 END IF;
 v_before:=app_private.financial_reset_continuation_snapshot(v_op.organization_id);
 SELECT * INTO v_existing FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=p_operation;
 IF FOUND THEN
  IF v_existing.checkpoint_kind<>'checked-reports' OR v_existing.generation<>v_op.target_generation
   OR v_before IS DISTINCT FROM v_existing.after_images THEN
   RAISE EXCEPTION 'financial_reset_report_checkpoint_changed' USING ERRCODE='40001';
  END IF;
  RETURN v_existing.result_json;
 END IF;
 IF v_op.execution_backend IS DISTINCT FROM pg_backend_pid() OR v_op.execution_xid IS DISTINCT FROM pg_current_xact_id() THEN
  RAISE EXCEPTION 'financial_reset_report_same_action_transaction_required' USING ERRCODE='55000';
 END IF;
 IF v_before IS DISTINCT FROM v_phase.after_images OR app_private.financial_reset_hash(v_before) IS DISTINCT FROM v_phase.result_json->>'after_sha256'
 OR v_zero.plan_json->'scopes' IS DISTINCT FROM app_private.financial_reset_known_zero_scope(p_operation) THEN
  RAISE EXCEPTION 'financial_reset_report_source_changed' USING ERRCODE='40001';
 END IF;
 FOREACH v_table IN ARRAY ARRAY['public.owner_event_allocation_sets','public.owner_event_owner_allocations',
   'public.owner_component_movements','public.owner_balance_periods','public.owner_balance_period_components'] LOOP
  IF v_before->v_table IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'financial_reset_report_empty_authority_required' USING ERRCODE='23514';
  END IF;
 END LOOP;
 -- The exclusive lifecycle lock is held throughout. The temporary open value
 -- cannot be observed by a concurrent writer and must be frozen at commit.
 UPDATE app_private.financial_write_controls SET status='open' WHERE organization_id=v_op.organization_id;
 PERFORM set_config('request.headers',(coalesce(nullif(v_headers,''),'{}')::jsonb||
   jsonb_build_object('x-nestory-financial-generation',v_op.target_generation::text))::text,true);
 FOR v_scope IN SELECT DISTINCT jsonb_build_object('property_id',value->'property_id','currency',value->'currency')
   FROM jsonb_array_elements(v_zero.plan_json->'scopes') WHERE value->>'property_archived_at' IS NULL LOOP
  FOR v_queue IN SELECT * FROM public.get_owner_event_allocation_queue(v_op.organization_id,
    (v_scope->>'property_id')::uuid,(v_scope->>'currency')::public.currency_code,v_period,(v_period+interval '1 month - 1 day')::date)
    ORDER BY event_date,source_type,source_line_id LOOP
   IF v_queue.allocation_state IS DISTINCT FROM 'pending' OR v_queue.source_type IS DISTINCT FROM 'management_fee_occurrence'
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_phase.after_images->'public.management_fee_occurrences') f
      WHERE f->>'id'=v_queue.source_line_id::text) THEN
    RAISE EXCEPTION 'financial_reset_report_unexpected_allocation_source' USING ERRCODE='23514';
   END IF;
   v_generated:=public.allocate_owner_event(v_op.organization_id,v_queue.source_type,v_queue.source_line_id,
     'reset-report:'||p_operation::text||':allocate:'||v_queue.source_line_id::text);
   v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('source_type',v_queue.source_type,
     'source_line_id',v_queue.source_line_id,'result',v_generated));
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.get_owner_event_allocation_queue(v_op.organization_id,(v_scope->>'property_id')::uuid,
    (v_scope->>'currency')::public.currency_code,v_period,(v_period+interval '1 month - 1 day')::date) q
    WHERE q.allocation_state IS DISTINCT FROM 'allocated') THEN
   RAISE EXCEPTION 'financial_reset_report_allocation_incomplete' USING ERRCODE='23514';
  END IF;
 END LOOP;
 FOR v_scope IN SELECT value FROM jsonb_array_elements(v_zero.plan_json->'scopes') ORDER BY value->>'property_id',value->>'owner_person_id',value->>'currency' LOOP
  IF v_scope->>'property_archived_at' IS NOT NULL THEN
   -- Ordinary period generation deliberately rejects archived properties.
   -- Preserve that contract and expose this limitation in the durable result.
   v_scopes:=v_scopes||jsonb_build_array(jsonb_build_object('scope',v_scope,'status','archived-known-zero-only'));
   CONTINUE;
  END IF;
  v_generated:=public.generate_owner_balance_period(v_op.organization_id,(v_scope->>'property_id')::uuid,
    (v_scope->>'owner_person_id')::uuid,(v_scope->>'currency')::public.currency_code,v_period,
    'reset-report:'||p_operation::text||':period:'||app_private.financial_reset_hash(v_scope));
  IF v_generated->>'status' IS DISTINCT FROM 'ready' OR (v_generated->>'component_count')::integer IS DISTINCT FROM 4 THEN
   RAISE EXCEPTION 'financial_reset_report_period_not_ready' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.component),'[]') INTO v_ledger FROM public.get_owner_balance_ledger(
    v_op.organization_id,(v_scope->>'property_id')::uuid,(v_scope->>'owner_person_id')::uuid,
    (v_scope->>'currency')::public.currency_code,v_period,v_period) l;
  IF jsonb_array_length(v_ledger)<>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_ledger) l
    WHERE l->>'period_status' IS DISTINCT FROM 'ready' OR (l->>'opening_amount')::numeric IS DISTINCT FROM 0
    OR l->>'closing_amount' IS NULL OR l->>'blocked_reason_code' IS NOT NULL) THEN
   RAISE EXCEPTION 'financial_reset_report_ledger_not_ready' USING ERRCODE='23514';
  END IF;
  v_readiness:=public.get_owner_close_readiness(v_op.organization_id,(v_scope->>'property_id')::uuid,
    (v_scope->>'owner_person_id')::uuid,(v_scope->>'currency')::public.currency_code,v_period);
  IF jsonb_typeof(v_readiness->'blockers') IS DISTINCT FROM 'array' OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_readiness->'blockers') b WHERE b->>'code' IS DISTINCT FROM 'financial_month_not_locked') THEN
   RAISE EXCEPTION 'financial_reset_report_readiness_blocked' USING ERRCODE='23514';
  END IF;
  v_scopes:=v_scopes||jsonb_build_array(jsonb_build_object('scope',v_scope,'status','ready','period',v_generated,
    'owner_ledger',v_ledger,'close_readiness',v_readiness));
 END LOOP;
 v_after:=app_private.financial_reset_continuation_snapshot(v_op.organization_id);
 FOR v_table IN SELECT key FROM jsonb_object_keys(v_before||v_after) key LOOP
  IF v_before->v_table IS NOT DISTINCT FROM v_after->v_table THEN CONTINUE; END IF;
  IF v_table NOT IN ('public.owner_event_allocation_sets','public.owner_event_owner_allocations','public.owner_component_movements',
   'public.owner_balance_periods','public.owner_balance_period_components','app_private.financial_idempotency_requests') THEN
   RAISE EXCEPTION 'financial_reset_report_unplanned_relation: %',v_table USING ERRCODE='23514';
  END IF;
  FOR v_old IN SELECT value FROM jsonb_array_elements(v_before->v_table) LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_after->v_table) a WHERE a.value=v_old) THEN
    RAISE EXCEPTION 'financial_reset_report_historical_row_changed' USING ERRCODE='23514';
   END IF;
  END LOOP;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_after->v_table) a WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_before->v_table) b WHERE b.value=a.value) LOOP
   IF v_table='app_private.financial_idempotency_requests' THEN
    IF v_row->>'operation' NOT IN ('allocate_owner_event','generate_owner_balance_period')
      OR v_row->>'status' IS DISTINCT FROM 'completed' OR (v_row->>'financial_generation')::integer IS DISTINCT FROM v_op.target_generation
      OR v_row->>'actor_id' IS DISTINCT FROM v_actor::text OR v_row->>'idempotency_key' NOT LIKE 'reset-report:'||p_operation::text||':%' THEN
     RAISE EXCEPTION 'financial_reset_report_unplanned_intent' USING ERRCODE='23514';
    END IF;
   ELSIF v_table='public.owner_event_allocation_sets' AND (v_row->>'source_type' IS DISTINCT FROM 'management_fee_occurrence'
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_allocations) a WHERE a->'source_line_id'=v_row->'source_line_id')) THEN
    RAISE EXCEPTION 'financial_reset_report_unplanned_allocation' USING ERRCODE='23514';
   ELSIF v_table='public.owner_balance_periods' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_scopes) s WHERE s->'period'->>'period_id'=v_row->>'id') THEN
    RAISE EXCEPTION 'financial_reset_report_unplanned_period' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END LOOP;
 UPDATE app_private.financial_write_controls SET status='frozen' WHERE organization_id=v_op.organization_id;
 PERFORM app_private.assert_financial_reset_frozen(p_operation);
 PERFORM app_private.record_financial_reset_phase_fence(p_operation,'reports');
 v_result:=jsonb_build_object('version',1,'operation_id',p_operation,'organization_id',v_op.organization_id,
   'generation',v_op.target_generation,'manifest_sha256',v_op.manifest_sha256,'plan_sha256',v_op.plan_sha256,
   'archive_sha256',v_op.archive_sha256,'action_sha256',v_op.action_sha256,'schema_sha256',v_op.schema_sha256,
   'zero_review_sha256',v_zero.review_sha256,'zero_authority_sha256',v_zero.result_json->>'authority_sha256',
   'continuation_review_sha256',v_phase.review_sha256,'before_sha256',app_private.financial_reset_hash(v_before),
   'after_sha256',app_private.financial_reset_hash(v_after),'scopes',v_scopes,'allocations',v_allocations,
   'reports_persisted',true,'control_reopened',false,'close_published',false,'storage_recovery_verified',false);
 INSERT INTO app_private.financial_reset_verification_checkpoints(operation_id,organization_id,checkpoint_kind,generation,
   before_images,after_images,result_json,checkpoint_sha256)
 VALUES(p_operation,v_op.organization_id,'checked-reports',v_op.target_generation,v_before,v_after,v_result,app_private.financial_reset_hash(v_result));
 PERFORM set_config('request.headers',coalesce(v_headers,''),true);
 RETURN v_result;
END;
$$;

-- No completed zero-only or continuation-only branch may adopt a fresh current
-- snapshot as its recovery authority. Later normal entries cause refusal.
CREATE FUNCTION app_private.assert_financial_reset_report_recovery_boundary(p_reset uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_checkpoint app_private.financial_reset_verification_checkpoints%ROWTYPE;
BEGIN
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_reset AND operation_kind='reset' AND status='actions_complete';
 SELECT * INTO v_checkpoint FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=p_reset AND checkpoint_kind='checked-reports';
 IF NOT FOUND OR v_checkpoint.generation<>v_op.target_generation OR v_checkpoint.checkpoint_sha256<>app_private.financial_reset_hash(v_checkpoint.result_json)
 OR app_private.financial_reset_hash(v_checkpoint.after_images) IS DISTINCT FROM v_checkpoint.result_json->>'after_sha256' THEN
  RAISE EXCEPTION 'financial_reset_report_checkpoint_required' USING ERRCODE='55000';
 END IF;
 IF app_private.financial_reset_continuation_snapshot(v_op.organization_id) IS DISTINCT FROM v_checkpoint.after_images THEN
  RAISE EXCEPTION 'financial_reset_report_checkpoint_drift' USING ERRCODE='40001';
 END IF;
END;
$$;

-- Extend existing exact-image recovery, preserving its preparation and sealing
-- checks. Every textual anchor is checked before replacing a function.
DO $integration$
DECLARE v_definition text; v_anchor text; v_replacement text;
BEGIN
 v_definition:=pg_get_functiondef('app_private.financial_reset_recovery_candidate(uuid,text,jsonb,jsonb,text)'::regprocedure);
 v_anchor:=' ELSIF p_provenance IS DISTINCT FROM ''continuation''';
 v_replacement:=E' ELSIF p_provenance=''reports'' THEN\n   IF p_relation IS NULL OR p_relation NOT IN (''public.owner_event_allocation_sets'',''public.owner_event_owner_allocations'',''public.owner_component_movements'',''public.owner_balance_periods'',''public.owner_balance_period_components'') OR p_after IS NOT NULL THEN\n     RAISE EXCEPTION ''financial_reset_recovery_report_source_invalid'' USING ERRCODE=''23514'';\n   END IF;\n'||v_anchor;
 IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_report_candidate_anchor_changed'; END IF;
 EXECUTE replace(v_definition,v_anchor,v_replacement);

 v_definition:=pg_get_functiondef('app_private.financial_reset_recovery_candidates(uuid)'::regprocedure);
 v_anchor:=' SELECT target_generation INTO STRICT v_generation FROM app_private.financial_reset_operations WHERE operation_id=p_reset_operation_id;';
 IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_report_candidates_anchor_changed'; END IF;
 v_definition:=replace(v_definition,v_anchor,v_anchor||E'\n PERFORM app_private.assert_financial_reset_report_recovery_boundary(p_reset_operation_id);');
 v_anchor:=' RETURN (SELECT coalesce(jsonb_agg(value ORDER BY value->>''relation_name'',(value->''primary_key'')::text),''[]'') FROM jsonb_array_elements(v_result));';
 v_replacement:=E' FOR v_item IN SELECT to_jsonb(c) FROM app_private.financial_reset_verification_checkpoints c WHERE operation_id=p_reset_operation_id AND checkpoint_kind=''checked-reports'' LOOP\n   FOR v_table IN SELECT key FROM jsonb_object_keys(v_item->''before_images''||v_item->''after_images'') key LOOP\n     IF v_item->''before_images''->v_table IS NOT DISTINCT FROM v_item->''after_images''->v_table OR v_table=''app_private.financial_idempotency_requests'' THEN CONTINUE; END IF;\n     FOR v_new IN SELECT value FROM jsonb_array_elements(v_item->''after_images''->v_table) a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_item->''before_images''->v_table) b WHERE b.value->''id''=a.value->''id'') LOOP\n       v_result:=v_result||jsonb_build_array(app_private.financial_reset_recovery_candidate(p_reset_operation_id,v_table,v_new,NULL,''reports''));\n     END LOOP;\n   END LOOP;\n END LOOP;\n'||v_anchor;
 IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_report_candidates_return_changed'; END IF;
 EXECUTE replace(v_definition,v_anchor,v_replacement);

 v_definition:=pg_get_functiondef('app_private.prepare_financial_reset_recovery(uuid,jsonb)'::regprocedure);
 v_anchor:='''continuation_review_sha256'',''schema_sha256''';
 IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_report_binding_keys_changed'; END IF;
 v_definition:=replace(v_definition,v_anchor,'''continuation_review_sha256'',''report_checkpoint_sha256'',''schema_sha256''');
 v_anchor:='   OR (v_phase.operation_id IS NOT NULL AND app_private.financial_reset_hash(v_snapshot) IS DISTINCT FROM v_phase.result_json->>''after_sha256'')';
 v_replacement:=E'   OR p_phase_binding->>''report_checkpoint_sha256'' IS DISTINCT FROM (SELECT checkpoint_sha256 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=v_op.restore_of AND checkpoint_kind=''checked-reports'')';
 IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_report_binding_snapshot_changed'; END IF;
 EXECUTE replace(v_definition,v_anchor,v_replacement);

 -- Seal already invokes recovery_candidates (and therefore the checkpoint
 -- boundary). Recheck at start so writes after sealing cannot be overlooked.
 v_definition:=pg_get_functiondef('app_private.start_financial_reset_actions(uuid)'::regprocedure);
 v_anchor:=' UPDATE app_private.financial_reset_operations SET status=''executing''';
 v_replacement:=E' IF EXISTS(SELECT 1 FROM app_private.financial_reset_operations o JOIN app_private.financial_reset_zero_plans z ON z.operation_id=o.restore_of WHERE o.operation_id=p_operation_id AND z.status=''complete'') THEN\n   PERFORM app_private.assert_financial_reset_report_recovery_boundary((SELECT restore_of FROM app_private.financial_reset_operations WHERE operation_id=p_operation_id));\n END IF;\n'||v_anchor;
 IF (length(v_definition)-length(replace(v_definition,v_anchor,'')))/length(v_anchor)<>1 THEN RAISE EXCEPTION 'financial_reset_report_start_anchor_changed'; END IF;
 EXECUTE replace(v_definition,v_anchor,v_replacement);
END;
$integration$;

CREATE FUNCTION app_private.finalize_financial_reset_recovery(p_operation uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_checkpoint app_private.financial_reset_verification_checkpoints%ROWTYPE;
 v_plan app_private.financial_reset_recovery_plans%ROWTYPE; v_row record; v_expected jsonb; v_actual jsonb; v_snapshot jsonb; v_result jsonb;
BEGIN
 PERFORM app_private.assert_financial_reset_checkpoint_coverage();
 PERFORM app_private.assert_financial_reset_frozen(p_operation);
 SELECT * INTO STRICT v_op FROM app_private.financial_reset_operations WHERE operation_id=p_operation FOR UPDATE;
 SELECT * INTO v_plan FROM app_private.financial_reset_recovery_plans WHERE operation_id=p_operation;
 IF v_op.operation_kind<>'restore' OR v_op.status<>'actions_complete' OR v_plan.operation_id IS NULL
 OR EXISTS(SELECT 1 FROM app_private.financial_reset_actions WHERE operation_id=p_operation AND applied_at IS NULL)
 OR EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE operation_id=p_operation)
 OR v_plan.phase_binding->>'report_checkpoint_sha256' IS DISTINCT FROM (SELECT checkpoint_sha256
   FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=v_op.restore_of AND checkpoint_kind='checked-reports') THEN
  RAISE EXCEPTION 'financial_reset_recovery_checkpoint_actions_required' USING ERRCODE='55000';
 END IF;
 v_snapshot:=app_private.financial_reset_continuation_snapshot(v_op.organization_id);
 SELECT * INTO v_checkpoint FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=p_operation;
 IF FOUND THEN
  IF v_checkpoint.checkpoint_kind<>'phase-recovery' OR v_checkpoint.after_images IS DISTINCT FROM v_snapshot THEN
   RAISE EXCEPTION 'financial_reset_recovery_checkpoint_changed' USING ERRCODE='40001';
  END IF;
  RETURN v_checkpoint.result_json;
 END IF;
 IF v_op.execution_backend IS DISTINCT FROM pg_backend_pid() OR v_op.execution_xid IS DISTINCT FROM pg_current_xact_id() THEN
  RAISE EXCEPTION 'financial_reset_recovery_checkpoint_same_transaction_required' USING ERRCODE='55000';
 END IF;
 FOR v_row IN SELECT r.* FROM app_private.financial_reset_archive_rows r JOIN app_private.financial_reset_relation_rules rule USING(relation_name)
   WHERE r.operation_id=v_op.restore_of AND rule.restore_allowed LOOP
  v_expected:=v_row.row_json;
  IF v_expected ? 'financial_generation' THEN v_expected:=jsonb_set(v_expected,'{financial_generation}',to_jsonb(v_op.target_generation)); END IF;
  SELECT value INTO v_actual FROM jsonb_array_elements(v_snapshot->v_row.relation_name) a
   WHERE app_private.financial_reset_primary_key(to_regclass(v_row.relation_name)::oid,a.value)=v_row.primary_key;
  IF v_actual IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'financial_reset_recovery_checkpoint_archive_changed' USING ERRCODE='40001'; END IF;
 END LOOP;
 FOR v_row IN SELECT * FROM app_private.financial_reset_recovery_sources WHERE operation_id=p_operation LOOP
  SELECT value INTO v_actual FROM jsonb_array_elements(v_snapshot->v_row.relation_name) a
   WHERE app_private.financial_reset_primary_key(to_regclass(v_row.relation_name)::oid,a.value)=v_row.primary_key;
  IF v_actual IS DISTINCT FROM v_row.after_row THEN RAISE EXCEPTION 'financial_reset_recovery_checkpoint_source_changed' USING ERRCODE='40001'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM app_private.financial_idempotency_requests WHERE organization_id=v_op.organization_id AND financial_generation>=v_op.target_generation) THEN
  RAISE EXCEPTION 'financial_reset_recovery_checkpoint_current_intent' USING ERRCODE='40001';
 END IF;
 v_result:=jsonb_build_object('version',1,'operation_id',p_operation,'reset_operation_id',v_op.restore_of,'organization_id',v_op.organization_id,
   'generation',v_op.target_generation,'manifest_sha256',v_op.manifest_sha256,'plan_sha256',v_op.plan_sha256,
   'archive_sha256',v_op.archive_sha256,'action_sha256',v_op.action_sha256,'schema_sha256',v_op.schema_sha256,
   'report_checkpoint_sha256',v_plan.phase_binding->>'report_checkpoint_sha256','recovery_binding_sha256',v_plan.binding_sha256,
   'recovery_sources_sha256',v_plan.sources_sha256,'after_sha256',app_private.financial_reset_hash(v_snapshot),
   'archive_rows_verified',true,'phase_rows_verified',true,'phase_intents_retired',true,'control_reopened',false,'storage_recovery_verified',false);
 INSERT INTO app_private.financial_reset_verification_checkpoints(operation_id,organization_id,checkpoint_kind,generation,
  before_images,after_images,result_json,checkpoint_sha256)
 VALUES(p_operation,v_op.organization_id,'phase-recovery',v_op.target_generation,'{}',v_snapshot,v_result,app_private.financial_reset_hash(v_result));
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.financial_reset_operation_status(p_operation_id uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('operation_id',o.operation_id,'organization_id',o.organization_id,'operation_kind',o.operation_kind,'restore_of',o.restore_of,
 'status',o.status,'source_generation',o.source_generation,'target_generation',o.target_generation,'manifest_sha256',o.manifest_sha256,
 'plan_sha256',o.plan_sha256,'schema_sha256',o.schema_sha256,'archive_sha256',o.archive_sha256,'action_sha256',o.action_sha256,
 'archive_count',o.archive_count,'action_count',o.action_count,'applied_count',(SELECT count(*) FROM app_private.financial_reset_actions a WHERE a.operation_id=o.operation_id AND applied_at IS NOT NULL),
 'completed_at',o.completed_at,'known_zero_verified',EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans z WHERE z.operation_id=o.operation_id AND z.status='complete'),
 'recovery_verified',c.checkpoint_kind IS NOT DISTINCT FROM 'phase-recovery','checkpoint_kind',c.checkpoint_kind,
 'checkpoint_sha256',c.checkpoint_sha256,'checkpoint_created_at',c.created_at,
 'checkpoint_generation_current',coalesce(c.generation=w.generation AND w.status='frozen',false),'storage_recovery_verified',false)
 FROM app_private.financial_reset_operations o LEFT JOIN app_private.financial_reset_verification_checkpoints c USING(operation_id,organization_id)
 LEFT JOIN app_private.financial_write_controls w ON w.organization_id=o.organization_id WHERE o.operation_id=p_operation_id
$$;

CREATE FUNCTION app_private.assert_financial_reset_checkpoint_commit() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_op app_private.financial_reset_operations%ROWTYPE; v_checkpoint app_private.financial_reset_verification_checkpoints%ROWTYPE;
BEGIN
 FOR v_op IN SELECT * FROM app_private.financial_reset_operations WHERE execution_backend=pg_backend_pid()
   AND execution_xid=pg_current_xact_id() AND status='actions_complete' LOOP
  IF (v_op.operation_kind='reset' AND EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans WHERE operation_id=v_op.operation_id AND status='complete'))
   OR (v_op.operation_kind='restore' AND EXISTS(SELECT 1 FROM app_private.financial_reset_recovery_plans WHERE operation_id=v_op.operation_id)) THEN
   IF NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=v_op.organization_id
     AND status='frozen' AND generation=v_op.target_generation) THEN
    RAISE EXCEPTION 'financial_reset_phase_must_commit_frozen' USING ERRCODE='23514';
   END IF;
   SELECT * INTO v_checkpoint FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=v_op.operation_id;
   IF NOT FOUND OR v_checkpoint.execution_backend<>v_op.execution_backend OR v_checkpoint.execution_xid<>v_op.execution_xid
    OR v_checkpoint.checkpoint_kind<>(CASE WHEN v_op.operation_kind='reset' THEN 'checked-reports' ELSE 'phase-recovery' END) THEN
    RAISE EXCEPTION 'financial_reset_checkpoint_must_commit' USING ERRCODE='23514';
   END IF;
   PERFORM app_private.assert_financial_reset_frozen(v_op.operation_id);
   IF v_checkpoint.after_images IS DISTINCT FROM app_private.financial_reset_continuation_snapshot(v_op.organization_id) THEN
    RAISE EXCEPTION 'financial_reset_checkpoint_changed_before_commit' USING ERRCODE='23514';
   END IF;
  END IF;
 END LOOP;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER financial_reset_checkpoint_operation_commit AFTER INSERT OR UPDATE ON app_private.financial_reset_operations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_checkpoint_commit();
CREATE CONSTRAINT TRIGGER financial_reset_checkpoint_evidence_commit AFTER INSERT ON app_private.financial_reset_verification_checkpoints
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_checkpoint_commit();
CREATE CONSTRAINT TRIGGER financial_reset_checkpoint_control_commit AFTER INSERT OR UPDATE ON app_private.financial_write_controls
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_checkpoint_commit();
-- A caller may flush the preceding triggers before a checked phase completes.
-- Completion itself must create an obligation, even when all earlier events
-- saw a merely prepared zero plan.
CREATE CONSTRAINT TRIGGER financial_reset_checkpoint_zero_commit AFTER INSERT OR UPDATE ON app_private.financial_reset_zero_plans
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.status='complete') EXECUTE FUNCTION app_private.assert_financial_reset_checkpoint_commit();
CREATE CONSTRAINT TRIGGER financial_reset_checkpoint_continuation_commit AFTER INSERT OR UPDATE ON app_private.financial_reset_continuation_plans
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.status='complete') EXECUTE FUNCTION app_private.assert_financial_reset_checkpoint_commit();
CREATE CONSTRAINT TRIGGER financial_reset_checkpoint_phase_commit AFTER INSERT ON app_private.financial_reset_phase_fences
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.assert_financial_reset_checkpoint_commit();

REVOKE ALL ON FUNCTION app_private.apply_financial_reset_reports(uuid),app_private.assert_financial_reset_report_recovery_boundary(uuid),
 app_private.finalize_financial_reset_recovery(uuid),app_private.financial_reset_operation_status(uuid),
 app_private.assert_financial_reset_checkpoint_commit(),app_private.guard_financial_reset_checkpoint_row(),
 app_private.assert_financial_reset_checkpoint_coverage() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
