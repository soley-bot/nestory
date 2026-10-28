// Authenticated handoff only. A signature is not database execution authority.
// The worker must rebuild mutationSql, check its digest and live preconditions,
// and retain the global transport hold until the complete path is reviewed.
import { spawn } from 'node:child_process';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import * as pgp from 'openpgp';
import { canonicalJson, hashBytes } from './pilot-finance-reset-operator-core.mjs';
import { HOSTED_ACTIONS, digestJson, digestDatabaseJson } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import { loadRecoveryPublicKey, readPrivateBackupFile } from './local-backup-crypto.mjs';
import {openWindowsResetJournal} from './pilot-finance-reset-windows-journal.mjs';
import {assertManualResetIntent} from './pilot-finance-reset-manual-coordinator.mjs';
import {assertLocalDispatchStageEvidenceRecord} from './local-backup-dispatch-review.mjs';
import {assertPrepareRepairRecord,assertPrepareRepairOriginalJournal,assertPrepareRepairCompatibility,
  verifyLocalDispatchCompatibility,assertLocalDispatchCompatibilityCurrent,localPrepareRepairStagePrefix} from './local-backup-dispatch-repair.mjs';
import {assertExecuteResumeRecord,assertExecuteResumeOriginalJournal,assertExecuteResumeCompatibility,localExecuteResumeStagePrefix} from './local-backup-execute-resume.mjs';

export const LOCAL_DISPATCH_WORKFLOW = '.github/workflows/pilot-financial-reset-local-custody.yml';
export const LOCAL_DISPATCH_REPOSITORY = 'soley-bot/nestory';
const domain = 'nestory-local-custody-dispatch-signature-v1\n';
const format = 'nestory-local-custody-dispatch-ticket-v1';
const repairDomain = 'nestory-local-custody-dispatch-signature-v2\n';
const repairFormat = 'nestory-local-custody-dispatch-ticket-v2';
const resumeDomain = 'nestory-local-custody-dispatch-signature-v3\n';
const resumeFormat = 'nestory-local-custody-dispatch-ticket-v3';
const hash = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail = () => { throw Error('local_dispatch_bundle_invalid'); };
const exact = (o, fields) => o && Object.getPrototypeOf(o) === Object.prototype &&
  Object.keys(o).sort().join(',') === [...fields].sort().join(',');
const config = Object.freeze({ v6Keys:false, allowUnauthenticatedMessages:false, allowUnauthenticatedStream:false });
const digestFields = ['intentSha256','claimSha256','packetSha256','bindingSha256','authoritySha256',
  'sourceObservationSha256','sqlSha256','custodySha256','custodyEvidenceSha256','payloadSha256'];
const fields = ['format','repository','workflow','mainSha','runId','runAttempt','operationId','action','authorizationId',
  'nonce','issuedAt','expiresAt','artifactHashes',...digestFields];
