import test from 'node:test';import assert from 'node:assert/strict';
import {assertLocalCustodyEvidenceReference,assertLocalCustodyProofBindings,assertLocalDestinationEvidence,
 createPreparedCustodyAdmission,assertPreparedLocalRecoveryEvidence,preparedCustodyArtifactReferences,assertPreparedCustodyArtifactBytes} from './local-backup-custody-evidence.mjs';
import {backupHash} from './local-backup-crypto.mjs';
const h='a'.repeat(64),id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const roles=['businessRestore','filesRestore','keyRecovery','destinationProtection'];
const evidence={format:'nestory-local-dispatch-custody-evidence-v1',keyId:id(8),businessArchive:{id:id(7),sha256:h,sourceSha256:h},
 ...Object.fromEntries(roles.map((r,i)=>[r,{id:id(i+1),sha256:h}]))};
test('custody evidence accepts only bounded UUID proof locators, never arbitrary paths',()=>{
 assert.doesNotThrow(()=>assertLocalCustodyEvidenceReference(evidence));
 for(const bad of [{...evidence,extra:true},{...evidence,businessRestore:{path:'C:\\outside',sha256:h}},
  {...evidence,keyRecovery:{id:evidence.businessRestore.id,sha256:h}}])assert.throws(()=>assertLocalCustodyEvidenceReference(bad));
});
test('live evidence reference binds the same key and bounded immutable encrypted input',()=>{
 const live={...evidence,format:'nestory-local-dispatch-custody-evidence-v2',liveWitness:{keyId:evidence.keyId,archiveId:id(80),archiveSha256:h,plaintextSha256:h,plaintextBytes:2048}};
 assert.doesNotThrow(()=>assertLocalCustodyEvidenceReference(live));
 for(const change of [v=>delete v.liveWitness,v=>v.liveWitness.keyId=id(81),v=>v.liveWitness.path='C:/outside',v=>v.liveWitness.plaintextBytes=0,
  v=>v.liveWitness.archiveSha256='wrong']){const changed=structuredClone(live);change(changed);assert.throws(()=>assertLocalCustodyEvidenceReference(changed));}
});
function fixture(){
 const packet={operation:{operationId:id(9)},packetSha256:h},custody={operationId:id(9),packetSha256:h,archiveEnvelopeSha256:h,
  archivePlaintextSha256:h,restoreEvidenceSha256:h,keyRecoveryEvidenceSha256:h,filesArchiveSha256:h,privateDestinationReviewSha256:h};
 const proofs={businessRestore:{format:'nestory-local-business-ram-restore-proof-v1',proofId:id(1),archiveId:id(7),archiveSha256:h,
  sourceSha256:h,keyId:id(8),freshProcessDecryption:true,parentCleanupVerified:true,ownedContainerRemoved:true,canonicalRowsVerified:true,
  foreignKeysVerified:true,foreignOrganizationRows:0,childProofId:id(10),childProofSha256:h,sourcePins:{},businessRows:42,financialResetInverseProven:false},
 filesRestore:{format:'nestory-local-files-byte-restore-proof-v1',scope:'selected-org-business',archiveId:id(2),sourceSha256:h,
  ciphertextSha256:h,planSha256:h,byteRestoreVerified:true,freshProcessByteRestoreVerified:true,objects:1,totalBytes:5},
 keyRecovery:{format:'nestory-synthetic-local-crypto-proof-v1',keyId:id(8),archiveId:id(3),freshProcessDecryptionVerified:true,tamperDenied:true,
  offHostKeyRecoveryProven:false,ciphertextSha256:h},destinationProtection:{}};
 return {evidence:structuredClone(evidence),custody,packet,proofs};
}
test('existing producer proof fields bind one exact archive and source without claiming inverse success',()=>{
 assert.equal(assertLocalCustodyProofBindings(fixture()),true);
});
function destination(){
 const p={Format:'nestory-bitlocker-status-v1',ObservedAtUtc:'2026-10-27T01:21:32.545Z',ReadOnly:true,ElevatedAdministrator:true,Status:'observed',
  Volumes:[{MountPoint:'C:',VolumeStatus:'FullyEncrypted',EncryptionPercentage:100,ProtectionStatus:'On',EncryptionMethod:'XtsAes128'},
   {MountPoint:'D:',VolumeStatus:'FullyDecrypted',EncryptionPercentage:0,ProtectionStatus:'Off',EncryptionMethod:'None'}],RequiredVolumesProtected:false};
 const proofBytes=Buffer.from(JSON.stringify(p)),spill={format:'nestory-local-business-spill-observation-v1',observedAtUtc:'2026-10-27T02:21:32.545Z',
  configSha256:'d3d609da96b511d8d553315005bc47ee2be8db5c3d4b624f3790e14cafe19697',restartProofSha256:'edb1906efe7e67f8ce272012f820cbbb1f8ab495ef77ca809a14765482c4e0e9',
  wslSwapEntries:0,privateCrashDirectoryVerified:true,ancestorHandlesPinned:true,bitLockerEvidenceSha256:backupHash(proofBytes),
  bitLockerObservedAtUtc:p.ObservedAtUtc,bitLockerEvidenceKind:'prior-administrator-observation-not-live-automated'};
 return{proofBytes,spillBefore:structuredClone(spill),spillAfter:{...spill,observedAtUtc:'2026-10-27T03:21:32.545Z'}};
}
test('C-specific prior administrator evidence permits unrelated D unencrypted without claiming a fresh check',()=>{
 const p=assertLocalDestinationEvidence(destination());assert.equal(p.volume,'C:');assert.equal(p.encryptionEvidenceKind,'prior-administrator-observation-not-live-automated');
 assert.equal(p.offHostKeyRecoveryProven,false);
});
for(const[name,change]of[
 ['swap',p=>p.spillAfter.wslSwapEntries=1],['lost held handles',p=>p.spillAfter.ancestorHandlesPinned=false],
 ['changed historical encryption proof',p=>p.spillBefore.bitLockerEvidenceSha256='b'.repeat(64)],
 ['backwards spill observations',p=>p.spillAfter.observedAtUtc='2026-10-27T01:21:32.545Z'],
 ['false fresh encryption claim',p=>p.spillBefore.bitLockerEvidenceKind='live'],
 ['unprotected C',p=>{const d=JSON.parse(p.proofBytes);d.Volumes[0].ProtectionStatus='Off';p.proofBytes=Buffer.from(JSON.stringify(d))}],
 ['ambiguous duplicate C',p=>{const d=JSON.parse(p.proofBytes);d.Volumes.push(d.Volumes[0]);p.proofBytes=Buffer.from(JSON.stringify(d))}],
])test(`${name} refuses destination evidence`,()=>{const p=destination();change(p);assert.throws(()=>assertLocalDestinationEvidence(p));});
for(const [name,change]of[
 ['business archive changed',f=>f.proofs.businessRestore.archiveSha256='b'.repeat(64)],
 ['stale source',f=>f.proofs.filesRestore.sourceSha256='b'.repeat(64)],
 ['wrong operation',f=>f.custody.operationId=id(11)],
 ['synthetic business proof',f=>f.proofs.businessRestore.syntheticOnly=true],
 ['missing fresh process',f=>f.proofs.businessRestore.freshProcessDecryption=false],
 ['unverified files',f=>f.proofs.filesRestore.freshProcessByteRestoreVerified=false],
 ['foreign rows',f=>f.proofs.businessRestore.foreignOrganizationRows=1],
 ['different recovery key',f=>f.proofs.keyRecovery.keyId=id(11)],
 ['rehearsal bound to stale archive',f=>f.proofs.businessRestore.rehearsal={binding:{sourceSha256:'b'.repeat(64)},semantics:{}}],
 ['asserted rehearsal success without actual binding',f=>f.proofs.businessRestore.rehearsal={binding:{sourceSha256:h},semantics:{verified:true}}],
])test(`${name} cannot satisfy saved recovery evidence`,()=>{const f=fixture();change(f);assert.throws(()=>assertLocalCustodyProofBindings(f));});
test('shape-only custody hashes do not satisfy saved proof semantics',()=>{
 assert.throws(()=>assertLocalCustodyProofBindings({evidence,custody:{operationId:id(9),packetSha256:h},packet:{operation:{operationId:id(9)},packetSha256:h},proofs:Object.fromEntries(roles.map(r=>[r,{verified:true}]))}));
});
test('successful business restore never substitutes for missing inverse or file-byte proof',()=>{
 const proofs=Object.fromEntries(roles.map(r=>[r,{}]));proofs.businessRestore={format:'nestory-local-business-ram-restore-proof-v1',canonicalRowsVerified:true,foreignKeysVerified:true,financialResetInverseProven:false};
 assert.throws(()=>assertLocalCustodyProofBindings({evidence,custody:{},packet:{operation:{operationId:id(9)},packetSha256:h},proofs}));
});

