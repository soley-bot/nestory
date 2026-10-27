import test from 'node:test';
import assert from 'node:assert/strict';
import * as pgp from 'openpgp';
import {buildLocalDispatchObservationSql,verifyLocalDispatchObservationChunk,verifyLocalDispatchObservationPackage,persistLocalDispatchObservation,openLocalDispatchObservation} from './local-backup-dispatch-observation.mjs';
import {rehearsalSqlFixture} from './fixtures/local-backup-rehearsal-sql-fixture.mjs';
import {prepareOperatorPacket,REQUIRED_ARTIFACTS,SOURCE_ENTRYPOINTS,hashBytes,canonicalJson} from './pilot-finance-reset-operator-core.mjs';
import {hostedBinding} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {localDispatchActorReadinessSql,prepareLocalDispatchReviewArtifacts,assertLocalDispatchReviewArtifacts,
 prepareLocalDispatchStageAuthority,assertLocalDispatchStageAuthority,assertLocalDispatchStageEvidenceRecord} from './local-backup-dispatch-review.mjs';
import {bootstrapLocalDispatch,publishLocalDispatch,dispatchLocalReconciliation,discoverLocalDispatch,collectLocalDispatchReceipt,persistPreparedLocalDispatchInput,extractLocalCustodyReceipt,localCustodyRunTitle,localDispatchWorkerWaiting} from './local-backup-dispatch-local.mjs';
const locator={operationId:'11111111-1111-4111-8111-111111111111',action:'execute',nonce:'22222222-2222-4222-8222-222222222222'};
const receipt={format:'nestory-local-custody-result-v1',operationId:locator.operationId,action:locator.action,runId:'123',runAttempt:1,intentSha256:'a'.repeat(64),
 outcome:'committed-and-verified',mutationRetried:false,observationSha256:'b'.repeat(64),checkpointSha256:'c'.repeat(64),normalWritesReopened:false};
const expected={...locator,mode:'execute',originalRunId:123,actualRunId:123,intentSha256:receipt.intentSha256};
const line=(value,step='Wait for exact run ticket and execute once')=>`Pilot reset local custody\t${step}\t2026-10-27T12:00:00Z ${JSON.stringify(value)}`;
test('operator remote entrypoints remain held before private inputs or provider requests',async()=>{
 for(const action of [()=>bootstrapLocalDispatch({}),()=>publishLocalDispatch({},''),()=>dispatchLocalReconciliation({}),()=>discoverLocalDispatch({}),()=>collectLocalDispatchReceipt({})])await assert.rejects(action(),/integration_incomplete/);
});
test('private input preparation rejects a caller custody claim before files, encryption or provider work',async()=>{
 await assert.rejects(persistPreparedLocalDispatchInput({context:{operationalCustodyVerified:true}}),/saved_rehearsal_unverified/);
});
test('run discovery title exactly binds inert dispatch nonce and mode',()=>assert.equal(localCustodyRunTitle(locator,'execute'),`Pilot reset ${locator.operationId} execute ${locator.nonce} execute`));
test('only the fixed worker step original-run aggregate is retained',()=>assert.deepEqual(extractLocalCustodyReceipt(line(receipt),expected),receipt));
test('reconciliation receipt binds separate read-only job to the original intent',()=>{
 const r={...receipt,reconciledByRunId:'456',historicalReadOnly:true};
 assert.deepEqual(extractLocalCustodyReceipt(line(r),{...expected,mode:'reconcile',actualRunId:456}),r);
 assert.throws(()=>extractLocalCustodyReceipt(line(r),{...expected,mode:'reconcile',actualRunId:457}));
});
for(const[name,logs]of[['other step',()=>line(receipt,'Install locked dependencies without lifecycle scripts')],['two receipts',()=>line(receipt)+'\n'+line(receipt)],
 ['other run',()=>line({...receipt,runId:'456'})],['unknown extra data',()=>line({...receipt,rows:['not permitted']})],
 ['mutation retry',()=>line({...receipt,mutationRetried:true})],['reopened claim',()=>line({...receipt,normalWritesReopened:true})]])
 test(`${name} cannot fabricate a retained worker receipt`,()=>assert.throws(()=>extractLocalCustodyReceipt(logs(),expected)));