const payloadFields = ['packet','binding','artifacts','recovery','observation'];
const hasRepair = payload => payload && Object.prototype.hasOwnProperty.call(payload,'repair');
const hasResume = payload => payload && Object.prototype.hasOwnProperty.call(payload,'resume');
const expectedPayloadFields = payload => hasResume(payload)?[...payloadFields,'repair','resume']:hasRepair(payload)?[...payloadFields,'repair']:payloadFields;
const expectedTicketFields = payload => hasResume(payload)?[...fields,'repairSha256','resumeSha256']:hasRepair(payload)?[...fields,'repairSha256']:fields;
const ticketFormat=payload=>hasResume(payload)?resumeFormat:hasRepair(payload)?repairFormat:format;
const bundleFormat=payload=>`nestory-local-custody-dispatch-bundle-v${hasResume(payload)?3:hasRepair(payload)?2:1}`;
export const LOCAL_DISPATCH_TRANSFER_LIMIT = 32*1024*1024;
const signatureLimit=8192, transferOverhead=32, documentReserve=64;
// Bound the complete future signed envelope before any durable intent exists.
// JSON escapes and UTF-8 are measured, including caller artifact key names.
export function inspectDispatchPayloadBudget(payload){
  if(!exact(payload,expectedPayloadFields(payload))||!payload.artifacts||Object.getPrototypeOf(payload.artifacts)!==Object.prototype)fail();
  if(hasRepair(payload))assertPrepareRepairRecord(payload.repair);
  if(hasResume(payload)){if(!exact(payload.resume,['record','observation']))fail();assertExecuteResumeRecord(payload.resume.record);}
  const h='a'.repeat(64),u='11111111-1111-4111-8111-111111111111';
  const ticket={format:ticketFormat(payload),repository:LOCAL_DISPATCH_REPOSITORY,workflow:LOCAL_DISPATCH_WORKFLOW,
    mainSha:'a'.repeat(40),runId:'9'.repeat(20),runAttempt:1,operationId:u,
    action:HOSTED_ACTIONS.reduce((a,b)=>a.length>=b.length?a:b),authorizationId:u,nonce:u,
    issuedAt:'+010000-01-01T00:00:00.000Z',expiresAt:'+010000-01-01T00:05:00.000Z',
    artifactHashes:Object.fromEntries(Object.keys(payload.artifacts).map(k=>[k,h])),
    ...Object.fromEntries(digestFields.map(k=>[k,h])),...(hasRepair(payload)?{repairSha256:h}:{}),...(hasResume(payload)?{resumeSha256:h}:{})};
  const maximumDocumentBytes=Buffer.byteLength(JSON.stringify({format:bundleFormat(payload),ticket,payload,
    signingPublicKeySha256:h,signatureBase64:'A'.repeat(signatureLimit)}));
  if(maximumDocumentBytes>LOCAL_DISPATCH_TRANSFER_LIMIT-documentReserve)throw Error('local_dispatch_transfer_limit');
  return Object.freeze({payloadBytes:Buffer.byteLength(JSON.stringify(payload)),maximumDocumentBytes,
    maximumCiphertextBytes:maximumDocumentBytes+transferOverhead,transferLimitBytes:LOCAL_DISPATCH_TRANSFER_LIMIT});
}
const journalReference='C:\\Users\\USer\\Nestory-Recovery\\pilot-october-2026\\local-journal-reference.json';
const journalReferenceSha256='6c5cd6fdd83d07ff57279cc978707e8fc6858d3fc404c013941b4c73e71b0c5b';

function validate(ticket, payload) {
  inspectDispatchPayloadBudget(payload);
  if (!exact(ticket,expectedTicketFields(payload)) || ticket.format!==ticketFormat(payload) || ticket.repository!==LOCAL_DISPATCH_REPOSITORY ||
      ticket.workflow!==LOCAL_DISPATCH_WORKFLOW || !/^[a-f0-9]{40}$/.test(ticket.mainSha) ||
      !/^[1-9][0-9]{0,19}$/.test(ticket.runId) || ticket.runAttempt!==1 ||
      ![ticket.operationId,ticket.authorizationId,ticket.nonce].every(v=>typeof v==='string'&&uuid.test(v)) ||
      !HOSTED_ACTIONS.includes(ticket.action) || !digestFields.every(k=>typeof ticket[k]==='string'&&hash.test(ticket[k])) ||
      !exact(payload,expectedPayloadFields(payload)) || !payload.artifacts || Object.getPrototypeOf(payload.artifacts)!==Object.prototype) fail();
  const start=Date.parse(ticket.issuedAt), end=Date.parse(ticket.expiresAt);
  if (!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString()!==ticket.issuedAt||
      new Date(end).toISOString()!==ticket.expiresAt||end<=start||end-start>300000) fail();
  const bytes=JSON.stringify(payload);
  if (Buffer.byteLength(bytes)>32*1024*1024 || digestDatabaseJson(payload)!==ticket.payloadSha256 ||
      !exact(ticket.artifactHashes,Object.keys(payload.artifacts)) || Object.keys(payload.artifacts).length<1 ||
      Object.entries(payload.artifacts).some(([k,v])=>ticket.artifactHashes[k]!==digestDatabaseJson(v)) ||
      ticket.sourceObservationSha256!==digestDatabaseJson(hasResume(payload)?payload.resume.observation:payload.observation) ||
      ticket.bindingSha256!==digestJson(payload.binding) || payload.packet?.packetSha256!==ticket.packetSha256 ||
      payload.packet?.operation?.operationId!==ticket.operationId || payload.binding?.operation_id!==ticket.operationId) fail();
  if(hasRepair(payload))assertDispatchRepairBinding({ticket,payload});
  return {ticket,payload};
}

