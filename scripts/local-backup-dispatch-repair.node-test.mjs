import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,hashBytes,hashSourceBytes} from './pilot-finance-reset-operator-core.mjs';
import {PREPARE_REPAIR_OPERATION,PREPARE_REPAIR_ORIGINAL_MAIN,PREPARE_REPAIR_MANIFEST,EXECUTE_RESUME_MANIFEST,
 assertPrepareRepairManifest,assertPrepareRepairSourceBytes,inspectLocalDispatchCompatibility,readLocalDispatchCompatibleSources,
 assertLocalDispatchCompatibilityCurrent,
 assertPrepareRepairRecord,assertPrepareRepairOriginalJournal,localPrepareRepairStagePrefix,
 buildPrepareRepairObservationSql,buildPrepareRepairGuardSql,assertPrepareRepairObservation,assertPrepareRepairOriginalRun,prepareRepairOriginalRunEvidence} from './local-backup-dispatch-repair.mjs';
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,h='a'.repeat(64);
const bytes=o=>Buffer.from(canonicalJson(o));
function record(){return{format:'nestory-local-prepare-repair-v1',operationId:PREPARE_REPAIR_OPERATION,packetSha256:h,bindingSha256:h,
 originalMainSha:PREPARE_REPAIR_ORIGINAL_MAIN,executorMainSha:'b'.repeat(40),manifestSha256:h,executorSourceSha256:h,
 originalAttempt:{authorizationId:id(1),nonce:id(2),runId:'100',runAttempt:1,intentSha256:h,claimSha256:h,publicationSha256:h},
 replacement:{nonce:id(3),runId:'101',runAttempt:1},eligibilitySha256:h,originalRunSha256:h,createdAt:'2026-10-28T01:30:00.000Z'};}
function binding(){return{version:1,operation_id:PREPARE_REPAIR_OPERATION,organization_id:'752a87b8-bd04-4a45-9cb8-00687af66e73',project_ref:'pfvmztxktkwyewvxfgot',
 main_sha:PREPARE_REPAIR_ORIGINAL_MAIN,source_generation:0,target_generation:1,cutoff:'2026-10-01',issue_date:'2026-10-01',invoice_date_policy:'empty-books-no-invoices',
 continuation_semantic:{version:4},source_snapshot_sha256:h};}