function reviewFixture(){
 const f=rehearsalSqlFixture(),b=f.planBinding,m=b.materialization,h='a'.repeat(64),now=Date.now();
 const operation={operationId:b.operationId,organizationId:b.organizationId,projectRef:'pfvmztxktkwyewvxfgot',mainSha:'a'.repeat(40),
  sourceGeneration:0,targetGeneration:1,cutoff:'2026-10-01',issueDate:'2026-10-01',timezone:'Asia/Bangkok',executionBusinessDate:'2026-10-27',invoiceDatePolicy:'empty-books-no-invoices'};
 const artifacts={...f.phases,archive:f.plan.archiveRows,
  manifest:{manifest_sha256:m.manifestSha256,source_snapshot_sha256:m.sourceSnapshotSha256,schema_sha256:b.executionBaseline.schemaSha256,ledger_sha256:b.executionBaseline.ledgerSha256},
  actions:{operation:{operation_id:b.operationId,organization_id:b.organizationId,operation_kind:'reset',restore_of:null,source_generation:0,target_generation:1,
   manifest_sha256:m.manifestSha256,plan_sha256:b.planSha256,schema_sha256:b.executionBaseline.schemaSha256,archive_sha256:m.archiveSha256,action_sha256:m.actionSha256,
   archive_count:m.archiveRows,action_count:m.actionCount,audit_timestamp:'2026-10-27T00:00:00Z',audit_actor:null},actions:f.plan.actions}};
 const files=Object.fromEntries(REQUIRED_ARTIFACTS.map(k=>[k,JSON.stringify(artifacts[k]??{syntheticEvidence:k})]));
 const review={format:'nestory-protected-reset-review-v1',operation,schemaSha256:b.executionBaseline.schemaSha256,ledgerSha256:b.executionBaseline.ledgerSha256,
  sourceSnapshotSha256:m.sourceSnapshotSha256,archiveRows:m.archiveRows,actionCount:m.actionCount,databaseBinding:{manifestSha256:m.manifestSha256,planSha256:b.planSha256,
   archiveSha256:m.archiveSha256,actionSha256:m.actionSha256,zeroReviewSha256:hashBytes(artifacts.zeroPlanText),continuationSemanticSha256:hashBytes(artifacts.continuationPlanText),reportReviewSha256:h},
  artifacts:Object.fromEntries(Object.entries(files).map(([k,v])=>[k,hashBytes(v)]))};
 const sources=[...SOURCE_ENTRYPOINTS,'supabase/migrations/20261027005615_financial_reset_empty_books_preserved_contracts.sql'].map(path=>({path,sha256:h}));
 const make=()=>prepareOperatorPacket({review,sources,artifacts:files,candidateHead:operation.mainSha});let packet=make();
 const observation={catalog:JSON.parse(f.materialization.catalog_text),ledger:JSON.parse(f.materialization.ledger_text),capabilityCount:0,timezone:operation.timezone,
  businessDate:operation.executionBusinessDate,reservation:null,operation:null,control:null,sourceSha256:m.sourceSnapshotSha256,foreignSha256:h};
 const actorObservation={format:'nestory-local-actor-readiness-v1',organizationId:b.organizationId,observedAt:new Date(now-1000).toISOString(),
  actors:['maker','reviewer'].map(kind=>({kind,actorId:f.fixture[kind],currentSessionCount:1,sessionCensusSha256:h}))};
 const retainedInstruction={reference:'synthetic-test-message-only',text:'Synthetic instruction: reset only the selected Pilot October books, retain contracts; no reopening or live recovery.',recordedAt:new Date(now-1000).toISOString()};
 const reviews=prepareLocalDispatchReviewArtifacts({packet,artifacts,actorObservation,sourceObservation:observation,retainedInstruction});
 for(const[k,v]of Object.entries(reviews)){files[k]=v;review.artifacts[k]=hashBytes(v)}packet=make();
 const input={packet,artifacts,reviews,action:'freeze',observation,nativeApprovals:null,issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+3600000).toISOString()};
 const authority=prepareLocalDispatchStageAuthority(input);return{...f,...input,authority,actorObservation,retainedInstruction,now};
}
test('preexecution reviews are acyclic, preserve retained instruction, and explicitly leave native phases pending',()=>{
 const f=reviewFixture(),r=assertLocalDispatchReviewArtifacts(f);
 assert.equal(r.actorApprovals.nativeZeroApprovals,'pending-prepared-plan');assert.equal(r.actorApprovals.sessionPossessionProven,false);
 assert.equal(r.containmentProof.productionFreeze,'pending-native-freeze');assert.equal(r.liveConsent.instruction.text,f.retainedInstruction.text);
 assert.equal(r.liveConsent.liveRecovery,'requires-separate-consent');assert.equal(f.packet.customerApprovalVerified,false);
 for(const raw of Object.values(f.reviews))assert.equal(raw.includes(f.packet.packetSha256),false);
 assert.equal(assertLocalDispatchStageAuthority(f),hashBytes(canonicalJson(f.authority)));
});
test('aggregate actor review query only reads selected current session counts and hashes',()=>{
 const f=reviewFixture(),sql=localDispatchActorReadinessSql(f.fixture);
 assert.match(sql,/READ ONLY/);assert.match(sql,/financial_reset_actor_is_current/);assert.match(sql,/currentSessionCount/);
 assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|authorize_financial_reset|access_token|refresh_token/);
 assert.throws(()=>localDispatchActorReadinessSql({maker:f.fixture.maker,reviewer:f.fixture.maker}));
});
for(const[name,change]of[
 ['claimed completed zero approvals',f=>{const r=JSON.parse(f.reviews.actorApprovals);r.nativeZeroApprovals='complete';f.reviews.actorApprovals=canonicalJson(r)}],
 ['claimed pre-freeze containment',f=>{const r=JSON.parse(f.reviews.containmentProof);r.productionFreeze=true;f.reviews.containmentProof=canonicalJson(r)}],
 ['changed retained consent',f=>{const r=JSON.parse(f.reviews.liveConsent);r.instruction.text='replacement';f.reviews.liveConsent=canonicalJson(r)}],
 ['wrong stage',f=>f.action='execute'],['recovery consent inferred',f=>{f.action='prepare-recovery';f.authority.action=f.action}],
 ['expired audit evidence',f=>f.now=Date.parse(f.authority.expiresAt)],['changed observed source',f=>f.observation.sourceSha256='f'.repeat(64)],
 ['changed foreign baseline',f=>f.observation.foreignSha256='f'.repeat(64)],['changed protected main',f=>f.authority.mainSha='b'.repeat(40)],
 ['invented native approvals before prepare',f=>f.authority.nativeApprovals=[]],
])test(`${name} cannot pass typed dispatch evidence admission`,()=>{const f=reviewFixture();f.reviews={...f.reviews};f.authority=structuredClone(f.authority);change(f);assert.throws(()=>assertLocalDispatchStageAuthority(f));});
test('expired audit evidence is usable only to reconcile the original immutable input',()=>{
 const f=reviewFixture();f.now=Date.parse(f.authority.expiresAt);assert.throws(()=>assertLocalDispatchStageAuthority(f));
 assert.equal(assertLocalDispatchStageAuthority({...f,historical:true}),hashBytes(canonicalJson(f.authority)));
});
test('durable signer binds exact typed stage evidence to ticket authority and action',()=>{
 const f=reviewFixture(),payload={packet:f.packet,artifacts:f.artifacts,observation:f.observation};
 const ticket={operationId:f.packet.operation.operationId,packetSha256:f.packet.packetSha256,action:f.action,authoritySha256:hashBytes(canonicalJson(f.authority))};
 const recordBytes=Buffer.from(canonicalJson({format:'nestory-local-stage-evidence-record-v1',operationId:ticket.operationId,packetSha256:ticket.packetSha256,stageAuthority:f.authority,reviewArtifacts:f.reviews}));
 assert.equal(assertLocalDispatchStageEvidenceRecord({recordBytes,ticket,payload}),true);
 for(const changed of [{...ticket,authoritySha256:'f'.repeat(64)},{...ticket,action:'execute'},{...ticket,packetSha256:'f'.repeat(64)}])
  assert.throws(()=>assertLocalDispatchStageEvidenceRecord({recordBytes,ticket:changed,payload}));
 assert.throws(()=>assertLocalDispatchStageEvidenceRecord({recordBytes:Buffer.from('{}'),ticket,payload}));
});
function executeReviewFixture(){
 const f=reviewFixture(),p=f.packet,b=p.databaseBinding,o=p.operation,bind=hostedBinding(p,f.artifacts.continuationPlan),at=f.issuedAt;
 const control={status:'frozen',generation:1,cutoff:o.cutoff,timezone:o.timezone,businessDate:o.executionBusinessDate};
 f.action='execute';f.observation={...f.observation,control,reservation:{binding:bind,bindingSha256:'a'.repeat(64),foreignSha256:f.observation.foreignSha256},
  recoveryCheckpoint:{bindingSha256:'a'.repeat(64),sourceSha256:p.sourceSnapshotSha256},operation:{...f.artifacts.actions.operation,status:'sealed'},
  appliedCount:0,approvalCount:2,zero:{reviewSha256:b.zeroReviewSha256,plan:f.artifacts.zeroPlan}};
 const approvals=['maker','reviewer'].map(kind=>({operationId:o.operationId,organizationId:o.organizationId,kind,reviewSha256:b.zeroReviewSha256,approvedBy:f.fixture[kind],approvedAt:at}));
 const v={operation:{operationId:o.operationId,organizationId:o.organizationId,kind:'reset',restoreOf:null,status:'sealed',sourceGeneration:0,targetGeneration:1,
  manifestSha256:b.manifestSha256,planSha256:b.planSha256,schemaSha256:p.schemaSha256,archiveSha256:b.archiveSha256,actionSha256:b.actionSha256,
  archiveRows:p.archiveRows,actionCount:p.actionCount,appliedCount:0},control,
  zeroPlan:{status:'prepared',reviewSha256:b.zeroReviewSha256,canonicalSha256:b.zeroReviewSha256,operationId:o.operationId,organizationId:o.organizationId,
   manifestSha256:b.manifestSha256,planSha256:b.planSha256,effectiveDate:o.cutoff,makerActorId:f.fixture.maker,reviewerActorId:f.fixture.reviewer},
  approvals,endorsements:approvals.map((a,index)=>({endorsementId:index?f.fixture.reviewerSession:f.fixture.makerSession,operationId:o.operationId,organizationId:o.organizationId,
   kind:a.kind,number:1,reviewSha256:b.zeroReviewSha256,actorId:a.approvedBy,sessionId:index?f.fixture.reviewerSession:f.fixture.makerSession,
   credentialExpiresAt:f.expiresAt,endorsedAt:at,availability:{status:'current',observedAt:at}})),targetEndorsements:[],capabilityCount:0};
 f.nativeApprovals=[{financial_reset_approval_observation:v}];f.authority=prepareLocalDispatchStageAuthority(f);return f;
}
test('execute evidence requires native approval and endorsement readback after prepare',()=>{
 const f=executeReviewFixture();assert.equal(assertLocalDispatchStageAuthority(f),hashBytes(canonicalJson(f.authority)));
 for(const change of [v=>v.approvals.pop(),v=>v.endorsements.pop(),v=>v.endorsements[1].availability.status='expired',
  v=>v.endorsements[1].actorId=f.fixture.maker,v=>v.control.status='open',v=>v.zeroPlan.reviewSha256='f'.repeat(64)]){
  const authority=structuredClone(f.authority);change(authority.nativeApprovals[0].financial_reset_approval_observation);
  assert.throws(()=>assertLocalDispatchStageAuthority({...f,authority}));
 }
 const authority={...f.authority,nativeApprovals:null};assert.throws(()=>assertLocalDispatchStageAuthority({...f,authority}));
});

