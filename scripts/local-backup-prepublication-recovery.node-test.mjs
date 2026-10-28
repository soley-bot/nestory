import test from 'node:test';
import assert from 'node:assert/strict';
import {stoppedResume} from './fixtures/local-backup-prepublication-fixture.mjs';
import {digestJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {localDispatchBootstrapPayload} from './local-backup-dispatch-local.mjs';
import {PREPUBLICATION_STOPPED as stopped,assertPrepublicationRecoveryRecord,assertPrepublicationRecoveryParent,
 assertPrepublicationRecoveryCompatibility,assertPrepublicationRecoveryOriginalJournal,prepublicationRecoveryOriginalRunEvidence,
 assertPrepublicationRecoveryOriginalRun,assertPrepublicationRecoveryObservation,buildPrepublicationRecoveryObservationSql,
 buildPrepublicationRecoveryGuardSql,prepublicationRecoveryRecordSlot,localPrepublicationRecoveryStagePrefix} from './local-backup-prepublication-recovery.mjs';
const h='a'.repeat(64),nonce='10000000-0000-4000-8000-000000000001';
function originalRun(){return {id:Number(stopped.runId),run_attempt:1,status:'completed',conclusion:'cancelled',head_sha:stopped.mainSha,
 head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/pilot-financial-reset-local-custody.yml',repository:{full_name:'soley-bot/nestory'},
 display_title:`Pilot reset ${stopped.operationId} execute ${stopped.nonce} execute`};}
function record(){return {format:'nestory-local-prepublication-recovery-v1',operationId:stopped.operationId,packetSha256:stoppedResume.packetSha256,
 bindingSha256:stoppedResume.bindingSha256,originalMainSha:stoppedResume.originalMainSha,executorMainSha:'b'.repeat(40),manifestSha256:h,executorSourceSha256:h,
 parentResumeSha256:stopped.parentResumeSha256,stopped:Object.fromEntries(['authorizationId','nonce','runId','runAttempt','mainSha','intentSha256','claimSha256','responseSha256','bootstrapSha256','stagedSha256'].map(k=>[k,stopped[k]])),
 replacement:{nonce,runId:'999999',runAttempt:1},eligibilitySha256:h,originalRunSha256:prepublicationRecoveryOriginalRunEvidence(originalRun()).sha256,
 freshForeignSha256:h,createdAt:'2026-10-28T08:10:00.000Z'};}
function binding(){return {version:1,operation_id:stopped.operationId,organization_id:'752a87b8-bd04-4a45-9cb8-00687af66e73',project_ref:'pfvmztxktkwyewvxfgot',
 main_sha:stoppedResume.originalMainSha,source_generation:0,target_generation:1,cutoff:'2026-10-01',issue_date:'2026-10-01',invoice_date_policy:'empty-books-no-invoices',
 continuation_semantic:{version:4},action_count:4169,archive_count:4898,...Object.fromEntries(['source_snapshot_sha256','manifest_sha256','plan_sha256','schema_sha256','archive_sha256','action_sha256','zero_review_sha256'].map(k=>[k,h]))};}
const flags=['authorizationExpiredUnused','sealedOperationMatches','preparedRowsMatch','zeroPlanMatches','executionAbsent','reservationMatches','checkpointMatches','controlMatches','sourceMatches'];
function observation(){return {format:'nestory-local-prepublication-recovery-observation-v1',operationId:stopped.operationId,originalAuthorizationId:stopped.authorizationId,
 observedAt:'2026-10-28T08:02:48.000Z',authorizationExpiresAt:'2026-10-28T07:58:00.000Z',freshForeignSha256:h,foreignOrganizationCount:4,
 ...Object.fromEntries(flags.map(k=>[k,true]))};}
test('one fixed unpublished parent remains immutable and selects a separate child namespace',()=>{
 assert.equal(assertPrepublicationRecoveryParent(stoppedResume),stoppedResume);assert.equal(digestJson(stoppedResume),stopped.parentResumeSha256);
 const r=record();assert.equal(assertPrepublicationRecoveryRecord(r),r);
 assert.equal(localPrepublicationRecoveryStagePrefix('execute',r),prepublicationRecoveryRecordSlot()+'/attempt');
 for(const action of ['prepare','seal','execute-recovery'])assert.throws(()=>localPrepublicationRecoveryStagePrefix(action,r));
 for(const change of [r=>r.parentResumeSha256=h,r=>r.stopped.authorizationId=nonce,r=>r.stopped.intentSha256=h,r=>r.stopped.bootstrapSha256=h,
  r=>r.stopped.stagedSha256=h,r=>r.stopped.runAttempt=2,r=>r.replacement.nonce=stopped.nonce,r=>r.replacement.runId=stopped.runId,
  r=>r.executorMainSha=stopped.mainSha,r=>r.retry=2,r=>r.operationId=nonce]){const v=record();change(v);assert.throws(()=>assertPrepublicationRecoveryRecord(v));}
 const changed=structuredClone(stoppedResume);changed.freshForeignSha256=h;assert.throws(()=>assertPrepublicationRecoveryParent(changed));
 assert.throws(()=>assertPrepublicationRecoveryCompatibility(r,{format:'nestory-local-prepare-repair-compatibility-v1'}));
});
test('published or ambiguous attempts cannot enter the prepublication journal admission',()=>{
 const values={record:record(),resumeBytes:Buffer.from(JSON.stringify(stoppedResume)),intentBytes:Buffer.from('{}'),claimBytes:Buffer.from('{}'),responseBytes:Buffer.from('{}'),
 bootstrapBytes:Buffer.from('{}'),stagedBytes:Buffer.from('{}'),publicationBytes:null};
 for(const publicationBytes of [Buffer.from('{}'),undefined,Buffer.alloc(0)])assert.throws(()=>assertPrepublicationRecoveryOriginalJournal({...values,publicationBytes}));
 assert.throws(()=>assertPrepublicationRecoveryOriginalJournal(values));
});
test('exact cancelled stopped run is required rather than an active or successful worker',()=>{
 const r=record();assert.equal(assertPrepublicationRecoveryOriginalRun(originalRun(),r),true);
 for(const patch of [{status:'in_progress'},{conclusion:'success'},{id:1},{head_sha:'c'.repeat(40)},{run_attempt:2},{event:'push'},{display_title:'other'}])
  assert.throws(()=>assertPrepublicationRecoveryOriginalRun({...originalRun(),...patch},r));
});
test('fresh read-only eligibility requires unused expired authorization and every unchanged native invariant',()=>{
 const b=binding(),v=observation();assert.equal(assertPrepublicationRecoveryObservation(v,{binding:b}),true);
 for(const flag of flags)assert.throws(()=>assertPrepublicationRecoveryObservation({...v,[flag]:false},{binding:b}));
 for(const patch of [{originalAuthorizationId:nonce},{foreignOrganizationCount:3},{freshForeignSha256:''},{observedAt:'9999-01-01'},
  {authorizationExpiresAt:'9999-01-01'},{bypass:true}])assert.throws(()=>assertPrepublicationRecoveryObservation({...v,...patch},{binding:b}));
 const sql=buildPrepublicationRecoveryObservationSql({binding:b});assert.match(sql,/READ ONLY/);assert.match(sql,new RegExp(stopped.authorizationId));
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|INSERT)\b/);
 const r=record();r.bindingSha256=digestJson(b);const guard=buildPrepublicationRecoveryGuardSql({record:r,binding:b});
 assert.match(guard,/pg_advisory_xact_lock/);assert.match(guard,/consumed_at IS NULL AND backend_pid IS NULL AND transaction_id IS NULL FOR UPDATE/);
 assert.match(guard,/ERRCODE='40001'/);assert.doesNotMatch(guard,/consume_financial_reset_actor_authorization/);
 assert.throws(()=>buildPrepublicationRecoveryGuardSql({record:record(),binding:b}));
});
test('native observation substitution never edits UUID text inside the unchanged binding',()=>{
 const b=binding();b.continuation_semantic.note='4db95b1e-774b-4a8c-881a-2192724aa42d';
 const sql=buildPrepublicationRecoveryObservationSql({binding:b});assert.ok(sql.includes(JSON.stringify(b)));
 assert.ok(sql.includes(`'${stopped.authorizationId}'::uuid`));
});
test('inert bootstrap digest remains original fields while staged child stays fully bound',()=>{
 const base={packet:{packetSha256:h},binding:{operation_id:stopped.operationId},artifacts:{},recovery:null,observation:{},repair:stoppedResume.prepareRepair};
 const payload={...base,resume:{record:stoppedResume,observation:{foreignSha256:h}},prepublicationRecovery:record()};
 assert.deepEqual(localDispatchBootstrapPayload({action:'execute',payload}),base);assert.notEqual(digestJson(payload),digestJson(base));
 const changed=structuredClone(payload);changed.prepublicationRecovery.replacement.nonce='10000000-0000-4000-8000-000000000002';assert.notEqual(digestJson(changed),digestJson(payload));
});
