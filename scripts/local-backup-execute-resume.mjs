// One recorded, rolled-back execute attempt. This is append-only local evidence,
// never native authorization, a generic retry policy, or a new packet binding.
import {canonicalJson,hashBytes} from './pilot-finance-reset-operator-core.mjs';
import {digestJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {assertPrepareRepairRecord,inspectLocalDispatchCompatibility,PREPARE_REPAIR_OPERATION,PREPARE_REPAIR_ORIGINAL_MAIN} from './local-backup-dispatch-repair.mjs';

export const EXECUTE_RESUME_ORIGINAL=Object.freeze({
 operationId:PREPARE_REPAIR_OPERATION,authorizationId:'4db95b1e-774b-4a8c-881a-2192724aa42d',
 nonce:'2e0eb763-4428-4972-90fe-1050279750c8',runId:'40634405835',runAttempt:1,
 mainSha:'abbfb289d58ec7039bf2ff0431e6529360dabb20',
});
const org='752a87b8-bd04-4a45-9cb8-00687af66e73',project='pfvmztxktkwyewvxfgot';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/,sha=/^[a-f0-9]{40}$/,run=/^[1-9][0-9]{0,19}$/;
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&same(Object.keys(v).sort(),[...k].sort());
const fail=()=>{throw Error('local_execute_resume_unverified');};
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const decode=b=>{if(!(b instanceof Uint8Array)||b.length<1||b.length>262144)fail();return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));};
const literal=v=>`'${v.replaceAll("'","''")}'`;

