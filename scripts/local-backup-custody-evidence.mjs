// Fixed private-C evidence admission. Saved proof identity is checked separately
// from its substantive assertions; neither a hash nor this reader performs an
// inverse rehearsal. Operational admission requires every saved producer proof
// and a current bound witness; the independent execution hold remains in force.
import {backupHash,readPrivateBackupFile,decryptLocalBackup,loadRecoveryPublicKey,verifyPrivateBackupCiphertexts} from './local-backup-crypto.mjs';
import {assertStoredLocalFileManifest} from './local-backup-files.mjs';
import {readBusinessRuntimeSourcePins,assertBusinessSpillObservation,assertBusinessRehearsalInputReference} from './local-backup-business-runtime.mjs';
import {assertPilotPacketRehearsalBinding} from './local-backup-packet-bridge.mjs';
import {inspectWindowsResetJournal} from './pilot-finance-reset-windows-journal.mjs';
import {openSavedPilotRehearsal,inspectSavedPilotRehearsal,assertSavedPilotRehearsalHeld,disposeSavedPilotRehearsal} from './local-backup-saved-rehearsal.mjs';
import {openPilotLiveWitnessInputs} from './local-backup-live-input.mjs';
import {assertPilotLivePacketBinding} from './local-backup-live-packet.mjs';
import {holdBusinessSpillCustody} from './local-backup-business-runtime.mjs';
import {verifyHostedPacketSources} from './pilot-finance-reset-hosted-transport.mjs';
import {digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
const hash=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&JSON.stringify(Object.keys(v).sort())===JSON.stringify([...k].sort());
const fail=()=>{throw Error('local_custody_saved_evidence_unverified')};
const roles=['businessRestore','filesRestore','keyRecovery','destinationProtection'];
const decode=b=>JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(b));
export function assertLocalCustodyEvidenceReference(e){
 const live=e?.format==='nestory-local-dispatch-custody-evidence-v2';
 if(!exact(e,['format','keyId','businessArchive',...roles,...(live?['liveWitness']:[])])||!['nestory-local-dispatch-custody-evidence-v1','nestory-local-dispatch-custody-evidence-v2'].includes(e.format)||!uuid.test(e.keyId)||!exact(e.businessArchive,['id','sha256','sourceSha256'])||!uuid.test(e.businessArchive.id)||![e.businessArchive.sha256,e.businessArchive.sourceSha256].every(h=>hash.test(h))||roles.some(r=>
  !exact(e[r],['id','sha256'])||!uuid.test(e[r].id)||!hash.test(e[r].sha256))||new Set(roles.map(r=>e[r].id)).size!==roles.length)fail();
 if(live)assertBusinessRehearsalInputReference(e.liveWitness,e.keyId);return e;
}
export function assertLocalCustodyProofBindings({evidence,custody,packet,proofs,artifacts}){
 assertLocalCustodyEvidenceReference(evidence);
 const keyId=evidence.keyId,{id:archiveId,sha256:archiveSha256,sourceSha256}=evidence.businessArchive;
 if(!exact(proofs,roles)||custody?.operationId!==packet?.operation?.operationId||custody.packetSha256!==packet.packetSha256||
  custody.archiveEnvelopeSha256!==archiveSha256||custody.archivePlaintextSha256!==sourceSha256||
  custody.restoreEvidenceSha256!==evidence.businessRestore.sha256||custody.keyRecoveryEvidenceSha256!==evidence.keyRecovery.sha256)fail();
 const b=proofs.businessRestore,f=proofs.filesRestore,k=proofs.keyRecovery;
 if(custody.privateDestinationReviewSha256!==evidence.destinationProtection.sha256)fail();
 if(b.format!=='nestory-local-business-ram-restore-proof-v1'||b.proofId!==evidence.businessRestore.id||b.archiveId!==archiveId||b.archiveSha256!==archiveSha256||
  b.sourceSha256!==sourceSha256||b.keyId!==keyId||b.freshProcessDecryption!==true||b.parentCleanupVerified!==true||b.ownedContainerRemoved!==true||
  b.canonicalRowsVerified!==true||b.foreignKeysVerified!==true||b.foreignOrganizationRows!==0||!uuid.test(b.childProofId)||!hash.test(b.childProofSha256)||
  !b.sourcePins||!Number.isSafeInteger(b.businessRows)||b.businessRows<1||b.syntheticOnly===true)fail();
 if(f.format!=='nestory-local-files-byte-restore-proof-v1'||f.scope!=='selected-org-business'||f.archiveId!==evidence.filesRestore.id||
  f.sourceSha256!==sourceSha256||f.ciphertextSha256!==custody.filesArchiveSha256||!hash.test(f.planSha256)||
  f.byteRestoreVerified!==true||f.freshProcessByteRestoreVerified!==true||!Number.isSafeInteger(f.objects)||f.objects<0||!Number.isSafeInteger(f.totalBytes)||f.totalBytes<0)fail();
 if(k.format!=='nestory-synthetic-local-crypto-proof-v1'||k.keyId!==keyId||k.archiveId!==evidence.keyRecovery.id||k.freshProcessDecryptionVerified!==true||
  k.tamperDenied!==true||k.offHostKeyRecoveryProven!==false||!hash.test(k.ciphertextSha256))fail();
 // The actual RAM producer adds this field only when its operation is bound.
 // Original restore-only proofs remain inspectable but never admit dispatch.
 if(b.rehearsal!==undefined){
  if(b.rehearsal?.binding?.sourceSha256!==sourceSha256)fail();
  if(evidence.liveWitness){if(b.financialResetInverseProven!==true||b.rehearsalInputsFreshProcessVerified!==true)fail();}
  else assertPilotPacketRehearsalBinding({packet,artifacts,rehearsal:b.rehearsal});
 }
 return true;
}
export function assertLocalDestinationEvidence({proofBytes,spillBefore,spillAfter}){
 if(!(proofBytes instanceof Uint8Array)||proofBytes.length>8192)fail();
 const p=decode(proofBytes);
 if(!exact(p,['Format','ObservedAtUtc','ReadOnly','ElevatedAdministrator','Status','Volumes','RequiredVolumesProtected'])||
  p.Format!=='nestory-bitlocker-status-v1'||p.ReadOnly!==true||p.ElevatedAdministrator!==true||p.Status!=='observed'||
  typeof p.RequiredVolumesProtected!=='boolean'||!Number.isFinite(Date.parse(p.ObservedAtUtc))||!Array.isArray(p.Volumes)||!p.Volumes.length)fail();
 const seen=new Set();for(const v of p.Volumes){
  if(!exact(v,['MountPoint','VolumeStatus','EncryptionPercentage','ProtectionStatus','EncryptionMethod'])||
   !/^[A-Z]:$/.test(v.MountPoint)||seen.has(v.MountPoint))fail();seen.add(v.MountPoint);
 }
 const c=p.Volumes.find(v=>v.MountPoint==='C:');
 if(c?.VolumeStatus!=='FullyEncrypted'||c.EncryptionPercentage!==100||c.ProtectionStatus!=='On'||!['XtsAes128','XtsAes256'].includes(c.EncryptionMethod))fail();
 const normalizedSha256=backupHash(new TextDecoder('utf8',{fatal:true}).decode(proofBytes).replaceAll('\r\n','\n'));
 let previous=Date.parse(p.ObservedAtUtc);
 for(const observation of [spillBefore,spillAfter]){
  if(!observation||observation.bitLockerEvidenceSha256!==normalizedSha256||observation.bitLockerObservedAtUtc!==p.ObservedAtUtc||
   observation.bitLockerEvidenceKind!=='prior-administrator-observation-not-live-automated')fail();
  const{bitLockerEvidenceSha256,bitLockerObservedAtUtc,bitLockerEvidenceKind,...spill}=observation;
  void bitLockerEvidenceSha256;void bitLockerObservedAtUtc;void bitLockerEvidenceKind;
  const at=Date.parse(spill.observedAtUtc);if(!Number.isFinite(at)||at<previous)fail();
  // This verifies the recorded held-check shape at its original time. It does
  // not falsely promote an old observation into a fresh automated volume check.
  assertBusinessSpillObservation(spill,at);previous=at;
 }
 return Object.freeze({volume:'C:',encryptionEvidenceSha256:backupHash(proofBytes),observedAtUtc:p.ObservedAtUtc,
  encryptionEvidenceKind:'prior-administrator-observation-not-live-automated',offHostKeyRecoveryProven:false});
}
async function assertSourcePins(pins){
 const actual=await readBusinessRuntimeSourcePins();
 if(!pins||!exact(pins,Object.keys(actual))||Object.keys(actual).some(name=>pins[name]!==actual[name]))fail();
}
export async function verifySavedLocalRecoveryEvidence({evidence,custody,packet,artifacts,observation}){
 assertLocalCustodyEvidenceReference(evidence);const keyId=evidence.keyId,{id:archiveId,sha256:archiveSha256,sourceSha256}=evidence.businessArchive;const proofs={};
 let destinationBytes;
 for(const role of roles){const bytes=await readPrivateBackupFile(evidence[role].id,'proof.json');
  if(bytes.length>262144||backupHash(bytes)!==evidence[role].sha256)fail();proofs[role]=decode(bytes);if(role==='destinationProtection')destinationBytes=bytes;}
 assertLocalCustodyProofBindings({evidence,custody,packet,proofs,artifacts});
 const business=await readPrivateBackupFile(archiveId,'archive.pgp');if(backupHash(business)!==archiveSha256)fail();business.fill(0);
 const b=proofs.businessRestore,child=await readPrivateBackupFile(b.childProofId,'proof.json');
 if(backupHash(child)!==b.childProofSha256)fail();const childProof=decode(child),{proofId,childProofId,childProofSha256,parentPid,parentCleanupVerified,rehearsalInputsFreshProcessVerified,...parent}=b;
 void proofId;void childProofId;void childProofSha256;void parentPid;void parentCleanupVerified;
 if(b.rehearsal&&rehearsalInputsFreshProcessVerified!==true)fail();
 const {proofId:childId,...childBody}=childProof;if(childId!==b.childProofId||JSON.stringify(parent)!==JSON.stringify(childBody))fail();
 await assertSourcePins(b.sourcePins);
 const destination=assertLocalDestinationEvidence({proofBytes:destinationBytes,spillBefore:b.spillBefore,spillAfter:b.spillAfter});
 const{openFixedLocalDispatchJournal}=await import('./local-backup-dispatch-bundle.mjs');
 const journal=inspectWindowsResetJournal(await openFixedLocalDispatchJournal());
 if(journal.kind!=='windows-create-new-write-through-flush-readback')fail();
 const base={format:'nestory-verified-saved-local-recovery-evidence-v1',businessArchiveSha256:archiveSha256,sourceSha256,
  destination,journal:{storeId:journal.storeId,rootIdentity:journal.rootIdentity,helperSha256:journal.helperSha256},offHostKeyRecoveryProven:false};
 // A restore-only record remains inspectable, but cannot trigger customer
 // decryption or satisfy the later operation/foreign-baseline admission.
 if(!evidence.liveWitness)return Object.freeze({...base,operationalCustodyVerified:false,remainingProofs:['selected-operation-inverse','operation-foreign-baseline']});
 const context=await openSavedPilotRehearsal({proofId:evidence.businessRestore.id,proofSha256:evidence.businessRestore.sha256,keyId});
 try{
 const saved=inspectSavedPilotRehearsal(context);saved.manifestBytes.fill(0);
 const liveBinding=await openPilotLiveWitnessInputs({context,reference:evidence.liveWitness});
 assertPilotLivePacketBinding({plan:saved.plan,liveBinding,rehearsal:saved.rehearsal,packet,artifacts});
 if(custody.foreignBaselineSha256!==liveBinding.materialization.foreignSnapshotSha256||observation?.foreignSha256!==custody.foreignBaselineSha256||
  packet.artifacts.restoreProof?.sha256!==evidence.businessRestore.sha256||packet.artifacts.rehearsalProof?.sha256!==evidence.businessRestore.sha256||
  packet.artifacts.storageProof?.sha256!==evidence.filesRestore.sha256||packet.artifacts.recoveryPlan?.sha256!==b.inverseInputs.archiveSha256)fail();
 await assertSavedPilotRehearsalHeld(context);
 const f=proofs.filesRestore,cipher=await readPrivateBackupFile(f.archiveId,'archive.pgp');if(backupHash(cipher)!==f.ciphertextSha256)fail();
 const plain=await decryptLocalBackup(keyId,cipher);let manifest;
 try{manifest=assertStoredLocalFileManifest(decode(plain));}finally{plain.fill(0);cipher.fill(0)}
 if(manifest.sourceSha256!==sourceSha256||manifest.planSha256!==f.planSha256||manifest.objects.length!==f.objects||manifest.totalBytes!==f.totalBytes)fail();
 await verifyPrivateBackupCiphertexts(manifest.objects.map(({archiveId,ciphertextBytes,ciphertextSha256})=>({archiveId,ciphertextBytes,ciphertextSha256})));
 const k=proofs.keyRecovery,{metadata}=await loadRecoveryPublicKey(keyId),sample=await readPrivateBackupFile(k.archiveId,'synthetic.pgp');
 if(k.keyFingerprint!==metadata.fingerprint||backupHash(sample)!==k.ciphertextSha256)fail();sample.fill(0);
 await assertSavedPilotRehearsalHeld(context);
 return Object.freeze({...base,operationalCustodyVerified:context.nativeContinuationReadbackVerified===true,
  remainingProofs:context.nativeContinuationReadbackVerified===true?[]:['native-continuation-readback']});
 }finally{await disposeSavedPilotRehearsal(context)}
}