let observationKey;
async function observationOptions(request){
 observationKey??=pgp.generateKey({type:'rsa',rsaBits:3072,userIDs:[{name:'Synthetic observation transport'}],format:'armored',config:{v6Keys:false}});
 const{publicKey}=await observationKey;
 return{request,publicKeyArmored:publicKey,publicKeySha256:hashBytes(publicKey),expectedPayloadSha256:null,chunkIndex:null};
}
test('fixed encrypted observation builders preserve canonical ledger and native stage/approval SELECTs',async()=>{
 const f=reviewFixture(),ledger={kind:'ledger',operationId:f.packet.operation.operationId};
 const l=await buildLocalDispatchObservationSql(await observationOptions(ledger));
 assert.match(l,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);assert.match(l,/'ledgerText',[\s\S]+::text/);
 assert.match(l,/pgp_pub_encrypt_bytea/);assert.match(l,/cipher-algo=aes256,compress-algo=0/);assert.match(l,/'ciphertextBase64'/);
 const stage={kind:'stage',packet:f.packet,continuationPlan:f.artifacts.continuationPlan,action:'freeze'};
 const s=await buildLocalDispatchObservationSql(await observationOptions(stage));
 assert.match(s,/'authorization',NULL::jsonb/);assert.doesNotMatch(s,/consume_financial_reset_actor_authorization|reserve_financial_reset_hosted_operation/);
 const a=await buildLocalDispatchObservationSql({...await observationOptions({kind:'approvals',packet:f.packet}),chunkIndex:0});
 assert.match(a,new RegExp(`WITH requested AS \\(SELECT '${f.packet.operation.operationId}'::uuid AS operation_id,NULL::integer AS endorsement_number\\)`));
 assert.doesNotMatch(a,/\$1|\$2/);assert.match(a,/NOT BETWEEN 1 AND 65536/);
});
test('observation builders reject arbitrary SQL, scopes, historical ordinal and unsafe chunk bindings',async()=>{
 const f=reviewFixture(),request={kind:'ledger',operationId:f.packet.operation.operationId},base=await observationOptions(request);
 for(const extra of [{sql:'SELECT 1'},{host:'other'},{path:'x'}])await assert.rejects(buildLocalDispatchObservationSql({...base,...extra}));
 for(const change of [{request:{...request,sql:'SELECT 1'}},{request:{...request,operationId:"x';SELECT 1"}},
  {chunkIndex:0},{chunkIndex:-1,expectedPayloadSha256:'a'.repeat(64)},{chunkIndex:64,expectedPayloadSha256:'a'.repeat(64)},
  {publicKeySha256:'a'.repeat(64)},{request:{kind:'approvals',packet:f.packet,endorsementNumber:1},chunkIndex:0},
  {request:{kind:'approvals',packet:f.packet},chunkIndex:null},
  {request:{kind:'stage',packet:f.packet,continuationPlan:f.artifacts.continuationPlan,action:'execute-recovery'}}])
  await assert.rejects(buildLocalDispatchObservationSql({...base,...change}));
});
async function observationPackageFixture(kind='ledger',length=65537){
 const f=reviewFixture(),request=kind==='ledger'?{kind,operationId:f.packet.operation.operationId}:{kind,packet:f.packet};
 const options={...await observationOptions(request),chunkIndex:kind==='approvals'?0:null};
 const sql=await buildLocalDispatchObservationSql(options),requestSha256=sql.match(/'requestSha256','([a-f0-9]{64})'/)[1];
 const plaintext=Buffer.alloc(length,97),count=Math.ceil(length/65536);
 const base={format:'nestory-local-dispatch-observation-chunk-v1',status:'ready',operationId:f.packet.operation.operationId,kind,requestSha256,
  publicKeySha256:options.publicKeySha256,payloadSha256:hashBytes(plaintext),payloadBytes:length,chunkBytes:65536,chunkCount:count,
  chunkIndex:null,plaintextChunkSha256:null,ciphertextSha256:null,ciphertextBase64:null};
 const plaintextChunks=Array.from({length:count},(_,i)=>plaintext.subarray(i*65536,(i+1)*65536));
 const chunks=plaintextChunks.map((b,i)=>{const cipher=Buffer.from(`synthetic-cipher-${i}`);return{...base,chunkIndex:i,plaintextChunkSha256:hashBytes(b),ciphertextSha256:hashBytes(cipher),ciphertextBase64:cipher.toString('base64')}});
 return{request,publicKeySha256:options.publicKeySha256,before:kind==='approvals'?chunks[0]:base,after:kind==='approvals'?chunks[0]:{...base},chunks,plaintextChunks};
}
test('encrypted observation package binds every exact chunk and before/after witness',async()=>{
 const f=await observationPackageFixture();assert.equal(verifyLocalDispatchObservationPackage(f).length,65537);
 for(const change of [v=>v.after.payloadSha256='b'.repeat(64),v=>v.chunks.reverse(),v=>v.chunks.pop(),v=>v.plaintextChunks[1]=Buffer.from('bad'),
  v=>v.chunks[0].ciphertextBase64+='!',v=>v.chunks[0].privateRows=[],v=>v.before.payloadBytes=0,
  v=>v.before.chunkCount=3,v=>v.chunks[0].requestSha256='b'.repeat(64),v=>v.chunks[0].status='source_changed']){
  const v=structuredClone(f);change(v);assert.throws(()=>verifyLocalDispatchObservationPackage(v));
 }
 assert.throws(()=>verifyLocalDispatchObservationChunk({request:f.request,publicKeySha256:f.publicKeySha256,observation:f.before,chunkIndex:0}));
});
test('volatile native approval observation is single-response only, with no stitched timestamps',async()=>{
 const f=await observationPackageFixture('approvals',128);assert.equal(verifyLocalDispatchObservationPackage(f).length,128);
 const changed=structuredClone(f);changed.after={...changed.after,ciphertextBase64:Buffer.from('changed').toString('base64'),ciphertextSha256:hashBytes(Buffer.from('changed'))};
 assert.throws(()=>verifyLocalDispatchObservationPackage(changed));
 const tooBig=await observationPackageFixture('approvals',65537);assert.throws(()=>verifyLocalDispatchObservationPackage(tooBig));
});
test('observation custody APIs require the real held saved context before any file or private-key access',async()=>{
 await assert.rejects(persistLocalDispatchObservation({context:{},request:{},package:{}}),/saved_rehearsal_unverified/);
 await assert.rejects(openLocalDispatchObservation({context:{},request:{},reference:{}}),/saved_rehearsal_unverified/);
});


test('discover readiness means the single exact original worker is polling, not merely running',()=>{
 const run={id:123},mainSha='a'.repeat(40);
 const job={name:'Pilot reset local custody',status:'in_progress',run_id:123,run_attempt:1,head_sha:mainSha,
  steps:[{name:'Wait for exact run ticket and execute once',status:'in_progress'}]};
 assert.equal(localDispatchWorkerWaiting({jobs:[job],total_count:1},run,mainSha),true);
 for(const changed of [{...job,status:'queued'},{...job,run_id:124},{...job,run_attempt:2},{...job,head_sha:'b'.repeat(40)},
  {...job,steps:[{name:'Check out exact main',status:'in_progress'}]},{...job,steps:[{name:'Wait for exact run ticket and execute once',status:'completed'}]}])
  assert.equal(localDispatchWorkerWaiting({jobs:[changed],total_count:1},run,mainSha),false);
 assert.equal(localDispatchWorkerWaiting({jobs:[job,job],total_count:2},run,mainSha),false);
 assert.throws(()=>localDispatchWorkerWaiting({jobs:[job],total_count:2},run,mainSha));
});
