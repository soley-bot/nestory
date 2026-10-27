// Reopens only UUID-addressed private-C artifacts from the existing producer.
// Customer row images remain in process memory. Rehydration supplies planning
// provenance, never live actor authority or permission to dispatch a mutation.
import {readFile,readdir} from 'node:fs/promises';
import {backupHash,readPrivateBackupFile,decryptLocalBackup,decryptLocalBackupChunks,loadRecoveryPublicKey} from './local-backup-crypto.mjs';
import {verifyCaptureChunk,verifyCaptureCompleteness} from './local-backup-capture.mjs';
import {validateBusinessSnapshot} from './local-backup-business-restore.mjs';
import {assertBusinessRestoreRequest,assertBusinessRehearsalInputReference,assertBusinessRehearsalVerification,readBusinessRuntimeSourcePins} from './local-backup-business-runtime.mjs';
import {createPilotRamRehearsalPlanner} from './local-backup-ram-rehearsal-plan.mjs';
import {bindPilotRehearsalSemantics} from './local-backup-packet-bridge.mjs';
import {buildRamRehearsalVerificationSql} from './local-backup-business-rehearsal-sql.mjs';
import {digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const same=(a,b)=>digestDatabaseJson(a)===digestDatabaseJson(b),hash=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail=()=>{throw Error('local_saved_rehearsal_unverified')};
const contexts=new WeakMap(),decode=b=>JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v};
function execution(value,phase,operationId,actionCount,checkpointSha256){
 const recovered=phase==='recovered',generation=recovered?2:1,kind=recovered?'phase-recovery':'checked-reports';
 if(!exact(value,['format','operationId','status','generation','actionCount','appliedCount','knownZeroVerified','recoveryVerified','checkpoint',
  'authorityKind','productionPermissionProven','productionForeignDataProven','controlReopened',...(recovered?[]:['authorityTiming'])])||value.format!==`nestory-local-ram-${recovered?'inverse':'reset'}-execution-v1`||
  value.operationId!==operationId||value.status!=='actions_complete'||value.generation!==generation||value.actionCount!==actionCount||value.appliedCount!==actionCount||
  value[recovered?'recoveryVerified':'knownZeroVerified']!==true||typeof value[recovered?'knownZeroVerified':'recoveryVerified']!=='boolean'||
  value.authorityKind!=='local-sql-session-fixture'||value.productionPermissionProven!==false||value.productionForeignDataProven!==false||value.controlReopened!==false||
  !exact(value.checkpoint,['kind','sha256','generation','resultSha256'])||value.checkpoint.kind!==kind||value.checkpoint.generation!==generation||
  !hash.test(checkpointSha256)||value.checkpoint.sha256!==checkpointSha256||value.checkpoint.resultSha256!==checkpointSha256)fail();
 if(!recovered){const timing=value.authorityTiming;
  if(!exact(timing,['consumedAgeSeconds','remainingSeconds'])||!Number.isFinite(timing.consumedAgeSeconds)||!Number.isFinite(timing.remainingSeconds)||
   timing.consumedAgeSeconds<0||timing.remainingSeconds<=0||timing.consumedAgeSeconds+timing.remainingSeconds>300+1e-6)fail();
 }
}
export function rehydrateSavedPilotRehearsal({manifestBytes,proof,rehearsalInputs,inverseInputs}){
 const r=rehearsalInputs,i=inverseInputs,p=proof;
 if(!exact(r,['format','businessArchive','operationId','preview','materialization','fixture','phases','rehearsal'])||r.format!=='nestory-local-business-rehearsal-inputs-v1'||
  !exact(i,['format','businessArchive','operationId','recoveryId','inverseInputs','canonicalInverse'])||i.format!=='nestory-local-business-inverse-inputs-v1'||
  !same(r.businessArchive,i.businessArchive)||!uuid.test(r.operationId)||i.operationId!==r.operationId||!uuid.test(i.recoveryId)||i.recoveryId===r.operationId)fail();
 const request=assertBusinessRestoreRequest(r.businessArchive),{snapshot}=validateBusinessSnapshot(manifestBytes,request.sourceSha256);
 if(p.format!=='nestory-local-business-ram-restore-proof-v1'||p.financialResetInverseProven!==true||p.rehearsalInputsFreshProcessVerified!==true||
  p.archiveId!==request.archiveId||p.archiveSha256!==request.archiveSha256||p.sourceSha256!==request.sourceSha256||p.keyId!==request.keyId||
  p.canonicalRowsVerified!==true||p.foreignKeysVerified!==true||p.foreignOrganizationRows!==0||p.syntheticOnly===true)fail();
 const planner=createPilotRamRehearsalPlanner({manifestBytes,expectedSourceSha256:request.sourceSha256,operationId:r.operationId});
 const plan=planner.acceptMaterialization(r.preview,r.materialization),phases=r.phases;
 if(typeof phases?.fixtureTransactionId!=='string'||! /^[1-9][0-9]{0,18}$/.test(phases.fixtureTransactionId)||
  BigInt(phases.fixtureTransactionId)>9223372036854775807n)fail();
 const rehearsal=bindPilotRehearsalSemantics(plan,{zeroPlan:phases.zeroPlan,zeroPlanText:phases.zeroPlanText,continuationPlan:phases.continuationPlan,reportPlan:phases.reportPlan});
 if(!same(rehearsal,r.rehearsal)||!same(rehearsal,p.rehearsal))fail();
 const result=p.resetInverseResult,b=rehearsal.binding,contracts=phases.continuationPlan.contracts_sha256;
 if(!exact(result,['format','operationId','recoveryId','authorityKind','productionPermissionProven','productionForeignDataProven','fixture','before',
  'reset','resetVerification','resetStorage','inverse','recovered','recoveredStorage','transition','recoveryBaseline','executionBaseline'])||
  result.format!=='nestory-local-business-reset-inverse-result-v1'||result.operationId!==r.operationId||result.recoveryId!==i.recoveryId||
  result.authorityKind!=='local-sql-session-fixture'||result.productionPermissionProven!==false||result.productionForeignDataProven!==false||
  !same(result.recoveryBaseline,b.recoveryBaseline)||!same(result.executionBaseline,b.executionBaseline)||
  !same(result.fixture,{format:'nestory-local-synthetic-actor-fixture-v1',actorCount:1,sessionCount:1,fixtureTransactionId:phases.fixtureTransactionId,authorityKind:'local-sql-session-fixture',productionPermissionProven:false,customerAuthImpersonated:false})||
  !same(result.before,{contractsSha256:contracts,censusAlgorithm:'sha256-of-concatenated-row-sha256-ordered-by-postgresql-primary-key-text',
   tableCensus:snapshot.tables.filter(t=>t.capture==='full-row-image').map(t=>({table_name:t.table_name,row_count:t.row_count,rows_sha256:t.rows_sha256}))})||
  !exact(result.transition,['name','sha256'])||result.transition.name!=='20261027005615_financial_reset_empty_books_preserved_contracts.sql'||!hash.test(result.transition.sha256))fail();
 for(const[value,phase]of [[result.resetVerification,'reset'],[result.recovered,'recovered']])assertBusinessRehearsalVerification(value,phase,contracts);
 for(const value of [result.resetStorage,result.recoveredStorage])if(!same(value,{metadataRows:snapshot.storageMetadata.length,bucketRows:snapshot.storageBucketMetadata.length,exactMetadataVerified:true,physicalFileBytesVerified:false}))fail();
 execution(result.reset,'reset',r.operationId,plan.actions.length,result.resetVerification.checkpointSha256);
 execution(result.inverse,'recovered',i.recoveryId,i.canonicalInverse.actions.length,result.recovered.checkpointSha256);
 if(i.inverseInputs.phaseBinding.report_checkpoint_sha256!==result.resetVerification.checkpointSha256||
  i.inverseInputs.phaseBinding.schema_sha256!==b.executionBaseline.schemaSha256||i.inverseInputs.phaseBinding.zero_review_sha256!==backupHash(phases.zeroPlanText))fail();
 // Native review binds the full DB-canonical plan including post-zero source.
 // Its hash is distinct from the actor-bound semantic digest.
 if(typeof i.inverseInputs.continuationReviewText!=='string'||backupHash(i.inverseInputs.continuationReviewText)!==i.inverseInputs.phaseBinding.continuation_review_sha256)fail();
 const{source_sha256,...continuation}=JSON.parse(i.inverseInputs.continuationReviewText);
 if(source_sha256!==i.inverseInputs.phaseBinding.continuation_before_sha256||!same(continuation,phases.continuationPlan))fail();
 // Reuse the actual producer's complete input validators. These strings are
 // discarded without execution; only the saved actual DB proof proves results.
 for(const phase of ['reset','recovered'])buildRamRehearsalVerificationSql({plan,planBinding:b,fixture:r.fixture,phases,
  inverseInputs:i.inverseInputs,recoveryId:i.recoveryId,canonicalInverse:i.canonicalInverse,phase});
 const context=Object.freeze({format:'nestory-rehydrated-pilot-rehearsal-v1',operationId:r.operationId,sourceSha256:request.sourceSha256,
  productionPermissionProven:false,productionForeignDataProven:false,operationalCustodyVerified:false,nativeContinuationReadbackVerified:true});
 contexts.set(context,{plan,phases:freeze(structuredClone(phases)),rehearsal,snapshot:freeze(structuredClone(snapshot)),request:freeze(structuredClone(request)),
  proof:freeze(structuredClone(p)),manifestBytes:Buffer.from(manifestBytes)});return context;
}
export function inspectSavedPilotRehearsal(context){const value=contexts.get(context);if(!value)fail();const{custody,...view}=value;void custody;return Object.freeze({...view,manifestBytes:Buffer.from(value.manifestBytes)});}
export async function assertSavedPilotRehearsalHeld(context){const value=contexts.get(context);if(!value?.custody)fail();await value.custody.check();return true;}
export async function disposeSavedPilotRehearsal(context){const value=contexts.get(context);if(!value)fail();value.manifestBytes.fill(0);contexts.delete(context);
 if(value.custody)try{await value.custody.check()}finally{await value.custody.close()}}
