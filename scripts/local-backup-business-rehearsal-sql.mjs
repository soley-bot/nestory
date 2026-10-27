// Pure SQL for the fixed private RAM rehearsal. No connection, hosted dispatch,
// credential read or production actor authority. The runtime separately attests
// its container; these SQL guards cannot prove Docker custody by themselves.
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {PILOT_BACKUP_ORGANIZATION,LOCAL_CAPTURE_POLICY} from './local-backup-capture.mjs';
import {buildPilotRehearsalBinding,bindPilotRehearsalSemantics} from './local-backup-packet-bridge.mjs';
import {inspectPilotRamRehearsalPlan,buildPilotRamInversePlan} from './local-backup-ram-rehearsal-plan.mjs';
import {buildActionTransactionSql,sqlDoBlock} from './pilot-finance-reset-executor-local.mjs';
import {catalogExpression,ledgerExpression,digestJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {RESET_REGISTRY} from './pilot-finance-reset-registry.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,digest=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error(`local_ram_rehearsal_${code}`)};
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const literal=v=>`'${String(v).replaceAll("'","''")}'`,json=v=>`${literal(JSON.stringify(v))}::jsonb`,org=`${literal(PILOT_BACKUP_ORGANIZATION)}::uuid`;
const identifier=v=>{if(!/^[a-z_][a-z0-9_]*$/.test(v))fail('identifier_invalid');return `"${v}"`};
const relation=v=>{if(!Object.hasOwn(RESET_REGISTRY,v))fail('relation_invalid');return v.split('.').map(identifier).join('.')};
export const RAM_REHEARSAL_LOCAL_GUARD=sqlDoBlock(`BEGIN
 IF session_user<>'postgres' OR current_user<>'postgres' OR current_database()<>'postgres' OR inet_server_addr() IS NOT NULL
 OR current_setting('data_directory')<>'/db/pg' OR current_setting('listen_addresses')<>'' OR current_setting('session_replication_role')<>'origin' THEN
 RAISE EXCEPTION 'local_ram_rehearsal_owned_socket_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261027005615' AND name='financial_reset_empty_books_preserved_contracts') THEN
 RAISE EXCEPTION 'local_ram_rehearsal_reviewed_transition_required'; END IF;
END`,'ram_local');
const settings="SET LOCAL standard_conforming_strings=on; SET LOCAL timezone='UTC'; SET LOCAL search_path=pg_catalog,public; SET LOCAL statement_timeout='120s';";
const begin=(readOnly=false)=>`BEGIN ISOLATION LEVEL READ COMMITTED${readOnly?' READ ONLY':''};\n${settings}\n${RAM_REHEARSAL_LOCAL_GUARD}`;
function fixtureChecked(f){
 if(!exact(f,['maker','reviewer','makerSession','reviewerSession'])||Object.values(f).some(x=>!uuid.test(x))||new Set(Object.values(f)).size!==4)fail('fixture_invalid');return f;
}

function lifecycleVerificationSql({b,p,f,recovered,recoveryId,canonicalInverse,inverseInputs,actionInputs,archiveRows}){
 const op=`${literal(b.operationId)}::uuid`,rop=recovered?`${literal(recoveryId)}::uuid`:'NULL::uuid';
 const operations=[operation(b,{audit_timestamp:p.auditTimestamp})];
 const authorities=[{operation_id:b.operationId,action:'execute',binding:actorBinding(b,p)}];
 if(recovered){
  const inversePlanSha256=digestJson({resetPlanSha256:b.planSha256,recoveryId,actionSha256:canonicalInverse.actionSha256,phaseBindingSha256:hash(inverseInputs.phaseBindingText)});
  operations.push(operation(b,{operation_id:recoveryId,operation_kind:'restore',restore_of:b.operationId,source_generation:1,target_generation:2,plan_sha256:inversePlanSha256,
   action_sha256:canonicalInverse.actionSha256,action_count:canonicalInverse.actions.length,audit_timestamp:canonicalInverse.auditTimestamp}));
  authorities.push({operation_id:recoveryId,action:'execute-recovery',binding:{...actorBinding(b,p),recovery:{operation_id:recoveryId,source_generation:1,target_generation:2,
   plan_sha256:inversePlanSha256,action_sha256:canonicalInverse.actionSha256,action_count:canonicalInverse.actions.length,phase_binding_sha256:hash(inverseInputs.phaseBindingText),
   report_checkpoint_sha256:inverseInputs.phaseBinding.report_checkpoint_sha256,review_artifact_sha256:inversePlanSha256,execution_business_date:p.executionBusinessDate}}});
 }
 return `${sqlDoBlock(`DECLARE r jsonb; a jsonb; stored jsonb; BEGIN
 FOR r IN SELECT value FROM jsonb_array_elements(${json(operations)}) LOOP
  SELECT to_jsonb(o) INTO STRICT stored FROM app_private.financial_reset_operations o WHERE operation_id=(r->>'operation_id')::uuid;
  IF NOT stored @> (r-'audit_timestamp') OR (stored->>'audit_timestamp')::timestamptz IS DISTINCT FROM (r->>'audit_timestamp')::timestamptz
   OR stored->>'status'<>'actions_complete' OR stored->>'database_name'<>'postgres' OR (stored->>'database_oid')::oid<>(SELECT oid FROM pg_database WHERE datname='postgres')
   OR stored->>'completed_at' IS NULL OR stored->>'execution_backend' IS NULL OR stored->>'execution_xid' IS NULL THEN RAISE EXCEPTION 'local_ram_rehearsal_operation_changed'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_operations WHERE organization_id=${org} AND operation_id NOT IN (${op},${recovered?rop:op})) THEN RAISE EXCEPTION 'local_ram_rehearsal_unexpected_operation'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(${json(archiveRows)}) LOOP
  IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_archive_rows s WHERE s.operation_id=${op} AND s.organization_id=${org}
   AND s.relation_name=r->>'relation_name' AND s.relation_oid=s.relation_name::regclass AND s.primary_key=r->'primary_key'
   AND s.row_json::text=r->>'row_text' AND s.row_sha256=r->>'row_sha256') THEN RAISE EXCEPTION 'local_ram_rehearsal_archive_changed'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(${json(actionInputs)}) LOOP
  FOR a IN SELECT value FROM jsonb_array_elements(r->'actions') LOOP
   SELECT jsonb_build_object('action_id',s.action_id,'ordinal',s.ordinal,'relation_name',s.relation_name,'primary_key',s.primary_key,'kind',s.kind,
    'before_row_text',s.before_row::text,'after_row_text',s.after_row::text,'before_sha256',s.before_sha256,'after_sha256',s.after_sha256) INTO STRICT stored
    FROM app_private.financial_reset_actions s WHERE s.operation_id=(r->>'operation_id')::uuid AND s.action_id=(a->>'action_id')::uuid AND s.applied_at IS NOT NULL
    AND s.organization_id=${org} AND s.relation_oid=s.relation_name::regclass;
   IF stored IS DISTINCT FROM (a-ARRAY['changed_columns','insert_columns']) THEN RAISE EXCEPTION 'local_ram_rehearsal_action_changed'; END IF;
  END LOOP;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans WHERE operation_id=${op} AND organization_id=${org} AND status='complete'
  AND plan_json::text=${literal(p.zeroPlanText)} AND review_sha256=${literal(p.zeroReviewSha256)}
  AND result_json->>'authority_sha256'=app_private.financial_reset_hash(result_json->'authority_rows')) THEN RAISE EXCEPTION 'local_ram_rehearsal_zero_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_continuation_plans WHERE operation_id=${op} AND organization_id=${org} AND status='complete'
  AND plan_json-'source_sha256'=${literal(p.continuationPlanText)}::jsonb AND review_sha256=app_private.financial_reset_hash(plan_json)
  AND before_images=after_images AND result_json->>'before_sha256'=app_private.financial_reset_hash(before_images)
  AND result_json->>'after_sha256'=app_private.financial_reset_hash(after_images)
  AND result_json->>'contracts_unchanged'='true' AND result_json->>'empty_books'='true' AND result_json->>'billing_paused'='true'
  AND result_json->>'billing_complete'='false' AND result_json->>'close_ready'='false' AND result_json->>'deferred_lease_count'='0'
  AND result_json->>'preserved_unbilled_lease_count'=${literal(String(p.continuationPlan.leases.length))}
  AND result_json->>'invoice_date_policy'='empty-books-no-invoices') THEN RAISE EXCEPTION 'local_ram_rehearsal_continuation_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=${op} AND organization_id=${org} AND checkpoint_kind='checked-reports'
  AND result_json->>'empty_books'='true' AND result_json->>'billing_paused'='true' AND result_json->>'billing_complete'='false'
  AND result_json->>'close_ready'='false' AND result_json->>'contracts_unchanged'='true' AND result_json->>'contracts_sha256'=${literal(p.continuationPlan.contracts_sha256)}
  AND result_json->>'deferred_lease_count'='0' AND result_json->>'preserved_unbilled_lease_count'=${literal(String(p.continuationPlan.leases.length))}
  AND result_json->>'control_reopened'='false' AND result_json->>'close_published'='false' AND result_json->>'reports_persisted'='true'
  AND result_json->>'report_review_sha256'=${literal(p.reportPlan.report_review_sha256)} AND result_json->>'continuation_semantic_sha256'=${literal(hash(p.continuationPlanText))})
 THEN RAISE EXCEPTION 'local_ram_rehearsal_empty_report_changed'; END IF;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_phase_fences s JOIN app_private.financial_reset_operations o USING(operation_id)
  WHERE s.organization_id=${org} AND (s.operation_id<>${op} OR s.phase NOT IN ('known-zero','continuation','reports') OR s.generation<>1 OR s.financial_start_date<>'2026-10-01'
   OR s.backend_pid<>o.execution_backend OR s.transaction_id<>o.execution_xid)) THEN RAISE EXCEPTION 'local_ram_rehearsal_phase_fence_changed'; END IF;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_zero_approvals s WHERE s.organization_id=${org} AND
  (s.operation_id<>${op} OR s.review_sha256<>${literal(p.zeroReviewSha256)} OR s.approved_by<>CASE s.approval_kind WHEN 'maker' THEN ${literal(f.maker)}::uuid ELSE ${literal(f.reviewer)}::uuid END))
 OR EXISTS(SELECT 1 FROM app_private.financial_reset_zero_session_endorsements s WHERE s.organization_id=${org} AND
  (s.operation_id<>${op} OR s.review_sha256<>${literal(p.zeroReviewSha256)} OR s.endorsement_number<>1 OR
   s.actor_id<>CASE s.approval_kind WHEN 'maker' THEN ${literal(f.maker)}::uuid ELSE ${literal(f.reviewer)}::uuid END OR
   s.session_id<>CASE s.approval_kind WHEN 'maker' THEN ${literal(f.makerSession)}::uuid ELSE ${literal(f.reviewerSession)}::uuid END)) THEN RAISE EXCEPTION 'local_ram_rehearsal_approvals_changed'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(${json(authorities)}) LOOP
  IF (SELECT count(*) FROM app_private.financial_reset_actor_authorizations a JOIN app_private.financial_reset_operations o ON o.operation_id=(r->>'operation_id')::uuid
   WHERE a.organization_id=${org} AND a.action=r->>'action' AND a.binding=r->'binding' AND a.binding_sha256=app_private.financial_reset_hash(a.binding)
   AND a.actor_id=${literal(f.maker)}::uuid AND a.session_id=${literal(f.makerSession)}::uuid AND a.consumed_at IS NOT NULL
   AND a.backend_pid=o.execution_backend AND a.transaction_id=o.execution_xid)<>1 THEN RAISE EXCEPTION 'local_ram_rehearsal_authorization_changed'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c JOIN app_private.financial_reset_operations o USING(operation_id)
  WHERE c.organization_id=${org} AND (c.operation_id NOT IN (${op},${recovered?rop:op}) OR c.generation<>o.target_generation OR c.checkpoint_sha256<>app_private.financial_reset_hash(c.result_json)
   OR c.execution_backend<>o.execution_backend OR c.execution_xid<>o.execution_xid OR c.checkpoint_kind<>CASE WHEN c.operation_id=${op} THEN 'checked-reports' ELSE 'phase-recovery' END))
 OR (SELECT after_images FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=${recovered?rop:op}) IS DISTINCT FROM app_private.financial_reset_continuation_snapshot(${org}) THEN RAISE EXCEPTION 'local_ram_rehearsal_checkpoint_changed'; END IF;
 ${recovered?`IF NOT EXISTS(SELECT 1 FROM app_private.financial_reset_recovery_plans WHERE operation_id=${rop} AND organization_id=${org} AND reset_operation_id=${op}
  AND phase_binding=${literal(inverseInputs.phaseBindingText)}::jsonb AND binding_sha256=app_private.financial_reset_hash(phase_binding)
  AND source_count=${inverseInputs.phaseSources.length} AND sources_sha256=${literal(inverseInputs.phaseBinding.sources_sha256)}) THEN RAISE EXCEPTION 'local_ram_rehearsal_recovery_changed'; END IF;
 IF EXISTS((SELECT relation_name,primary_key,before_row::text,after_row::text,kind,before_sha256,after_sha256,provenance FROM app_private.financial_reset_recovery_sources WHERE operation_id=${rop})
 EXCEPT (SELECT x.relation_name,x.primary_key,x.before_row_text,x.after_row_text,x.kind,x.before_sha256,x.after_sha256,x.provenance
 FROM jsonb_to_recordset(${json(inverseInputs.phaseSources)}) x(relation_name text,primary_key jsonb,before_row_text text,after_row_text text,kind text,before_sha256 text,after_sha256 text,provenance text))) THEN RAISE EXCEPTION 'local_ram_rehearsal_recovery_sources_changed'; END IF;`:''}
 END`,'ram_verify_lifecycle')}
 ${sqlDoBlock(`DECLARE r record; BEGIN
 FOR r IN SELECT * FROM jsonb_to_recordset(${json(LOCAL_CAPTURE_POLICY.filter(v=>v.table.startsWith('app_private.financial_reset_')||v.table==='app_private.financial_write_controls').map(v=>({table_name:v.table})))}) x(table_name text) LOOP
  EXECUTE format('INSERT INTO ram_expected SELECT %L,app_private.financial_reset_primary_key(%L::regclass,to_jsonb(t)),to_jsonb(t)::text FROM %s t WHERE organization_id=$1',r.table_name,r.table_name,r.table_name::regclass) USING ${org};
 END LOOP; END`,'ram_verified_lifecycle_rows')}`;
}