// The original packet and native binding never inherit the executor release.
// Only this one append-only repair record may explain a v2 ticket's difference.
export function assertDispatchRepairBinding({ticket,payload}){
  if(hasResume(payload))return assertDispatchResumeBinding({ticket,payload});
  const repair=assertPrepareRepairRecord(payload?.repair);
  if(!['prepare','seal','execute'].includes(ticket.action)||ticket.repairSha256!==digestJson(repair)||
    ticket.mainSha!==repair.executorMainSha||payload.packet?.operation?.mainSha!==repair.originalMainSha||
    payload.binding?.main_sha!==repair.originalMainSha||ticket.operationId!==repair.operationId||
    ticket.packetSha256!==repair.packetSha256||ticket.bindingSha256!==repair.bindingSha256||
    ticket.authorizationId===repair.originalAttempt.authorizationId||
    ticket.action==='prepare'&&(ticket.nonce!==repair.replacement.nonce||ticket.runId!==repair.replacement.runId||ticket.runAttempt!==repair.replacement.runAttempt))fail();
  return repair;
}
export function assertDispatchResumeBinding({ticket,payload}){
  if(!exact(payload.resume,['record','observation']))fail();
  const r=assertExecuteResumeRecord(payload.resume.record),o=payload.resume.observation;
  if(ticket.action!=='execute'||ticket.resumeSha256!==digestJson(payload.resume)||ticket.repairSha256!==digestJson(payload.repair)||
    canonicalJson(payload.repair)!==canonicalJson(r.prepareRepair)||ticket.mainSha!==r.executorMainSha||ticket.operationId!==r.operationId||
    ticket.packetSha256!==r.packetSha256||ticket.bindingSha256!==r.bindingSha256||ticket.runId!==r.replacement.runId||ticket.nonce!==r.replacement.nonce||ticket.runAttempt!==1||
    ticket.authorizationId===r.originalAttempt.authorizationId||ticket.authorizationId===r.prepareRepair.originalAttempt.authorizationId||
    payload.packet?.operation?.mainSha!==r.originalMainSha||payload.binding?.main_sha!==r.originalMainSha||o?.foreignSha256!==r.freshForeignSha256)fail();
  return r;
}

export function buildDispatchTicket(input,payload) {
  const supplied=fields.filter(k=>!['format','repository','workflow','runAttempt','artifactHashes','payloadSha256'].includes(k));
  if(!exact(input,supplied)||!exact(payload,expectedPayloadFields(payload))||!payload.artifacts)fail();
  const ticket={...structuredClone(input),format:ticketFormat(payload),repository:LOCAL_DISPATCH_REPOSITORY,workflow:LOCAL_DISPATCH_WORKFLOW,runAttempt:1,
    artifactHashes:Object.fromEntries(Object.entries(payload.artifacts).map(([k,v])=>[k,digestDatabaseJson(v)])),payloadSha256:digestDatabaseJson(payload),
    ...(hasRepair(payload)?{repairSha256:digestJson(payload.repair)}:{}),...(hasResume(payload)?{resumeSha256:digestJson(payload.resume)}:{})};
  validate(ticket,payload); return ticket;
}
export function dispatchSigningBytes(ticket,payload) {
  validate(ticket,payload);
  return Buffer.from((hasResume(payload)?resumeDomain:hasRepair(payload)?repairDomain:domain)+canonicalJson(ticket),'utf8');
}

// Fixed existing custody helper, anonymous pipes only; private bytes never leave
// this module's signing function or reach disk/arguments/logs.
async function unwrap(wrapped) {
  if(process.platform!=='win32'||wrapped.length<1||wrapped.length>65536)fail();
  const input=Buffer.from(JSON.stringify({action:'unprotect',name:null,payload:wrapped.toString('base64')}));
  return new Promise((resolve,reject)=>{
    const child=spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(import.meta.dirname,'local-backup-windows.ps1')],
      {windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows'}});
    const chunks=[];let size=0,bad=false;
    const stop=()=>{bad=true;child.kill();};const timer=setTimeout(stop,60000);
    child.stdout.on('data',b=>{size+=b.length;if(size>100000)stop();else chunks.push(b);});
    child.stderr.on('data',stop);child.stdin.on('error',stop);child.on('error',stop);
    child.once('close',code=>{
      clearTimeout(timer);input.fill(0);let result;
      try{
        if(bad||code!==0)fail();
        const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(!exact(value,['status','payload'])||value.status!=='ok'||typeof value.payload!=='string')fail();
        result=Buffer.from(value.payload,'base64');
        if(result.length<1||result.length>65536||result.toString('base64')!==value.payload)fail();
        resolve(result);
      }catch{result?.fill(0);reject(Error('local_dispatch_signing_failed'));}
      finally{chunks.forEach(b=>b.fill(0));}
    });child.stdin.end(input);
  });
}

