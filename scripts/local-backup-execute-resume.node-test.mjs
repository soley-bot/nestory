import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,realpath,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {canonicalJson,hashBytes} from './pilot-finance-reset-operator-core.mjs';
import {initializeWindowsResetJournal,openWindowsResetJournal} from './pilot-finance-reset-windows-journal.mjs';
import {createManualResetCoordinator} from './pilot-finance-reset-manual-coordinator.mjs';
import {PREPARE_REPAIR_ORIGINAL_MAIN} from './local-backup-dispatch-repair.mjs';
import {EXECUTE_RESUME_ORIGINAL,assertExecuteResumeRecord,localExecuteResumeStagePrefix,assertExecuteResumeOriginalJournal,
 executeResumeOriginalRunEvidence,assertExecuteResumeOriginalRun,assertExecuteResumeObservation,buildExecuteResumeObservationSql} from './local-backup-execute-resume.mjs';
const a=EXECUTE_RESUME_ORIGINAL,h='a'.repeat(64),id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const bytes=v=>Buffer.from(canonicalJson(v));
function fixture(){
 const binding={version:1,operation_id:a.operationId,organization_id:'752a87b8-bd04-4a45-9cb8-00687af66e73',project_ref:'pfvmztxktkwyewvxfgot',
  main_sha:PREPARE_REPAIR_ORIGINAL_MAIN,source_generation:0,target_generation:1,cutoff:'2026-10-01',issue_date:'2026-10-01',
  invoice_date_policy:'empty-books-no-invoices',continuation_semantic:{version:4},action_count:4169,archive_count:4898,
  ...Object.fromEntries(['source_snapshot_sha256','manifest_sha256','plan_sha256','schema_sha256','archive_sha256','action_sha256','zero_review_sha256'].map(k=>[k,h]))};
 const prepareRepair={format:'nestory-local-prepare-repair-v1',operationId:a.operationId,packetSha256:h,bindingSha256:hashBytes(bytes(binding)),
  originalMainSha:PREPARE_REPAIR_ORIGINAL_MAIN,executorMainSha:a.mainSha,manifestSha256:h,executorSourceSha256:h,
  originalAttempt:{authorizationId:id(1),nonce:id(2),runId:'123',runAttempt:1,intentSha256:h,claimSha256:h,publicationSha256:h},
  replacement:{nonce:id(3),runId:'124',runAttempt:1},eligibilitySha256:h,originalRunSha256:h,createdAt:'2026-10-28T00:00:00.000Z'};
 const intent={format:'nestory-manual-reset-intent-v1',mainSha:a.mainSha,inputBundleSha256:h,
  transportIntent:{format:'nestory-hosted-reset-action-intent-v1',operationId:a.operationId,action:'execute',authorizationId:a.authorizationId,
   packetSha256:h,bindingSha256:prepareRepair.bindingSha256,authoritySha256:h,sourceObservationSha256:h,sqlSha256:h},
  custody:{format:'nestory-local-reset-custody-reference-v1',operationId:a.operationId,packetSha256:h,
   ...Object.fromEntries(['archiveEnvelopeSha256','archivePlaintextSha256','filesArchiveSha256','restoreEvidenceSha256','keyRecoveryEvidenceSha256',
    'privateDestinationReviewSha256','foreignBaselineSha256','evidenceRecordSha256'].map(k=>[k,h]))}};
 const intentSha256=hashBytes(bytes(intent)),claim={format:'nestory-manual-reset-dispatch-claim-v1',operationId:a.operationId,action:'execute',intentSha256};
 const response={format:'nestory-manual-reset-dispatch-response-v1',operationId:a.operationId,action:'execute',intentSha256,runId:Number(a.runId),runAttempt:1};
 const publication={format:'nestory-local-ticket-publication-v1',runId:Number(a.runId),intentSha256,publicationArchiveId:id(4),publicationArchiveSha256:h,ciphertextSha256:h};
 const receipt={format:'nestory-local-custody-result-v1',operationId:a.operationId,action:'execute',runId:a.runId,runAttempt:1,intentSha256,
  outcome:'not-proven-do-not-retry',mutationRetried:false,observationSha256:h,checkpointSha256:null,normalWritesReopened:false};
 const receiptSha256=hashBytes(bytes(receipt)),reconciliation={format:'nestory-manual-reset-reconciliation-record-v1',operationId:a.operationId,action:'execute',intentSha256,
  runId:Number(a.runId),runAttempt:1,receiptSha256,observationSha256:h,outcome:receipt.outcome};
 const eligibility={format:'nestory-local-execute-resume-observation-v1',operationId:a.operationId,originalAuthorizationId:a.authorizationId,
  observedAt:'2026-10-28T05:21:00.000Z',authorizationExpiresAt:'2026-10-28T05:01:30.000Z',freshForeignSha256:'b'.repeat(64),foreignOrganizationCount:4,
  ...Object.fromEntries(['authorizationExpiredUnused','sealedOperationMatches','preparedRowsMatch','zeroPlanMatches','executionAbsent','reservationMatches','checkpointMatches','controlMatches','sourceMatches'].map(k=>[k,true]))};
 const originalRun={id:Number(a.runId),run_attempt:1,status:'completed',conclusion:'success',head_sha:a.mainSha,head_branch:'main',event:'workflow_dispatch',
  path:'.github/workflows/pilot-financial-reset-local-custody.yml',repository:{full_name:'soley-bot/nestory'},display_title:`Pilot reset ${a.operationId} execute ${a.nonce} execute`};
 const resume={format:'nestory-local-execute-resume-v1',operationId:a.operationId,packetSha256:h,bindingSha256:prepareRepair.bindingSha256,
  originalMainSha:PREPARE_REPAIR_ORIGINAL_MAIN,executorMainSha:'c'.repeat(40),manifestSha256:h,executorSourceSha256:h,prepareRepair,
  originalAttempt:{authorizationId:a.authorizationId,nonce:a.nonce,runId:a.runId,runAttempt:1,mainSha:a.mainSha,intentSha256,claimSha256:hashBytes(bytes(claim)),publicationSha256:h,receiptSha256},
  replacement:{nonce:id(5),runId:'999999',runAttempt:1},eligibilitySha256:hashBytes(bytes(eligibility)),freshForeignSha256:eligibility.freshForeignSha256,
  originalRunSha256:executeResumeOriginalRunEvidence(originalRun).sha256,createdAt:'2026-10-28T05:22:00.000Z'};
 return {resume,binding,eligibility,originalRun,intent,journal:{resume,intentBytes:bytes(intent),claimBytes:bytes(claim),responseBytes:bytes(response),
  publicationBytes:bytes(publication),receiptBytes:bytes(receipt),reconciliationBytes:bytes(reconciliation),prepareRepairBytes:bytes(prepareRepair)}};
}
test('one execute resume retains original native binding and nested prepare history',()=>{
 const f=fixture();assert.equal(assertExecuteResumeRecord(f.resume),f.resume);assert.equal(assertExecuteResumeOriginalJournal(f.journal),true);
 assert.equal(localExecuteResumeStagePrefix('execute',f.resume),`financial-reset/${a.operationId}/manual-stage/execute/resume-once/attempt`);
 for(const action of ['prepare','seal','execute-recovery','freeze'])assert.throws(()=>localExecuteResumeStagePrefix(action,f.resume));
 for(const change of [r=>r.operationId=id(6),r=>r.originalAttempt.authorizationId=id(7),r=>r.originalAttempt.nonce=id(8),r=>r.originalAttempt.runId='123',
  r=>r.originalAttempt.runAttempt=2,r=>r.replacement.nonce=a.nonce,r=>r.replacement.runId=a.runId,r=>r.prepareRepair.bindingSha256='b'.repeat(64),
  r=>r.prepareRepair.executorMainSha='d'.repeat(40),r=>r.sql='SELECT 1',r=>r.execution_resume={}]){
  const r=structuredClone(f.resume);change(r);assert.throws(()=>assertExecuteResumeRecord(r));
 }
});
test('collected NOTPROVEN receipt and retained reconciliation are required, not an operator success flag',()=>{
 const f=fixture();
 for(const key of Object.keys(f.journal).filter(k=>k!=='resume')){
  assert.throws(()=>assertExecuteResumeOriginalJournal({...f.journal,[key]:Buffer.from('{}')}));
  assert.throws(()=>assertExecuteResumeOriginalJournal({...f.journal,[key]:null}));
 }
 for(const change of [r=>r.outcome='committed-and-verified',r=>r.checkpointSha256=h,r=>r.normalWritesReopened=null,r=>r.mutationRetried=true,r=>r.runAttempt=2,r=>r.runId='1']){
  const receipt=JSON.parse(f.journal.receiptBytes);change(receipt);const receiptBytes=bytes(receipt),resume=structuredClone(f.resume);
  resume.originalAttempt.receiptSha256=hashBytes(receiptBytes);
  assert.throws(()=>assertExecuteResumeOriginalJournal({...f.journal,resume,receiptBytes}));
 }
});
test('terminal exact original run is checked even when GitHub marked NOTPROVEN worker as success',()=>{
 const f=fixture();assert.equal(assertExecuteResumeOriginalRun(f.originalRun,f.resume),true);
 for(const patch of [{status:'in_progress'},{run_attempt:2},{id:1},{head_sha:'f'.repeat(40)},{head_branch:'other'},
  {event:'push'},{display_title:'other'},{conclusion:'skipped'}])assert.throws(()=>assertExecuteResumeOriginalRun({...f.originalRun,...patch},f.resume));
});
test('rollback observation admits fresh foreign census without claiming equality to the original one',()=>{
 const f=fixture(),options={binding:f.binding,originalAuthorizationId:a.authorizationId};
 assert.equal(assertExecuteResumeObservation(f.eligibility,options),true);assert.notEqual(f.eligibility.freshForeignSha256,h);
 for(const key of Object.keys(f.eligibility).filter(k=>f.eligibility[k]===true))assert.throws(()=>assertExecuteResumeObservation({...f.eligibility,[key]:false},options));
 for(const patch of [{freshForeignSha256:''},{foreignOrganizationCount:3},{originalAuthorizationId:id(2)},
  {observedAt:'9999-01-01T00:00:00.000Z'},{authorizationExpiresAt:'9999-01-01T00:00:00.000Z'},{foreignMatches:true}])
  assert.throws(()=>assertExecuteResumeObservation({...f.eligibility,...patch},options));
 const sql=buildExecuteResumeObservationSql(options);assert.match(sql,/READ ONLY/);assert.match(sql,/financial_reset_archive_digest/);
 assert.match(sql,/financial_reset_execute_resumes/);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|consume_financial_reset_actor_authorization)\b/);
 assert.throws(()=>buildExecuteResumeObservationSql({...options,originalAuthorizationId:id(2)}));
 assert.throws(()=>buildExecuteResumeObservationSql({...options,binding:{...f.binding,execution_resume:{}}}));
});
test('resume coordinator uses real append-only storage and refuses fabricated providers',()=>{
 assert.throws(()=>createManualResetCoordinator({store:{read(){},putIfAbsent(){}}}),/unrecognized_provider/);
});
test('real Windows resume append survives reopen, preserves originals and cannot dispatch a second attempt', {skip:process.platform!=='win32'},async t=>{
 const parent=await realpath(os.tmpdir());assert.match(parent,/^C:\\/i);
 const directory=await mkdtemp(path.join(parent,'nestory-resume-synthetic-'));
 t.after(async()=>{const resolved=await realpath(directory);assert.equal(path.dirname(resolved).toLowerCase(),parent.toLowerCase());assert.match(path.basename(resolved),/^nestory-resume-synthetic-/);await rm(resolved,{recursive:true,force:false});});
 const acl=`$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false);foreach($sid in @($owner.Value,'S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};[IO.Directory]::SetAccessControl($p,$acl)`;
 const setup=spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(acl,'utf16le').toString('base64')],{input:directory,windowsHide:true,timeout:30000});assert.equal(setup.status,0);
 const options=await initializeWindowsResetJournal({directory,storeId:randomUUID(),expectedHelperSha256:hashBytes(await readFile(new URL('./pilot-finance-reset-windows-journal.ps1',import.meta.url)))});
 const store=await openWindowsResetJournal(options),f=fixture(),base=`financial-reset/${a.operationId}/manual-stage/execute`;
 const originals=new Map([[`${base}/intent`,f.journal.intentBytes],[`${base}/dispatch-claim`,f.journal.claimBytes],[`${base}/dispatch-response`,f.journal.responseBytes],
  [`${base}/bootstrap/${a.nonce}/publish-claim`,f.journal.publicationBytes],[`${base}/bootstrap/${a.nonce}/worker-receipt/${f.resume.originalAttempt.receiptSha256}`,f.journal.receiptBytes],
  [`${base}/reconciliation/${f.resume.originalAttempt.receiptSha256}`,f.journal.reconciliationBytes],[`financial-reset/${a.operationId}/manual-stage/prepare/repair-once`,f.journal.prepareRepairBytes]]);
 for(const[k,v]of originals)await store.putIfAbsent(k,v);
 const coordinator=createManualResetCoordinator({store}),bootstrap={format:'nestory-manual-reset-bootstrap-claim-v1',operationId:a.operationId,action:'execute',nonce:f.resume.replacement.nonce,
  mainSha:f.resume.executorMainSha,packetSha256:h,payloadSha256:h,transferArchiveId:id(90),transferArchiveSha256:h};
 const claim=await coordinator.recordBootstrapClaim(bootstrap);await coordinator.recordBootstrapResponse({...bootstrap,bootstrapClaimSha256:claim.bootstrapClaimSha256,runId:Number(f.resume.replacement.runId),runAttempt:1});
 await store.putIfAbsent(`${base}/bootstrap/${bootstrap.nonce}/workflow-post`,bytes({format:'nestory-local-workflow-post-v1',operationId:a.operationId,action:'execute',nonce:bootstrap.nonce,mainSha:bootstrap.mainSha}));
 const evidence={binding:f.binding,eligibility:f.eligibility,originalRun:f.originalRun};
 const bad=structuredClone(evidence);bad.eligibility.executionAbsent=false;await assert.rejects(coordinator.recordExecuteResume(f.resume,bad));
 assert.equal(await store.read(`${base}/resume-once`),null);
 assert.equal((await coordinator.recordExecuteResume(f.resume,evidence)).executionSupported,false);
 const reopened=await openWindowsResetJournal(options);await assert.rejects(createManualResetCoordinator({store:reopened}).recordExecuteResume(f.resume,evidence),/existing_or_uncertain/);
 const scoped=createManualResetCoordinator({store:reopened,prepareRepair:f.resume.prepareRepair,executeResume:f.resume});
 const intent=structuredClone(f.intent);intent.mainSha=f.resume.executorMainSha;intent.transportIntent.authorizationId=id(91);
 const result=await scoped.recordIntent(intent),request={operationId:a.operationId,action:'execute',intentSha256:result.intentSha256};await scoped.claimDispatch(request);
 await scoped.recordDispatchResponse({...request,runId:Number(f.resume.replacement.runId),runAttempt:1});
 const again=createManualResetCoordinator({store:await openWindowsResetJournal(options),prepareRepair:f.resume.prepareRepair,executeResume:f.resume});
 await assert.rejects(again.claimDispatch(request),/existing_or_uncertain/);
 for(const[k,v]of originals)assert.deepEqual(await reopened.read(k),v);
});