function auditVerificationSql({b,p,f}){
 const op=`${literal(b.operationId)}::uuid`;
 // The checkpoint was produced by the pinned ordinary command implementations.
 // Retained originals remain in ram_expected; only these exact immutable image
 // additions may survive recovery. No live row is adopted as an expected row.
 return `CREATE TEMP TABLE ram_audit_additions ON COMMIT DROP AS
 SELECT k.relation_name,app_private.financial_reset_primary_key(k.relation_name::regclass,a) primary_key,a row_json
 FROM app_private.financial_reset_verification_checkpoints c,
 (VALUES('public.activity_logs'),('app_private.financial_idempotency_requests')) k(relation_name),
 LATERAL jsonb_array_elements(c.after_images->k.relation_name) a
 WHERE c.operation_id=${op} AND NOT EXISTS(SELECT 1 FROM ram_expected e WHERE e.relation_name=k.relation_name AND e.row_text::jsonb=a);
 ${sqlDoBlock(`DECLARE n bigint; r record; BEGIN
 SELECT count(*) INTO n FROM ram_phase_rows WHERE relation_name='public.owner_opening_balance_requests';
 IF (SELECT count(*) FROM ram_audit_additions WHERE relation_name='public.activity_logs')<>2*n THEN RAISE EXCEPTION 'local_ram_rehearsal_audit_count_changed'; END IF;
 FOR r IN SELECT row_json FROM ram_phase_rows WHERE relation_name='public.owner_opening_balance_requests' LOOP
  IF (SELECT count(*) FROM ram_audit_additions WHERE relation_name='public.activity_logs' AND row_json->>'entity_id'=r.row_json->>'id' AND row_json->>'action'='submitted')<>1
  OR (SELECT count(*) FROM ram_audit_additions WHERE relation_name='public.activity_logs' AND row_json->>'entity_id'=r.row_json->>'id' AND row_json->>'action'='approved')<>1 THEN RAISE EXCEPTION 'local_ram_rehearsal_audit_pair_changed'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM ram_audit_additions a WHERE relation_name='public.activity_logs' AND
  (row_json->>'organization_id' IS DISTINCT FROM ${org}::text OR row_json->>'entity_type' IS DISTINCT FROM 'owner_opening_balance_request'
  OR row_json->>'action' NOT IN ('submitted','approved') OR row_json->'previous_values' IS DISTINCT FROM 'null'::jsonb
  OR row_json->>'actor_id' IS DISTINCT FROM CASE row_json->>'action' WHEN 'submitted' THEN ${literal(f.maker)} ELSE ${literal(f.reviewer)} END
  OR row_json->'new_values'->>'source' IS DISTINCT FROM 'checked_rpc'
  OR row_json->'new_values'->>'operation' IS DISTINCT FROM CASE row_json->>'action' WHEN 'submitted' THEN 'submit_owner_opening_balance' ELSE 'review_owner_opening_balance' END
  OR NOT EXISTS(SELECT 1 FROM ram_audit_additions i WHERE i.relation_name='app_private.financial_idempotency_requests'
   AND i.row_json->>'id'=a.row_json->'new_values'->>'financial_idempotency_request_id' AND i.row_json->>'payload_hash'=a.row_json->'new_values'->>'payload_hash')))
 THEN RAISE EXCEPTION 'local_ram_rehearsal_audit_changed'; END IF;
 IF EXISTS(SELECT 1 FROM ram_audit_additions a WHERE relation_name='app_private.financial_idempotency_requests' AND
  (row_json->>'organization_id' IS DISTINCT FROM ${org}::text OR row_json->>'financial_generation' IS DISTINCT FROM '1' OR row_json->>'status' IS DISTINCT FROM 'completed'
   OR NOT ((row_json->>'operation' IN ('submit_owner_opening_balance','review_owner_opening_balance')
    AND row_json->>'idempotency_key' LIKE 'reset-zero:'||${op}::text||':%'
    AND EXISTS(SELECT 1 FROM ram_audit_additions l WHERE l.relation_name='public.activity_logs' AND l.row_json->'new_values'->>'financial_idempotency_request_id'=a.row_json->>'id'
      AND l.row_json->>'actor_id'=a.row_json->>'actor_id'))
    OR (row_json->>'operation'='generate_owner_balance_period' AND row_json->>'actor_id'=${literal(f.maker)}
     AND row_json->>'idempotency_key' LIKE 'reset-report:'||${op}::text||':period:%'
     AND EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints c,LATERAL jsonb_array_elements(c.result_json->'scopes') s
      WHERE c.operation_id=${op} AND s->>'status'='empty-books-billing-paused' AND row_json->>'idempotency_key'='reset-report:'||${op}::text||':period:'||app_private.financial_reset_hash(s->'scope'))))))
 THEN RAISE EXCEPTION 'local_ram_rehearsal_retired_intent_changed'; END IF;
 IF (SELECT count(*) FROM ram_audit_additions WHERE relation_name='app_private.financial_idempotency_requests')<>2*n+
  (SELECT count(*) FROM app_private.financial_reset_verification_checkpoints c,LATERAL jsonb_array_elements(c.result_json->'scopes') s WHERE c.operation_id=${op} AND s->>'status'='empty-books-billing-paused')
 THEN RAISE EXCEPTION 'local_ram_rehearsal_retired_intent_count_changed'; END IF;
 END`,'ram_verify_audit')}
 INSERT INTO ram_expected SELECT relation_name,primary_key,row_json::text FROM ram_audit_additions;`;
}
function accepted(plan,planBinding){const b=buildPilotRehearsalBinding(plan);if(!isDeepStrictEqual(b,planBinding))fail('binding_changed');return b}
function phaseChecked(plan,fixture,p){
 fixtureChecked(fixture);
 if(!exact(p,['zeroPlan','zeroPlanText','zeroReviewSha256','continuationPlan','continuationPlanText','reportPlan','auditTimestamp','timezone','executionBusinessDate','fixtureSourceSha256','fixtureForeignSha256','fixtureRows','fixtureTransactionId','reportRevisionBefore'])||
   ![p.zeroReviewSha256,p.reportPlan?.report_review_sha256,p.fixtureSourceSha256,p.fixtureForeignSha256].every(x=>digest.test(x))||
   !Number.isFinite(Date.parse(p.auditTimestamp))||!/^2026-10-\d{2}$/.test(p.executionBusinessDate)||typeof p.timezone!=='string'||
   hash(p.zeroPlanText)!==p.zeroReviewSha256||!isDeepStrictEqual(JSON.parse(p.zeroPlanText),p.zeroPlan)||
   !isDeepStrictEqual(JSON.parse(p.continuationPlanText),p.continuationPlan)||p.zeroPlan.version!==4||p.zeroPlan.maker_actor_id!==fixture.maker||p.zeroPlan.reviewer_actor_id!==fixture.reviewer||
   p.continuationPlan.actor_id!==fixture.maker||p.continuationPlan.execution_business_date!==p.executionBusinessDate||
   !Array.isArray(p.fixtureRows)||p.fixtureRows.length!==2||!/^[0-9]+$/.test(p.reportRevisionBefore)||!transactionIdValid(p.fixtureTransactionId))fail('phases_changed');
 for(const row of p.fixtureRows){if(!exact(row,['rowText','rowSha256'])||typeof row.rowText!=='string'||hash(row.rowText)!==row.rowSha256)fail('fixture_readback_changed');
  const v=JSON.parse(row.rowText);if(v.organization_id!==PILOT_BACKUP_ORGANIZATION||![fixture.maker,fixture.reviewer].includes(v.user_id)||v.role!=='super_admin'||v.branch_id!==null||v.person_id!==null)fail('fixture_readback_changed');}
 if(new Set(p.fixtureRows.map(r=>JSON.parse(r.rowText).user_id)).size!==2)fail('fixture_readback_changed');
 bindPilotRehearsalSemantics(plan,{zeroPlan:p.zeroPlan,zeroPlanText:p.zeroPlanText,continuationPlan:p.continuationPlan,reportPlan:p.reportPlan});return p;
}
function catalogGuard(plan){const v=inspectPilotRamRehearsalPlan(plan);return sqlDoBlock(`BEGIN
 IF ${catalogExpression} IS DISTINCT FROM ${json(v.executionBaseline.catalog)} OR ${ledgerExpression} IS DISTINCT FROM ${json(v.executionBaseline.ledger)} THEN
 RAISE EXCEPTION 'local_ram_rehearsal_execution_schema_changed'; END IF; END`,'ram_catalog')}