function closureFixture(){
 const f=fixture(),reference=n=>({keyId:id(8),archiveId:id(n),archiveSha256:h,plaintextSha256:h,plaintextBytes:12});
 f.evidence={...f.evidence,format:'nestory-local-dispatch-custody-evidence-v2',liveWitness:reference(13)};
 Object.assign(f.proofs.businessRestore,{rehearsalInputs:reference(11),inverseInputs:reference(12)});
 return {...f,request:{inputArchiveId:id(14),inputArchiveSha256:h,nonce:id(15)},
  metadata:{publicKeySha256:h,wrappedKeySha256:h},metadataSha256:h,
  manifest:{sourceSha256:h,planSha256:h,totalBytes:5,objects:[{archiveId:id(16),ciphertextBytes:9,ciphertextSha256:h}]}};
}
test('prepared closure includes every proof, encrypted input, key identity and attachment',()=>{
 const closure=preparedCustodyArtifactReferences(closureFixture());
 assert.deepEqual(closure.refs.map(r=>`${r.id}.${r.kind}`).sort(),[
  ...[1,2,3,4,10].map(n=>`${id(n)}.proof.json`),...[2,7,11,12,13,14].map(n=>`${id(n)}.archive.pgp`),
  `${id(3)}.synthetic.pgp`,...['metadata.json','public.asc','private.dpapi'].map(kind=>`${id(8)}.${kind}`),
 ].sort());
 assert.deepEqual(closure.objects,[{archiveId:id(16),ciphertextBytes:9,ciphertextSha256:h}]);
});
for(const field of ['rehearsalInputs','inverseInputs'])test(`prepared closure denies missing ${field}`,()=>{
 const f=closureFixture();delete f.proofs.businessRestore[field];assert.throws(()=>preparedCustodyArtifactReferences(f));
});
test('prepared closure denies manifest omission and conflicting ciphertext identity',()=>{
 const f=closureFixture();f.manifest.objects=[];assert.throws(()=>preparedCustodyArtifactReferences(f));
 const g=closureFixture();g.request.inputArchiveId=g.evidence.businessArchive.id;g.request.inputArchiveSha256='b'.repeat(64);
 assert.throws(()=>preparedCustodyArtifactReferences(g));
});
test('late artifact admission rejects same-size tampering, truncation and appended bytes',()=>{
 const bytes=Buffer.from('reviewed'),ref={bytes:bytes.length,sha256:backupHash(bytes)};
 assert.equal(assertPreparedCustodyArtifactBytes(ref,bytes),true);
 for(const altered of [Buffer.from('ReviewEd'),bytes.subarray(1),Buffer.concat([bytes,Buffer.from('!')])])assert.throws(()=>assertPreparedCustodyArtifactBytes(ref,altered));
});
function admissionFixture(){
 let valid=true,leaseValid=true,closed=0,verified=0,checked=0;
 const api=createPreparedCustodyAdmission({hold:async()=>({check:async()=>{if(!leaseValid)throw Error('lease lost')},close:async()=>{closed++}}),
  collect:async args=>structuredClone(args),verify:async()=>{verified++;return {operationalCustodyVerified:true}},
  check:async()=>{checked++;if(!valid)throw Error('bytes or source changed')}});
 return {api,args:{packet:{packetSha256:h},evidence:{proof:h}},request:{nonce:id(15)},
  tamper:()=>{valid=false},loseLease:()=>{leaseValid=false},counts:()=>({closed,verified,checked})};
}
test('prepared receipt is private, order-independent bound, and never admits serialized or foreign-factory handles',async()=>{
 const f=admissionFixture(),handle=await f.api.prepare(f.args,f.request);
 const reordered={evidence:{proof:h},packet:{packetSha256:h}};
 assert.equal(await f.api.assert(handle,reordered,f.request.nonce),true);
 await assert.rejects(f.api.assert({...handle},f.args,f.request.nonce));
 await assert.rejects(admissionFixture().api.assert(handle,f.args,f.request.nonce));
 await assert.rejects(assertPreparedLocalRecoveryEvidence(handle,f.args,f.request.nonce));
 await assert.rejects(f.api.assert(handle,{...f.args,packet:{packetSha256:'b'.repeat(64)}},f.request.nonce));
 await assert.rejects(f.api.assert(handle,f.args,id(99)));
 await f.api.close(handle);assert.equal(f.counts().closed,1);
});
test('preparation clones callers before async verification and finish consumes exactly once',async()=>{
 const f=admissionFixture(),original=structuredClone(f.args),pending=f.api.prepare(f.args,f.request);f.args.packet.packetSha256='b'.repeat(64);
 const handle=await pending;
 const results=await Promise.allSettled([f.api.assert(handle,original,f.request.nonce,{consume:true}),f.api.assert(handle,original,f.request.nonce,{consume:true})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.counts().verified,1);
 await f.api.close(handle);await f.api.close(handle);assert.equal(f.counts().closed,1);
});
for(const method of ['tamper','loseLease'])test(`late ${method} stops admission and closes custody`,async()=>{
 const f=admissionFixture(),handle=await f.api.prepare(f.args,f.request);f[method]();
 await assert.rejects(f.api.assert(handle,f.args,f.request.nonce));assert.equal(f.counts().closed,1);
 await assert.rejects(f.api.assert(handle,f.args,f.request.nonce));
});
