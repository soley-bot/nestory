import test from 'node:test';
import assert from 'node:assert/strict';
import { writePrivateBackupFile, decryptLocalBackupChunks, preparePrivateBackupCiphertextBatch, assertPrivateBackupCiphertextBatchResult, verifyPrivateBackupCiphertexts,LOCAL_BACKUP_ROOT,backupHash } from './local-backup-crypto.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('public artifact writer cannot write a private-key or key-metadata file',async()=>{
 for(const kind of ['private.dpapi','public.asc','metadata.json','../private.key']) {
  await assert.rejects(writePrivateBackupFile(id,kind,Buffer.from('synthetic private bytes')),/^Error: local_backup_artifact_kind_invalid$/);
 }
});
test('plaintext cannot be persisted under an encrypted archive extension',async()=>{
 await assert.rejects(writePrivateBackupFile(id,'archive.pgp',Buffer.from('sensitive synthetic plaintext')),/^Error: local_backup_encrypted_artifact_required$/);
});
test('invalid or unbounded decryption batches fail before local key access',async()=>{
 for(const chunks of [null,[],[null],Array(4097).fill(Buffer.alloc(0))]) {
  await assert.rejects(decryptLocalBackupChunks(id,chunks),/^Error: local_backup_ciphertext_limit$/);
 }
});


const batchObject=(n=1)=>({archiveId:'11111111-1111-4111-8111-'+String(n).padStart(12,'0'),ciphertextBytes:32,ciphertextSha256:'a'.repeat(64)});
test('ciphertext batch retains 256-object and 8MiB ciphertext bounds including empty manifests',()=>{
 for(const objects of [[],[batchObject()],Array.from({length:256},(_,i)=>({...batchObject(i),ciphertextBytes:8*1024*1024}))]){
  const request=preparePrivateBackupCiphertextBatch(objects);
  assert.equal(request.files,objects.length);assert.ok(request.bytes.length<=65536);
  const result={format:'nestory-local-ciphertext-batch-result-v1',inputSha256:request.inputSha256,files:request.files,bytes:request.totalBytes};
  assert.deepEqual(assertPrivateBackupCiphertextBatchResult(objects,result),result);request.bytes.fill(0);
 }
});
test('invalid ciphertext batch cannot launch a helper or address a non-archive path',async()=>{
 const object=batchObject();
 for(const objects of [null,[null],[object,object],Array.from({length:257},(_,i)=>batchObject(i)),
  [{...object,path:'C:/other'}],[{...object,archiveId:'../key'}],[{...object,ciphertextSha256:'x'}],
  ...[0,-1,8*1024*1024+1,NaN,Infinity,1.5,'32'].map(ciphertextBytes=>[{...object,ciphertextBytes}])]){
  assert.throws(()=>preparePrivateBackupCiphertextBatch(objects),/ciphertext_batch_invalid/);
  await assert.rejects(verifyPrivateBackupCiphertexts(objects),/ciphertext_batch_invalid/);
 }
});
test('batch receipt binds exact ordered roster and totals, never a caller success flag',()=>{
 const objects=[batchObject(1),batchObject(2)],r=preparePrivateBackupCiphertextBatch(objects);
 const result={format:'nestory-local-ciphertext-batch-result-v1',inputSha256:r.inputSha256,files:2,bytes:64};r.bytes.fill(0);
 for(const changed of [{...result,verified:true},{...result,inputSha256:'b'.repeat(64)},{...result,files:1},{...result,bytes:63},{...result,files:'2'}])
  assert.throws(()=>assertPrivateBackupCiphertextBatchResult(objects,changed),/ciphertext_batch_unverified/);
 assert.throws(()=>assertPrivateBackupCiphertextBatchResult([...objects].reverse(),result),/ciphertext_batch_unverified/);
});