function claims(actor,session){return sqlDoBlock(`BEGIN
 PERFORM set_config('request.jwt.claim.sub',${literal(actor)},true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',${literal(actor)},'session_id',${literal(session)},'role','authenticated','aud','authenticated','is_anonymous',false,
 'exp',floor(extract(epoch FROM clock_timestamp()+interval '1 hour'))::bigint)::text,true);
END`,'ram_synthetic_claims')}
const clearClaims=sqlDoBlock("BEGIN PERFORM set_config('request.jwt.claim.sub','',true); PERFORM set_config('request.jwt.claims','{}',true); END",'ram_clear_claims');
function actorGuard(f){return sqlDoBlock(`BEGIN
 IF (SELECT count(*) FROM auth.sessions WHERE (id,user_id) IN ((${literal(f.makerSession)}::uuid,${literal(f.maker)}::uuid),(${literal(f.reviewerSession)}::uuid,${literal(f.reviewer)}::uuid)))<>2
 OR (SELECT count(*) FROM public.organization_members WHERE organization_id=${org} AND user_id IN (${literal(f.maker)}::uuid,${literal(f.reviewer)}::uuid)
 AND role='super_admin' AND branch_id IS NULL AND person_id IS NULL)<>2 THEN RAISE EXCEPTION 'local_ram_rehearsal_fixture_changed'; END IF;
END`,'ram_actors')}
export function buildRamActorFixtureSql(fixture){
 const f=fixtureChecked(fixture),ids=[f.maker,f.reviewer];
 return `${begin()}\n${sqlDoBlock(`BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=ANY(ARRAY[${ids.map(x=>literal(x)+'::uuid').join(',')}]))
 OR EXISTS(SELECT 1 FROM auth.sessions WHERE id=ANY(ARRAY[${[f.makerSession,f.reviewerSession].map(x=>literal(x)+'::uuid').join(',')}]))
 OR EXISTS(SELECT 1 FROM public.organization_members WHERE user_id=ANY(ARRAY[${ids.map(x=>literal(x)+'::uuid').join(',')}])) THEN
 RAISE EXCEPTION 'local_ram_rehearsal_synthetic_actor_collision'; END IF;
 IF EXISTS(SELECT 1 FROM app_private.privileged_email_step_up_policies WHERE organization_id=${org} AND enforcement_enabled) THEN
 RAISE EXCEPTION 'local_ram_rehearsal_step_up_policy_not_fixture_eligible'; END IF;
END`,'ram_fixture_new')}
 INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,is_anonymous)
 SELECT actor,'authenticated','authenticated','ram-rehearsal-'||actor::text||'@test.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,false
 FROM unnest(ARRAY[${ids.map(x=>literal(x)+'::uuid').join(',')}]) actor;
 INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal) VALUES
 (${literal(f.makerSession)},${literal(f.maker)},clock_timestamp(),clock_timestamp(),'aal1'),(${literal(f.reviewerSession)},${literal(f.reviewer)},clock_timestamp(),clock_timestamp(),'aal1');
 INSERT INTO public.organization_members(organization_id,user_id,role) VALUES (${org},${literal(f.maker)},'super_admin'),(${org},${literal(f.reviewer)},'super_admin');
 ${actorGuard(f)}
 SELECT jsonb_build_object('format','nestory-local-synthetic-actor-fixture-v1','actorCount',2,'sessionCount',2,
 'authorityKind','local-sql-session-fixture','productionPermissionProven',false,'customerAuthImpersonated',false,'fixtureTransactionId',txid_current()::text);
 COMMIT;`;
}
function operation(b,extra={}){return{operation_id:b.operationId,organization_id:b.organizationId,operation_kind:'reset',restore_of:null,
 source_generation:0,target_generation:1,manifest_sha256:b.materialization.manifestSha256,plan_sha256:b.planSha256,schema_sha256:b.executionBaseline.schemaSha256,
 archive_sha256:b.materialization.archiveSha256,action_sha256:b.materialization.actionSha256,archive_count:b.materialization.archiveRows,action_count:b.materialization.actionCount,audit_actor:null,...extra}}