export function assertDispatchJournalRecords({ticket,payload,intentBytes,claimBytes,responseBytes,bootstrapClaimBytes,bootstrapResponseBytes,workflowPostBytes,evidenceRecordBytes}){
  validate(ticket,payload);
  if(![intentBytes,claimBytes,responseBytes,bootstrapClaimBytes,bootstrapResponseBytes,workflowPostBytes,evidenceRecordBytes].every(b=>b instanceof Uint8Array&&b.length>0&&b.length<=262144)||
    hashBytes(intentBytes)!==ticket.intentSha256||hashBytes(claimBytes)!==ticket.claimSha256)fail();
  const decode=b=>JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));
  const intent=assertManualResetIntent(decode(intentBytes)),claim=decode(claimBytes),response=decode(responseBytes),t=intent.transportIntent;
  const bootstrap=decode(bootstrapClaimBytes),enrollment=decode(bootstrapResponseBytes);
  const bootstrapPayload=hasResume(payload)?Object.fromEntries(Object.entries(payload).filter(([key])=>key!=='resume')):hasRepair(payload)&&ticket.action==='prepare'
    ?Object.fromEntries(Object.entries(payload).filter(([key])=>key!=='repair')):payload;
  const evidence=decode(evidenceRecordBytes);
  if(hashBytes(evidenceRecordBytes)!==ticket.custodyEvidenceSha256||intent.custody.evidenceRecordSha256!==ticket.custodyEvidenceSha256||
    !exact(evidence,['format','operationId','packetSha256','evidence'])||evidence.format!=='nestory-local-dispatch-evidence-record-v1'||
    evidence.operationId!==ticket.operationId||evidence.packetSha256!==ticket.packetSha256)fail();
  if(canonicalJson(decode(workflowPostBytes))!==canonicalJson({format:'nestory-local-workflow-post-v1',operationId:ticket.operationId,
    action:ticket.action,nonce:ticket.nonce,mainSha:ticket.mainSha}))fail();
  if(!exact(bootstrap,['format','operationId','action','nonce','mainSha','packetSha256','payloadSha256','transferArchiveId','transferArchiveSha256'])||
    bootstrap.format!=='nestory-manual-reset-bootstrap-claim-v1'||!uuid.test(bootstrap.transferArchiveId)||!hash.test(bootstrap.transferArchiveSha256)||
    !['operationId','action','nonce','mainSha','packetSha256'].every(k=>bootstrap[k]===ticket[k])||
    bootstrap.payloadSha256!==digestDatabaseJson(bootstrapPayload)||
    !exact(enrollment,['format','operationId','action','nonce','bootstrapClaimSha256','runId','runAttempt'])||
    enrollment.format!=='nestory-manual-reset-bootstrap-response-v1'||enrollment.bootstrapClaimSha256!==hashBytes(bootstrapClaimBytes)||
    !['operationId','action','nonce'].every(k=>enrollment[k]===ticket[k])||!Number.isSafeInteger(enrollment.runId)||
    String(enrollment.runId)!==ticket.runId||enrollment.runAttempt!==1)fail();
  if(intent.mainSha!==ticket.mainSha||intent.inputBundleSha256!==ticket.payloadSha256||digestJson(intent.custody)!==ticket.custodySha256||
    !['operationId','packetSha256','action','bindingSha256','authorizationId','authoritySha256','sourceObservationSha256','sqlSha256'].every(k=>t[k]===ticket[k])||
    canonicalJson(claim)!==canonicalJson({format:'nestory-manual-reset-dispatch-claim-v1',operationId:ticket.operationId,action:ticket.action,intentSha256:ticket.intentSha256})||
    !exact(response,['format','operationId','action','intentSha256','runId','runAttempt'])||response.format!=='nestory-manual-reset-dispatch-response-v1'||
    response.operationId!==ticket.operationId||response.action!==ticket.action||response.intentSha256!==ticket.intentSha256||
    !Number.isSafeInteger(response.runId)||String(response.runId)!==ticket.runId||response.runAttempt!==1)fail();
}
export async function openFixedLocalDispatchJournal(){
  if(process.platform!=='win32')fail();
  const bytes=await readFile(journalReference);if(hashBytes(bytes)!==journalReferenceSha256)fail();
  const reference=JSON.parse(bytes.toString('utf8'));
  if(reference.format!=='nestory-windows-reset-journal-reference-v1'||
    reference.configuration?.directory!=='C:\\Users\\USer\\Nestory-Recovery\\pilot-october-2026\\local-journal')fail();
  return openWindowsResetJournal(reference.configuration);
}
async function verifyDurableDispatch(ticket,payload,preparedCustody,preparedSigning){
  const store=preparedSigning?.store??await openFixedLocalDispatchJournal();
  const basePrefix=`financial-reset/${ticket.operationId}/manual-stage/${ticket.action}`;
  let prefix=basePrefix,compatibility;
  if(hasRepair(payload)){
    assertDispatchRepairBinding({ticket,payload});const repair=assertPrepareRepairRecord(payload.repair);
    const repairBytes=await store.read(`financial-reset/${ticket.operationId}/manual-stage/prepare/repair-once`);
    if(!(repairBytes instanceof Uint8Array)||repairBytes.length<1||repairBytes.length>262144||
      Buffer.from(repairBytes).toString('utf8')!==canonicalJson(repair))fail();
    compatibility=preparedSigning?.compatibility??await verifyLocalDispatchCompatibility({packet:payload.packet,executorMainSha:ticket.mainSha});
    if(preparedSigning)await assertLocalDispatchCompatibilityCurrent(compatibility,payload.packet);
    if(hasResume(payload))assertExecuteResumeCompatibility(payload.resume.record,compatibility);else assertPrepareRepairCompatibility(repair,compatibility);
    const originalPrefix=`financial-reset/${ticket.operationId}/manual-stage/prepare`;
    const [intentBytes,claimBytes,responseBytes,publicationBytes]=await Promise.all(
      ['intent','dispatch-claim','dispatch-response',`bootstrap/${repair.originalAttempt.nonce}/publish-claim`].map(k=>store.read(`${originalPrefix}/${k}`)));
    assertPrepareRepairOriginalJournal({repair,intentBytes,claimBytes,responseBytes,publicationBytes});
    if(hasResume(payload)){
      const resume=payload.resume.record,parent=await store.read(`${basePrefix}/resume-once`);
      if(!(parent instanceof Uint8Array)||Buffer.from(parent).toString('utf8')!==canonicalJson(resume))fail();
      const a=resume.originalAttempt,old=await Promise.all(['intent','dispatch-claim','dispatch-response',`bootstrap/${a.nonce}/publish-claim`,
        `bootstrap/${a.nonce}/worker-receipt/${a.receiptSha256}`,`reconciliation/${a.receiptSha256}`].map(k=>store.read(`${basePrefix}/${k}`)));
      assertExecuteResumeOriginalJournal({resume,intentBytes:old[0],claimBytes:old[1],responseBytes:old[2],publicationBytes:old[3],
        receiptBytes:old[4],reconciliationBytes:old[5],prepareRepairBytes:repairBytes});
      const {assertExecuteResumeEnvelope}=await import('./local-backup-execute-adapter.mjs');await assertExecuteResumeEnvelope({payload,compatibility});
      prefix=localExecuteResumeStagePrefix(ticket.action,resume);
    }else prefix=localPrepareRepairStagePrefix(ticket.action,repair);
  }
  const [intentBytes,claimBytes,responseBytes,bootstrapClaimBytes,bootstrapResponseBytes,workflowPostBytes,evidenceRecordBytes]=await Promise.all(
    ['intent','dispatch-claim','dispatch-response'].map(k=>store.read(`${prefix}/${k}`)).concat(
      ['claim','response','workflow-post'].map(k=>store.read(`${basePrefix}/bootstrap/${ticket.nonce}/${k}`)),
      [store.read(`${prefix}/custody-evidence`)]));
  assertDispatchJournalRecords({ticket,payload,intentBytes,claimBytes,responseBytes,bootstrapClaimBytes,bootstrapResponseBytes,workflowPostBytes,evidenceRecordBytes});
  assertLocalDispatchStageEvidenceRecord({recordBytes:await store.read(`${prefix}/stage-evidence`),ticket,payload});
  const {verifySavedLocalRecoveryEvidence,assertPreparedLocalRecoveryEvidence}=await import('./local-backup-custody-evidence.mjs');
  const args={evidence:JSON.parse(evidenceRecordBytes).evidence,custody:JSON.parse(intentBytes).custody,packet:payload.packet,artifacts:payload.artifacts,observation:payload.observation};
  if(preparedCustody!==undefined){
    await assertPreparedLocalRecoveryEvidence(preparedCustody,args,ticket.nonce,{consume:true});
    assertLocalDispatchStageEvidenceRecord({recordBytes:await store.read(`${prefix}/stage-evidence`),ticket,payload});
  }
  else if((await verifySavedLocalRecoveryEvidence(args)).operationalCustodyVerified!==true)fail();
}
// Each instance owns its handles. Synthetic ports cannot mint a production
// signer. The binding excludes authorization, which must arrive only at finish.
export function createPreparedDispatchSigning({prepare,check,sign,dispose}){
  const handles=new WeakMap();
  const close=async handle=>{const state=handles.get(handle);if(!state||state.closed)return;state.closed=true;
    try{await dispose(state.value);}finally{state.value=null;}};
  return Object.freeze({
    async prepare(options){let value;try{
      value=await prepare(options);const handle=Object.freeze({format:'nestory-prepared-dispatch-signing-v1'});
      handles.set(handle,{value,closed:false,used:false});return handle;
    }catch(error){if(value)await dispose(value);throw error;}},
    async finish(handle,options){const state=handles.get(handle);if(!state||state.closed||state.used)fail();state.used=true;
      try{await check(state.value,options);return await sign(state.value,options);}finally{await close(handle);}},
    close,
  });
}
async function loadSigningMaterial(keyId){
  let wrapped,raw,signingKey;
  try{
    const {metadata,key}=await loadRecoveryPublicKey(keyId);
    wrapped=await readPrivateBackupFile(keyId,'private.dpapi');
    if(hashBytes(wrapped)!==metadata.wrappedKeySha256)fail();
    raw=await unwrap(wrapped);signingKey=await pgp.readPrivateKey({binaryKey:raw,config});
    if(signingKey.getFingerprint()!==key.getFingerprint()||signingKey.keyPacket.version!==4||signingKey.getAlgorithmInfo().bits!==3072)fail();
    return {signingKey,publicKeySha256:metadata.publicKeySha256};
  }catch(error){signingKey?.clearPrivateParams();throw error;}
  finally{wrapped?.fill(0);raw?.fill(0);}
}
async function signWithMaterial(material,{ticket,payload}){
  const copy=structuredClone({ticket,payload}),bytes=dispatchSigningBytes(copy.ticket,copy.payload);
  try{
    const signature=await pgp.sign({message:await pgp.createMessage({binary:bytes}),signingKeys:material.signingKey,detached:true,format:'binary',config});
    if(Buffer.from(signature).toString('base64').length>signatureLimit)fail();
    return {format:bundleFormat(copy.payload),...copy,
      signingPublicKeySha256:material.publicKeySha256,signatureBase64:Buffer.from(signature).toString('base64')};
  }finally{bytes.fill(0);}
}
const preparedSigners=createPreparedDispatchSigning({
  prepare:async({keyId,payload,mainSha,runId,locator,preparedCustody})=>{
    payload=structuredClone(payload);locator=structuredClone(locator);
    if(!uuid.test(keyId)||!exact(locator,['operationId','action','nonce'])||!uuid.test(locator.operationId)||!uuid.test(locator.nonce)||
      !HOSTED_ACTIONS.includes(locator.action)||!/^[a-f0-9]{40}$/.test(mainSha)||!/^[1-9][0-9]{0,19}$/.test(runId))fail();
    inspectDispatchPayloadBudget(payload);
    const {assertPreparedLocalRecoveryEvidenceHeld}=await import('./local-backup-custody-evidence.mjs');
    await assertPreparedLocalRecoveryEvidenceHeld(preparedCustody);
    const store=await openFixedLocalDispatchJournal();
    const compatibility=hasRepair(payload)?await verifyLocalDispatchCompatibility({packet:payload.packet,executorMainSha:mainSha}):null;
    if(compatibility){if(hasResume(payload))assertExecuteResumeCompatibility(payload.resume.record,compatibility);else assertPrepareRepairCompatibility(payload.repair,compatibility);}
    let material;
    try{material=await loadSigningMaterial(keyId);await assertPreparedLocalRecoveryEvidenceHeld(preparedCustody);
      return {material,store,compatibility,preparedCustody,keyId,payloadSha256:digestDatabaseJson(payload),mainSha,runId,locator:structuredClone(locator)};
    }catch(error){material?.signingKey.clearPrivateParams();throw error;}
  },
  check:async(state,options)=>{
    assertPreparedDispatchSigningBinding(state,options);
    const {ticket,payload,preparedCustody}=options;
    await verifyDurableDispatch(ticket,payload,preparedCustody,state);
  },
  sign:(state,options)=>signWithMaterial(state.material,options),
  dispose:state=>{state.material.signingKey.clearPrivateParams();state.material=null;state.preparedCustody=null;state.compatibility=null;state.store=null;},
});
export function assertPreparedDispatchSigningBinding(state,{keyId,ticket,payload,preparedCustody}){
  validate(ticket,payload);
  if(keyId!==state.keyId||preparedCustody!==state.preparedCustody||ticket.payloadSha256!==state.payloadSha256||ticket.mainSha!==state.mainSha||ticket.runId!==state.runId||
    !['operationId','action','nonce'].every(k=>ticket[k]===state.locator[k]))fail();
  return true;
}
export const prepareLocalDispatchSigning=options=>preparedSigners.prepare(options);
export const disposePreparedLocalDispatchSigning=handle=>preparedSigners.close(handle);
export async function signLocalDispatchBundle({keyId,ticket,payload,preparedCustody,preparedSigning}) {
  // Freeze caller-owned objects before any asynchronous custody access.
  let material;
  try{
    const copy=structuredClone({ticket,payload});
    // Actual fixed branded journal read, before public/private key custody.
    // No caller-provided path, mock store or Boolean can replace these records.
    if(preparedSigning!==undefined)return await preparedSigners.finish(preparedSigning,{keyId,...copy,preparedCustody});
    await verifyDurableDispatch(copy.ticket,copy.payload,preparedCustody);
    material=await loadSigningMaterial(keyId);return await signWithMaterial(material,copy);
  }catch{throw Error('local_dispatch_signing_failed');}
  finally{material?.signingKey.clearPrivateParams();if(preparedSigning!==undefined)await preparedSigners.close(preparedSigning);}
}