export function assertExecuteResumeRecord(r){
 if(!exact(r,['format','operationId','packetSha256','bindingSha256','originalMainSha','executorMainSha','manifestSha256','executorSourceSha256',
  'prepareRepair','originalAttempt','replacement','eligibilitySha256','freshForeignSha256','originalRunSha256','createdAt'])||
  r.format!=='nestory-local-execute-resume-v1'||r.operationId!==PREPARE_REPAIR_OPERATION||r.originalMainSha!==PREPARE_REPAIR_ORIGINAL_MAIN||
  !sha.test(r.executorMainSha)||r.executorMainSha===r.originalMainSha||r.executorMainSha===EXECUTE_RESUME_ORIGINAL.mainSha||!stamp(r.createdAt)||
  !['packetSha256','bindingSha256','manifestSha256','executorSourceSha256','eligibilitySha256','freshForeignSha256','originalRunSha256'].every(k=>hash.test(r[k])))fail();
 const p=assertPrepareRepairRecord(r.prepareRepair),a=r.originalAttempt,b=r.replacement;
 if(p.operationId!==r.operationId||p.packetSha256!==r.packetSha256||p.bindingSha256!==r.bindingSha256||p.executorMainSha!==EXECUTE_RESUME_ORIGINAL.mainSha||
  !exact(a,['authorizationId','nonce','runId','runAttempt','mainSha','intentSha256','claimSha256','publicationSha256','receiptSha256'])||
  !['authorizationId','nonce','runId','runAttempt','mainSha'].every(k=>a[k]===EXECUTE_RESUME_ORIGINAL[k])||
  !['intentSha256','claimSha256','publicationSha256','receiptSha256'].every(k=>hash.test(a[k]))||
  !exact(b,['nonce','runId','runAttempt'])||!uuid.test(b.nonce)||!run.test(b.runId)||b.runAttempt!==1||b.nonce===a.nonce||b.runId===a.runId)fail();
 return r;
}
export function localExecuteResumeStagePrefix(action,resume){
 assertExecuteResumeRecord(resume);if(action!=='execute')fail();
 return `financial-reset/${resume.operationId}/manual-stage/execute/resume-once/attempt`;
}
export function assertExecuteResumeCompatibility(record,handle){
 assertExecuteResumeRecord(record);const info=inspectLocalDispatchCompatibility(handle);
 if(!Object.keys(info).every(k=>info[k]===record[k]))fail();return true;
}
export function assertExecuteResumeOriginalJournal({resume,intentBytes,claimBytes,responseBytes,publicationBytes,receiptBytes,reconciliationBytes,prepareRepairBytes}){
 assertExecuteResumeRecord(resume);const a=resume.originalAttempt;
 const intent=decode(intentBytes),claim=decode(claimBytes),response=decode(responseBytes),publication=decode(publicationBytes),receipt=decode(receiptBytes),reconciliation=decode(reconciliationBytes);
 if(hashBytes(intentBytes)!==a.intentSha256||hashBytes(claimBytes)!==a.claimSha256||hashBytes(receiptBytes)!==a.receiptSha256||
  !same(decode(prepareRepairBytes),resume.prepareRepair)||Buffer.from(prepareRepairBytes).toString('utf8')!==canonicalJson(resume.prepareRepair)||
  intent.mainSha!==a.mainSha||intent.transportIntent?.operationId!==resume.operationId||intent.transportIntent.action!=='execute'||
  intent.transportIntent.authorizationId!==a.authorizationId||intent.transportIntent.packetSha256!==resume.packetSha256||intent.transportIntent.bindingSha256!==resume.bindingSha256||
  !same(claim,{format:'nestory-manual-reset-dispatch-claim-v1',operationId:resume.operationId,action:'execute',intentSha256:a.intentSha256})||
  !same(response,{format:'nestory-manual-reset-dispatch-response-v1',operationId:resume.operationId,action:'execute',intentSha256:a.intentSha256,runId:Number(a.runId),runAttempt:1})||
  !exact(publication,['format','runId','intentSha256','publicationArchiveId','publicationArchiveSha256','ciphertextSha256'])||
  publication.format!=='nestory-local-ticket-publication-v1'||String(publication.runId)!==a.runId||publication.intentSha256!==a.intentSha256||
  !uuid.test(publication.publicationArchiveId)||!hash.test(publication.publicationArchiveSha256)||publication.ciphertextSha256!==a.publicationSha256||
  !exact(receipt,['format','operationId','action','runId','runAttempt','intentSha256','outcome','mutationRetried','observationSha256','checkpointSha256','normalWritesReopened'])||
  receipt.format!=='nestory-local-custody-result-v1'||receipt.operationId!==resume.operationId||receipt.action!=='execute'||receipt.runId!==a.runId||
  receipt.runAttempt!==1||receipt.intentSha256!==a.intentSha256||receipt.outcome!=='not-proven-do-not-retry'||receipt.mutationRetried!==false||
  !hash.test(receipt.observationSha256)||receipt.checkpointSha256!==null||receipt.normalWritesReopened!==false||
  !same(reconciliation,{format:'nestory-manual-reset-reconciliation-record-v1',operationId:resume.operationId,action:'execute',intentSha256:a.intentSha256,
   runId:Number(a.runId),runAttempt:1,receiptSha256:a.receiptSha256,observationSha256:receipt.observationSha256,outcome:receipt.outcome}))fail();
 return true;
}
export function executeResumeOriginalRunEvidence(metadata){
 const a=EXECUTE_RESUME_ORIGINAL;
 // A worker can return NOTPROVEN with process success; the authenticated retained
 // receipt, not the workflow conclusion alone, proves its reported outcome.
 if(!metadata||String(metadata.id)!==a.runId||metadata.run_attempt!==1||metadata.status!=='completed'||
  !['success','failure','cancelled','timed_out'].includes(metadata.conclusion)||metadata.head_sha!==a.mainSha||metadata.head_branch!=='main'||
  metadata.event!=='workflow_dispatch'||metadata.path!=='.github/workflows/pilot-financial-reset-local-custody.yml'||metadata.repository?.full_name!=='soley-bot/nestory'||
  metadata.display_title!==`Pilot reset ${a.operationId} execute ${a.nonce} execute`)fail();
 const observation={format:'nestory-local-execute-original-run-v1',runId:a.runId,runAttempt:1,status:'completed',conclusion:metadata.conclusion,
  mainSha:a.mainSha,branch:'main',event:'workflow_dispatch',workflow:metadata.path,repository:metadata.repository.full_name,displayTitle:metadata.display_title};
 return {observation,sha256:digestJson(observation)};
}
export function assertExecuteResumeOriginalRun(metadata,resume){
 assertExecuteResumeRecord(resume);if(executeResumeOriginalRunEvidence(metadata).sha256!==resume.originalRunSha256)fail();return true;
}
function scope({binding,originalAuthorizationId}){
 if(!binding||binding.operation_id!==PREPARE_REPAIR_OPERATION||binding.organization_id!==org||binding.project_ref!==project||
  binding.main_sha!==PREPARE_REPAIR_ORIGINAL_MAIN||binding.version!==1||binding.recovery!==undefined||binding.execution_resume!==undefined||
  binding.source_generation!==0||binding.target_generation!==1||binding.cutoff!=='2026-10-01'||binding.issue_date!=='2026-10-01'||
  binding.invoice_date_policy!=='empty-books-no-invoices'||binding.continuation_semantic?.version!==4||binding.action_count!==4169||binding.archive_count!==4898||
  originalAuthorizationId!==EXECUTE_RESUME_ORIGINAL.authorizationId||Buffer.byteLength(JSON.stringify(binding))>131072||
  !['source_snapshot_sha256','manifest_sha256','plan_sha256','schema_sha256','archive_sha256','action_sha256','zero_review_sha256'].every(k=>hash.test(binding[k])))fail();
 return {b:literal(JSON.stringify(binding))+'::jsonb',id:literal(originalAuthorizationId)+'::uuid',op:literal(binding.operation_id)+'::uuid'};
}
const flags=['authorizationExpiredUnused','sealedOperationMatches','preparedRowsMatch','zeroPlanMatches','executionAbsent','reservationMatches','checkpointMatches','controlMatches','sourceMatches'];
export function assertExecuteResumeObservation(value,{binding,originalAuthorizationId,now=Date.now()}){
 scope({binding,originalAuthorizationId});
 if(!exact(value,['format','operationId','originalAuthorizationId','observedAt','authorizationExpiresAt','freshForeignSha256','foreignOrganizationCount',...flags])||
  value.format!=='nestory-local-execute-resume-observation-v1'||value.operationId!==binding.operation_id||value.originalAuthorizationId!==originalAuthorizationId||
  !Number.isFinite(Date.parse(value.observedAt))||!Number.isFinite(Date.parse(value.authorizationExpiresAt))||!Number.isSafeInteger(now)||
  Date.parse(value.authorizationExpiresAt)>Date.parse(value.observedAt)||Date.parse(value.observedAt)>now||
  !hash.test(value.freshForeignSha256)||value.foreignOrganizationCount!==4||flags.some(k=>value[k]!==true))fail();
 return true;
}
export function buildExecuteResumeObservationSql(options){
 const {b,id,op}=scope(options);
 return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL standard_conforming_strings=on; SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='30s';
SELECT jsonb_build_object('format','nestory-local-execute-resume-observation-v1','operationId',${op},'originalAuthorizationId',${id},
 'observedAt',clock_timestamp(),'authorizationExpiresAt',(SELECT expires_at FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=${id}),
 'authorizationExpiredUnused',EXISTS(SELECT 1 FROM app_private.financial_reset_actor_authorizations WHERE authorization_id=${id} AND operation_id=${op}
  AND organization_id='${org}'::uuid AND action='execute' AND binding=${b} AND binding_sha256=app_private.financial_reset_hash(${b})
  AND expires_at<=clock_timestamp() AND consumed_at IS NULL AND backend_pid IS NULL AND transaction_id IS NULL),
 'sealedOperationMatches',EXISTS(SELECT 1 FROM app_private.financial_reset_operations o WHERE operation_id=${op} AND organization_id='${org}'::uuid
  AND operation_kind='reset' AND restore_of IS NULL AND status='sealed' AND source_generation=0 AND target_generation=1
  AND execution_backend IS NULL AND execution_xid IS NULL AND completed_at IS NULL AND archive_count=4898 AND action_count=4169
  AND ${['manifest_sha256','plan_sha256','schema_sha256','archive_sha256','action_sha256'].map(k=>`o.${k}=${b}->>'${k}'`).join(' AND ')}),
 'preparedRowsMatch',(SELECT count(*)=4898 FROM app_private.financial_reset_archive_rows WHERE operation_id=${op})
  AND (SELECT count(*)=4169 AND max(ordinal)=4169 AND count(*) FILTER(WHERE applied_at IS NOT NULL)=0 FROM app_private.financial_reset_actions WHERE operation_id=${op})
  AND app_private.financial_reset_archive_digest(${op})=${b}->>'archive_sha256' AND app_private.financial_reset_action_digest(${op})=${b}->>'action_sha256',
 'zeroPlanMatches',EXISTS(SELECT 1 FROM app_private.financial_reset_zero_plans WHERE operation_id=${op} AND status='prepared'
  AND review_sha256=${b}->>'zero_review_sha256' AND app_private.financial_reset_hash(plan_json)=review_sha256
  AND plan_json->>'approval_policy'='pilot-october-single-admin-v1' AND plan_json->'version'='4'::jsonb AND plan_json->'reviewer_actor_id'='null'::jsonb),
 'executionAbsent',NOT EXISTS(SELECT 1 FROM app_private.financial_reset_continuation_plans WHERE operation_id=${op})
  AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_phase_fences WHERE operation_id=${op})
  AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_verification_checkpoints WHERE operation_id=${op})
  AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_transaction_capabilities WHERE operation_id=${op})
  AND NOT EXISTS(SELECT 1 FROM app_private.financial_reset_execute_resumes WHERE operation_id=${op}),
 'reservationMatches',EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_reservations WHERE operation_id=${op} AND organization_id='${org}'::uuid
  AND binding=${b} AND binding_sha256=app_private.financial_reset_hash(${b})),
 'checkpointMatches',EXISTS(SELECT 1 FROM app_private.financial_reset_hosted_checkpoints WHERE operation_id=${op} AND organization_id='${org}'::uuid
  AND binding_sha256=app_private.financial_reset_hash(${b}) AND source_sha256=${b}->>'source_snapshot_sha256'),
 'controlMatches',EXISTS(SELECT 1 FROM app_private.financial_write_controls WHERE organization_id='${org}'::uuid AND status='frozen' AND generation=1 AND financial_start_date='2026-10-01'::date),
 'sourceMatches',app_private.financial_reset_hash(app_private.financial_reset_continuation_snapshot('${org}'::uuid))=${b}->>'source_snapshot_sha256',
 'freshForeignSha256',app_private.financial_reset_hash(app_private.financial_reset_hosted_foreign_census('${org}'::uuid)),
 'foreignOrganizationCount',(SELECT count(*) FROM public.organizations WHERE id<>'${org}'::uuid));
COMMIT;`;
}