// Replace native error text with a fixed phase label; preserve its SQLSTATE and
// abort the enclosing transaction. Never copy customer-bearing error details.
function prepareDiagnostic(section,sql){return `BEGIN\n${sql}\nEXCEPTION WHEN OTHERS THEN
 RAISE EXCEPTION USING ERRCODE=SQLSTATE, MESSAGE='local_ram_rehearsal_prepare_${section}_failed', DETAIL='', HINT='';
END;`}
const transactionIdValid=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
export function buildRamResetPrepareSql({plan,planBinding,fixture,fixtureTransactionId}){
 const b=accepted(plan,planBinding),f=fixtureChecked(fixture),op=`${literal(b.operationId)}::uuid`;
 if(!transactionIdValid(fixtureTransactionId))fail('fixture_transaction_invalid');
 return `${begin()}\n${catalogGuard(plan)}\n${actorGuard(f)}
 SELECT pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||${org}::text,0));
 ${sqlDoBlock(`BEGIN IF EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=${org}) OR EXISTS(SELECT 1 FROM app_private.financial_reset_operations WHERE organization_id=${org}) THEN
 RAISE EXCEPTION 'local_ram_rehearsal_not_unenrolled'; END IF; END`,'ram_unenrolled')}
 INSERT INTO app_private.financial_write_controls(organization_id,generation,status,financial_start_date) VALUES(${org},1,'frozen','2026-10-01');
 ${sqlDoBlock(`BEGIN
 ${prepareDiagnostic('operation',`PERFORM app_private.prepare_financial_reset_operation(${json(operation(b))}||jsonb_build_object('audit_timestamp',clock_timestamp()));`)}
 ${prepareDiagnostic('archive',`PERFORM app_private.archive_financial_reset_rows(${op},${json(plan.archiveRows)});`)}
 ${prepareDiagnostic('actions',`PERFORM app_private.prepare_financial_reset_actions(${op},${json(plan.actions)});`)}
END`,'ram_prepare')}
 ${sqlDoBlock(`DECLARE zero_value jsonb; continuation_value jsonb; BEGIN
 ${prepareDiagnostic('zero_scope',`zero_value:=jsonb_build_object('version',4,'operation_id',${op},'organization_id',${org},'manifest_sha256',${literal(b.materialization.manifestSha256)},'reset_plan_sha256',${literal(b.planSha256)},
 'maker_actor_id',${literal(f.maker)},'reviewer_actor_id',${literal(f.reviewer)},'effective_date','2026-10-01','currencies','["USD"]'::jsonb,
 'scopes',app_private.financial_reset_empty_zero_scope_on_date(${org},DATE '2026-10-01'));`)}
 ${prepareDiagnostic('continuation',`continuation_value:=jsonb_build_object('version',4,'actor_id',${literal(f.maker)},'billing_period_start','2026-10-01','issue_date','2026-10-01',
 'execution_business_date',app_private.rent_business_date(${org},statement_timestamp()),'invoice_date_policy','empty-books-no-invoices',
 'contracts_sha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(${org})),
 'leases',(SELECT coalesce(jsonb_agg(jsonb_build_object('lease_id',l.id,'disposition','preserve-unbilled','source_sha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_lease_source(${org},l.id))) ORDER BY l.id),'[]'::jsonb)
 FROM public.leases l WHERE l.organization_id=${org}));
 PERFORM app_private.assert_financial_reset_empty_semantic(continuation_value);`)}
 CREATE TEMP TABLE ram_phases ON COMMIT DROP AS SELECT zero_value AS zero_plan,continuation_value AS continuation_plan;
 END`,'ram_phase_build')}
 ${sqlDoBlock(`DECLARE r record; BEGIN ${prepareDiagnostic('zero_plan',`SELECT * INTO STRICT r FROM ram_phases;
 PERFORM app_private.prepare_financial_reset_empty_zero_plan(${op},r.zero_plan,app_private.financial_reset_hash(r.zero_plan));`)} END`,'ram_zero_prepare')}
 ${sqlDoBlock(`BEGIN ${prepareDiagnostic('readback',`CREATE TEMP TABLE ram_prepare_readback ON COMMIT DROP AS
 SELECT jsonb_build_object('zeroPlan',zero_plan,'zeroPlanText',zero_plan::text,'zeroReviewSha256',app_private.financial_reset_hash(zero_plan),
 'continuationPlan',continuation_plan,'continuationPlanText',continuation_plan::text,
 'reportPlan',jsonb_build_object('report_review_sha256',app_private.financial_reset_hash(jsonb_build_object('mode','empty-books-no-invoices','operation_id',${op},'zero_semantic_sha256',app_private.financial_reset_hash(zero_plan-ARRAY['maker_actor_id','reviewer_actor_id','manifest_sha256','reset_plan_sha256']),'continuation_semantic_sha256',app_private.financial_reset_hash(continuation_plan-'actor_id')))),
 'auditTimestamp',(SELECT audit_timestamp FROM app_private.financial_reset_operations WHERE operation_id=${op}),
 'timezone',(SELECT operational_timezone FROM public.organizations WHERE id=${org}),'executionBusinessDate',continuation_plan->>'execution_business_date',
 'fixtureSourceSha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(${org})),
 'fixtureForeignSha256',app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(${org})),
 'fixtureRows',(SELECT jsonb_agg(jsonb_build_object('rowText',to_jsonb(m)::text,'rowSha256',app_private.financial_reset_hash(to_jsonb(m))) ORDER BY user_id) FROM public.organization_members m WHERE organization_id=${org} AND user_id IN (${literal(f.maker)}::uuid,${literal(f.reviewer)}::uuid)),
 'fixtureTransactionId',${literal(fixtureTransactionId)},
 'reportRevisionBefore',(SELECT coalesce(sum(revision),0)::text FROM app_private.financial_report_source_revisions WHERE organization_id=${org})) AS result FROM ram_phases;`)} END`,'ram_prepare_readback')}
 SELECT result FROM ram_prepare_readback;
 COMMIT;`;
}
function executionDiagnostic(section,sql){
 const timed=['known_zero','continuation','reports'].includes(section);
 const elapsed="floor(extract(epoch FROM clock_timestamp()-ram_phase_started)*1000)::bigint";
 const notice=outcome=>timed?`RAISE NOTICE 'local_ram_rehearsal_phase:${section}:${outcome}:%',${elapsed};`:'';
 return `${timed?'DECLARE ram_phase_started timestamptz:=clock_timestamp(); ':''}BEGIN\n${sql}\n${notice('success')}\nEXCEPTION WHEN query_canceled OR OTHERS THEN
 ${notice('failure')}
 RAISE EXCEPTION USING ERRCODE=SQLSTATE, MESSAGE='local_ram_rehearsal_execute_${section}_failed', DETAIL='', HINT='';
END`;}
const executionBlock=(section,sql)=>sqlDoBlock(executionDiagnostic(section,sql),`ram_execute_${section}`);
// Only complete literal messages from the pinned native action/recovery guards
// may leave the SQL exception handler. Native row/constraint/context text does not.
export const RAM_INVERSE_NATIVE_CAUSES=Object.freeze([
 'financial_reset_primary_key_required','financial_reset_relation_not_allowed','financial_reset_full_typed_row_required',
 'financial_reset_evidence_immutable','financial_reset_initial_binding_invalid','financial_reset_binding_immutable',
 'financial_reset_status_transition_invalid','financial_reset_operation_id_reused','financial_reset_restore_binding_invalid',
 'financial_reset_action_immutable','financial_reset_action_scope_invalid','financial_reset_action_not_preparable',
 'financial_reset_action_archive_required','financial_reset_action_before_invalid','financial_reset_action_after_invalid',
 'financial_reset_restore_image_invalid','financial_reset_canonical_action_text_required',
 'financial_reset_manifest_counts_or_digest_mismatch','financial_reset_action_chain_mismatch','financial_reset_restore_final_image_not_original',
 'financial_reset_next_action_required','financial_reset_capability_removal_invalid','financial_reset_capability_scope_invalid',
 'financial_reset_capability_transaction_invalid','financial_reset_capability_entry_invalid','financial_reset_exact_row_action_mismatch',
 'financial_reset_action_event_reused','financial_reset_final_stored_image_mismatch','financial_reset_transaction_incomplete',
 'financial_reset_recovery_phase_binding_invalid','financial_reset_recovery_plan_id_reused','financial_reset_recovery_action_source_mismatch',
 'financial_reset_phase_recovery_plan_required','financial_reset_recovery_sources_not_exactly_covered','financial_reset_recovery_original_archive_not_covered',
 'financial_reset_checkpoint_transaction_sealed','financial_reset_phase_must_commit_frozen',
 'financial_reset_checkpoint_must_commit','financial_reset_checkpoint_changed_before_commit',
]);
const inverseCauseMapperSql=`CREATE FUNCTION pg_temp.ram_inverse_native_cause(p_message text) RETURNS text
 LANGUAGE sql IMMUTABLE SET search_path='' AS $ram_inverse_mapper$
 SELECT CASE p_message
 ${RAM_INVERSE_NATIVE_CAUSES.map(code=>`WHEN '${code}' THEN '${code}'`).join('\n ')}
 ELSE NULL::text END
 $ram_inverse_mapper$;`;