// Each factory has its own brands. A synthetic factory cannot mint a receipt
// accepted by the fixed production instance below or by the signer.
export function createPreparedCustodyAdmission({hold,collect,verify,check}){
 const receipts=new WeakMap();
 const binding=value=>digestDatabaseJson(value);
 const get=handle=>{const state=receipts.get(handle);if(!state||state.closed)fail();return state;};
 const close=async handle=>{const state=receipts.get(handle);if(!state||state.closed)return;state.closed=true;try{await state.lease.close()}finally{state.args=null;state.closure=null;}};
 return Object.freeze({
  async prepare(args,request){
   args=structuredClone(args);request=structuredClone(request);const lease=await hold();let handle;
   try{
    const closure=await collect(args,request);
    if((await verify(args)).operationalCustodyVerified!==true)fail();
    await check(closure,args);await lease.check();
    handle=Object.freeze({format:'nestory-prepared-custody-v1'});
    receipts.set(handle,{args,closure,request,binding:binding(args),lease,closed:false,consumed:false});return handle;
   }catch(error){await lease.close();throw error;}
  },
  async assert(handle,args,nonce,{consume=false}={}){
   const state=get(handle);if(state.consumed||state.request.nonce!==nonce||state.binding!==binding(args))fail();
   // Claim before the first await: concurrent finish/sign attempts cannot share it.
   if(consume)state.consumed=true;
   try{await state.lease.check();await check(state.closure,state.args);await state.lease.check();return true;}
   catch(error){await close(handle);throw error;}
  },
  async held(handle){await get(handle).lease.check();return true;},
  close,
 });
}

