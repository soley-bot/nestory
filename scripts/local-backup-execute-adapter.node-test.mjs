import test from 'node:test';
import assert from 'node:assert/strict';
import {digestJson,jsonSql,literal,observationSql} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {rehearsalSqlFixture} from './fixtures/local-backup-rehearsal-sql-fixture.mjs';
import {localCustodyMutationSql} from './pilot-finance-reset-local-custody-runner.mjs';
import {EXECUTE_RESUME_ORIGINAL as original} from './local-backup-execute-resume.mjs';
import {assertExecuteResumeAudit,executeResumeMutationSql,executeResumeObservationSql,projectExecuteResumeObservation} from './local-backup-execute-adapter.mjs';
const h='a'.repeat(64),id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function fixture(){
 const f=rehearsalSqlFixture(),binding={version:1,operation_id:original.operationId,organization_id:'752a87b8-bd04-4a45-9cb8-00687af66e73',
  project_ref:'pfvmztxktkwyewvxfgot',main_sha:'9a08df0181d391a9bc8e6c28319c6678485f4c59',source_generation:0,target_generation:1,
  cutoff:'2026-10-01',issue_date:'2026-10-01',invoice_date_policy:'empty-books-no-invoices',action_count:4169,archive_count:4898,
  continuation_semantic:f.phases.continuationPlan,continuation_semantic_sha256:digestJson(f.phases.continuationPlan),
  ...Object.fromEntries(['source_snapshot_sha256','schema_sha256','archive_sha256','action_sha256','manifest_sha256','plan_sha256','zero_review_sha256'].map(k=>[k,h]))};
 const prepareRepair={format:'nestory-local-prepare-repair-v1',operationId:original.operationId,packetSha256:h,bindingSha256:digestJson(binding),
  originalMainSha:binding.main_sha,executorMainSha:original.mainSha,manifestSha256:h,executorSourceSha256:h,
  originalAttempt:{authorizationId:id(1),nonce:id(2),runId:'123',runAttempt:1,intentSha256:h,claimSha256:h,publicationSha256:h},
  replacement:{nonce:id(3),runId:'124',runAttempt:1},eligibilitySha256:h,originalRunSha256:h,createdAt:'2026-10-28T00:00:00.000Z'};
 const record={format:'nestory-local-execute-resume-v1',operationId:original.operationId,packetSha256:h,bindingSha256:digestJson(binding),
  originalMainSha:binding.main_sha,executorMainSha:'c'.repeat(40),manifestSha256:h,executorSourceSha256:h,prepareRepair,
  originalAttempt:{...Object.fromEntries(['authorizationId','nonce','runId','runAttempt','mainSha'].map(k=>[k,original[k]])),intentSha256:h,claimSha256:h,publicationSha256:h,receiptSha256:h},
  replacement:{nonce:id(5),runId:'999999',runAttempt:1},eligibilitySha256:h,freshForeignSha256:'b'.repeat(64),originalRunSha256:h,createdAt:'2026-10-28T05:22:00.000Z'};
 // Native SHA(jsonb::text) is deliberately different from compact JS canonical
 // digestJson used by the local record. Compare each only within its domain.
 const reservation={binding,bindingSha256:'e'.repeat(64),foreignSha256:h,backendPid:10,transactionId:'11'},
  recoveryCheckpoint={bindingSha256:'e'.repeat(64),sourceSha256:h,foreignSha256:h,backendPid:10,transactionId:'12'};
 const historicalObservation={catalog:[],ledger:[],reservation,recoveryCheckpoint};
 const observation={...structuredClone(historicalObservation),foreignSha256:record.freshForeignSha256,sourceSha256:h,capabilityCount:0,
  appliedCount:0,archiveCount:4898,actionCount:4169,operation:{status:'sealed',execution_backend:null,execution_xid:null,completed_at:null},
  continuation:null,checkpoint:null,phaseFences:[],zero:{status:'prepared'},control:{status:'frozen',generation:1,cutoff:'2026-10-01'},executeResume:null};
 const authorizationId=id(9),artifacts={continuationPlan:f.phases.continuationPlan,zeroPlan:{...f.phases.zeroPlan,operation_id:binding.operation_id},
  actions:{actions:f.plan.actions,operation:{}}};
 return{binding,record,historicalObservation,observation,authorizationId,phase:'before',artifacts};
}
function completed(){const f=fixture();f.phase='after';f.observation.authorization={status:'consumed',bindingMatches:true,authorizationId:f.authorizationId,
 actorId:f.binding.continuation_semantic.actor_id,backendPid:20,transactionId:'30'};
 f.observation.executeResume={operationId:f.binding.operation_id,bindingSha256:f.observation.reservation.bindingSha256,failedAuthorizationId:original.authorizationId,
  authorizationId:f.authorizationId,originalForeignSha256:h,foreignSha256:f.record.freshForeignSha256,censusHashValid:true,foreignOrganizationCount:4,backendPid:20,transactionId:'30'};
 return f;}
