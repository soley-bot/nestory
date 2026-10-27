// Fixed operator-side handoff for the reviewed sole-admin reset stages only.
// Private inputs are encrypted archive UUIDs, never paths, SQL or credentials.
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,readdir} from 'node:fs/promises';
import {canonicalJson,hashBytes,assertOperatorPacket} from './pilot-finance-reset-operator-core.mjs';
import {digestJson,digestDatabaseJson,validateArtifacts,hostedBinding,HOSTED_ACTIONS} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {verifyHostedPacketSources} from './pilot-finance-reset-hosted-transport.mjs';
import {createManualResetCoordinator} from './pilot-finance-reset-manual-coordinator.mjs';
import {decryptLocalBackup,encryptLocalBackup,readPrivateBackupFile,writePrivateBackupFile,loadRecoveryPublicKey} from './local-backup-crypto.mjs';
import {openFixedLocalDispatchJournal,buildDispatchTicket,signLocalDispatchBundle,inspectDispatchPayloadBudget,LOCAL_DISPATCH_REPOSITORY,LOCAL_DISPATCH_WORKFLOW} from './local-backup-dispatch-bundle.mjs';
import {localCustodyObjectPath,assertLocalCustodySignedUrl,encryptLocalCustodyTransfer,decryptLocalCustodyTransfer,localCustodyMutationSql,assertLocalCustodyResetScope,LOCAL_CUSTODY_BUCKET,LOCAL_CUSTODY_SOURCES} from './pilot-finance-reset-local-custody-runner.mjs';
import {readPilotHostedServiceCredential} from './local-backup-file-credential.mjs';
import {verifySavedLocalRecoveryEvidence,prepareSavedLocalRecoveryEvidence,assertPreparedLocalRecoveryEvidence,
 assertPreparedLocalRecoveryEvidenceHeld,disposePreparedLocalRecoveryEvidence} from './local-backup-custody-evidence.mjs';