async function boundedAll(items,work){
 let next=0;
 const results=await Promise.allSettled(Array.from({length:Math.min(4,items.length)},async()=>{
  for(;;){const index=next++;if(index>=items.length)return;await work(items[index]);}
 }));
 if(results.some(result=>result.status==='rejected'))fail();
}
export function preparedCustodyArtifactReferences({evidence,request,proofs,manifest,metadata,metadataSha256}){
 assertLocalCustodyEvidenceReference(evidence);
 if(!exact(request,['inputArchiveId','inputArchiveSha256','nonce'])||!uuid.test(request.inputArchiveId)||!uuid.test(request.nonce)||!hash.test(request.inputArchiveSha256))fail();
 const refs=new Map();
 const add=(id,kind,sha256)=>{
  if(!uuid.test(id)||!hash.test(sha256))fail();const name=id+'.'+kind,prior=refs.get(name);
  if(prior&&prior.sha256!==sha256)fail();refs.set(name,{id,kind,sha256});
 };
 for(const role of roles)add(evidence[role].id,'proof.json',evidence[role].sha256);
 const b=proofs.businessRestore,f=proofs.filesRestore,k=proofs.keyRecovery;
 add(request.inputArchiveId,'archive.pgp',request.inputArchiveSha256);
 add(b.childProofId,'proof.json',b.childProofSha256);
 add(evidence.businessArchive.id,'archive.pgp',evidence.businessArchive.sha256);
 for(const reference of [b.rehearsalInputs,b.inverseInputs,evidence.liveWitness]){
  assertBusinessRehearsalInputReference(reference,evidence.keyId);add(reference.archiveId,'archive.pgp',reference.archiveSha256);
 }
 add(f.archiveId,'archive.pgp',f.ciphertextSha256);add(k.archiveId,'synthetic.pgp',k.ciphertextSha256);
 add(evidence.keyId,'metadata.json',metadataSha256);add(evidence.keyId,'public.asc',metadata.publicKeySha256);add(evidence.keyId,'private.dpapi',metadata.wrappedKeySha256);
 if(manifest.sourceSha256!==evidence.businessArchive.sourceSha256||manifest.planSha256!==f.planSha256||manifest.objects.length!==f.objects||manifest.totalBytes!==f.totalBytes)fail();
 return {refs:[...refs.values()],objects:manifest.objects.map(({archiveId,ciphertextBytes,ciphertextSha256})=>({archiveId,ciphertextBytes,ciphertextSha256}))};
}
export function assertPreparedCustodyArtifactBytes(ref,bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==ref.bytes||backupHash(bytes)!==ref.sha256)fail();return true;
}
async function collectPreparedClosure(args,request){
 const {evidence,packet}=args;assertLocalCustodyEvidenceReference(evidence);
 if(!exact(request,['inputArchiveId','inputArchiveSha256','nonce'])||!uuid.test(request.inputArchiveId)||!uuid.test(request.nonce)||!hash.test(request.inputArchiveSha256))fail();
 const proofs={};for(const role of roles){const bytes=await readPrivateBackupFile(evidence[role].id,'proof.json');
  try{if(bytes.length>262144||backupHash(bytes)!==evidence[role].sha256)fail();proofs[role]=decode(bytes);}finally{bytes.fill(0);}}
 const b=proofs.businessRestore,f=proofs.filesRestore,k=proofs.keyRecovery;
 void k;
 // Pin the key metadata before the unchanged full verifier proves it. All
 // captured bytes are checked again after that verification and before signing.
 const metadataBytes=await readPrivateBackupFile(evidence.keyId,'metadata.json');let metadata,metadataSha256;
 try{metadata=decode(metadataBytes);metadataSha256=backupHash(metadataBytes);}
 finally{metadataBytes.fill(0);}
 const cipher=await readPrivateBackupFile(f.archiveId,'archive.pgp');let plain,manifest;
 try{if(backupHash(cipher)!==f.ciphertextSha256)fail();plain=await decryptLocalBackup(evidence.keyId,cipher);manifest=assertStoredLocalFileManifest(decode(plain));}
 finally{cipher.fill(0);plain?.fill(0);}
 const closure=preparedCustodyArtifactReferences({evidence,request,proofs,manifest,metadata,metadataSha256});
 await boundedAll(closure.refs,async ref=>{const bytes=await readPrivateBackupFile(ref.id,ref.kind);try{if(backupHash(bytes)!==ref.sha256)fail();ref.bytes=bytes.length;}finally{bytes.fill(0);}});
 return {...closure,
  sourcePins:structuredClone(b.sourcePins),packet:structuredClone(packet)};
}
async function checkPreparedClosure(closure){
 const results=await Promise.allSettled([
  boundedAll(closure.refs,async ref=>{const bytes=await readPrivateBackupFile(ref.id,ref.kind);try{assertPreparedCustodyArtifactBytes(ref,bytes);}finally{bytes.fill(0);}}),
  verifyPrivateBackupCiphertexts(closure.objects),assertSourcePins(closure.sourcePins),verifyHostedPacketSources(closure.packet),
 ]);
 if(results.some(result=>result.status==='rejected'))fail();
}
const preparedCustody=createPreparedCustodyAdmission({hold:holdBusinessSpillCustody,collect:collectPreparedClosure,verify:verifySavedLocalRecoveryEvidence,check:checkPreparedClosure});
export const prepareSavedLocalRecoveryEvidence=(args,request)=>preparedCustody.prepare(args,request);
export const assertPreparedLocalRecoveryEvidence=(handle,args,nonce,options)=>preparedCustody.assert(handle,args,nonce,options);
export const assertPreparedLocalRecoveryEvidenceHeld=handle=>preparedCustody.held(handle);
export const disposePreparedLocalRecoveryEvidence=handle=>preparedCustody.close(handle);