async function verifyDispatchBundle({bundle,publicKeyArmored,expectedPublicKeySha256,invocation,now=Date.now()},historical) {
  try{
    // Never return caller-owned mutable bytes after verification.
    const copy=structuredClone(bundle);
    if(!exact(copy,['format','ticket','payload','signingPublicKeySha256','signatureBase64'])||
        copy.format!==bundleFormat(copy.payload)||!hash.test(expectedPublicKeySha256)||
        typeof publicKeyArmored!=='string'||publicKeyArmored.length>16384||hashBytes(publicKeyArmored)!==expectedPublicKeySha256||
        copy.signingPublicKeySha256!==expectedPublicKeySha256||typeof copy.signatureBase64!=='string'||copy.signatureBase64.length>signatureLimit||
        !exact(invocation,['repository','workflow','mainSha','runId','runAttempt','operationId','action','nonce']))fail();
    const bytes=dispatchSigningBytes(copy.ticket,copy.payload);
    if(!Number.isSafeInteger(now)||now<Date.parse(copy.ticket.issuedAt)||!historical&&now>=Date.parse(copy.ticket.expiresAt)||
        Object.entries(invocation).some(([k,v])=>copy.ticket[k]!==v))fail();
    const signature=Buffer.from(copy.signatureBase64,'base64');
    if(signature.length<1||signature.toString('base64')!==copy.signatureBase64)fail();
    const key=await pgp.readKey({armoredKey:publicKeyArmored,config});
    if(key.isPrivate()||key.keyPacket.version!==4||key.getAlgorithmInfo().bits!==3072)fail();
    const result=await pgp.verify({message:await pgp.createMessage({binary:bytes}),verificationKeys:key,
      signature:await pgp.readSignature({binarySignature:signature,config}),config});
    if(result.signatures.length!==1)fail();await result.signatures[0].verified;
    return {ticket:copy.ticket,payload:copy.payload,...(historical?{historicalReadOnly:true}:{})};
  }catch{fail();}
}
export const verifySignedDispatchBundle=options=>verifyDispatchBundle(options,false);
export const verifyHistoricalDispatchBundle=options=>verifyDispatchBundle(options,true);