async function opened(reference,keyId){
 assertBusinessRehearsalInputReference(reference,keyId);let cipher,plain;
 try{cipher=await readPrivateBackupFile(reference.archiveId,'archive.pgp');if(backupHash(cipher)!==reference.archiveSha256)fail();plain=await decryptLocalBackup(keyId,cipher);
  if(plain.length!==reference.plaintextBytes||backupHash(plain)!==reference.plaintextSha256)fail();return decode(plain);
 }finally{cipher?.fill(0);plain?.fill(0)}
}
export async function openSavedPilotRehearsal({proofId,proofSha256,keyId}){
 if(!uuid.test(proofId)||!hash.test(proofSha256)||!uuid.test(keyId))fail();
 const bytes=await readPrivateBackupFile(proofId,'proof.json');if(bytes.length>262144||backupHash(bytes)!==proofSha256)fail();const proof=decode(bytes);
 if(proof.proofId!==proofId||proof.keyId!==keyId||proof.parentCleanupVerified!==true||proof.ownedContainerRemoved!==true||proof.freshProcessDecryption!==true||
  !same(proof.sourcePins,await readBusinessRuntimeSourcePins()))fail();
 const childBytes=await readPrivateBackupFile(proof.childProofId,'proof.json');if(backupHash(childBytes)!==proof.childProofSha256)fail();const child=decode(childBytes);
 const{proofId:parentId,childProofId,childProofSha256,parentPid,parentCleanupVerified,rehearsalInputsFreshProcessVerified,...parent}=proof;
 void parentId;void childProofId;void childProofSha256;void parentPid;void parentCleanupVerified;
 const{proofId:childId,...body}=child;if(childId!==proof.childProofId||rehearsalInputsFreshProcessVerified!==true||!same(parent,body))fail();
 // Require the same concrete held spill guard as the original restore. The
 // export is deliberately mandatory: no fallback to an old proof or Boolean.
 const{holdBusinessSpillCustody}=await import('./local-backup-business-runtime.mjs');if(typeof holdBusinessSpillCustody!=='function')fail();
 const custody=await holdBusinessSpillCustody();let cipher,outer,payload,pendingContext,retained=false;
 try{
  const rehearsalInputs=await opened(proof.rehearsalInputs,keyId),inverseInputs=await opened(proof.inverseInputs,keyId);
  cipher=await readPrivateBackupFile(proof.archiveId,'archive.pgp');if(backupHash(cipher)!==proof.archiveSha256)fail();outer=await decryptLocalBackup(keyId,cipher);const envelope=decode(outer);
  if(!exact(envelope,['format','keyId','before','after','observations'])||envelope.format!=='nestory-encrypted-pilot-capture-package-v1'||envelope.keyId!==keyId||
   envelope.before.sourceSha256!==proof.sourceSha256||!Array.isArray(envelope.observations)||envelope.observations.length>4096)fail();
  if(envelope.before.publicKeySha256!==(await loadRecoveryPublicKey(keyId)).metadata.publicKeySha256)fail();
  const chunks=await decryptLocalBackupChunks(keyId,envelope.observations.map((value,chunkIndex)=>verifyCaptureChunk(value,{...envelope.before,chunkIndex})));
  try{payload=verifyCaptureCompleteness({before:envelope.before,after:envelope.after,observations:envelope.observations,plaintextChunks:chunks})}finally{chunks.forEach(b=>b.fill(0))}
  const context=rehydrateSavedPilotRehearsal({manifestBytes:payload,proof,rehearsalInputs,inverseInputs});pendingContext=context;
  const transition=await readFile(new URL('../supabase/migrations/'+proof.resetInverseResult.transition.name,import.meta.url));
  if(backupHash(transition.toString('utf8').replaceAll('\r\n','\n'))!==proof.resetInverseResult.transition.sha256)fail();
  await custody.check();contexts.get(context).custody=custody;retained=true;return context;
 }finally{cipher?.fill(0);outer?.fill(0);payload?.fill(0);if(!retained){if(pendingContext)await disposeSavedPilotRehearsal(pendingContext);await custody.close()}}
}
export async function readPilotLiveMigrationSources(){
 const directory=new URL('../supabase/migrations/',import.meta.url),files=new Map();
 for(const name of (await readdir(directory)).filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort())files.set('supabase/migrations/'+name,(await readFile(new URL(name,directory),'utf8')).replaceAll('\r\n','\n'));
 const manifest='supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json';files.set(manifest,await readFile(new URL('../'+manifest,import.meta.url),'utf8'));return files;
}