// Explicit opt-in: operates only on newly allocated synthetic UUID archives in
// the already protected fixed root. Never opens customer archives or keys.
test('Windows batch verifies synthetic ciphertext and rejects tamper, missing, ACL, reparse and hard links',{
 skip:process.platform!=='win32'||process.env.NESTORY_LOCAL_BACKUP_BATCH_TEST!=='synthetic-only',timeout:120000
},async t=>{
 const {randomUUID}=await import('node:crypto'),fs=await import('node:fs/promises'),path=await import('node:path');
 const {spawnSync}=await import('node:child_process'),pgp=await import('openpgp');
 const powershell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
 const ids=Array.from({length:5},()=>randomUUID()),filename=n=>path.join(LOCAL_BACKUP_ROOT,'local-backup-'+ids[n]+'.archive.pgp');
 const good=filename(0),hardlink=filename(1),junction=filename(2),target=path.join(LOCAL_BACKUP_ROOT,'local-backup-batch-test-'+ids[3]);
 const owned=[good,hardlink,junction,target];for(const name of owned)assert.equal(path.dirname(name),LOCAL_BACKUP_ROOT);
 const ps=(script,input)=>{const r=spawnSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{
  input:JSON.stringify(input),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8192,env:{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows'}});
  assert.equal(r.status,0,'synthetic fixture operation failed');assert.equal(r.stderr,'');return r.stdout;};
 const aclScript="$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd()|ConvertFrom-Json; $acl=[IO.File]::GetAccessControl($p.path); $sid=[Security.Principal.SecurityIdentifier]::new('S-1-1-0'); $rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow); if($p.add){$acl.AddAccessRule($rule)}else{$acl.RemoveAccessRuleAll($rule)}; [IO.File]::SetAccessControl($p.path,$acl)";
 const key=await pgp.generateKey({type:'rsa',rsaBits:3072,userIDs:[{name:'Synthetic batch test'}],format:'object',config:{v6Keys:false}});
 const cipher=Buffer.from(await pgp.encrypt({message:await pgp.createMessage({binary:Buffer.from('synthetic batch fixture only')}),encryptionKeys:key.publicKey,format:'binary',config:{v6Keys:false}}));
 const object={archiveId:ids[0],ciphertextBytes:cipher.length,ciphertextSha256:backupHash(cipher)};let aclChanged=false;
 try{
  await writePrivateBackupFile(ids[0],'archive.pgp',cipher);
  await t.test('positive and empty batches',async()=>{assert.equal((await verifyPrivateBackupCiphertexts([object])).files,1);assert.equal((await verifyPrivateBackupCiphertexts([])).files,0)});
  await t.test('wrong digest and exact byte length',async()=>{for(const changed of [{...object,ciphertextSha256:'0'.repeat(64)},{...object,ciphertextBytes:cipher.length+1}])await assert.rejects(verifyPrivateBackupCiphertexts([changed]),/windows_helper_failed/)});
  await t.test('missing exact UUID file',async()=>{await assert.rejects(verifyPrivateBackupCiphertexts([{...object,archiveId:ids[4]}]),/windows_helper_failed/)});
  await t.test('ciphertext tampering',async()=>{const changed=Buffer.from(cipher);changed[changed.length-1]^=1;try{await fs.writeFile(good,changed);await assert.rejects(verifyPrivateBackupCiphertexts([object]),/windows_helper_failed/)}finally{changed.fill(0);await fs.writeFile(good,cipher)}});
  await t.test('unexpected world-readable ACL',async()=>{ps(aclScript,{path:good,add:true});aclChanged=true;try{await assert.rejects(verifyPrivateBackupCiphertexts([object]),/windows_helper_failed/)}finally{ps(aclScript,{path:good,add:false});aclChanged=false}});
  await t.test('hard-linked file',async()=>{await fs.link(good,hardlink);try{await assert.rejects(verifyPrivateBackupCiphertexts([object]),/windows_helper_failed/)}finally{await fs.unlink(hardlink)}});
  await t.test('junction reparse point',async()=>{await fs.mkdir(target);await fs.symlink(target,junction,'junction');try{await assert.rejects(verifyPrivateBackupCiphertexts([{...object,archiveId:ids[2]}]),/windows_helper_failed/)}finally{await fs.unlink(junction);await fs.rmdir(target)}});
  await t.test('native parser independently rejects malformed, duplicate and oversized rosters',()=>{
   const helper=new URL('./local-backup-windows.ps1',import.meta.url);
   for(const objects of [[object,object],[{...object,path:'elsewhere'}],[{...object,ciphertextBytes:1.5}],
    [{...object,ciphertextBytes:8388609}],Array.from({length:257},(_,i)=>batchObject(i))]){
    const input={action:'verify-archives',name:null,payload:Buffer.from(JSON.stringify({format:'nestory-local-ciphertext-batch-v1',objects})).toString('base64')};
    const r=spawnSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-File',helper.pathname.replace(/^\//,'')],{
     input:JSON.stringify(input),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8192,env:{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows'}});
    assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).status,'stopped');assert.equal(r.stderr,'');
   }
  });
  assert.equal((await verifyPrivateBackupCiphertexts([object])).files,1);
 }finally{
  if(aclChanged)ps(aclScript,{path:good,add:false});
  for(const name of [junction,hardlink,good])await fs.unlink(name).catch(e=>{if(e.code!=='ENOENT')throw e});
  await fs.rmdir(target).catch(e=>{if(e.code!=='ENOENT')throw e});cipher.fill(0);
 }
});