const inverseDiagnostic=(section,sql)=>`DECLARE ram_inverse_message text; ram_inverse_cause text; BEGIN\n${sql}\nEXCEPTION WHEN query_canceled OR OTHERS THEN
 GET STACKED DIAGNOSTICS ram_inverse_message=MESSAGE_TEXT;
 ram_inverse_cause:=pg_temp.ram_inverse_native_cause(ram_inverse_message);
 ram_inverse_message:=NULL;
 IF ram_inverse_cause IS NOT NULL THEN RAISE NOTICE 'local_ram_rehearsal_inverse_cause:${section}:%',ram_inverse_cause; END IF;
 RAISE EXCEPTION USING ERRCODE=SQLSTATE, MESSAGE='local_ram_rehearsal_inverse_${section}_failed', DETAIL='', HINT='';
END`;
const inverseBlock=(section,sql)=>sqlDoBlock(inverseDiagnostic(section,sql),`ram_inverse_${section}`);
function nativeActions(operationId,actions,finalize=false,diagnostics=false){
 const inner=buildActionTransactionSql(operationId,actions,null,null,finalize);
 if(!inner.startsWith('BEGIN;\n')||!inner.endsWith('\nCOMMIT;'))fail('native_action_builder_changed');
 // Native action functions return void except recovery finalization. Suppress
 // every intermediate result so the last SELECT is the only JSON readback.
 let body=inner.slice(7,-8);
 const diagnosticBlock=diagnostics==='inverse'?inverseBlock:executionBlock;
 if(diagnostics){
  let count=0;
  body=body.replace(/^DO (\$[a-zA-Z0-9_]+\$) ([\s\S]*?) \1;/gm,(_,tag,block)=>{count++;return diagnosticBlock('native_action',`${block};`)});
  if(count!==actions.length)fail('native_action_builder_changed');
 }
 return body.replace(/^SELECT (app_private\.[^\n]+);$/gm,(_,call)=>{
  if(!diagnostics)return sqlDoBlock(`BEGIN PERFORM ${call}; END`,'ram_native');
  const section=call.startsWith('app_private.start_financial_reset_actions(')?'native_start':
   call.startsWith('app_private.arm_financial_reset_action(')?'native_arm':
   call.startsWith('app_private.complete_financial_reset_actions(')?'native_complete':
   diagnostics==='inverse'&&call.startsWith('app_private.finalize_financial_reset_recovery(')?'finalize':null;
  if(!section)fail('native_action_builder_changed');
  return diagnosticBlock(section,`PERFORM ${call};`);
 });
}
function actorBinding(b,p){return{version:1,operation_id:b.operationId,project_ref:'syntheticprojectrefa',organization_id:b.organizationId,
 packet_sha256:b.planSha256,main_sha:'0'.repeat(40),sources_sha256:b.planSha256,schema_sha256:b.executionBaseline.schemaSha256,
 ledger_sha256:b.executionBaseline.ledgerSha256,source_snapshot_sha256:p.fixtureSourceSha256,source_generation:0,target_generation:1,
 cutoff:'2026-10-01',issue_date:'2026-10-01',timezone:p.timezone,execution_business_date:p.executionBusinessDate,invoice_date_policy:'empty-books-no-invoices',
 manifest_sha256:b.materialization.manifestSha256,plan_sha256:b.planSha256,archive_sha256:b.materialization.archiveSha256,action_sha256:b.materialization.actionSha256,
 archive_artifact_sha256:b.materialization.archiveSha256,archive_count:b.materialization.archiveRows,action_count:b.materialization.actionCount,
 zero_review_sha256:p.zeroReviewSha256,continuation_semantic_sha256:hash(p.continuationPlanText),report_review_sha256:p.reportPlan.report_review_sha256,continuation_semantic:p.continuationPlan}}
function authorizationSql(f,binding,action,diagnostics=false){
 const diagnosticBlock=diagnostics==='inverse'?inverseBlock:executionBlock;
 const authorize=`UPDATE ram_actor_authorization SET authorization_id=public.authorize_financial_reset_hosted_action(binding,${literal(action)});`;
 const consume=`DECLARE r record; BEGIN SELECT * INTO STRICT r FROM ram_actor_authorization; PERFORM app_private.consume_financial_reset_actor_authorization(r.authorization_id,r.binding,${literal(action)}); END`;
 return `CREATE TEMP TABLE ram_actor_authorization(binding jsonb,authorization_id uuid) ON COMMIT DROP;
 INSERT INTO ram_actor_authorization(binding) VALUES(${json(binding)});GRANT SELECT,UPDATE ON ram_actor_authorization TO authenticated;
 ${claims(f.maker,f.makerSession)}
 SET SESSION AUTHORIZATION authenticator; SET LOCAL ROLE authenticated;
 ${diagnostics?diagnosticBlock('authorize',authorize):authorize}
 RESET ROLE; RESET SESSION AUTHORIZATION;
 ${diagnostics?diagnosticBlock('authorize',`${consume};`):sqlDoBlock(consume,'ram_consume')}
 ${clearClaims}`}
export function buildRamResetExecuteSql({plan,planBinding,fixture,phases}){
 const b=accepted(plan,planBinding),f=fixtureChecked(fixture),p=phaseChecked(plan,f,phases),op=`${literal(b.operationId)}::uuid`,binding=actorBinding(b,p);
 return `${begin()}\n${catalogGuard(plan)}\n${actorGuard(f)}
 SELECT pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||${org}::text,0));
 ${sqlDoBlock(`BEGIN IF (SELECT plan_json::text FROM app_private.financial_reset_zero_plans WHERE operation_id=${op}) IS DISTINCT FROM ${literal(p.zeroPlanText)}
 OR app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(${org}))<>${literal(p.fixtureSourceSha256)} THEN RAISE EXCEPTION 'local_ram_rehearsal_prepared_source_changed'; END IF; END`,'ram_prepared')}
 ${[ [f.maker,f.makerSession],[f.reviewer,f.reviewerSession] ].map(([actor,session])=>`${claims(actor,session)}
 SET SESSION AUTHORIZATION authenticator; SET LOCAL ROLE authenticated;
 ${executionBlock('endorsement',`PERFORM public.approve_financial_reset_zero_plan(${op},${literal(p.zeroReviewSha256)});`)}
 RESET ROLE; RESET SESSION AUTHORIZATION;`).join('\n')}
 ${clearClaims}
 ${executionBlock('seal',`PERFORM app_private.seal_financial_reset_operation(${op});`)}
 ${authorizationSql(f,binding,'execute',true)}
 SET LOCAL ROLE postgres;
 ${nativeActions(b.operationId,plan.actions,false,true)}
 RESET ROLE;
 SET LOCAL statement_timeout='300s';
 ${executionBlock('known_zero',`PERFORM app_private.apply_financial_reset_known_zero(${op});`)}
 SET LOCAL statement_timeout='60s';
 ${executionBlock('continuation',`DECLARE reviewed jsonb; BEGIN
 reviewed:=${literal(p.continuationPlanText)}::jsonb||jsonb_build_object('source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(${org})));
 PERFORM app_private.prepare_financial_reset_continuation(${op},reviewed,app_private.financial_reset_hash(reviewed));
 PERFORM app_private.apply_financial_reset_continuation(${op}); END;`)}
 ${executionBlock('reports',`PERFORM app_private.apply_financial_reset_reports(${op});`)}
 ${executionBlock('readback_checks',`PERFORM app_private.assert_financial_reset_empty_sources(${op},true);
 IF app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(${org}))<>${literal(p.fixtureForeignSha256)} THEN RAISE EXCEPTION 'local_ram_rehearsal_clone_foreign_changed'; END IF;
`)}
 SET CONSTRAINTS ALL IMMEDIATE;
 SELECT jsonb_build_object('format','nestory-local-ram-reset-execution-v1','operation',app_private.financial_reset_operation_status(${op}),
 'checkpoint',(SELECT jsonb_build_object('kind',checkpoint_kind,'sha256',checkpoint_sha256,'generation',generation,'resultSha256',app_private.financial_reset_hash(result_json)) FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=${op}),
 'authorityTiming',(SELECT jsonb_build_object('consumedAgeSeconds',extract(epoch FROM timing.observed_at-a.consumed_at),
  'remainingSeconds',extract(epoch FROM a.expires_at-timing.observed_at))
  FROM app_private.financial_reset_actor_authorizations a CROSS JOIN (SELECT clock_timestamp() observed_at) timing
  WHERE a.operation_id=${op} AND a.action='execute' AND a.consumed_at IS NOT NULL
   AND a.backend_pid=pg_backend_pid() AND a.transaction_id=pg_current_xact_id()),
 'authorityKind','local-sql-session-fixture','productionPermissionProven',false,'productionForeignDataProven',false,'controlReopened',false);
 COMMIT;`;
}

