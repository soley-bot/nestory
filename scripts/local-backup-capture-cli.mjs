// Fixed local orchestration. query emits SQL containing only the public key;
// persist accepts encrypted connector observations; other output is aggregate.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { backupHash, loadRecoveryPublicKey, encryptLocalBackup, decryptLocalBackup, decryptLocalBackupChunks,
  readPrivateBackupFile, writePrivateBackupFile } from './local-backup-crypto.mjs';
import { buildPilotCiphertextCaptureSql, verifyCaptureChunk, verifyCaptureCompleteness, LOCAL_CAPTURE_POLICY, PILOT_BACKUP_ORGANIZATION } from './local-backup-capture.mjs';
import { holdBusinessSpillCustody } from './local-backup-business-runtime.mjs';
const self=fileURLToPath(import.meta.url);
const fail=()=>{throw Error('local_backup_capture_cli_failed');};
const sameKeys=(o,keys)=>o&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
async function stdinJson(){const chunks=[];let length=0;for await(const chunk of process.stdin){length+=chunk.length;if(length>48*1024*1024)fail();chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
function checkPackage(p){
 if(!sameKeys(p,['format','keyId','before','after','observations'])||p.format!=='nestory-encrypted-pilot-capture-package-v1'||
   !Array.isArray(p.observations)||p.observations.length<1||p.observations.length>4096)fail();
 return p;
}
async function verifyPackage(p){
 checkPackage(p);
 const {metadata}=await loadRecoveryPublicKey(p.keyId);
 if(p.before.publicKeySha256!==metadata.publicKeySha256)fail();
 const encrypted=p.observations.map((o,index)=>verifyCaptureChunk(o,{...p.before,chunkIndex:index}));
 const chunks=await decryptLocalBackupChunks(p.keyId,encrypted);
 let payload;
 try{
  payload=verifyCaptureCompleteness({before:p.before,after:p.after,observations:p.observations,plaintextChunks:chunks});
  const decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload));
  if(decoded.format!=='nestory-local-pilot-business-capture-v1'||decoded.scope!=='selected-org-business'||
    decoded.organizationId!==PILOT_BACKUP_ORGANIZATION||decoded.operationId!==p.before.operationId||decoded.authBackupIncluded!==false||
    !Array.isArray(decoded.tables)||decoded.tables.length!==LOCAL_CAPTURE_POLICY.length)fail();
  const tables=new Map(decoded.tables.map(t=>[t.table_name,t]));if(tables.size!==LOCAL_CAPTURE_POLICY.length)fail();
  let rows=0;
  for(let i=0;i<LOCAL_CAPTURE_POLICY.length;i++){
   const policy=LOCAL_CAPTURE_POLICY[i],t=tables.get(policy.table);if(!t)fail();
   if(t.table_name!==policy.table||t.capture!==policy.capture||t.scopeColumn!==policy.scopeColumn||t.mustBeEmpty!==policy.mustBeEmpty||
     !Number.isSafeInteger(t.row_count)||t.row_count<0||policy.mustBeEmpty&&t.row_count!==0)fail();
   if(policy.capture==='count-and-hash-only'){if(t.rows!==null)fail();continue;}
   if(!Array.isArray(t.rows)||t.rows.length!==t.row_count)fail();
   for(const row of t.rows){
    if(!sameKeys(row,['primaryKey','rowText','rowSha256'])||typeof row.rowText!=='string'||backupHash(row.rowText)!==row.rowSha256)fail();
    const object=JSON.parse(row.rowText);if(object[policy.scopeColumn]!==PILOT_BACKUP_ORGANIZATION)fail();
   }
   rows+=t.row_count;
  }
  if(rows!==p.before.businessRows)fail();
  return {operationId:p.before.operationId,sourceSha256:p.before.sourceSha256,payloadBytes:payload.length,businessRows:rows,
   tableCount:decoded.tables.length,chunkCount:p.observations.length,storageObjects:decoded.storageMetadata.length,
   fileBytesCaptured:false,customerRestoreProven:false};
 }finally{payload?.fill(0);for(const bytes of chunks)bytes.fill(0);}
}
async function freshVerify(keyId,archiveId,archiveSha,sourceSha){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[self,'verify',keyId,archiveId,archiveSha,sourceSha],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  const chunks=[];let size=0,bad=false;const timer=setTimeout(()=>{bad=true;child.kill();},120000);
  child.stdout.on('data',b=>{size+=b.length;if(size>8192){bad=true;child.kill();}else chunks.push(b);});
  child.stderr.on('data',()=>{bad=true;child.kill();});child.on('error',reject);
  child.on('close',code=>{clearTimeout(timer);if(bad||code!==0)return reject(Error('fresh_verify_failed'));try{resolve(JSON.parse(Buffer.concat(chunks)))}catch{reject(Error('fresh_verify_failed'));}});
 });
}
let custody;
try{
 const [action,keyId,operationOrArchiveId,expected,chunk]=process.argv.slice(2);
 if(action==='query'&&[5,7].includes(process.argv.length)){
  const {armored,metadata}=await loadRecoveryPublicKey(keyId);
  process.stdout.write(await buildPilotCiphertextCaptureSql({operationId:operationOrArchiveId,publicKeyArmored:armored,publicKeySha256:metadata.publicKeySha256,
   ...(expected?{expectedSourceSha256:expected,chunkIndex:Number(chunk)}:{})}));
 }else if(action==='persist'&&process.argv.length===5){
  const p=checkPackage(await stdinJson());if(p.keyId!==keyId)fail();
  custody=await holdBusinessSpillCustody();
  const verified=await verifyPackage(p);
  await custody.check();
  const sealed=await encryptLocalBackup(keyId,Buffer.from(JSON.stringify(p)));
  await writePrivateBackupFile(operationOrArchiveId,'archive.pgp',sealed);
  const proof=await freshVerify(keyId,operationOrArchiveId,backupHash(sealed),verified.sourceSha256);
  await custody.check();
  await writePrivateBackupFile(operationOrArchiveId,'proof.json',Buffer.from(JSON.stringify(proof)));
  process.stdout.write(JSON.stringify(proof)+'\n');
 }else if(action==='verify'&&process.argv.length===7){
  custody=await holdBusinessSpillCustody();
  const sealed=await readPrivateBackupFile(operationOrArchiveId,'archive.pgp');if(backupHash(sealed)!==expected)fail();
  const packageBytes=await decryptLocalBackup(keyId,sealed);let p;
  try{p=checkPackage(JSON.parse(packageBytes.toString('utf8')));}finally{packageBytes.fill(0);}
  if(p.keyId!==keyId||p.before.sourceSha256!==chunk)fail();
  const verified=await verifyPackage(p);
  await custody.check();
  process.stdout.write(JSON.stringify({format:'nestory-local-capture-custody-proof-v1',archiveId:operationOrArchiveId,keyId,
   archiveSha256:expected,...verified,freshProcessVerified:true,offHostKeyRecoveryProven:false})+'\n');
 }else fail();
}catch{process.stderr.write('local_backup_capture_cli_failed\n');process.exitCode=1;}
finally{await custody?.close();}
