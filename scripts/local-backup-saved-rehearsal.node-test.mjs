import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {rehydrateSavedPilotRehearsal,inspectSavedPilotRehearsal,disposeSavedPilotRehearsal} from './local-backup-saved-rehearsal.mjs';
import {rehearsalSqlFixture} from './fixtures/local-backup-rehearsal-sql-fixture.mjs';
import {bindPilotRehearsalSemantics} from './local-backup-packet-bridge.mjs';
import {readFile} from 'node:fs/promises';
import {bindSavedPilotLiveWitness,persistPilotLiveWitnessInputs,openPilotLiveWitnessInputs} from './local-backup-live-input.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex'),id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`,h='a'.repeat(64);
function fixture(){
 const f=rehearsalSqlFixture(),request={keyId:id(71),archiveId:id(72),archiveSha256:h,sourceSha256:f.expectedSourceSha256};
 const rehearsal=bindPilotRehearsalSemantics(f.plan,{zeroPlan:f.phases.zeroPlan,zeroPlanText:f.phases.zeroPlanText,continuationPlan:f.phases.continuationPlan,reportPlan:f.phases.reportPlan});
 f.inverseInputs.phaseBinding={...f.inverseInputs.phaseBinding,schema_sha256:f.planBinding.executionBaseline.schemaSha256,
  zero_review_sha256:hash(f.phases.zeroPlanText),report_checkpoint_sha256:h};
 f.inverseInputs.phaseBindingText=JSON.stringify(f.inverseInputs.phaseBinding);
 const verification=phase=>({format:'nestory-local-ram-rehearsal-verification-v1',phase,canonicalRowsVerified:true,foreignKeysVerified:true,contractsUnchanged:true,frozen:true,
  generation:phase==='reset'?1:2,exactLifecycleDeltaVerified:true,contractsSha256:h,tableCensus:f.snapshot.tables.map(t=>({table_name:t.table_name,row_count:t.capture==='full-row-image'?t.row_count:0,rows_sha256:t.rows_sha256})),
  checkpointSha256:phase==='reset'?h:'b'.repeat(64),syntheticActorCount:1,productionPermissionProven:false,productionForeignDataProven:false,excludedCredentialTablesRestored:false,storageRecoveryVerified:false});
 const execution=phase=>({format:`nestory-local-ram-${phase==='reset'?'reset':'inverse'}-execution-v1`,operationId:phase==='reset'?f.operationId:f.recoveryId,status:'actions_complete',generation:phase==='reset'?1:2,
  actionCount:phase==='reset'?f.plan.actions.length:f.canonicalInverse.actions.length,appliedCount:phase==='reset'?f.plan.actions.length:f.canonicalInverse.actions.length,
  knownZeroVerified:phase==='reset',recoveryVerified:phase!=='reset',checkpoint:{kind:phase==='reset'?'checked-reports':'phase-recovery',sha256:phase==='reset'?h:'b'.repeat(64),generation:phase==='reset'?1:2,resultSha256:phase==='reset'?h:'b'.repeat(64)},
  authorityKind:'local-sql-session-fixture',productionPermissionProven:false,productionForeignDataProven:false,controlReopened:false,
  ...(phase==='reset'?{authorityTiming:structuredClone(f.authorityTiming)}:{})});
 const storage={metadataRows:f.snapshot.storageMetadata.length,bucketRows:f.snapshot.storageBucketMetadata.length,exactMetadataVerified:true,physicalFileBytesVerified:false};
 const result={format:'nestory-local-business-reset-inverse-result-v1',operationId:f.operationId,recoveryId:f.recoveryId,authorityKind:'local-sql-session-fixture',productionPermissionProven:false,productionForeignDataProven:false,
  fixture:{format:'nestory-local-synthetic-actor-fixture-v1',actorCount:1,sessionCount:1,fixtureTransactionId:f.fixtureTransactionId,authorityKind:'local-sql-session-fixture',productionPermissionProven:false,customerAuthImpersonated:false},
  before:{contractsSha256:h,censusAlgorithm:'sha256-of-concatenated-row-sha256-ordered-by-postgresql-primary-key-text',tableCensus:f.snapshot.tables.filter(t=>t.capture==='full-row-image').map(t=>({table_name:t.table_name,row_count:t.row_count,rows_sha256:t.rows_sha256}))},
  reset:execution('reset'),resetVerification:verification('reset'),resetStorage:storage,inverse:execution('recovered'),recovered:verification('recovered'),recoveredStorage:storage,
  transition:{name:'20261027005615_financial_reset_empty_books_preserved_contracts.sql',sha256:h},recoveryBaseline:rehearsal.binding.recoveryBaseline,executionBaseline:rehearsal.binding.executionBaseline};
 return{manifestBytes:f.manifestBytes,proof:{format:'nestory-local-business-ram-restore-proof-v1',...request,financialResetInverseProven:true,rehearsalInputsFreshProcessVerified:true,
  canonicalRowsVerified:true,foreignKeysVerified:true,foreignOrganizationRows:0,rehearsal,resetInverseResult:result},
  rehearsalInputs:{format:'nestory-local-business-rehearsal-inputs-v1',businessArchive:request,operationId:f.operationId,preview:f.preview,materialization:f.materialization,fixture:f.fixture,phases:f.phases,rehearsal},
  inverseInputs:{format:'nestory-local-business-inverse-inputs-v1',businessArchive:request,operationId:f.operationId,recoveryId:f.recoveryId,inverseInputs:f.inverseInputs,canonicalInverse:f.canonicalInverse}};
}
test('saved producer inputs rehydrate the exact branded planner without granting execution custody',async()=>{
 const f=fixture(),context=rehydrateSavedPilotRehearsal(f),view=inspectSavedPilotRehearsal(context);
 assert.equal(context.operationalCustodyVerified,false);assert.equal(context.productionPermissionProven,false);assert.equal(context.productionForeignDataProven,false);
 assert.equal(view.plan.operationId,f.rehearsalInputs.operationId);assert.ok(view.manifestBytes.equals(f.manifestBytes));
 assert.match(view.plan.actions[0].action_id,/^[a-f0-9]{8}-[a-f0-9]{4}-2[a-f0-9]{3}-[a-f0-9]{4}-[a-f0-9]{12}$/);
 assert.equal(view.plan.actions[0].action_id,f.rehearsalInputs.materialization.actions[0].action_id);
 f.proof.resetInverseResult.reset.generation=99;assert.equal(inspectSavedPilotRehearsal(context).proof.resetInverseResult.reset.generation,1);
 view.manifestBytes.fill(0);const other=inspectSavedPilotRehearsal(context);assert.notEqual(other.manifestBytes[0],0);other.manifestBytes.fill(0);
 assert.throws(()=>inspectSavedPilotRehearsal(structuredClone(context)));await disposeSavedPilotRehearsal(context);assert.throws(()=>inspectSavedPilotRehearsal(context));
});
for(const[name,change]of[
 ['restore-only proof',f=>f.proof.financialResetInverseProven=false],['missing fresh-process readback',f=>f.proof.rehearsalInputsFreshProcessVerified=false],
 ['different original archive',f=>f.inverseInputs.businessArchive={...f.inverseInputs.businessArchive,archiveId:id(79)}],
 ['changed materialization text',f=>f.rehearsalInputs.materialization.summary_text+=' '],
 ['wrong inverse operation',f=>f.proof.resetInverseResult.recoveryId=id(79)],['missing action application',f=>f.proof.resetInverseResult.inverse.appliedCount--],
 ['unknown table omitted',f=>f.proof.resetInverseResult.recovered.tableCensus.pop()],['changed original business census',f=>f.proof.resetInverseResult.before.tableCensus[0].rows_sha256='f'.repeat(64)],
 ['invented Storage bytes proof',f=>f.proof.resetInverseResult.recoveredStorage={...f.proof.resetInverseResult.recoveredStorage,physicalFileBytesVerified:true}],
 ['another reset checkpoint',f=>f.inverseInputs.inverseInputs.phaseBinding.report_checkpoint_sha256='f'.repeat(64)],
 ['semantic text substituted for full native review',f=>f.inverseInputs.inverseInputs.continuationReviewText=f.rehearsalInputs.phases.continuationPlanText],
 ['native continuation source changed',f=>{const input=f.inverseInputs.inverseInputs,review=JSON.parse(input.continuationReviewText);review.source_sha256='f'.repeat(64);input.continuationReviewText=JSON.stringify(review);input.phaseBinding.continuation_review_sha256=hash(input.continuationReviewText);input.phaseBindingText=JSON.stringify(input.phaseBinding)}],
 ['altered inverse row',f=>f.inverseInputs.canonicalInverse.actions[0].before_sha256='f'.repeat(64)],
 ['production identity relabel',f=>f.proof.resetInverseResult.productionPermissionProven=true],
 ['old two-actor proof relabel',f=>{f.proof.resetInverseResult.fixture.actorCount=2;f.proof.resetInverseResult.fixture.sessionCount=2}],
 ['extra reviewer fixture',f=>{f.rehearsalInputs.fixture.reviewer=id(81);f.rehearsalInputs.fixture.reviewerSession=id(82)}],
 ['old two-actor verification',f=>f.proof.resetInverseResult.resetVerification.syntheticActorCount=2],
 ['missing native timing',f=>delete f.proof.resetInverseResult.reset.authorityTiming],
 ['timing success flag substituted',f=>f.proof.resetInverseResult.reset.authorityTiming={verified:true}],
 ['inverse timing shape widened',f=>f.proof.resetInverseResult.inverse.authorityTiming={consumedAgeSeconds:1,remainingSeconds:299}],
 ...[
  {consumedAgeSeconds:-1,remainingSeconds:299},{consumedAgeSeconds:1,remainingSeconds:0},
  {consumedAgeSeconds:1,remainingSeconds:-1},{consumedAgeSeconds:1,remainingSeconds:299.00001},
  {consumedAgeSeconds:NaN,remainingSeconds:299},{consumedAgeSeconds:1,remainingSeconds:Infinity},
  {consumedAgeSeconds:'1',remainingSeconds:299},{consumedAgeSeconds:1,remainingSeconds:'299'},
 ].map((timing,index)=>[`invalid native timing ${index}`,f=>f.proof.resetInverseResult.reset.authorityTiming=timing]),
 ['missing fixture transaction receipt',f=>delete f.proof.resetInverseResult.fixture.fixtureTransactionId],
 ['different fixture transaction receipt',f=>f.proof.resetInverseResult.fixture.fixtureTransactionId='101'],
 ['missing phase fixture transaction',f=>delete f.rehearsalInputs.phases.fixtureTransactionId],
 ...['0','0100','-1','9223372036854775808',100].map(value=>[`invalid fixture transaction ${value}`,f=>{f.proof.resetInverseResult.fixture.fixtureTransactionId=value;f.rehearsalInputs.phases.fixtureTransactionId=value}]),
])test(`${name} cannot obtain saved rehearsal provenance`,()=>{const f=fixture();change(f);assert.throws(()=>rehydrateSavedPilotRehearsal(f));});
test('saved live witness rebinds the same business archive and requires actual held custody before private I/O',async()=>{
 const f=fixture(),context=rehydrateSavedPilotRehearsal(f),view=inspectSavedPilotRehearsal(context),snapshot=view.snapshot;view.manifestBytes.fill(0);
 const census=full=>snapshot.tables.filter(t=>(t.capture==='full-row-image')===full).map(t=>({table_name:t.table_name,row_count:t.row_count,rows_sha256:t.rows_sha256})).sort((a,b)=>a.table_name.localeCompare(b.table_name));
 const summary={...f.rehearsalInputs.materialization.summary,source_snapshot_sha256:'8'.repeat(64),foreign_snapshot_sha256:'9'.repeat(64)},summary_text=JSON.stringify(summary);
 const witness={format:'nestory-local-pilot-live-witness-v1',status:'ready',operationId:context.operationId,archiveSourceSha256:context.sourceSha256,observedCaptureSha256:'7'.repeat(64),
  businessCensus:census(true),securityCensus:census(false),storageObjectCount:0,storageBucketCount:0,storageClosureSha256:hash(':'),foreignOrganizationCount:4,foreignCensusSha256:summary.foreign_snapshot_sha256,
  preview:{...summary,summary_text,manifest_sha256:hash(summary_text)}};
 const manifest='supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json';
 const sourceFiles=new Map([[manifest,await readFile(new URL('../'+manifest,import.meta.url),'utf8')],['supabase/migrations/20261026000100_fixture.sql','SELECT 1;'],['supabase/migrations/20261027005615_financial_reset_empty_books_preserved_contracts.sql','SELECT 2;']]);
 const value={format:'nestory-local-live-witness-inputs-v1',businessArchive:view.request,operationId:context.operationId,witness,hostedLedgerText:f.rehearsalInputs.materialization.ledger_text};
 const binding=bindSavedPilotLiveWitness({context,value,sourceFiles});assert.equal(binding.archiveSourceSha256,context.sourceSha256);
 assert.throws(()=>bindSavedPilotLiveWitness({context,value:{...value,businessArchive:{...view.request,archiveId:id(99)}},sourceFiles}));
 await assert.rejects(persistPilotLiveWitnessInputs({context,witness,hostedLedgerText:value.hostedLedgerText}),/saved_rehearsal_unverified/);
 await assert.rejects(openPilotLiveWitnessInputs({context,reference:{}}),/saved_rehearsal_unverified/);
 await disposeSavedPilotRehearsal(context);
});
