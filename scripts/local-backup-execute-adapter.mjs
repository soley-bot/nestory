// The fixed execute-only amendment retains the sealed packet and native actor
// binding. Historical projections are copies, never replacement database rows.
import {canonicalJson,assertOperatorPacket} from './pilot-finance-reset-operator-core.mjs';
import {digestJson,mutationSql,observationSql,jsonSql,literal,validateArtifacts,hostedBinding} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {verifyExecuteTransitionObservation} from './local-backup-execute-transition.mjs';
import {assertExecuteResumeRecord,EXECUTE_RESUME_ORIGINAL} from './local-backup-execute-resume.mjs';
import {assertPrepublicationRecoveryRecord,assertPrepublicationRecoveryParent,assertPrepublicationRecoveryPayload,buildPrepublicationRecoveryGuardSql} from './local-backup-prepublication-recovery.mjs';
import {inspectLocalDispatchCompatibility} from './local-backup-dispatch-repair.mjs';
const hash=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),[...k].sort());
const fail=()=>{throw Error('local_execute_adapter_unverified')};
function bindingChecked(binding){
 if(binding?.operation_id!==EXECUTE_RESUME_ORIGINAL.operationId||binding.organization_id!=='752a87b8-bd04-4a45-9cb8-00687af66e73'||
  binding.main_sha!=='9a08df0181d391a9bc8e6c28319c6678485f4c59'||binding.source_generation!==0||binding.target_generation!==1||
  binding.cutoff!=='2026-10-01'||binding.issue_date!=='2026-10-01'||binding.invoice_date_policy!=='empty-books-no-invoices'||
  binding.continuation_semantic?.version!==4||binding.recovery!==undefined||binding.execution_resume!==undefined||
  binding.action_count!==4169||binding.archive_count!==4898)fail();
 return binding;
}
function resumeChecked(payload){
 if(!exact(payload,['packet','binding','artifacts','recovery','observation','repair','resume',...(payload.prepublicationRecovery?['prepublicationRecovery']:[])])||
  !exact(payload.resume,['record','observation'])||payload.recovery!==null)fail();
 const r=assertExecuteResumeRecord(payload.resume.record),b=bindingChecked(payload.binding);
 if(r.packetSha256!==payload.packet?.packetSha256||r.bindingSha256!==digestJson(b)||!same(payload.repair,r.prepareRepair))fail();
 if(payload.prepublicationRecovery){const child=assertPrepublicationRecoveryRecord(payload.prepublicationRecovery);assertPrepublicationRecoveryParent(r);if(child.packetSha256!==r.packetSha256||child.bindingSha256!==r.bindingSha256)fail();}
 return r;
}
function retainedBaseline(binding,historical,observed){
 bindingChecked(binding);
 if(!historical?.reservation||!historical.recoveryCheckpoint||!observed?.reservation||!observed.recoveryCheckpoint||
  !same(observed.reservation,historical.reservation)||!same(observed.recoveryCheckpoint,historical.recoveryCheckpoint)||
  !same(observed.reservation.binding,binding)||!hash.test(observed.reservation.bindingSha256)||
  observed.recoveryCheckpoint.bindingSha256!==observed.reservation.bindingSha256||
  observed.recoveryCheckpoint.sourceSha256!==binding.source_snapshot_sha256||
  observed.recoveryCheckpoint.foreignSha256!==observed.reservation.foreignSha256||
  !hash.test(observed.foreignSha256)||observed.capabilityCount!==0)fail();
}
function beforeState(binding,o,allowMissingAudit=false){
 if((allowMissingAudit?o.executeResume!==undefined&&o.executeResume!==null:o.executeResume!==null)||
  o.sourceSha256!==binding.source_snapshot_sha256||o.appliedCount!==0||o.archiveCount!==4898||o.actionCount!==4169||
  o.operation?.status!=='sealed'||o.operation.execution_backend!==null||o.operation.execution_xid!==null||o.operation.completed_at!==null||
  o.continuation!==null||o.checkpoint!==null||!Array.isArray(o.phaseFences)||o.phaseFences.length!==0||
  o.zero?.status!=='prepared'||o.control?.status!=='frozen'||o.control.generation!==1||o.control.cutoff!=='2026-10-01')fail();
}
// Pure strict audit validator, shared with synthetic tests. It grants no source
// transition or authorization; operational projection verifies both separately.
export function assertExecuteResumeAudit({binding,historicalObservation,observation,record,authorizationId,phase,prepublicationRecovery}){
 const r=assertExecuteResumeRecord(record),child=prepublicationRecovery?assertPrepublicationRecoveryRecord(prepublicationRecovery):null;retainedBaseline(binding,historicalObservation,observation);
 if(child&&(child.bindingSha256!==r.bindingSha256||child.packetSha256!==r.packetSha256))fail();
 const foreign=child?.freshForeignSha256??r.freshForeignSha256;
 if(child&&authorizationId===child.stopped.authorizationId)fail();
 if(r.bindingSha256!==digestJson(binding)||observation.foreignSha256!==foreign)fail();
 if(phase==='before'){beforeState(binding,observation);return true;}
 if(phase!=='after'||!uuid.test(authorizationId??'')||authorizationId===r.originalAttempt.authorizationId)fail();
 const a=observation.executeResume,auth=observation.authorization;
 if(!exact(a,['operationId','bindingSha256','failedAuthorizationId','authorizationId','originalForeignSha256','foreignSha256',
  'censusHashValid','foreignOrganizationCount','backendPid','transactionId'])||
  a.operationId!==binding.operation_id||a.bindingSha256!==observation.reservation.bindingSha256||a.failedAuthorizationId!==r.originalAttempt.authorizationId||
  a.authorizationId!==authorizationId||a.originalForeignSha256!==historicalObservation.reservation.foreignSha256||
  a.foreignSha256!==foreign||a.censusHashValid!==true||a.foreignOrganizationCount!==4||
  !Number.isSafeInteger(a.backendPid)||a.backendPid<1||typeof a.transactionId!=='string'||! /^(?:[1-9][0-9]*)$/.test(a.transactionId)||
  auth?.status!=='consumed'||auth.bindingMatches!==true||auth.authorizationId!==authorizationId||
  auth.actorId!==binding.continuation_semantic.actor_id||auth.backendPid!==a.backendPid||auth.transactionId!==a.transactionId)fail();
 return true;
}
function projected(historical,observed){
 const copy=structuredClone(observed);
 copy.catalog=structuredClone(historical.catalog);copy.ledger=structuredClone(historical.ledger);
 copy.reservation.foreignSha256=observed.foreignSha256;copy.recoveryCheckpoint.foreignSha256=observed.foreignSha256;
 return copy;
}
export async function projectExecuteResumeReviewObservation({packet,binding,historicalObservation,observation}){
 await verifyExecuteTransitionObservation({packet,historicalObservation,currentObservation:observation});
 retainedBaseline(binding,historicalObservation,observation);beforeState(binding,observation,true);
 return projected(historicalObservation,observation);
}
export async function assertExecuteResumeEnvelope({payload,compatibility}){
 assertExecuteResumeBinding({payload,compatibility});
 const view=await projectExecuteResumeReviewObservation({packet:payload.packet,binding:payload.binding,historicalObservation:payload.observation,observation:payload.resume.observation});
 return view;
}
export function assertExecuteResumeBinding({payload,compatibility}){
 const r=resumeChecked(payload),info=inspectLocalDispatchCompatibility(compatibility),current=payload.prepublicationRecovery?assertPrepublicationRecoveryPayload({payload,compatibility}):r;
 assertOperatorPacket(payload.packet);validateArtifacts(payload.packet,payload.artifacts,payload.recovery);
 if(!same(payload.binding,hostedBinding(payload.packet,payload.artifacts.continuationPlan,null))||
  !info||!['operationId','packetSha256','originalMainSha','executorMainSha','manifestSha256','executorSourceSha256'].every(k=>info[k]===current[k]))fail();
 if(payload.resume.observation.foreignSha256!==current.freshForeignSha256)fail();
 return r;
}
export async function projectExecuteResumeObservation({payload,observation,authorizationId,phase}){
 const r=resumeChecked(payload);
 await verifyExecuteTransitionObservation({packet:payload.packet,historicalObservation:payload.observation,currentObservation:observation});
 assertExecuteResumeAudit({binding:payload.binding,historicalObservation:payload.observation,observation,record:r,authorizationId,phase,prepublicationRecovery:payload.prepublicationRecovery});
 return projected(payload.observation,observation);
}
export function executeResumeObservationSql(packet,binding,authorizationId=null){
 bindingChecked(binding);if(authorizationId!==null&&!uuid.test(authorizationId))fail();
 const sql=observationSql(packet,binding,authorizationId,'execute'),anchor="SELECT jsonb_build_object('catalog',";
 if(sql.split(anchor).length!==2)fail();
 const metadata=`'executeResume',(SELECT jsonb_build_object('operationId',operation_id,'bindingSha256',binding_sha256,
 'failedAuthorizationId',failed_authorization_id,'authorizationId',authorization_id,'originalForeignSha256',original_foreign_sha256,
 'foreignSha256',foreign_sha256,'censusHashValid',foreign_sha256=app_private.financial_reset_hash(foreign_census),
 'foreignOrganizationCount',foreign_organization_count,'backendPid',backend_pid,'transactionId',transaction_id::text)
 FROM app_private.financial_reset_execute_resumes WHERE operation_id=${literal(binding.operation_id)}::uuid),`;
 return sql.replace(anchor,`SELECT jsonb_build_object(${metadata}'catalog',`);
}
export function executeResumeMutationSql(options){
 const {binding,action,authorizationId,resume}=options;bindingChecked(binding);
 const r=assertExecuteResumeRecord(resume?.record??resume),child=options.prepublicationRecovery?assertPrepublicationRecoveryRecord(options.prepublicationRecovery):null;
 if(child){assertPrepublicationRecoveryParent(r);if(child.bindingSha256!==r.bindingSha256||child.packetSha256!==r.packetSha256||authorizationId===child.stopped.authorizationId)fail();}
 const expectedForeign=child?.freshForeignSha256??r.freshForeignSha256;
 if(action!=='execute'||options.recovery!==null||!uuid.test(authorizationId??'')||authorizationId===r.originalAttempt.authorizationId||
  r.bindingSha256!==digestJson(binding)||options.observation?.foreignSha256!==expectedForeign)fail();
 let sql=mutationSql(options);
 const consume=`SELECT app_private.consume_financial_reset_actor_authorization(${literal(authorizationId)}::uuid,${jsonSql(binding)},'execute');`;
 const old=`(SELECT foreign_sha256 FROM app_private.financial_reset_hosted_reservations WHERE operation_id=${literal(binding.operation_id)}::uuid)`;
 if(sql.split(consume).length!==2||sql.split(old).length!==2)fail();
 const activatedBaseline=`DO $local_execute_baseline$ BEGIN IF app_private.financial_reset_execute_foreign_sha256(${jsonSql(binding)}) IS DISTINCT FROM '${expectedForeign}' THEN RAISE EXCEPTION 'local_custody_foreign_baseline_changed' USING ERRCODE='40001'; END IF; END $local_execute_baseline$;`;
 sql=sql.replace(consume,`${child?buildPrepublicationRecoveryGuardSql({record:child,binding})+'\n':''}${consume}\nSELECT app_private.activate_financial_reset_execute_resume(${jsonSql(binding)},${literal(r.originalAttempt.authorizationId)}::uuid);\n${activatedBaseline}`);
 sql=sql.replace(old,`app_private.financial_reset_execute_foreign_sha256(${jsonSql(binding)})`);
 // Same fixed identity/private-bucket/foreign guards as the original local
 // route; kept here so local signer and worker hash exactly the same SQL.
 const identity="DO $local_custody_identity$ BEGIN IF session_user<>'postgres' OR current_user<>'postgres' OR current_database()<>'postgres' THEN RAISE EXCEPTION 'local_custody_database_identity'; END IF; END $local_custody_identity$;";
 const bucket="DO $local_custody_bucket$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='pilot-reset-handoff' AND name='pilot-reset-handoff' AND public=false AND file_size_limit=33554432 AND allowed_mime_types IS NOT DISTINCT FROM ARRAY['application/octet-stream']::text[]) THEN RAISE EXCEPTION 'local_custody_private_bucket_changed'; END IF; END $local_custody_bucket$;";
 const foreign=`DO $local_custody_foreign$ BEGIN IF app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census('${binding.organization_id}'::uuid)) IS DISTINCT FROM '${expectedForeign}' THEN RAISE EXCEPTION 'local_custody_foreign_baseline_changed'; END IF; END $local_custody_foreign$;`;
 const boundary=sql.indexOf('\n');if(!sql.startsWith('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;\n'))fail();
 return `${sql.slice(0,boundary)}\n${identity}\n${bucket}\n${foreign}\n${sql.slice(boundary+1)}`;
}