test('before audit requires absent amendment and exact sealed/source/retained original lineage',()=>assert.equal(assertExecuteResumeAudit(fixture()),true));
test('after audit requires actual consumed authority and matching native backend/XID/full census hash',()=>assert.equal(assertExecuteResumeAudit(completed()),true));
test('native binding hashes remain separate from compact local record digests',()=>{
 const f=completed();assert.notEqual(f.record.bindingSha256,f.observation.reservation.bindingSha256);
 assert.equal(assertExecuteResumeAudit(f),true);
 f.observation.executeResume.bindingSha256=f.record.bindingSha256;assert.throws(()=>assertExecuteResumeAudit(f),/adapter_unverified/);
});
for(const [label,change]of[
 ['foreign drift',f=>f.observation.foreignSha256='f'.repeat(64)],['old reservation rewritten',f=>f.observation.reservation.foreignSha256=f.record.freshForeignSha256],
 ['checkpoint rewritten',f=>f.observation.recoveryCheckpoint.foreignSha256=f.record.freshForeignSha256],['wrong binding',f=>f.observation.reservation.bindingSha256='f'.repeat(64)],
 ['Pilot source drift',f=>f.observation.sourceSha256='f'.repeat(64)],['applied action',f=>f.observation.appliedCount=1],
 ['unproven absence',f=>delete f.observation.executeResume],['existing amendment',f=>f.observation.executeResume={}],
 ['partial archive',f=>f.observation.archiveCount--],['executing state',f=>f.observation.operation.status='executing'],
])test(`before denies ${label}`,()=>{const f=fixture();change(f);assert.throws(()=>assertExecuteResumeAudit(f),/adapter_unverified/)});
for(const [label,change]of[
 ['absent amendment',f=>f.observation.executeResume=null],['different auth',f=>f.observation.executeResume.authorizationId=id(8)],
 ['old failed auth',f=>f.authorizationId=original.authorizationId],['wrong backend',f=>f.observation.executeResume.backendPid=21],
 ['wrong transaction',f=>f.observation.executeResume.transactionId='31'],['corrupt census',f=>f.observation.executeResume.censusHashValid=false],
 ['wrong org count',f=>f.observation.executeResume.foreignOrganizationCount=3],['pending authority',f=>f.observation.authorization.status='pending'],
 ['wrong original baseline',f=>f.observation.executeResume.originalForeignSha256='c'.repeat(64)],['extra audit data',f=>f.observation.executeResume.extra=true],
])test(`after denies ${label}`,()=>{const f=completed();change(f);assert.throws(()=>assertExecuteResumeAudit(f),/adapter_unverified/)});
test('SQL changes only activation after consume and final baseline selector; guards/actions/TTL remain byte-identical',()=>{
 const f=fixture(),options={...f,action:'execute',authoritySha256:h,recovery:null,repair:f.record.prepareRepair};
 const originalSql=localCustodyMutationSql(options),actual=executeResumeMutationSql({...options,resume:{record:f.record,observation:f.observation}});
 const activation=`\nSELECT app_private.activate_financial_reset_execute_resume(${jsonSql(f.binding)},${literal(original.authorizationId)}::uuid);\nDO $local_execute_baseline$ BEGIN IF app_private.financial_reset_execute_foreign_sha256(${jsonSql(f.binding)}) IS DISTINCT FROM '${f.record.freshForeignSha256}' THEN RAISE EXCEPTION 'local_custody_foreign_baseline_changed' USING ERRCODE='40001'; END IF; END $local_execute_baseline$;`;
 const baseline=`app_private.financial_reset_execute_foreign_sha256(${jsonSql(f.binding)})`;
 assert.equal(actual.split(activation).length,2);assert.equal(actual.split(baseline).length,3);
 assert.equal(actual.replace(activation,'').replace(baseline,`(SELECT foreign_sha256 FROM app_private.financial_reset_hosted_reservations WHERE operation_id=${literal(f.binding.operation_id)}::uuid)`),originalSql);
 assert.ok(actual.indexOf(activation)>actual.indexOf('consume_financial_reset_actor_authorization'));
 assert.ok(actual.indexOf(activation)<actual.indexOf('SELECT app_private.assert_financial_reset_hosted_reservation'));
 assert.throws(()=>executeResumeMutationSql({...options,resume:f.record,authorizationId:original.authorizationId}));
 assert.throws(()=>executeResumeMutationSql({...options,resume:f.record,action:'seal'}));
});
test('observation adds only bounded audit metadata to existing read-only query',()=>{
 const f=fixture(),sql=executeResumeObservationSql({},f.binding,f.authorizationId),base=observationSql({},f.binding,f.authorizationId,'execute');
 const start=sql.indexOf("'executeResume',"),end=sql.indexOf("'catalog',",start);
 assert.equal(sql.slice(0,start)+sql.slice(end),base);assert.match(sql,/READ ONLY/);assert.doesNotMatch(sql,/activate_financial_reset_execute_resume|SELECT \*/);
 assert.match(sql,/censusHashValid/);assert.match(sql,/financial_reset_hash\(foreign_census\)/);
});
test('projection cannot admit arbitrary schema by supplying a success Boolean',async()=>{
 await assert.rejects(projectExecuteResumeObservation({payload:{transitionVerified:true},observation:{},phase:'after'}));
});