export function buildRamInverseReadbackSql({plan,planBinding}){
 const b=accepted(plan,planBinding),op=`${literal(b.operationId)}::uuid`;
 return `${begin()}\n${catalogGuard(plan)}
 CREATE TEMP TABLE ram_inverse_sources ON COMMIT DROP AS SELECT value AS value FROM jsonb_array_elements(app_private.financial_reset_recovery_candidates(${op}));
 CREATE TEMP TABLE ram_inverse_edges(value jsonb) ON COMMIT DROP;
 ${sqlDoBlock(`DECLARE target record; f record; equality_sql text; found_edges jsonb; BEGIN
 FOR target IN SELECT value FROM ram_inverse_sources LOOP
  FOR f IN SELECT c.*,n.nspname||'.'||t.relname AS source_name FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE c.contype='f' AND c.confrelid=(target.value->>'relation_name')::regclass LOOP
   SELECT string_agg(format('s.%I=t.%I',a.attname,z.attname),' AND ' ORDER BY k.i) INTO equality_sql
    FROM unnest(f.conkey,f.confkey) WITH ORDINALITY k(s,t,i)
    JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=k.s JOIN pg_attribute z ON z.attrelid=f.confrelid AND z.attnum=k.t;
   EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''source'',jsonb_build_object(''relation_name'',%L,''primary_key'',app_private.financial_reset_primary_key(%s::oid,to_jsonb(s))),''target'',$1)),''[]''::jsonb) FROM %s s JOIN %s t ON %s WHERE app_private.financial_reset_primary_key(%s::oid,to_jsonb(t))=$2',
    f.source_name,f.conrelid,f.conrelid::regclass,f.confrelid::regclass,equality_sql,f.confrelid)
    INTO found_edges USING jsonb_build_object('relation_name',target.value->'relation_name','primary_key',target.value->'primary_key'),target.value->'primary_key';
   INSERT INTO ram_inverse_edges SELECT value FROM jsonb_array_elements(found_edges);
  END LOOP;
 END LOOP;
