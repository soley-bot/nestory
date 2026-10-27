import test from 'node:test';
import assert from 'node:assert/strict';
import * as pgp from 'openpgp';
import {hashBytes,canonicalJson} from './pilot-finance-reset-operator-core.mjs';
import {digestJson,digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {buildDispatchTicket,dispatchSigningBytes,verifySignedDispatchBundle,verifyHistoricalDispatchBundle,assertDispatchJournalRecords,inspectDispatchPayloadBudget,LOCAL_DISPATCH_TRANSFER_LIMIT,LOCAL_DISPATCH_WORKFLOW,LOCAL_DISPATCH_REPOSITORY} from './local-backup-dispatch-bundle.mjs';
const key=await pgp.generateKey({type:'rsa',rsaBits:3072,userIDs:[{name:'Synthetic dispatch only'}],format:'object',config:{v6Keys:false}});
const publicKeyArmored=key.publicKey.armor(), expectedPublicKeySha256=hashBytes(publicKeyArmored);
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const now=Date.now(), h='a'.repeat(64);
test('handoff budget measures UTF-8, JSON escaping and full signed envelope before intent',()=>{
 const payload={packet:{},binding:{},artifacts:{'odd"key':{rowText:'"\n水😀'}},recovery:null,observation:{}};
 const budget=inspectDispatchPayloadBudget(payload);
 assert.equal(budget.payloadBytes,Buffer.byteLength(JSON.stringify(payload)));
 assert.equal(budget.maximumCiphertextBytes,budget.maximumDocumentBytes+32);
 assert.ok(budget.maximumDocumentBytes>budget.payloadBytes+8192);
 const changed=structuredClone(payload);changed.artifacts['odd"key'].rowText+='水';
 assert.equal(inspectDispatchPayloadBudget(changed).maximumDocumentBytes,budget.maximumDocumentBytes+3);
});
test('largest admitted complete envelope fits; one more byte fails before signing',()=>{
 const payload={packet:{},binding:{},artifacts:{archive:''},recovery:null,observation:{}};
 const base=inspectDispatchPayloadBudget(payload);
 payload.artifacts.archive='x'.repeat(LOCAL_DISPATCH_TRANSFER_LIMIT-64-base.maximumDocumentBytes);
 const budget=inspectDispatchPayloadBudget(payload);
 assert.equal(budget.maximumDocumentBytes,LOCAL_DISPATCH_TRANSFER_LIMIT-64);
 assert.equal(budget.maximumCiphertextBytes,LOCAL_DISPATCH_TRANSFER_LIMIT-32);
 payload.artifacts.archive+='x';assert.throws(()=>inspectDispatchPayloadBudget(payload),/transfer_limit/);
});
async function fixture(){
 const payload={packet:{packetSha256:h,operation:{operationId:id(1)}},binding:{operation_id:id(1)},artifacts:{actions:{synthetic:true,amount:1234.56},archive:[]},recovery:null,observation:{catalog:[],ledger:[],balance:98.76}};
 const ticket=buildDispatchTicket({mainSha:'b'.repeat(40),runId:'123456',operationId:id(1),action:'freeze',authorizationId:id(2),nonce:id(3),
   issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+120000).toISOString(),intentSha256:h,claimSha256:h,packetSha256:h,
   bindingSha256:digestJson(payload.binding),authoritySha256:h,sourceObservationSha256:digestDatabaseJson(payload.observation),sqlSha256:h,custodySha256:h,custodyEvidenceSha256:h},payload);
 const signature=await pgp.sign({message:await pgp.createMessage({binary:dispatchSigningBytes(ticket,payload)}),signingKeys:key.privateKey,detached:true,format:'binary'});
 return {bundle:{format:'nestory-local-custody-dispatch-bundle-v1',ticket,payload,signingPublicKeySha256:expectedPublicKeySha256,signatureBase64:Buffer.from(signature).toString('base64')},
  publicKeyArmored,expectedPublicKeySha256,now,invocation:{repository:LOCAL_DISPATCH_REPOSITORY,workflow:LOCAL_DISPATCH_WORKFLOW,mainSha:ticket.mainSha,runId:ticket.runId,runAttempt:1,operationId:ticket.operationId,action:ticket.action,nonce:ticket.nonce}};
}
test('real detached signature authenticates exact run-bound payload and returns a copy',async()=>{
 const f=await fixture(),r=await verifySignedDispatchBundle(f);assert.deepEqual(r.payload,f.bundle.payload);
 f.bundle.payload.artifacts.actions.synthetic=false;assert.equal(r.payload.artifacts.actions.synthetic,true);
});
test('expired original ticket permits authenticated historical read only; execution still rejects',async()=>{
 const f=await fixture();f.now=Date.parse(f.bundle.ticket.expiresAt)+86400000;
 const r=await verifyHistoricalDispatchBundle(f);assert.equal(r.historicalReadOnly,true);
 await assert.rejects(verifySignedDispatchBundle(f),/invalid/);
 f.invocation.runId='123457';await assert.rejects(verifyHistoricalDispatchBundle(f),/invalid/);
});
for(const [name,change]of[
 ['different run',f=>f.invocation.runId='123457'],['rerun',f=>f.invocation.runAttempt=2],
 ['different main',f=>f.invocation.mainSha='c'.repeat(40)],['different nonce',f=>f.invocation.nonce=id(4)],
 ['different workflow',f=>f.invocation.workflow='.github/workflows/ci.yml'],['different action',f=>f.invocation.action='execute'],
 ['expired',f=>f.now=Date.parse(f.bundle.ticket.expiresAt)],['future',f=>f.now=Date.parse(f.bundle.ticket.issuedAt)-1],
 ['payload alteration',f=>f.bundle.payload.artifacts.archive.push({row:'changed'})],
 ['ticket alteration',f=>f.bundle.ticket.sqlSha256='d'.repeat(64)],['wrong enrolled key',f=>f.expectedPublicKeySha256='e'.repeat(64)],
 ['extra signed field',f=>f.bundle.ticket.sql='DELETE FROM anything'],['noncanonical signature',f=>f.bundle.signatureBase64+='\n'],
 ['corrupt signature',f=>{const b=Buffer.from(f.bundle.signatureBase64,'base64');b[b.length-1]^=1;f.bundle.signatureBase64=b.toString('base64');}],
])test(`${name} is rejected before any worker execution`,async()=>{
 const f=await fixture();change(f);await assert.rejects(verifySignedDispatchBundle(f),/local_dispatch_bundle_invalid/);
});
test('even a freshly signed ticket cannot exceed five-minute lifetime',async()=>{
 const f=await fixture();f.bundle.ticket.expiresAt=new Date(Date.parse(f.bundle.ticket.issuedAt)+300001).toISOString();
 assert.throws(()=>dispatchSigningBytes(f.bundle.ticket,f.bundle.payload),/invalid/);
});
test('artifact digests cannot be replaced with an aggregate caller claim',async()=>{
 const f=await fixture();f.bundle.ticket.artifactHashes={all:h};assert.throws(()=>dispatchSigningBytes(f.bundle.ticket,f.bundle.payload),/invalid/);
});
test('payload packet/binding/operation mismatch cannot be signed',async()=>{
 const f=await fixture();f.bundle.payload.binding.operation_id=id(8);f.bundle.ticket.payloadSha256=digestDatabaseJson(f.bundle.payload);
 f.bundle.ticket.bindingSha256=digestJson(f.bundle.payload.binding);assert.throws(()=>dispatchSigningBytes(f.bundle.ticket,f.bundle.payload),/invalid/);
});
async function journalFixture(){
 const {bundle:{ticket,payload}}=await fixture();
 const evidenceRecordBytes=Buffer.from(canonicalJson({format:'nestory-local-dispatch-evidence-record-v1',operationId:ticket.operationId,packetSha256:ticket.packetSha256,evidence:{syntheticOnly:true}}));
 ticket.custodyEvidenceSha256=hashBytes(evidenceRecordBytes);
 const custody={format:'nestory-local-reset-custody-reference-v1',operationId:ticket.operationId,packetSha256:ticket.packetSha256,
  evidenceRecordSha256:ticket.custodyEvidenceSha256,
  ...Object.fromEntries(['archiveEnvelopeSha256','archivePlaintextSha256','filesArchiveSha256','restoreEvidenceSha256','keyRecoveryEvidenceSha256',
  'privateDestinationReviewSha256','foreignBaselineSha256'].map(k=>[k,h]))};
 ticket.custodySha256=digestJson(custody);
 const transportIntent={format:'nestory-hosted-reset-action-intent-v1',...Object.fromEntries(['operationId','packetSha256','action','bindingSha256','authorizationId','authoritySha256','sourceObservationSha256','sqlSha256'].map(k=>[k,ticket[k]]))};
 const intentBytes=Buffer.from(canonicalJson({format:'nestory-manual-reset-intent-v1',mainSha:ticket.mainSha,inputBundleSha256:ticket.payloadSha256,custody,transportIntent}));
 ticket.intentSha256=hashBytes(intentBytes);
 const claimBytes=Buffer.from(canonicalJson({format:'nestory-manual-reset-dispatch-claim-v1',operationId:ticket.operationId,action:ticket.action,intentSha256:ticket.intentSha256}));
 ticket.claimSha256=hashBytes(claimBytes);
 const responseBytes=Buffer.from(canonicalJson({format:'nestory-manual-reset-dispatch-response-v1',operationId:ticket.operationId,action:ticket.action,intentSha256:ticket.intentSha256,runId:Number(ticket.runId),runAttempt:1}));
 const bootstrapClaimBytes=Buffer.from(canonicalJson({format:'nestory-manual-reset-bootstrap-claim-v1',operationId:ticket.operationId,action:ticket.action,nonce:ticket.nonce,
  mainSha:ticket.mainSha,packetSha256:ticket.packetSha256,payloadSha256:ticket.payloadSha256,transferArchiveId:id(9),transferArchiveSha256:h}));
 const bootstrapResponseBytes=Buffer.from(canonicalJson({format:'nestory-manual-reset-bootstrap-response-v1',operationId:ticket.operationId,action:ticket.action,nonce:ticket.nonce,
  bootstrapClaimSha256:hashBytes(bootstrapClaimBytes),runId:Number(ticket.runId),runAttempt:1}));
 const workflowPostBytes=Buffer.from(canonicalJson({format:'nestory-local-workflow-post-v1',operationId:ticket.operationId,action:ticket.action,nonce:ticket.nonce,mainSha:ticket.mainSha}));
 return {ticket,payload,intentBytes,claimBytes,responseBytes,bootstrapClaimBytes,bootstrapResponseBytes,workflowPostBytes,evidenceRecordBytes};
}
test('durable records bind payload, custody, original intent, claim and exact enrolled run',async()=>{
 const f=await journalFixture();assert.doesNotThrow(()=>assertDispatchJournalRecords(f));
});
for(const [name,change]of[['missing intent',f=>f.intentBytes=null],['missing claim',f=>f.claimBytes=null],['missing run enrollment',f=>f.responseBytes=null],
 ['missing inert dispatch claim',f=>f.bootstrapClaimBytes=null],['missing inert run enrollment',f=>f.bootstrapResponseBytes=null],
 ['missing workflow POST claim',f=>f.workflowPostBytes=null],['wrong workflow POST nonce',f=>{const p=JSON.parse(f.workflowPostBytes);p.nonce=id(12);f.workflowPostBytes=Buffer.from(canonicalJson(p))}],
 ['missing custody record',f=>f.evidenceRecordBytes=null],['wrong custody record hash',f=>f.ticket.custodyEvidenceSha256='f'.repeat(64)],
 ['changed original intent',f=>f.intentBytes=Buffer.from('{}')],['wrong custody',f=>f.ticket.custodySha256='f'.repeat(64)],
 ['wrong payload binding',f=>{const i=JSON.parse(f.intentBytes);i.inputBundleSha256='f'.repeat(64);f.intentBytes=Buffer.from(canonicalJson(i));f.ticket.intentSha256=hashBytes(f.intentBytes)}],
 ['wrong run',f=>{const r=JSON.parse(f.responseBytes);r.runId++;f.responseBytes=Buffer.from(canonicalJson(r))}],
 ['rerun',f=>{const r=JSON.parse(f.responseBytes);r.runAttempt=2;f.responseBytes=Buffer.from(canonicalJson(r))}]])test(`journal ${name} prevents signing`,async()=>{
 const f=await journalFixture();change(f);assert.throws(()=>assertDispatchJournalRecords(f));
});