function sourceFixture(){
 const p='scripts/local-backup-dispatch-repair.mjs',unchanged='supabase/migrations/20261027005615_financial_reset_empty_books_preserved_contracts.sql';
 const old=Buffer.from('SELECT 1;\n'),fresh=Buffer.from('// reviewed transport only\n');
 const manifest={format:'nestory-local-prepare-repair-manifest-v1',originalMainSha:PREPARE_REPAIR_ORIGINAL_MAIN,operationId:PREPARE_REPAIR_OPERATION,
  allowedStages:['prepare','seal','execute'],changes:[{path:p,originalSha256:null,replacementSha256:hashSourceBytes(fresh)}]};
 return{packet:{operation:{mainSha:PREPARE_REPAIR_ORIGINAL_MAIN,operationId:PREPARE_REPAIR_OPERATION},sourceFiles:[{path:unchanged,sha256:hashSourceBytes(old)}]},
  manifest,originalFiles:new Map([[p,null],[unchanged,old]]),currentFiles:new Map([[p,fresh],[unchanged,Buffer.from('SELECT 1;\r\n')]]),changedPaths:[p,PREPARE_REPAIR_MANIFEST]};
}
test('compatibility pins original bytes, unchanged SQL and exact finite reviewed delta without future commit/self hash',()=>{
 const f=sourceFixture();assert.equal(assertPrepareRepairSourceBytes(f),true);assertPrepareRepairManifest(f.manifest);
 assert.equal(JSON.stringify(f.manifest).includes('executorMainSha'),false);
});
function resumeSourceFixture(){
 const f=sourceFixture();
 f.manifest.format='nestory-local-execute-resume-manifest-v1';f.manifest.allowedStages=['execute'];
 for(const [path,content]of[
  [PREPARE_REPAIR_MANIFEST,'{"retained":"original prepare repair"}\n'],
  ['supabase/migrations/20261028053520_financial_reset_execute_attempt_foreign_baseline.sql','-- reviewed forward-only addition\nSELECT 2;\n'],
 ]){
  const value=Buffer.from(content);f.originalFiles.set(path,null);f.currentFiles.set(path,value);
  f.manifest.changes.push({path,originalSha256:null,replacementSha256:hashSourceBytes(value)});
 }
 f.manifest.changes.sort((a,b)=>a.path.localeCompare(b.path));
 f.changedPaths=[...f.manifest.changes.map(c=>c.path),EXECUTE_RESUME_MANIFEST];
 return f;
}
test('execute-only compatibility adds the exact forward migration while retaining historical packet bytes and prepare manifest',()=>{
 const f=resumeSourceFixture();assert.equal(assertPrepareRepairSourceBytes(f),true);
 assert.deepEqual(f.manifest.allowedStages,['execute']);
 assert.equal(f.originalFiles.get(f.packet.sourceFiles[0].path).toString(),'SELECT 1;\n');
});
for(const [name,change]of[
 ['legacy manifest claiming the new migration',f=>{f.manifest.format='nestory-local-prepare-repair-manifest-v1';f.manifest.allowedStages=['prepare','seal','execute'];f.changedPaths[f.changedPaths.length-1]=PREPARE_REPAIR_MANIFEST;}],
 ['resume manifest widening to prepare',f=>f.manifest.allowedStages=['prepare','execute']],
 ['unknown manifest format',f=>f.manifest.format='nestory-local-execute-resume-manifest-v2'],
 ['old manifest path substituted for resume manifest',f=>f.changedPaths[f.changedPaths.length-1]=PREPARE_REPAIR_MANIFEST],
 ['changed new migration bytes',f=>f.currentFiles.set(f.manifest.changes.at(-1).path,Buffer.from('SELECT 3;'))],
 ['different forward migration path',f=>f.manifest.changes.at(-1).path='supabase/migrations/20261028053521_unreviewed.sql'],
 ['modified original financial migration',f=>{const path=f.packet.sourceFiles[0].path;f.currentFiles.set(path,Buffer.from('SELECT 3;'));}],
 ['unlisted schema addition',f=>f.changedPaths.push('supabase/migrations/20261028053521_unreviewed.sql')],
 ['missing retained prepare manifest',f=>f.currentFiles.delete(PREPARE_REPAIR_MANIFEST)],
])test(`execute-only compatibility rejects ${name}`,()=>{const f=resumeSourceFixture();change(f);assert.throws(()=>assertPrepareRepairSourceBytes(f));});
for(const [name,change]of[
 ['changed native SQL',f=>f.currentFiles.set(f.packet.sourceFiles[0].path,Buffer.from('SELECT 2;'))],
 ['changed original bytes',f=>f.originalFiles.set(f.packet.sourceFiles[0].path,Buffer.from('SELECT 2;'))],
 ['changed transport bytes',f=>f.currentFiles.set(f.manifest.changes[0].path,Buffer.from('// unreviewed'))],
 ['unlisted added file',f=>f.changedPaths.push('scripts/extra.mjs')],
 ['missing delta',f=>f.changedPaths.pop()],
 ['another operation',f=>f.packet.operation.operationId=id(8)],
 ['native change disguised as transport',f=>{f.manifest.changes[0].path=f.packet.sourceFiles[0].path;}],
 ['duplicate original source',f=>f.packet.sourceFiles.push({...f.packet.sourceFiles[0]})],
])test(`compatibility rejects ${name}`,()=>{const f=sourceFixture();change(f);assert.throws(()=>assertPrepareRepairSourceBytes(f));});
test('pure comparison cannot mint a branded operational source receipt',()=>{
 assert.throws(()=>inspectLocalDispatchCompatibility({format:'nestory-local-prepare-repair-compatibility-v1'}));
 assert.throws(()=>readLocalDispatchCompatibleSources(sourceFixture()));
});
test('fabricated/serialized compatibility never reaches custody reads or acquires an operational lease',async()=>{
 const {prepareSavedLocalRecoveryEvidence}=await import('./local-backup-custody-evidence.mjs');
 const handle={format:'nestory-local-prepare-repair-compatibility-v1'};
 await assert.rejects(assertLocalDispatchCompatibilityCurrent(handle,{}));
 await assert.rejects(prepareSavedLocalRecoveryEvidence({}, {}, {compatibility:handle}));
 await assert.rejects(prepareSavedLocalRecoveryEvidence({}, {}, {compatibility:handle,approved:true}));
});
test('one-off record and stage prefixes preserve original history and reject other modes/reuse',()=>{
 const r=record();assertPrepareRepairRecord(r);
 assert.equal(localPrepareRepairStagePrefix('prepare',r),`financial-reset/${r.operationId}/manual-stage/prepare/repair-once/attempt`);
 assert.equal(localPrepareRepairStagePrefix('seal',r),`financial-reset/${r.operationId}/manual-stage/seal`);
 assert.throws(()=>localPrepareRepairStagePrefix('freeze',r));assert.throws(()=>localPrepareRepairStagePrefix('execute-recovery',r));
 for(const change of [x=>x.replacement.runId=x.originalAttempt.runId,x=>x.replacement.nonce=x.originalAttempt.nonce,x=>x.replacement.runAttempt=2,
  x=>x.operationId=id(9),x=>x.originalMainSha=x.executorMainSha,x=>x.createdAt='2026-10-28T01:30:00Z',x=>x.approved=true]){
  const v=record();change(v);assert.throws(()=>assertPrepareRepairRecord(v));
 }
});
function originalJournal(){
 const repair=record(),intentBytes=bytes({mainSha:repair.originalMainSha,transportIntent:{operationId:repair.operationId,action:'prepare',
  authorizationId:repair.originalAttempt.authorizationId,packetSha256:repair.packetSha256,bindingSha256:repair.bindingSha256}});
 repair.originalAttempt.intentSha256=hashBytes(intentBytes);
 const claimBytes=bytes({format:'nestory-manual-reset-dispatch-claim-v1',operationId:repair.operationId,action:'prepare',intentSha256:repair.originalAttempt.intentSha256});
 repair.originalAttempt.claimSha256=hashBytes(claimBytes);
 const responseBytes=bytes({format:'nestory-manual-reset-dispatch-response-v1',operationId:repair.operationId,action:'prepare',intentSha256:repair.originalAttempt.intentSha256,runId:100,runAttempt:1});
 const publicationBytes=bytes({format:'nestory-local-ticket-publication-v1',runId:100,intentSha256:repair.originalAttempt.intentSha256,ciphertextSha256:repair.originalAttempt.publicationSha256});
 return{repair,intentBytes,claimBytes,responseBytes,publicationBytes};
}
test('repair parent binds original intent, claim, run response and publication bytes',()=>{
 const f=originalJournal();assert.equal(assertPrepareRepairOriginalJournal(f),true);
 for(const k of ['intentBytes','claimBytes','responseBytes','publicationBytes']){const v=originalJournal();v[k]=bytes({unrelated:true});assert.throws(()=>assertPrepareRepairOriginalJournal(v));}
 const v=originalJournal();v.repair.originalAttempt.authorizationId=id(4);assert.throws(()=>assertPrepareRepairOriginalJournal(v));
});
test('native eligibility query is fixed read-only and replacement guard remains inside callers transaction',()=>{
 const o={binding:binding(),originalAuthorizationId:id(1)},query=buildPrepareRepairObservationSql(o),guard=buildPrepareRepairGuardSql(o);
 assert.ok(query.startsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;'));
 assert.ok(!/\b(?:UPDATE|DELETE|INSERT|ALTER|CREATE|DROP)\b/.test(query));
 assert.match(guard,/financial_write_lifecycle_v1:/);assert.match(guard,/FOR UPDATE;/);
 assert.ok(!guard.includes('COMMIT'));assert.ok(!guard.includes('consume_financial_reset_actor_authorization'));
 for(const table of ['financial_reset_operations','financial_reset_archive_rows','financial_reset_actions','financial_reset_hosted_stage_events','financial_reset_hosted_action_receipts'])assert.ok(guard.includes(`NOT EXISTS(SELECT 1 FROM app_private.${table}`));
 for(const change of [x=>x.binding.recovery={},x=>x.binding.main_sha='c'.repeat(40),x=>x.binding.target_generation=2,x=>x.originalAuthorizationId="'; COMMIT; --"]){
  const v=structuredClone(o);change(v);assert.throws(()=>buildPrepareRepairGuardSql(v));
 }
});
test('eligibility refuses consumed/missing/changed native state and malformed time; no actor/session data admitted',()=>{
 const options={binding:binding(),originalAuthorizationId:id(1),now:Date.parse('2026-10-28T01:30:00.000Z')};
 const value={format:'nestory-local-prepare-repair-observation-v1',operationId:PREPARE_REPAIR_OPERATION,originalAuthorizationId:id(1),
  observedAt:'2026-10-28T01:29:59.000Z',authorizationExpiresAt:'2026-10-28T01:17:06.000Z',
  authorizationExpiredUnused:true,nativePrepareAbsent:true,reservationMatches:true,checkpointMatches:true,controlMatches:true,sourceMatches:true,foreignMatches:true};
 assert.equal(assertPrepareRepairObservation(value,options),true);
 for(const k of ['authorizationExpiredUnused','nativePrepareAbsent','reservationMatches','checkpointMatches','controlMatches','sourceMatches','foreignMatches'])assert.throws(()=>assertPrepareRepairObservation({...value,[k]:false},options));
 assert.throws(()=>assertPrepareRepairObservation({...value,authorizationExpiresAt:'garbage'},options));
 assert.throws(()=>assertPrepareRepairObservation({...value,actorId:id(2)},options));
});
test('old GitHub attempt must be terminal unsuccessful and exactly bound to original protected main workflow',()=>{
 const r=record(),run={id:100,run_attempt:1,status:'completed',conclusion:'failure',head_sha:PREPARE_REPAIR_ORIGINAL_MAIN,
  head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/pilot-financial-reset-local-custody.yml',repository:{full_name:'soley-bot/nestory'},
  display_title:`Pilot reset ${r.operationId} prepare ${r.originalAttempt.nonce} execute`};
 r.originalRunSha256=prepareRepairOriginalRunEvidence(run,{operationId:r.operationId,nonce:r.originalAttempt.nonce}).sha256;
 assert.equal(assertPrepareRepairOriginalRun(run,r),true);
 for(const delta of [{status:'in_progress'},{conclusion:'success'},{run_attempt:2},{head_sha:'b'.repeat(40)},{id:101},{event:'push'},{display_title:'another operation'}])assert.throws(()=>assertPrepareRepairOriginalRun({...run,...delta},r));
 assert.throws(()=>assertPrepareRepairOriginalRun(run,{...r,originalRunSha256:h}));
});