END`,'ram_inverse_edges')}
 WITH phase AS (SELECT jsonb_build_object('schema_sha256',o.schema_sha256,'zero_review_sha256',z.review_sha256,'zero_authority_sha256',z.result_json->>'authority_sha256',
 'continuation_review_sha256',c.review_sha256,'continuation_before_sha256',c.result_json->>'before_sha256','continuation_after_sha256',c.result_json->>'after_sha256',
 'sources_sha256',app_private.financial_reset_hash(app_private.financial_reset_recovery_candidates(${op})),
 'source_sha256',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot(${org})),
 'report_checkpoint_sha256',v.checkpoint_sha256) value,c.plan_json::text continuation_review_text FROM app_private.financial_reset_operations o
 JOIN app_private.financial_reset_zero_plans z USING(operation_id) JOIN app_private.financial_reset_continuation_plans c USING(operation_id)
 JOIN app_private.financial_reset_verification_checkpoints v USING(operation_id) WHERE o.operation_id=${op} AND o.status='actions_complete' AND v.checkpoint_kind='checked-reports')
 SELECT jsonb_build_object('phaseSources',(SELECT coalesce(jsonb_agg(jsonb_build_object('relation_name',value->'relation_name','primary_key',value->'primary_key','kind',value->'kind',
 'before_row_text',(value->'before_row')::text,'after_row_text',CASE WHEN value->'after_row'='null'::jsonb THEN NULL ELSE (value->'after_row')::text END,
 'before_sha256',value->'before_sha256','after_sha256',value->'after_sha256','provenance',value->'provenance') ORDER BY value->>'relation_name',(value->'primary_key')::text),'[]'::jsonb) FROM ram_inverse_sources),
 'incomingEdges',(SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]'::jsonb) FROM ram_inverse_edges),
 'phaseBinding',value,'phaseBindingText',value::text,'continuationReviewText',continuation_review_text) FROM phase;
 COMMIT;`;
}
function inverseChecked(plan,input,recoveryId){
 if(!uuid.test(recoveryId)||recoveryId===plan.operationId||!exact(input,['phaseSources','incomingEdges','phaseBinding','phaseBindingText','continuationReviewText'])||
 !exact(input.phaseBinding,['schema_sha256','zero_review_sha256','zero_authority_sha256','continuation_review_sha256','continuation_before_sha256','continuation_after_sha256','sources_sha256','source_sha256','report_checkpoint_sha256'])||
 Object.values(input.phaseBinding).some(v=>!digest.test(v))||typeof input.phaseBindingText!=='string'||!isDeepStrictEqual(JSON.parse(input.phaseBindingText),input.phaseBinding)||
 typeof input.continuationReviewText!=='string'||hash(input.continuationReviewText)!==input.phaseBinding.continuation_review_sha256||
 JSON.parse(input.continuationReviewText).source_sha256!==input.phaseBinding.continuation_before_sha256||
 input.phaseBinding.continuation_before_sha256!==input.phaseBinding.continuation_after_sha256)fail('inverse_inputs_invalid');
 return buildPilotRamInversePlan(plan,{phaseSources:input.phaseSources,incomingEdges:input.incomingEdges});
}
function actionId(recoveryId,ordinal){const h=hash(`${recoveryId}:${ordinal}`);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`}
function inverseCandidates(plan,input,recoveryId){return inverseChecked(plan,input,recoveryId).actions.map((a,i)=>({...a,action_id:actionId(recoveryId,i+1),ordinal:i+1}))}
function continuationReviewMatchesPhases(input,phases){
 const {source_sha256,...semantic}=JSON.parse(input.continuationReviewText);void source_sha256;
 if(!isDeepStrictEqual(semantic,phases.continuationPlan))fail('inverse_continuation_changed');
}
export function buildRamInverseCanonicalSql({plan,planBinding,inverseInputs,recoveryId}){
 accepted(plan,planBinding);const candidates=inverseCandidates(plan,inverseInputs,recoveryId);
 candidates.forEach(a=>relation(a.relation_name));
 return `${begin()}\n${catalogGuard(plan)}
 CREATE TEMP TABLE ram_inverse_typed(candidate jsonb,typed jsonb,columns jsonb) ON COMMIT DROP;
 ${sqlDoBlock(`DECLARE r jsonb; typed jsonb; columns jsonb; BEGIN FOR r IN SELECT value FROM jsonb_array_elements(${json(candidates)}) LOOP
  EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::%s,$1))',(r->>'relation_name')::regclass) INTO typed USING (r->>'candidate_after_row_text')::jsonb;
  SELECT jsonb_agg(attname ORDER BY attnum) INTO columns FROM pg_attribute WHERE attrelid=(r->>'relation_name')::regclass AND attnum>0 AND NOT attisdropped AND attgenerated='';
  INSERT INTO ram_inverse_typed VALUES(r,typed,columns);
 END LOOP; END`,'ram_inverse_convert')}
 ${sqlDoBlock(`BEGIN IF EXISTS(SELECT 1 FROM ram_inverse_typed WHERE typed IS DISTINCT FROM (candidate->>'candidate_after_row_text')::jsonb) THEN RAISE EXCEPTION 'local_ram_rehearsal_inverse_type_changed'; END IF; END`,'ram_inverse_types')}
 WITH actions AS (SELECT jsonb_build_object('action_id',candidate->'action_id','ordinal',candidate->'ordinal','relation_name',candidate->'relation_name','primary_key',candidate->'primary_key','kind',candidate->'kind',
 'before_row_text',candidate->'before_row_text','before_sha256',candidate->'before_sha256','after_row_text',typed::text,'after_sha256',CASE WHEN typed IS NULL THEN NULL ELSE app_private.financial_reset_hash(typed) END,
 'changed_columns',candidate->'changed_columns','insert_columns',columns) value FROM ram_inverse_typed),
 descriptors AS (SELECT coalesce(jsonb_agg(value-ARRAY['before_row_text','after_row_text','changed_columns','insert_columns'] ORDER BY (value->>'ordinal')::integer),'[]'::jsonb) value FROM actions)
 SELECT jsonb_build_object('actions',(SELECT jsonb_agg(value ORDER BY (value->>'ordinal')::integer) FROM actions),'actionDescriptorText',value::text,
 'actionSha256',app_private.financial_reset_hash(value),'auditTimestamp',clock_timestamp()) FROM descriptors;
 COMMIT;`;
}
function canonicalChecked(plan,inverseInputs,recoveryId,value){
 const candidates=inverseCandidates(plan,inverseInputs,recoveryId);
 if(!exact(value,['actions','actionDescriptorText','actionSha256','auditTimestamp'])||!Array.isArray(value.actions)||value.actions.length!==candidates.length||
 !digest.test(value.actionSha256)||hash(value.actionDescriptorText)!==value.actionSha256||!Number.isFinite(Date.parse(value.auditTimestamp)))fail('inverse_canonical_invalid');
 const descriptors=[];
 for(const [i,a]of value.actions.entries()){
  const c=candidates[i];
  if(!exact(a,['action_id','ordinal','relation_name','primary_key','kind','before_row_text','before_sha256','after_row_text','after_sha256','changed_columns','insert_columns'])||
   ['action_id','ordinal','relation_name','kind','before_row_text','before_sha256'].some(k=>a[k]!==c[k])||!isDeepStrictEqual(a.primary_key,c.primary_key)||!isDeepStrictEqual(a.changed_columns,c.changed_columns)||
   !Array.isArray(a.insert_columns)||!a.insert_columns.length||new Set(a.insert_columns).size!==a.insert_columns.length||a.insert_columns.some(x=>!/^[a-z_][a-z0-9_]*$/.test(x))||
   (c.candidate_after_row_text===null?a.after_row_text!==null||a.after_sha256!==null:typeof a.after_row_text!=='string'||!digest.test(a.after_sha256)||hash(a.after_row_text)!==a.after_sha256))fail('inverse_canonical_changed');
  const {before_row_text,after_row_text,changed_columns,insert_columns,...descriptor}=a;descriptors.push(descriptor);
 }
 if(!isDeepStrictEqual(JSON.parse(value.actionDescriptorText),descriptors))fail('inverse_descriptor_changed');
 return candidates;
}
export function buildRamInverseExecuteSql({plan,planBinding,fixture,phases,inverseInputs,recoveryId,canonicalInverse}){
 const b=accepted(plan,planBinding),f=fixtureChecked(fixture),p=phaseChecked(plan,f,phases),candidates=canonicalChecked(plan,inverseInputs,recoveryId,canonicalInverse);
 continuationReviewMatchesPhases(inverseInputs,p);
 const inversePlanSha256=digestJson({resetPlanSha256:b.planSha256,recoveryId,actionSha256:canonicalInverse.actionSha256,phaseBindingSha256:hash(inverseInputs.phaseBindingText)});
 const rop=`${literal(recoveryId)}::uuid`,op=operation(b,{operation_id:recoveryId,operation_kind:'restore',restore_of:b.operationId,source_generation:1,target_generation:2,
 plan_sha256:inversePlanSha256,action_sha256:canonicalInverse.actionSha256,action_count:canonicalInverse.actions.length,audit_timestamp:canonicalInverse.auditTimestamp});
 const binding={...actorBinding(b,p),recovery:{operation_id:recoveryId,source_generation:1,target_generation:2,plan_sha256:inversePlanSha256,
 action_sha256:canonicalInverse.actionSha256,action_count:canonicalInverse.actions.length,phase_binding_sha256:hash(inverseInputs.phaseBindingText),
 report_checkpoint_sha256:inverseInputs.phaseBinding.report_checkpoint_sha256,review_artifact_sha256:inversePlanSha256,execution_business_date:p.executionBusinessDate}};
 const typedProof=candidates.map((c,i)=>sqlDoBlock(`BEGIN IF ${canonicalInverse.actions[i].after_row_text===null?'NULL::jsonb':`${literal(canonicalInverse.actions[i].after_row_text)}::jsonb`} IS DISTINCT FROM
 ${c.candidate_after_row_text===null?'NULL::jsonb':`to_jsonb(jsonb_populate_record(NULL::${relation(c.relation_name)},${literal(c.candidate_after_row_text)}::jsonb))`} THEN RAISE EXCEPTION 'local_ram_rehearsal_inverse_readback_changed'; END IF; END`,'ram_typed_proof')).join('\n');
 return `${begin()}\n${catalogGuard(plan)}\n${actorGuard(f)}
 ${inverseCauseMapperSql}
 SELECT pg_advisory_xact_lock(hashtextextended('financial_write_lifecycle_v1:'||${org}::text,0));
 ${typedProof}
 ${sqlDoBlock(`BEGIN ${inverseDiagnostic('prepare_operation',`IF NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=${org} AND generation=1 AND status='frozen') THEN RAISE EXCEPTION 'local_ram_rehearsal_recovery_generation_changed'; END IF;
 UPDATE app_private.financial_write_controls SET generation=2 WHERE organization_id=${org};
 PERFORM app_private.prepare_financial_reset_operation(${json(op)});`)};
 ${inverseDiagnostic('prepare_sources',`PERFORM app_private.prepare_financial_reset_recovery(${rop},${literal(inverseInputs.phaseBindingText)}::jsonb);`)};
 ${inverseDiagnostic('prepare_actions',`PERFORM app_private.prepare_financial_reset_actions(${rop},${json(canonicalInverse.actions)});`)};
 ${inverseDiagnostic('seal',`PERFORM app_private.seal_financial_reset_operation(${rop});`)}; END`,'ram_recovery_prepare')}
 ${authorizationSql(f,binding,'execute-recovery','inverse')}
 SET LOCAL ROLE postgres;
 ${nativeActions(recoveryId,canonicalInverse.actions,true,'inverse')}
 RESET ROLE;
 ${inverseBlock('commit_checks','SET CONSTRAINTS ALL IMMEDIATE;')}
 SELECT jsonb_build_object('format','nestory-local-ram-inverse-execution-v1','operation',app_private.financial_reset_operation_status(${rop}),
 'checkpoint',(SELECT jsonb_build_object('kind',checkpoint_kind,'sha256',checkpoint_sha256,'generation',generation,'resultSha256',app_private.financial_reset_hash(result_json)) FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=${rop}),
 'authorityKind','local-sql-session-fixture','productionPermissionProven',false,'productionForeignDataProven',false,'controlReopened',false);
 COMMIT;`;
}

// All scoped tables participate. Native immutable phase images are permitted
// only for the enumerated additions below; a current-row snapshot is never an
// authority for arbitrary business changes.
export function buildRamRehearsalVerificationSql({plan,planBinding,fixture,phases,inverseInputs,recoveryId,canonicalInverse,phase}){
 const b=accepted(plan,planBinding),f=fixtureChecked(fixture),p=phaseChecked(plan,f,phases);
 if(!['reset','recovered'].includes(phase))fail('verification_phase_invalid');
 const recovered=phase==='recovered',generation=recovered?2:1,op=`${literal(b.operationId)}::uuid`,rop=recovered?`${literal(recoveryId)}::uuid`:'NULL::uuid';
 let rows=plan.retainedRows;
 if(recovered){canonicalChecked(plan,inverseInputs,recoveryId,canonicalInverse);continuationReviewMatchesPhases(inverseInputs,p);rows=inverseChecked(plan,inverseInputs,recoveryId).originalRowsExpectedAfterInverse;}
 const baseline=rows.filter(r=>r.relation_name!=='app_private.financial_write_controls')
  .map(r=>({relation_name:r.relation_name,primary_key:r.primary_key,row_text:r.expected_row_text}));
 const lifecycleCounts={financial_reset_operations:generation,financial_reset_archive_rows:plan.archiveRows.length,
  financial_reset_actions:plan.actions.length+(recovered?canonicalInverse.actions.length:0),financial_reset_zero_plans:1,
  financial_reset_zero_approvals:2,financial_reset_phase_fences:3,financial_reset_continuation_plans:1,
  financial_reset_recovery_plans:recovered?1:0,financial_reset_recovery_sources:recovered?inverseInputs.phaseSources.length:0,
  financial_reset_verification_checkpoints:generation,financial_reset_actor_authorizations:generation,financial_reset_zero_session_endorsements:2};
 const life=LOCAL_CAPTURE_POLICY.filter(r=>r.table.startsWith('app_private.financial_reset_'));
 const actionInputs=[{operation_id:b.operationId,actions:plan.actions},...(recovered?[{operation_id:recoveryId,actions:canonicalInverse.actions}]:[])];
 const knownZeroTables=['public.owner_opening_balance_requests','public.owner_opening_balance_entries'];
 const phaseTables=[...knownZeroTables,'public.owner_event_allocation_sets','public.owner_event_owner_allocations','public.owner_component_movements','public.owner_balance_periods','public.owner_balance_period_components'];
 const foreignGuard=sqlDoBlock(`DECLARE f record; equality_sql text; all_nonnull text; all_null text; predicate text; n bigint; BEGIN
 FOR f IN SELECT c.* FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace s ON s.oid=t.relnamespace
  WHERE c.contype='f' AND s.nspname IN ('public','app_private','auth','storage') LOOP
  IF f.confmatchtype NOT IN ('s','f') THEN RAISE EXCEPTION 'local_ram_rehearsal_fk_match_unsupported'; END IF;
  SELECT string_agg(format('s.%I=t.%I',a.attname,z.attname),' AND ' ORDER BY k.i),string_agg(format('s.%I IS NOT NULL',a.attname),' AND ' ORDER BY k.i),string_agg(format('s.%I IS NULL',a.attname),' AND ' ORDER BY k.i)
   INTO equality_sql,all_nonnull,all_null FROM unnest(f.conkey,f.confkey) WITH ORDINALITY k(s,t,i)
   JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=k.s JOIN pg_attribute z ON z.attrelid=f.confrelid AND z.attnum=k.t;
  predicate:=CASE WHEN f.confmatchtype='f' THEN format('NOT (%s) AND (NOT (%s) OR NOT EXISTS(SELECT 1 FROM %s t WHERE %s))',all_null,all_nonnull,f.confrelid::regclass,equality_sql)
   ELSE format('(%s) AND NOT EXISTS(SELECT 1 FROM %s t WHERE %s)',all_nonnull,f.confrelid::regclass,equality_sql) END;
  EXECUTE format('SELECT count(*) FROM %s s WHERE %s',f.conrelid::regclass,predicate) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'local_ram_rehearsal_foreign_key_unresolved'; END IF;
 END LOOP; END`,'ram_verify_fk');
 return `${begin()}
 ${catalogGuard(plan)}
 ${actorGuard(f)}
 CREATE TEMP TABLE ram_expected(relation_name text,primary_key jsonb,row_text text,PRIMARY KEY(relation_name,primary_key)) ON COMMIT DROP;
 INSERT INTO ram_expected SELECT * FROM jsonb_to_recordset(${json(baseline)}) x(relation_name text,primary_key jsonb,row_text text);
 INSERT INTO ram_expected SELECT 'public.organization_members',app_private.financial_reset_primary_key('public.organization_members'::regclass,(r->>'rowText')::jsonb),r->>'rowText'
 FROM jsonb_array_elements(${json(p.fixtureRows)}) r;
 INSERT INTO ram_expected SELECT 'app_private.financial_report_source_revisions',
 app_private.financial_reset_primary_key('app_private.financial_report_source_revisions'::regclass,row_json),row_json::text
 FROM (SELECT jsonb_build_object('organization_id',${org},'revision',1,'last_transaction_id',${literal(p.fixtureTransactionId)}::bigint) row_json) fixture_revision;
 CREATE TEMP TABLE ram_phase_rows ON COMMIT DROP AS ${recovered?`SELECT relation_name,primary_key,before_row row_json,provenance FROM app_private.financial_reset_recovery_sources WHERE operation_id=${rop}`:
 `SELECT r->>'relation_name' relation_name,r->'primary_key' primary_key,r->'before_row' row_json,r->>'provenance' provenance FROM jsonb_array_elements(app_private.financial_reset_recovery_candidates(${op})) r`};
 ${sqlDoBlock(`DECLARE r record; mismatch boolean; BEGIN
 IF EXISTS(SELECT 1 FROM ram_phase_rows WHERE relation_name NOT IN (${phaseTables.map(literal).join(',')}) OR provenance NOT IN ('known-zero','reports'))
 OR (SELECT count(*) FROM ram_phase_rows WHERE relation_name='public.owner_opening_balance_requests')<>4*jsonb_array_length(${literal(p.zeroPlanText)}::jsonb->'scopes')
 OR (SELECT count(*) FROM ram_phase_rows WHERE relation_name='public.owner_opening_balance_entries')<>4*jsonb_array_length(${literal(p.zeroPlanText)}::jsonb->'scopes') THEN RAISE EXCEPTION 'local_ram_rehearsal_phase_roster_changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id=${org} AND generation=${generation} AND status='frozen' AND financial_start_date='2026-10-01')
 OR (SELECT count(*) FROM app_private.financial_write_controls WHERE organization_id=${org})<>1 THEN RAISE EXCEPTION 'local_ram_rehearsal_lifecycle_changed'; END IF;
 IF (SELECT coalesce(sum((row_text::jsonb->>'revision')::numeric),0) FROM ram_expected WHERE relation_name='app_private.financial_report_source_revisions')<>${literal(p.reportRevisionBefore)}::numeric
 OR (SELECT coalesce(sum(revision),0) FROM app_private.financial_report_source_revisions WHERE organization_id=${org})<>${literal(p.reportRevisionBefore)}::numeric+${generation}
 THEN RAISE EXCEPTION 'local_ram_rehearsal_source_revision_changed'; END IF;
 IF app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(${org}))<>${literal(p.continuationPlan.contracts_sha256)} THEN RAISE EXCEPTION 'local_ram_rehearsal_contract_changed'; END IF;
 IF app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census(${org}))<>${literal(p.fixtureForeignSha256)} THEN RAISE EXCEPTION 'local_ram_rehearsal_clone_foreign_changed'; END IF;
 ${!recovered?`PERFORM app_private.assert_financial_reset_empty_sources(${op},true);`:''}
 FOR r IN SELECT * FROM jsonb_to_recordset(${json(life.map(v=>({table_name:v.table,expected:lifecycleCounts[v.table.slice('app_private.'.length)]??0})))}) x(table_name text,expected bigint) LOOP
  IF (SELECT count(*) FROM ram_expected WHERE relation_name=r.table_name)<>0 THEN RAISE EXCEPTION 'local_ram_rehearsal_prior_lifecycle_rows'; END IF;
  EXECUTE format('SELECT count(*)<>$1 FROM %s WHERE organization_id=$2',r.table_name::regclass) INTO STRICT mismatch USING r.expected,${org};
  IF mismatch THEN RAISE EXCEPTION 'local_ram_rehearsal_lifecycle_count_changed'; END IF;
 END LOOP;
 END`,'ram_verify_basics')}
 INSERT INTO ram_expected SELECT 'app_private.financial_report_source_revisions',
 app_private.financial_reset_primary_key('app_private.financial_report_source_revisions'::regclass,r.row_json),r.row_json::text
 FROM app_private.financial_reset_operations o CROSS JOIN LATERAL
 (SELECT jsonb_build_object('organization_id',${org},'revision',1,'last_transaction_id',o.execution_xid::text::bigint) row_json) r
 WHERE o.organization_id=${org} AND o.operation_id IN (${op},${recovered?rop:op});
 ${!recovered?'INSERT INTO ram_expected SELECT relation_name,primary_key,row_json::text FROM ram_phase_rows;':''}
 ${lifecycleVerificationSql({b,p,f,recovered,recoveryId,canonicalInverse,inverseInputs,actionInputs,archiveRows:plan.archiveRows})}
 ${auditVerificationSql({b,p,f})}
 ${sqlDoBlock(`DECLARE r record; actual jsonb; expected jsonb; n bigint; rows_hash text; BEGIN
 FOR r IN SELECT * FROM jsonb_to_recordset(${json(LOCAL_CAPTURE_POLICY.map(v=>({table_name:v.table,scope_column:v.scopeColumn})))}) x(table_name text,scope_column text) LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY app_private.financial_reset_primary_key(%L::regclass,to_jsonb(t))::text),''[]''::jsonb) FROM %s t WHERE %I=$1',r.table_name,r.table_name::regclass,r.scope_column) INTO actual USING ${org};
  SELECT coalesce(jsonb_agg(row_text::jsonb ORDER BY primary_key::text),'[]'::jsonb) INTO expected FROM ram_expected WHERE relation_name=r.table_name;
  IF actual::text IS DISTINCT FROM expected::text THEN RAISE EXCEPTION 'local_ram_rehearsal_exact_projection_changed: %',r.table_name; END IF;
  SELECT encode(extensions.digest(coalesce(string_agg(app_private.financial_reset_hash(value),'' ORDER BY ordinality),''),'sha256'),'hex') INTO rows_hash
   FROM jsonb_array_elements(actual) WITH ORDINALITY;
  INSERT INTO ram_census VALUES(r.table_name,jsonb_array_length(actual),rows_hash);
 END LOOP; END`,'ram_verify_projection').replace(/^DO /,`CREATE TEMP TABLE ram_census(table_name text,row_count bigint,rows_sha256 text) ON COMMIT DROP;\nDO `)}
 ${foreignGuard}
 SELECT jsonb_build_object('format','nestory-local-ram-rehearsal-verification-v1','phase',${literal(phase)},'canonicalRowsVerified',true,'foreignKeysVerified',true,
 'contractsUnchanged',true,'frozen',true,'generation',${generation},'exactLifecycleDeltaVerified',true,
 'contractsSha256',app_private.financial_reset_hash(app_private.financial_reset_preserved_contracts(${org})),
 'tableCensus',(SELECT jsonb_agg(to_jsonb(t) ORDER BY table_name) FROM ram_census t),
 'checkpointSha256',(SELECT checkpoint_sha256 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=${recovered?rop:op}),
 'syntheticActorCount',2,'productionPermissionProven',false,'productionForeignDataProven',false,'excludedCredentialTablesRestored',false,'storageRecoveryVerified',false);
 COMMIT;`;
}
