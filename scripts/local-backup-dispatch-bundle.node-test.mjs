import test from 'node:test';
import './local-backup-dispatch-repair.node-test.mjs';
import './local-backup-dispatch-staging.node-test.mjs';
import assert from 'node:assert/strict';
import * as pgp from 'openpgp';
import {hashBytes,canonicalJson} from './pilot-finance-reset-operator-core.mjs';
import {digestJson,digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {PREPARE_REPAIR_ORIGINAL_MAIN,PREPARE_REPAIR_OPERATION} from './local-backup-dispatch-repair.mjs';
import {EXECUTE_RESUME_ORIGINAL} from './local-backup-execute-resume.mjs';
import {buildDispatchTicket,dispatchSigningBytes,verifySignedDispatchBundle,verifyHistoricalDispatchBundle,assertDispatchJournalRecords,inspectDispatchPayloadBudget,LOCAL_DISPATCH_TRANSFER_LIMIT,LOCAL_DISPATCH_WORKFLOW,LOCAL_DISPATCH_REPOSITORY,
 createPreparedDispatchSigning,assertPreparedDispatchSigningBinding,signLocalDispatchBundle,prepareLocalDispatchSigning} from './local-backup-dispatch-bundle.mjs';
const key=await pgp.generateKey({type:'rsa',rsaBits:3072,userIDs:[{name:'Synthetic dispatch only'}],format:'object',config:{v6Keys:false}});
const publicKeyArmored=key.publicKey.armor(), expectedPublicKeySha256=hashBytes(publicKeyArmored);
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const now=Date.now(), h='a'.repeat(64);

function preparedFixture(f){
 const {ticket,payload}=f.bundle,preparedCustody={};
 return {state:{keyId:id(99),preparedCustody,payloadSha256:ticket.payloadSha256,mainSha:ticket.mainSha,runId:ticket.runId,
   locator:{operationId:ticket.operationId,action:ticket.action,nonce:ticket.nonce}},
  options:{keyId:id(99),ticket,payload,preparedCustody}};
}
test('prepared signer binds exact payload, key, custody handle, executor, run and nonce',async()=>{
 const {state,options}=preparedFixture(await fixture());
 assert.equal(assertPreparedDispatchSigningBinding(state,options),true);
 for(const change of [v=>v.keyId=id(98),v=>v.preparedCustody={},v=>v.ticket.mainSha='c'.repeat(40),v=>v.ticket.runId='123457',
  v=>v.ticket.nonce=id(9),v=>v.ticket.action='seal',v=>v.payload.artifacts.actions.synthetic=false]){
  const v={...options,ticket:structuredClone(options.ticket),payload:structuredClone(options.payload)};change(v);
  assert.throws(()=>assertPreparedDispatchSigningBinding(state,v));
 }
});
test('signing setup completes before authorization and real detached signing clears key parameters after one use',async t=>{
 const f=await fixture(),{state,options}=preparedFixture(f),events=[];let params,closed=0;
 const service=createPreparedDispatchSigning({
  prepare:async()=>{events.push('public-key','private-read','unwrap','parse');await new Promise(resolve=>setTimeout(resolve,40));
   const signingKey=await pgp.readPrivateKey({binaryKey:key.privateKey.write(),config:{v6Keys:false}});
   params=Object.values(signingKey.keyPacket.privateParams);return {...state,signingKey};},
  check:async(s,o)=>{events.push('fresh-journal-custody');assertPreparedDispatchSigningBinding(s,o);},
  sign:async(s,o)=>{events.push('sign');return pgp.sign({message:await pgp.createMessage({binary:dispatchSigningBytes(o.ticket,o.payload)}),
   signingKeys:s.signingKey,detached:true,format:'binary'});},
  dispose:s=>{closed++;s.signingKey.clearPrivateParams();},
 });
 const start=performance.now(),handle=await service.prepare({}),preparedAt=performance.now();assert.deepEqual(events,['public-key','private-read','unwrap','parse']);
 const results=await Promise.allSettled([service.finish(handle,options),service.finish(handle,options)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(closed,1);
 const signature=results.find(r=>r.status==='fulfilled').value;
 await verifySignedDispatchBundle({...f,bundle:{...f.bundle,signatureBase64:Buffer.from(signature).toString('base64')}});
 assert.deepEqual(events.slice(4),['fresh-journal-custody','sign']);assert.ok(params.every(p=>p.every(b=>b===0)));
 t.diagnostic(JSON.stringify({syntheticSetupDelayMs:40,preauthorizationMs:Math.round(preparedAt-start),postauthorizationMs:Math.round(performance.now()-preparedAt),postauthorizationSetupCalls:0}));
 await service.close(handle);assert.equal(closed,1);
 await assert.rejects(signLocalDispatchBundle({...options,preparedSigning:handle}),/signing_failed/);
});
test('prepared signer failure and explicit abandonment clear secrets without signing',async()=>{
 for(const mode of ['check','sign','abandon']){
  const secret=Buffer.from('synthetic secret');let signs=0,closed=0;
  const service=createPreparedDispatchSigning({prepare:async()=>({secret}),check:async()=>{if(mode==='check')throw Error('changed');},
   sign:async()=>{signs++;throw Error('sign failed');},dispose:s=>{closed++;s.secret.fill(0);}});
  const handle=await service.prepare({});
  if(mode==='abandon')await service.close(handle);else await assert.rejects(service.finish(handle,{}));
  assert.equal(closed,1);assert.ok(secret.every(b=>b===0));assert.equal(signs,mode==='sign'?1:0);
  await assert.rejects(service.finish(handle,{}));assert.equal(closed,1);
 }
});
test('fabricated custody cannot pre-unlock the production signing key',async()=>{
 const f=await fixture(),{state,options}=preparedFixture(f);
 await assert.rejects(prepareLocalDispatchSigning({...options,mainSha:state.mainSha,runId:state.runId,locator:state.locator}),/local_custody_saved_evidence_unverified/);
});

async function repairFixture(){
 const f=await fixture(),payload=structuredClone(f.bundle.payload);
 payload.packet.operation={operationId:PREPARE_REPAIR_OPERATION,mainSha:PREPARE_REPAIR_ORIGINAL_MAIN};
 payload.binding={operation_id:PREPARE_REPAIR_OPERATION,main_sha:PREPARE_REPAIR_ORIGINAL_MAIN};
 const repair={format:'nestory-local-prepare-repair-v1',operationId:PREPARE_REPAIR_OPERATION,packetSha256:h,
  bindingSha256:digestJson(payload.binding),originalMainSha:PREPARE_REPAIR_ORIGINAL_MAIN,executorMainSha:'b'.repeat(40),
  manifestSha256:h,executorSourceSha256:h,eligibilitySha256:h,originalRunSha256:h,createdAt:new Date(now-2000).toISOString(),
  originalAttempt:{authorizationId:id(10),nonce:id(11),runId:'123455',runAttempt:1,intentSha256:h,claimSha256:h,publicationSha256:h},
  replacement:{nonce:id(3),runId:'123456',runAttempt:1}};
 payload.repair=repair;
 const computed=new Set(['format','repository','workflow','runAttempt','artifactHashes','payloadSha256']);
 const input=Object.fromEntries(Object.entries(f.bundle.ticket).filter(([k])=>!computed.has(k)));
 Object.assign(input,{operationId:PREPARE_REPAIR_OPERATION,action:'prepare',bindingSha256:digestJson(payload.binding)});
 const ticket=buildDispatchTicket(input,payload);
 const signature=await pgp.sign({message:await pgp.createMessage({binary:dispatchSigningBytes(ticket,payload)}),signingKeys:key.privateKey,detached:true,format:'binary'});
 return {...f,bundle:{format:'nestory-local-custody-dispatch-bundle-v2',ticket,payload,signingPublicKeySha256:expectedPublicKeySha256,signatureBase64:Buffer.from(signature).toString('base64')},
  invocation:{...f.invocation,operationId:PREPARE_REPAIR_OPERATION,action:'prepare'}};
}
test('repair signature preserves original native binding while authenticating reviewed executor and replacement run',async()=>{
 const f=await repairFixture(),result=await verifySignedDispatchBundle(f);
 assert.equal(result.ticket.format,'nestory-local-custody-dispatch-ticket-v2');
 assert.equal(result.payload.binding.main_sha,PREPARE_REPAIR_ORIGINAL_MAIN);
 assert.equal(result.ticket.repairSha256,digestJson(result.payload.repair));
 assert.notEqual(result.ticket.mainSha,result.payload.packet.operation.mainSha);
});
async function resumeFixture(){
 const f=await repairFixture(),payload=structuredClone(f.bundle.payload),a=EXECUTE_RESUME_ORIGINAL;
 payload.repair.executorMainSha=a.mainSha;
 const record={format:'nestory-local-execute-resume-v1',operationId:a.operationId,packetSha256:h,bindingSha256:digestJson(payload.binding),
  originalMainSha:PREPARE_REPAIR_ORIGINAL_MAIN,executorMainSha:'c'.repeat(40),manifestSha256:h,executorSourceSha256:h,prepareRepair:structuredClone(payload.repair),
  originalAttempt:{authorizationId:a.authorizationId,nonce:a.nonce,runId:a.runId,runAttempt:1,mainSha:a.mainSha,intentSha256:h,claimSha256:h,publicationSha256:h,receiptSha256:h},
  replacement:{nonce:id(33),runId:'123499',runAttempt:1},eligibilitySha256:h,freshForeignSha256:'d'.repeat(64),originalRunSha256:h,createdAt:new Date(now-1000).toISOString()};
 payload.resume={record,observation:{foreignSha256:record.freshForeignSha256,catalog:[],ledger:[]}};
 const computed=new Set(['format','repository','workflow','runAttempt','artifactHashes','payloadSha256','repairSha256']);
 const input=Object.fromEntries(Object.entries(f.bundle.ticket).filter(([k])=>!computed.has(k)));
 Object.assign(input,{mainSha:record.executorMainSha,action:'execute',runId:record.replacement.runId,nonce:record.replacement.nonce,sourceObservationSha256:digestDatabaseJson(payload.resume.observation)});
 const ticket=buildDispatchTicket(input,payload),signature=await pgp.sign({message:await pgp.createMessage({binary:dispatchSigningBytes(ticket,payload)}),signingKeys:key.privateKey,detached:true,format:'binary'});
 return {...f,bundle:{format:'nestory-local-custody-dispatch-bundle-v3',ticket,payload,signingPublicKeySha256:expectedPublicKeySha256,signatureBase64:Buffer.from(signature).toString('base64')},
  invocation:{...f.invocation,mainSha:ticket.mainSha,action:'execute',runId:ticket.runId,nonce:ticket.nonce}};
}
test('v3 signs the fresh resume observation and retains the historical packet, binding and prepare record',async()=>{
 const f=await resumeFixture(),result=await verifySignedDispatchBundle(f);
 assert.equal(result.ticket.resumeSha256,digestJson(result.payload.resume));
 assert.equal(result.ticket.sourceObservationSha256,digestDatabaseJson(result.payload.resume.observation));
 assert.notEqual(result.ticket.sourceObservationSha256,digestDatabaseJson(result.payload.observation));
 assert.equal(result.payload.binding.main_sha,PREPARE_REPAIR_ORIGINAL_MAIN);
 assert.deepEqual(result.payload.repair,result.payload.resume.record.prepareRepair);
 const budget=inspectDispatchPayloadBudget(result.payload);assert.equal(budget.payloadBytes,Buffer.byteLength(JSON.stringify(result.payload)));
});
for(const [name,change]of[
 ['v2 downgrade',f=>f.bundle.format='nestory-local-custody-dispatch-bundle-v2'],
 ['historical observation substitution',f=>f.bundle.ticket.sourceObservationSha256=digestDatabaseJson(f.bundle.payload.observation)],
 ['old expired execute authorization',f=>f.bundle.ticket.authorizationId=EXECUTE_RESUME_ORIGINAL.authorizationId],
 ['seal action',f=>{f.bundle.ticket.action='seal';f.invocation.action='seal';}],
 ['other replacement run',f=>{f.bundle.ticket.runId='123500';f.invocation.runId='123500';}],
 ['changed fresh baseline',f=>f.bundle.payload.resume.observation.foreignSha256=h],
 ['rewritten prepare history',f=>f.bundle.payload.repair.executorSourceSha256='b'.repeat(64)],
 ['missing repair',f=>delete f.bundle.payload.repair],
 ['extra native binding field',f=>f.bundle.payload.binding.execution_resume={}],
])test(`resume rejects ${name}`,async()=>{const f=await resumeFixture();change(f);await assert.rejects(verifySignedDispatchBundle(f));});
for(const [name,change]of[
 ['legacy bundle downgrade',f=>f.bundle.format='nestory-local-custody-dispatch-bundle-v1'],
 ['legacy ticket downgrade',f=>f.bundle.ticket.format='nestory-local-custody-dispatch-ticket-v1'],
 ['missing repair',f=>delete f.bundle.payload.repair],
 ['changed repair digest',f=>f.bundle.ticket.repairSha256='f'.repeat(64)],
 ['original expired authorization',f=>f.bundle.ticket.authorizationId=f.bundle.payload.repair.originalAttempt.authorizationId],
 ['different replacement run',f=>{f.bundle.ticket.runId='123457';f.invocation.runId='123457'}],
 ['different replacement nonce',f=>{f.bundle.ticket.nonce=id(42);f.invocation.nonce=id(42)}],
 ['reopening freeze action',f=>{f.bundle.ticket.action='freeze';f.invocation.action='freeze'}],
 ['repinned native binding',f=>f.bundle.payload.binding.main_sha=f.bundle.ticket.mainSha],
 ['repinned packet',f=>f.bundle.payload.packet.operation.mainSha=f.bundle.ticket.mainSha],
])test(`repair rejects ${name}`,async()=>{
 const f=await repairFixture();change(f);await assert.rejects(verifySignedDispatchBundle(f),/invalid|unverified/);
});
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
async function journalFixture(base){
 const {bundle:{ticket,payload}}=base??await fixture();
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
  mainSha:ticket.mainSha,packetSha256:ticket.packetSha256,payloadSha256:payload.resume?digestDatabaseJson(Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='resume'))):payload.repair&&ticket.action==='prepare'
   ?digestDatabaseJson(Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='repair'))):ticket.payloadSha256,transferArchiveId:id(9),transferArchiveSha256:h}));
 const bootstrapResponseBytes=Buffer.from(canonicalJson({format:'nestory-manual-reset-bootstrap-response-v1',operationId:ticket.operationId,action:ticket.action,nonce:ticket.nonce,
  bootstrapClaimSha256:hashBytes(bootstrapClaimBytes),runId:Number(ticket.runId),runAttempt:1}));
 const workflowPostBytes=Buffer.from(canonicalJson({format:'nestory-local-workflow-post-v1',operationId:ticket.operationId,action:ticket.action,nonce:ticket.nonce,mainSha:ticket.mainSha}));
 return {ticket,payload,intentBytes,claimBytes,responseBytes,bootstrapClaimBytes,bootstrapResponseBytes,workflowPostBytes,evidenceRecordBytes};
}
test('durable records bind payload, custody, original intent, claim and exact enrolled run',async()=>{
 const f=await journalFixture();assert.doesNotThrow(()=>assertDispatchJournalRecords(f));
});
test('repair prepare bootstrap binds only unchanged pre-enrollment payload; signed intent binds complete repaired payload',async()=>{
 const f=await journalFixture(await repairFixture());assert.doesNotThrow(()=>assertDispatchJournalRecords(f));
 const bootstrap=JSON.parse(f.bootstrapClaimBytes);
 assert.notEqual(bootstrap.payloadSha256,f.ticket.payloadSha256);
 bootstrap.payloadSha256=f.ticket.payloadSha256;
 f.bootstrapClaimBytes=Buffer.from(canonicalJson(bootstrap));
 const enrolled=JSON.parse(f.bootstrapResponseBytes);enrolled.bootstrapClaimSha256=hashBytes(f.bootstrapClaimBytes);
 f.bootstrapResponseBytes=Buffer.from(canonicalJson(enrolled));
 assert.throws(()=>assertDispatchJournalRecords(f),/invalid/);
});
test('subsequent seal bootstrap includes the existing immutable repair record',async()=>{
 const base=await repairFixture();base.bundle.ticket.action='seal';
 const f=await journalFixture(base);assert.doesNotThrow(()=>assertDispatchJournalRecords(f));
 assert.equal(JSON.parse(f.bootstrapClaimBytes).payloadSha256,f.ticket.payloadSha256);
});
test('resume bootstrap retains prepare history and excludes only the later append-only resume envelope',async()=>{
 const f=await journalFixture(await resumeFixture());assert.doesNotThrow(()=>assertDispatchJournalRecords(f));
 for(const payload of [f.payload,Object.fromEntries(Object.entries(f.payload).filter(([k])=>!['repair','resume'].includes(k)))]){
  const changed={...f},bootstrap=JSON.parse(f.bootstrapClaimBytes),enrolled=JSON.parse(f.bootstrapResponseBytes);
  bootstrap.payloadSha256=digestDatabaseJson(payload);changed.bootstrapClaimBytes=Buffer.from(canonicalJson(bootstrap));
  enrolled.bootstrapClaimSha256=hashBytes(changed.bootstrapClaimBytes);changed.bootstrapResponseBytes=Buffer.from(canonicalJson(enrolled));
  assert.throws(()=>assertDispatchJournalRecords(changed));
 }
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
