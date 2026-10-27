// Fixed private-C evidence admission. Saved proof identity is checked separately
// from its substantive assertions; neither a hash nor this reader performs an
// inverse rehearsal. Operational admission requires every saved producer proof
// and a current bound witness; the independent execution hold remains in force.
import {backupHash,readPrivateBackupFile,decryptLocalBackup,loadRecoveryPublicKey} from './local-backup-crypto.mjs';
import {assertStoredLocalFileManifest} from './local-backup-files.mjs';
import {readBusinessRuntimeSourcePins,assertBusinessSpillObservation,assertBusinessRehearsalInputReference} from './local-backup-business-runtime.mjs';
import {assertPilotPacketRehearsalBinding} from './local-backup-packet-bridge.mjs';
import {inspectWindowsResetJournal} from './pilot-finance-reset-windows-journal.mjs';
import {openSavedPilotRehearsal,inspectSavedPilotRehearsal,assertSavedPilotRehearsalHeld,disposeSavedPilotRehearsal} from './local-backup-saved-rehearsal.mjs';
import {openPilotLiveWitnessInputs} from './local-backup-live-input.mjs';
import {assertPilotLivePacketBinding} from './local-backup-live-packet.mjs';
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
 for(const object of manifest.objects){const saved=await readPrivateBackupFile(object.archiveId,'archive.pgp');
  try{if(saved.length!==object.ciphertextBytes||backupHash(saved)!==object.ciphertextSha256)fail();}finally{saved.fill(0)}}
 const k=proofs.keyRecovery,{metadata}=await loadRecoveryPublicKey(keyId),sample=await readPrivateBackupFile(k.archiveId,'synthetic.pgp');
 if(k.keyFingerprint!==metadata.fingerprint||backupHash(sample)!==k.ciphertextSha256)fail();sample.fill(0);
 await assertSavedPilotRehearsalHeld(context);
 return Object.freeze({...base,operationalCustodyVerified:context.nativeContinuationReadbackVerified===true,
  remainingProofs:context.nativeContinuationReadbackVerified===true?[]:['native-continuation-readback']});
 }finally{await disposeSavedPilotRehearsal(context)}
}