import {inspectSavedPilotRehearsal,assertSavedPilotRehearsalHeld} from './local-backup-saved-rehearsal.mjs';
import {assertLocalDispatchStageAuthority} from './local-backup-dispatch-review.mjs';
const root=path.resolve(import.meta.dirname,'..'),origin='https://pfvmztxktkwyewvxfgot.supabase.co';
const keyId='62ff0255-db38-43a4-b794-4194753f6a7b',uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/;
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const fail=code=>{throw Error(`local_dispatch_${code}`)};
async function held(work){
 const{holdBusinessSpillCustody}=await import('./local-backup-business-runtime.mjs');if(typeof holdBusinessSpillCustody!=='function')fail('custody_unavailable');
 const custody=await holdBusinessSpillCustody();try{const result=await work();await custody.check();return result}finally{await custody.close()}
}
export async function readLocalDispatchSourceFiles(){
 const names=new Set(LOCAL_CUSTODY_SOURCES);
 for(const name of await readdir(path.join(root,'supabase/migrations')))if(/^\d{14}_[a-z0-9_]+\.sql$/.test(name))names.add('supabase/migrations/'+name);
 const files=new Map();for(const name of [...names].sort())files.set(name,(await readFile(path.join(root,name),'utf8')).replaceAll('\r\n','\n'));return files;
}
// Operational input assembly derives custody hashes from opened proof records.
// It creates an encrypted private-C artifact only; no journal intent, remote
// placeholder, workflow dispatch or actor authorization is created here.
export async function persistPreparedLocalDispatchInput({context,prepared,custodyEvidence,observation,stageAuthority,action}){
 const reviewArtifacts=structuredClone(Object.fromEntries(['actorApprovals','containmentProof','liveConsent'].map(r=>[r,prepared?.artifactBytes?.[r]])));
 stageAuthority=structuredClone(stageAuthority);
 prepared={packet:structuredClone(prepared?.packet),artifacts:structuredClone(prepared?.artifacts)};
 custodyEvidence=structuredClone(custodyEvidence);observation=structuredClone(observation);
 await assertSavedPilotRehearsalHeld(context);const saved=inspectSavedPilotRehearsal(context);saved.manifestBytes.fill(0);
 if(saved.request.keyId!==keyId||!HOSTED_ACTIONS.includes(action)||!custodyEvidence?.liveWitness||
  custodyEvidence.businessRestore.id!==saved.proof.proofId||custodyEvidence.businessArchive.id!==saved.request.archiveId)fail('input_invalid');
 const{packet,artifacts}=prepared;assertOperatorPacket(packet);validateArtifacts(packet,artifacts);
 assertLocalCustodyResetScope({action,binding:hostedBinding(packet,artifacts.continuationPlan),artifacts,recovery:null});
 const authoritySha256=assertLocalDispatchStageAuthority({packet,artifacts,reviews:reviewArtifacts,action,observation,authority:stageAuthority});
 if(packet.evidenceBlockers.length||!LOCAL_CUSTODY_SOURCES.every(p=>packet.sourceFiles.some(s=>s.path===p)))fail('input_incomplete');
 await verifyHostedPacketSources(packet);
 const fileProofBytes=await readPrivateBackupFile(custodyEvidence.filesRestore.id,'proof.json');
 if(hashBytes(fileProofBytes)!==custodyEvidence.filesRestore.sha256)fail('file_proof_changed');const fileProof=JSON.parse(fileProofBytes);
 const record={format:'nestory-local-dispatch-evidence-record-v1',operationId:packet.operation.operationId,packetSha256:packet.packetSha256,evidence:custodyEvidence};
 const custody={format:'nestory-local-reset-custody-reference-v1',operationId:packet.operation.operationId,packetSha256:packet.packetSha256,
  archiveEnvelopeSha256:saved.request.archiveSha256,archivePlaintextSha256:saved.request.sourceSha256,filesArchiveSha256:fileProof.ciphertextSha256,
  restoreEvidenceSha256:custodyEvidence.businessRestore.sha256,keyRecoveryEvidenceSha256:custodyEvidence.keyRecovery.sha256,
  privateDestinationReviewSha256:custodyEvidence.destinationProtection.sha256,foreignBaselineSha256:observation?.foreignSha256,evidenceRecordSha256:hashBytes(canonicalJson(record))};
 if((await verifySavedLocalRecoveryEvidence({evidence:custodyEvidence,custody,packet,artifacts,observation})).operationalCustodyVerified!==true)fail('custody_incomplete');
 const payload={packet,binding:hostedBinding(packet,artifacts.continuationPlan),artifacts,recovery:null,observation};
 inspectDispatchPayloadBudget(payload);
 const input={format:'nestory-local-dispatch-input-v1',payload,custody,custodyEvidence,authoritySha256,stageAuthority,reviewArtifacts,action};
 const plain=Buffer.from(JSON.stringify(input)),inputArchiveId=randomUUID();let cipher;
 try{if(plain.length>32*1024*1024)fail('input_limit');cipher=await encryptLocalBackup(keyId,plain);await assertSavedPilotRehearsalHeld(context);
  await writePrivateBackupFile(inputArchiveId,'archive.pgp',cipher);const readback=await readPrivateBackupFile(inputArchiveId,'archive.pgp');
  try{if(!readback.equals(cipher))fail('input_readback_changed')}finally{readback.fill(0)}
  await assertSavedPilotRehearsalHeld(context);return{inputArchiveId,inputArchiveSha256:hashBytes(cipher),nonce:randomUUID()};
 }finally{plain.fill(0);cipher?.fill(0)}
}
const ghPath='C:\\Program Files\\GitHub CLI\\gh.exe';
function command(args,input){return new Promise((resolve,reject)=>{
 const child=spawn(ghPath,args,{cwd:root,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{
  SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',USERPROFILE:'C:\\Users\\USer',APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA,
  TEMP:process.env.TEMP,TMP:process.env.TMP,GH_HOST:'github.com',GH_PROMPT_DISABLED:'1',NO_COLOR:'1'}});
 const chunks=[];let size=0,bad=false;const stop=()=>{bad=true;child.kill()};const timer=setTimeout(stop,30000);
 child.stdout.on('data',b=>{size+=b.length;if(size>2*1024*1024)stop();else chunks.push(b)});child.stderr.on('data',()=>{});child.stdin.on('error',stop);child.on('error',stop);
 child.on('close',code=>{clearTimeout(timer);if(bad||code!==0)reject(Error('local_dispatch_github_outcome_unknown'));else resolve(Buffer.concat(chunks))});child.stdin.end(input??'');
});}
const api=async(resource,body)=>{
 const bytes=await command(['api',`repos/${LOCAL_DISPATCH_REPOSITORY}/${resource}`,...(body?['--method','POST','--input','-']:[])],body?JSON.stringify(body):undefined);
 return bytes.length?JSON.parse(bytes):null;
};
function request(r){if(!exact(r,['inputArchiveId','inputArchiveSha256','nonce'])||!uuid.test(r.inputArchiveId)||!uuid.test(r.nonce)||!hash.test(r.inputArchiveSha256))fail('request_invalid');return r;}
async function load(r,{historical=false}={}){
 request(r);const cipher=await readPrivateBackupFile(r.inputArchiveId,'archive.pgp');if(hashBytes(cipher)!==r.inputArchiveSha256)fail('input_changed');
 const plain=await decryptLocalBackup(keyId,cipher);let input;try{input=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(plain));}finally{plain.fill(0);cipher.fill(0);}
 if(!exact(input,['format','payload','custody','custodyEvidence','authoritySha256','stageAuthority','reviewArtifacts','action'])||input.format!=='nestory-local-dispatch-input-v1'||!hash.test(input.authoritySha256)||!HOSTED_ACTIONS.includes(input.action))fail('input_invalid');
 const {payload}=input;if(!exact(payload,['packet','binding','artifacts','recovery','observation']))fail('payload_invalid');
 inspectDispatchPayloadBudget(payload);
 assertLocalCustodyResetScope({action:input.action,binding:payload.binding,artifacts:payload.artifacts,recovery:payload.recovery});
 assertOperatorPacket(payload.packet);validateArtifacts(payload.packet,payload.artifacts,payload.recovery);
 if(assertLocalDispatchStageAuthority({packet:payload.packet,artifacts:payload.artifacts,reviews:input.reviewArtifacts,action:input.action,
  observation:payload.observation,authority:input.stageAuthority,historical})!==input.authoritySha256)fail('stage_evidence_changed');
 if(payload.packet.evidenceBlockers.length||payload.packet.operation.invoiceDatePolicy!=='empty-books-no-invoices'||payload.artifacts.continuationPlan?.version!==4||
  payload.packet.operation.projectRef!=='pfvmztxktkwyewvxfgot'||payload.packet.operation.organizationId!=='752a87b8-bd04-4a45-9cb8-00687af66e73'||
  !LOCAL_CUSTODY_SOURCES.every(p=>payload.packet.sourceFiles.some(s=>s.path===p))||canonicalJson(payload.binding)!==canonicalJson(hostedBinding(payload.packet,payload.artifacts.continuationPlan,payload.recovery)))fail('payload_invalid');
 await verifyHostedPacketSources(payload.packet);
 const record={format:'nestory-local-dispatch-evidence-record-v1',operationId:payload.packet.operation.operationId,packetSha256:payload.packet.packetSha256,evidence:input.custodyEvidence};
 if(hashBytes(canonicalJson(record))!==input.custody.evidenceRecordSha256)fail('custody_record_changed');
 if((await verifySavedLocalRecoveryEvidence({evidence:input.custodyEvidence,custody:input.custody,packet:payload.packet,artifacts:payload.artifacts,observation:payload.observation})).operationalCustodyVerified!==true)fail('custody_incomplete');
 if((await api('commits/main')).sha!==payload.packet.operation.mainSha)fail('main_changed');
 return {...input,locator:{operationId:payload.packet.operation.operationId,action:input.action,nonce:r.nonce}};
}
async function serviceCredential(){
 return readPilotHostedServiceCredential();
}
async function storage(method,pathname,key,body,headers={}){
 let response;const url=origin+'/storage/v1/'+pathname;
 try{response=await fetch(url,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${key}`,apikey:key,...headers},body});}catch{fail('storage_outcome_unknown');}
 if(!response.ok||response.redirected||response.url!==url||!response.body)fail('storage_unverified');
 const reader=response.body.getReader(),chunks=[];let size=0;
 for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>32*1024*1024){await reader.cancel();fail('storage_limit')}chunks.push(value)}return Buffer.concat(chunks);
}
async function privateBucket(key){
 const b=JSON.parse(await storage('GET',`bucket/${LOCAL_CUSTODY_BUCKET}`,key));
 if(b.id!==LOCAL_CUSTODY_BUCKET||b.name!==LOCAL_CUSTODY_BUCKET||b.public!==false||b.file_size_limit!==33554432||JSON.stringify(b.allowed_mime_types)!=='["application/octet-stream"]')fail('private_bucket_invalid');
}
const prefix=locator=>`financial-reset/${locator.operationId}/manual-stage/${locator.action}/bootstrap/${locator.nonce}`;
async function record(store,key,value){const bytes=Buffer.from(canonicalJson(value));if(await store.putIfAbsent(key,bytes)!=='created'||!Buffer.from(await store.read(key)).equals(bytes))fail('journal_uncertain');return hashBytes(bytes);}
async function required(store,key){const b=await store.read(key);if(!b)fail('original_record_missing');return JSON.parse(b);}
async function transfer(store,locator){
 const claim=await required(store,`${prefix(locator)}/claim`),cipher=await readPrivateBackupFile(claim.transferArchiveId,'archive.pgp');
 if(hashBytes(cipher)!==claim.transferArchiveSha256)fail('transfer_archive_changed');const plain=await decryptLocalBackup(keyId,cipher);
 try{const data=JSON.parse(plain);if(!exact(data,['format','locator','inputArchiveId','inputArchiveSha256','keyBase64'])||data.format!=='nestory-local-transfer-secret-v1'||canonicalJson(data.locator)!==canonicalJson(locator)||!/^[A-Za-z0-9+/]{43}=$/.test(data.keyBase64))fail('transfer_archive_invalid');return {claim,data,key:Buffer.from(data.keyBase64,'base64')};}finally{plain.fill(0);cipher.fill(0);}
}
async function signedUrl(key,locator){
 const result=JSON.parse(await storage('POST',`object/sign/${LOCAL_CUSTODY_BUCKET}/${localCustodyObjectPath(locator)}`,key,JSON.stringify({expiresIn:3600}),{'Content-Type':'application/json'}));
 const value=result.signedURL??result.signedUrl;
 return assertLocalCustodySignedUrl(typeof value==='string'&&value.startsWith('/object/sign/')?origin+'/storage/v1'+value:value,locator);
}
async function enroll(url,key){
 for(const[name,value]of [['PILOT_RESET_HANDOFF_SIGNED_URL',url],['PILOT_RESET_HANDOFF_KEY',key.toString('base64')]])
  await command(['secret','set',name,'--env','production-database','--repo',LOCAL_DISPATCH_REPOSITORY],value);
}
async function enrollmentReady(){
 const [enabled,signingHash,signingKey,psql,local]=await Promise.all([
  ...['PILOT_RESET_LOCAL_CUSTODY_ENABLED','PILOT_RESET_SIGNING_PUBLIC_KEY_SHA256','PILOT_RESET_SIGNING_PUBLIC_KEY','PILOT_RESET_PSQL_SHA256']
   .map(name=>api(`environments/production-database/variables/${name}`)),loadRecoveryPublicKey(keyId)]);
 if(enabled.value!=='reviewed-operation-only'||signingHash.value!==local.metadata.publicKeySha256||signingKey.value!==local.armored||!hash.test(psql.value))fail('protected_enrollment_missing');
}
export function localCustodyRunTitle(locator,mode){return `Pilot reset ${locator.operationId} ${locator.action} ${locator.nonce} ${mode}`;}
async function findOriginalRun(input,mode){
 const runs=await api(`actions/workflows/${path.posix.basename(LOCAL_DISPATCH_WORKFLOW)}/runs?event=workflow_dispatch&branch=main&per_page=100`);
 if(!Array.isArray(runs.workflow_runs))fail('run_listing_invalid');
 const matches=runs.workflow_runs.filter(r=>r.display_title===localCustodyRunTitle(input.locator,mode)&&r.head_sha===input.payload.packet.operation.mainSha&&r.event==='workflow_dispatch'&&r.path===LOCAL_DISPATCH_WORKFLOW&&r.repository?.full_name===LOCAL_DISPATCH_REPOSITORY);
 if(matches.length>1||matches.some(r=>r.run_attempt!==1))fail('ambiguous_original_run');return matches[0]??null;
}

async function bootstrapLocalDispatchHeld(r){
 const input=await load(r),{locator,payload}=input,store=await openFixedLocalDispatchJournal(),coordinator=createManualResetCoordinator({store});
 await enrollmentReady();
 const key=randomBytes(32),archiveId=randomUUID();
 try{
  const sealed=await encryptLocalBackup(keyId,Buffer.from(JSON.stringify({format:'nestory-local-transfer-secret-v1',locator,inputArchiveId:r.inputArchiveId,inputArchiveSha256:r.inputArchiveSha256,keyBase64:key.toString('base64')})));
  await writePrivateBackupFile(archiveId,'archive.pgp',sealed);
  const claim={format:'nestory-manual-reset-bootstrap-claim-v1',...locator,mainSha:payload.packet.operation.mainSha,packetSha256:payload.packet.packetSha256,
   payloadSha256:digestDatabaseJson(payload),transferArchiveId:archiveId,transferArchiveSha256:hashBytes(sealed)};
  await coordinator.recordBootstrapClaim(claim);
  const credential=await serviceCredential();await privateBucket(credential);
  const placeholder=encryptLocalCustodyTransfer({format:'nestory-local-custody-waiting-v1',...locator},key,locator),object=`object/${LOCAL_CUSTODY_BUCKET}/${localCustodyObjectPath(locator)}`;
  await storage('POST',object,credential,placeholder,{'Content-Type':'application/octet-stream','cache-control':'max-age=0','x-upsert':'false'});
  const observed=await storage('GET',object,credential);if(!observed.equals(placeholder))fail('placeholder_readback_failed');
  await enroll(await signedUrl(credential,locator),key);
  // Persist a distinct permanent claim BEFORE the single workflow POST.
  await record(store,`${prefix(locator)}/workflow-post`,{format:'nestory-local-workflow-post-v1',...locator,mainSha:claim.mainSha});
  try{await api(`actions/workflows/${path.posix.basename(LOCAL_DISPATCH_WORKFLOW)}/dispatches`,{ref:'main',inputs:{operation_id:locator.operationId,nonce:locator.nonce,action:locator.action,mode:'execute',original_run_id:'none'}});}catch{/* Only discover original run; never POST again. */}
  return {status:'inert-dispatch-claimed',...locator,automaticRetryAllowed:false};
 }finally{key.fill(0);}
}
async function discoverLocalDispatchHeld(r){
 const input=await load(r,{historical:true}),store=await openFixedLocalDispatchJournal(),claim=await required(store,`${prefix(input.locator)}/claim`);
 await required(store,`${prefix(input.locator)}/workflow-post`);
 const run=await findOriginalRun(input,'execute');if(!run)return {status:'original-run-not-found-do-not-redispatch',...input.locator};
 const key=`${prefix(input.locator)}/response`,prior=await store.read(key);
 if(prior){const p=JSON.parse(prior);if(p.runId!==run.id||p.runAttempt!==1)fail('original_run_changed');}
 else await createManualResetCoordinator({store}).recordBootstrapResponse({...input.locator,bootstrapClaimSha256:digestJson(claim),runId:run.id,runAttempt:1});
 const waitingWorkerReady=run.status==='in_progress'&&localDispatchWorkerWaiting(await api('actions/runs/'+run.id+'/attempts/1/jobs?per_page=100'),run,input.payload.packet.operation.mainSha);
 return {status:'original-run-enrolled',...input.locator,runId:run.id,runAttempt:1,githubStatus:run.status,waitingWorkerReady};
}
export function localDispatchWorkerWaiting(jobs,run,mainSha){
 if(!Array.isArray(jobs?.jobs)||jobs.total_count!==jobs.jobs.length)fail('waiting_worker_not_ready');
 return jobs.jobs.filter(j=>j.name==='Pilot reset local custody'&&j.status==='in_progress'&&j.run_id===run.id&&j.run_attempt===1&&
   j.head_sha===mainSha&&Array.isArray(j.steps)&&j.steps.some(s=>s.name==='Wait for exact run ticket and execute once'&&s.status==='in_progress')).length===1;
}
async function publishLocalDispatchHeld(r,authorizationId,prepared){
 if(!uuid.test(authorizationId))fail('authorization_invalid');
 const input=prepared?.input??await load(r),{locator,payload}=input,store=await openFixedLocalDispatchJournal(),coordinator=createManualResetCoordinator({store});
 const enrolled=await required(store,`${prefix(locator)}/response`),run=await findOriginalRun(input,'execute');
 if(!run||run.id!==enrolled.runId||run.status!=='in_progress')fail('original_run_not_active');
 const jobs=await api(`actions/runs/${run.id}/attempts/1/jobs?per_page=100`);
 if(!localDispatchWorkerWaiting(jobs,run,payload.packet.operation.mainSha))fail('waiting_worker_not_ready');
 const secret=await transfer(store,locator);
 try{
  if(secret.data.inputArchiveId!==r.inputArchiveId||secret.data.inputArchiveSha256!==r.inputArchiveSha256||secret.claim.payloadSha256!==digestDatabaseJson(payload))fail('original_input_changed');
  // Prepared execution proves remote containment before any signing-key unwrap,
  // then repeats the original placeholder check immediately before publication.
  let credential;
  const object=`object/${LOCAL_CUSTODY_BUCKET}/${localCustodyObjectPath(locator)}`;
  if(prepared){
   credential=await serviceCredential();await privateBucket(credential);
   const waiting=decryptLocalCustodyTransfer(await storage('GET',object,credential),secret.key,locator);
   if(canonicalJson(waiting)!==canonicalJson({format:'nestory-local-custody-waiting-v1',...locator}))fail('placeholder_changed');
  }
  const sql=localCustodyMutationSql({binding:payload.binding,action:locator.action,authorizationId,authoritySha256:input.authoritySha256,observation:payload.observation,artifacts:payload.artifacts,recovery:payload.recovery});
  const transportIntent={format:'nestory-hosted-reset-action-intent-v1',operationId:locator.operationId,packetSha256:payload.packet.packetSha256,action:locator.action,
   bindingSha256:digestJson(payload.binding),authorizationId,authoritySha256:input.authoritySha256,sourceObservationSha256:digestDatabaseJson(payload.observation),sqlSha256:digestJson(sql)};
  const document={format:'nestory-manual-reset-intent-v1',mainSha:payload.packet.operation.mainSha,inputBundleSha256:digestDatabaseJson(payload),custody:input.custody,transportIntent};
  await record(store,`financial-reset/${locator.operationId}/manual-stage/${locator.action}/stage-evidence`,{format:'nestory-local-stage-evidence-record-v1',
   operationId:locator.operationId,packetSha256:payload.packet.packetSha256,stageAuthority:input.stageAuthority,reviewArtifacts:input.reviewArtifacts});
  await record(store,`financial-reset/${locator.operationId}/manual-stage/${locator.action}/custody-evidence`,{format:'nestory-local-dispatch-evidence-record-v1',operationId:locator.operationId,packetSha256:payload.packet.packetSha256,evidence:input.custodyEvidence});
  const {intentSha256}=await coordinator.recordIntent(document),{claimSha256}=await coordinator.claimDispatch({operationId:locator.operationId,action:locator.action,intentSha256});
  await coordinator.recordDispatchResponse({operationId:locator.operationId,action:locator.action,intentSha256,runId:run.id,runAttempt:1});
  const issuedAt=new Date(),{format:ignored,...transport}=transportIntent;void ignored;
  const ticket=buildDispatchTicket({...transport,mainSha:document.mainSha,runId:String(run.id),nonce:locator.nonce,
   issuedAt:issuedAt.toISOString(),expiresAt:new Date(issuedAt.getTime()+300000).toISOString(),intentSha256,claimSha256,custodySha256:digestJson(input.custody),custodyEvidenceSha256:input.custody.evidenceRecordSha256},payload);
  const bundle=await signLocalDispatchBundle({keyId,ticket,payload,...(prepared?{preparedCustody:prepared.custodyReceipt}:{})}),cipher=encryptLocalCustodyTransfer(bundle,secret.key,locator);
  credential??=await serviceCredential();await privateBucket(credential);
  const previous=decryptLocalCustodyTransfer(await storage('GET',object,credential),secret.key,locator);
  if(canonicalJson(previous)!==canonicalJson({format:'nestory-local-custody-waiting-v1',...locator}))fail('placeholder_changed');
  const publicationArchiveId=randomUUID(),sealed=await encryptLocalBackup(keyId,cipher);await writePrivateBackupFile(publicationArchiveId,'archive.pgp',sealed);
  await record(store,`${prefix(locator)}/publish-claim`,{format:'nestory-local-ticket-publication-v1',runId:run.id,intentSha256,
   publicationArchiveId,publicationArchiveSha256:hashBytes(sealed),ciphertextSha256:hashBytes(cipher)});
  if(prepared){await prepared.lease.check();await assertPreparedLocalRecoveryEvidenceHeld(prepared.custodyReceipt);}
  try{await storage('PUT',object,credential,cipher,{'Content-Type':'application/octet-stream','cache-control':'max-age=0'});}catch{/* Read original outcome only. */}
  if(hashBytes(await storage('GET',object,credential))!==hashBytes(cipher))fail('publication_unknown_do_not_retry');
  return {status:'exact-run-ticket-published',...locator,runId:run.id,intentSha256,ciphertextSha256:hashBytes(cipher),automaticRetryAllowed:false};
 }finally{secret.key.fill(0);}
}

// Separate instances cannot mint handles for the fixed production lifecycle.
// Ports support synthetic lifecycle tests, never caller-supplied production I/O.
export function createLocalPublicationLifecycle({prepare,check,publish,dispose}){
 const handles=new WeakMap();
 const get=handle=>{const state=handles.get(handle);if(!state||state.closed||state.busy||state.used)fail('prepared_publication_invalid');return state;};
 const close=async(handle)=>{const state=handles.get(handle);if(!state||state.closed)return;state.closed=true;try{await dispose(state.value)}finally{state.value=null;}};
 return Object.freeze({
  async prepare(r){
   request(r);r=structuredClone(r);const value=await prepare(r);
   const handle=Object.freeze({format:'nestory-prepared-local-publication-v1'});
   const ready=Object.freeze({status:'prepared-awaiting-authorization',operationId:value.input.locator.operationId,action:value.input.action,
    nonce:r.nonce,packetSha256:value.input.payload.packet.packetSha256});
   handles.set(handle,{value,request:r,ready,used:false,busy:false,closed:false});return {handle,ready};
  },
  inspect(handle){return {...get(handle).ready};},
  async check(handle){
   const state=get(handle);state.busy=true;const start=performance.now();
   try{await check(state.value,state.request);return {status:'prepared-integrity-verified',elapsedMs:Math.round(performance.now()-start)};}
   catch(error){await close(handle);throw error;}finally{state.busy=false;}
  },
  async finish(handle,authorizationId){
   const state=get(handle);state.used=true;
   try{
    if(!uuid.test(authorizationId))fail('authorization_invalid');
    await check(state.value,state.request);
    return await publish(state.value,state.request,authorizationId);
   }finally{await close(handle);}
  },
  dispose:close,
 });
}
const custodyArgs=input=>({evidence:input.custodyEvidence,custody:input.custody,packet:input.payload.packet,artifacts:input.payload.artifacts,observation:input.payload.observation});
async function preparePublication(r){
 const {holdBusinessSpillCustody}=await import('./local-backup-business-runtime.mjs');const lease=await holdBusinessSpillCustody();let custodyReceipt;
 try{
  const input=await load(r); // Existing first full semantic verification.
  custodyReceipt=await prepareSavedLocalRecoveryEvidence(custodyArgs(input),r); // Existing signer's full verification, now before authorization.
  const value={input,custodyReceipt,lease};await checkPublication(value,r);return value;
 }catch(error){try{if(custodyReceipt)await disposePreparedLocalRecoveryEvidence(custodyReceipt)}finally{await lease.close();}throw error;}
}
async function checkPublication(value,r){
 const {input,custodyReceipt,lease}=value,{payload,locator}=input;
 await lease.check();
 if(locator.nonce!==r.nonce||assertLocalDispatchStageAuthority({packet:payload.packet,artifacts:payload.artifacts,reviews:input.reviewArtifacts,
  action:input.action,observation:payload.observation,authority:input.stageAuthority})!==input.authoritySha256)fail('stage_evidence_changed');
 const checks=await Promise.allSettled([
  assertPreparedLocalRecoveryEvidence(custodyReceipt,custodyArgs(input),r.nonce),
  (async()=>{
   if((await api('commits/main')).sha!==payload.packet.operation.mainSha)fail('main_changed');
   const store=await openFixedLocalDispatchJournal(),enrolled=await required(store,`${prefix(locator)}/response`),run=await findOriginalRun(input,'execute');
   if(!run||run.id!==enrolled.runId||run.status!=='in_progress')fail('original_run_not_active');
   if(!localDispatchWorkerWaiting(await api(`actions/runs/${run.id}/attempts/1/jobs?per_page=100`),run,payload.packet.operation.mainSha))fail('waiting_worker_not_ready');
  })(),
 ]);
 const failed=checks.find(result=>result.status==='rejected');if(failed)throw failed.reason;
 await lease.check();
}
const publications=createLocalPublicationLifecycle({prepare:preparePublication,check:checkPublication,
 publish:(value,r,authorizationId)=>publishLocalDispatchHeld(r,authorizationId,value),
 dispose:async value=>{try{await disposePreparedLocalRecoveryEvidence(value.custodyReceipt)}finally{await value.lease.close();}}
});
export const prepareLocalDispatchPublication=r=>publications.prepare(r);
export const inspectLocalDispatchPublication=handle=>publications.inspect(handle);
export const checkLocalDispatchPublication=handle=>publications.check(handle);
export const finishLocalDispatchPublication=(handle,authorizationId)=>publications.finish(handle,authorizationId);
export const disposeLocalDispatchPublication=handle=>publications.dispose(handle);

async function dispatchLocalReconciliationHeld(r){
 // This POST creates only a fixed read-only worker; it cannot publish a new
 // ticket or issue SQL. It still requires review of the complete route.

 const input=await load(r,{historical:true}),{locator}=input,store=await openFixedLocalDispatchJournal();
 const original=await required(store,`${prefix(locator)}/response`),published=await required(store,`${prefix(locator)}/publish-claim`),secret=await transfer(store,locator);
 try{
  if(published.runId!==original.runId)fail('original_run_changed');
  const credential=await serviceCredential();await privateBucket(credential);
  if(hashBytes(await storage('GET',`object/${LOCAL_CUSTODY_BUCKET}/${localCustodyObjectPath(locator)}`,credential))!==published.ciphertextSha256)fail('original_ticket_changed');
  await enroll(await signedUrl(credential,locator),secret.key);
  await record(store,`${prefix(locator)}/reconcile-post`,{format:'nestory-local-reconcile-post-v1',...locator,originalRunId:original.runId,intentSha256:published.intentSha256});
  try{await api(`actions/workflows/${path.posix.basename(LOCAL_DISPATCH_WORKFLOW)}/dispatches`,{ref:'main',inputs:{operation_id:locator.operationId,nonce:locator.nonce,action:locator.action,mode:'reconcile',original_run_id:String(original.runId)}});}catch{/* Discover original read-only run; never dispatch another. */}
  return {status:'read-only-reconciliation-dispatch-claimed',...locator,originalRunId:original.runId,automaticRetryAllowed:false};
 }finally{secret.key.fill(0);}
}

export function extractLocalCustodyReceipt(logText,expected){
 if(typeof logText!=='string'||Buffer.byteLength(logText)>2*1024*1024)fail('log_limit');
 const values=[];
 for(const line of logText.split(/\r?\n/)){
  const [job,step,...rest]=line.split('\t');
  if(job!=='Pilot reset local custody'||step!=='Wait for exact run ticket and execute once')continue;
  const text=rest.join('\t'),start=text.indexOf('{');if(start<0)continue;
  let value;try{value=JSON.parse(text.slice(start))}catch{continue}
  if(value.format==='nestory-local-custody-result-v1')values.push(value);
 }
 if(values.length!==1)fail('receipt_missing_or_ambiguous');const r=values[0];
 const fields=['format','operationId','action','runId','runAttempt','intentSha256','outcome','mutationRetried','observationSha256','checkpointSha256','normalWritesReopened'];
 if(!exact(r,expected.mode==='reconcile'?[...fields,'reconciledByRunId','historicalReadOnly']:fields)||r.operationId!==expected.operationId||r.action!==expected.action||
  r.runId!==String(expected.originalRunId)||r.runAttempt!==1||r.intentSha256!==expected.intentSha256||r.mutationRetried!==false||
  !['committed-and-verified','not-proven-do-not-retry'].includes(r.outcome)||!hash.test(r.observationSha256)||
  !(r.checkpointSha256===null||hash.test(r.checkpointSha256))||![false,null].includes(r.normalWritesReopened)||
  expected.mode==='reconcile'&&(r.reconciledByRunId!==String(expected.actualRunId)||r.historicalReadOnly!==true))fail('receipt_changed');
 return r;
}
async function collectLocalDispatchReceiptHeld(r,mode='execute'){
 if(!['execute','reconcile'].includes(mode))fail('mode_invalid');
 const input=await load(r,{historical:true}),{locator}=input,store=await openFixedLocalDispatchJournal(),published=await required(store,`${prefix(locator)}/publish-claim`);
 if(mode==='reconcile')await required(store,`${prefix(locator)}/reconcile-post`);
 const run=await findOriginalRun(input,mode);if(!run||run.status!=='completed')return {status:'original-run-not-complete',...locator};
 if(mode==='execute'&&run.id!==published.runId)fail('original_run_changed');
 const jobs=await api(`actions/runs/${run.id}/attempts/1/jobs?per_page=100`);
 if(!Array.isArray(jobs.jobs)||jobs.total_count!==jobs.jobs.length)fail('jobs_incomplete');
 const matches=jobs.jobs.filter(j=>j.name==='Pilot reset local custody');
 if(matches.length!==1||matches[0].run_id!==run.id||matches[0].run_attempt!==1||matches[0].head_sha!==input.payload.packet.operation.mainSha||matches[0].status!=='completed')fail('job_unverified');
 const logs=await command(['run','view',String(run.id),'--repo',LOCAL_DISPATCH_REPOSITORY,'--job',String(matches[0].id),'--log']);
 const receipt=extractLocalCustodyReceipt(logs.toString('utf8'),{...locator,mode,originalRunId:published.runId,actualRunId:run.id,intentSha256:published.intentSha256});logs.fill(0);
 const receiptSha256=digestJson(receipt),receiptKey=`${prefix(locator)}/worker-receipt/${receiptSha256}`;
 const prior=await store.read(receiptKey);if(prior){if(hashBytes(prior)!==receiptSha256)fail('receipt_changed');}
 else await record(store,receiptKey,receipt);
 const coordinator=createManualResetCoordinator({store});
 const summary={operationId:locator.operationId,action:locator.action,intentSha256:published.intentSha256,
  runId:published.runId,runAttempt:1,receiptSha256,observationSha256:receipt.observationSha256,outcome:receipt.outcome};
 const retained=await store.read(`financial-reset/${locator.operationId}/manual-stage/${locator.action}/reconciliation/${receiptSha256}`);
 if(retained){if(retained.toString('utf8')!==canonicalJson({format:'nestory-manual-reset-reconciliation-record-v1',...summary}))fail('retained_receipt_changed');}
 else await coordinator.recordReconciliation(summary);
 return {status:'authenticated-worker-receipt-retained',...receipt,receiptSha256};
}

export async function bootstrapLocalDispatch(r){request(r);return held(()=>bootstrapLocalDispatchHeld(r));}
export async function discoverLocalDispatch(r){request(r);return held(()=>discoverLocalDispatchHeld(r));}
export async function publishLocalDispatch(r,authorizationId){request(r);if(!uuid.test(authorizationId))fail('authorization_invalid');return held(()=>publishLocalDispatchHeld(r,authorizationId));}
export async function dispatchLocalReconciliation(r){request(r);return held(()=>dispatchLocalReconciliationHeld(r));}
export async function collectLocalDispatchReceipt(r,mode='execute'){request(r);if(!['execute','reconcile'].includes(mode))fail('mode_invalid');return held(()=>collectLocalDispatchReceiptHeld(r,mode));}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const action=process.argv[2];if(process.argv.length!==3||!['bootstrap','discover','publish','reconcile','collect','collect-reconciliation'].includes(action))fail('command_invalid');
  const parts=[];let size=0;for await(const b of process.stdin){size+=b.length;if(size>2048)fail('request_limit');parts.push(b)}
  const input=JSON.parse(Buffer.concat(parts));let result;
  if(action==='publish'){
   if(!exact(input,['request','authorizationId']))fail('request_invalid');result=await publishLocalDispatch(input.request,input.authorizationId);
  }else if(action==='bootstrap')result=await bootstrapLocalDispatch(input);
  else if(action==='discover')result=await discoverLocalDispatch(input);
  else if(action==='reconcile')result=await dispatchLocalReconciliation(input);
  else result=await collectLocalDispatchReceipt(input,action==='collect'?'execute':'reconcile');
  console.log(JSON.stringify(result));
 }catch{console.error(JSON.stringify({status:'stopped',code:'local_dispatch_stopped',automaticRetryAllowed:false}));process.exitCode=1;}
}
