// Fixed private-C ciphertext custody. No connection or captured-definition execution.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { backupHash,loadRecoveryPublicKey,encryptLocalBackup,decryptLocalBackup,decryptLocalBackupChunks,readPrivateBackupFile,writePrivateBackupFile } from './local-backup-crypto.mjs';
import { buildPilotSchemaCiphertextSql,assertSchemaCapturePreview,verifySchemaCaptureChunk,verifySchemaCaptureCompleteness,verifySchemaDefinitions } from './local-backup-schema-capture.mjs';
const self=fileURLToPath(import.meta.url),uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,sha=/^[a-f0-9]{64}$/;
const fail=()=>{throw Error('local_schema_capture_cli_failed')};
const exact=(o,k)=>o&&Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).sort().join(',')===[...k].sort().join(',');
const identityKeys=['operationId','businessSourceSha256','schemaSha256','ledgerSha256','publicKeySha256'];
function identity(v){if(!exact(v,identityKeys)||!uuid.test(v.operationId)||identityKeys.slice(1).some(k=>!sha.test(v[k])))fail();return v;}
export function assertSchemaCapturePackage(p){
 if(!exact(p,['format','keyId','expected','before','after','observations'])||p.format!=='nestory-encrypted-schema-capture-package-v1'||!uuid.test(p.keyId))fail();
 identity(p.expected);assertSchemaCapturePreview(p.before,p.expected);assertSchemaCapturePreview(p.after,p.expected);
 if(!isDeepStrictEqual(p.before,p.after)||!Array.isArray(p.observations)||p.observations.length!==p.before.chunkCount)fail();
 p.observations.forEach((o,i)=>verifySchemaCaptureChunk(o,{...p.before,chunkIndex:i}));return p;
}
export async function verifyPrivateSchemaPackage(p){
 assertSchemaCapturePackage(p);
 const {metadata}=await loadRecoveryPublicKey(p.keyId);if(metadata.publicKeySha256!==p.expected.publicKeySha256)fail();
 const encrypted=p.observations.map((o,i)=>verifySchemaCaptureChunk(o,{...p.before,chunkIndex:i}));
 const chunks=await decryptLocalBackupChunks(p.keyId,encrypted);let bytes;
 try{
  bytes=verifySchemaCaptureCompleteness({...p,plaintextChunks:chunks});const payload=verifySchemaDefinitions(bytes,p.before);
  return {...p.expected,payloadSha256:p.before.payloadSha256,payloadBytes:bytes.length,chunkCount:chunks.length,
   definitions:payload.definitions.length,ledgerVersions:payload.ledger.length,serverVersionNum:payload.serverVersionNum,
   capturedDefinitionsExecuted:false,currentBusinessParityProven:false,customerRestoreProven:false};
 }finally{bytes?.fill(0);chunks.forEach(b=>b.fill(0));}
}
export async function verifySavedSchemaArchive(request){
 if(!exact(request,['keyId','archiveId','archiveSha256','expected'])||!uuid.test(request.keyId)||!uuid.test(request.archiveId)||!sha.test(request.archiveSha256))fail();identity(request.expected);
 const cipher=await readPrivateBackupFile(request.archiveId,'archive.pgp');if(backupHash(cipher)!==request.archiveSha256)fail();
 const bytes=await decryptLocalBackup(request.keyId,cipher);let p;
 try{p=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));}finally{bytes.fill(0);}
 if(p.keyId!==request.keyId||!isDeepStrictEqual(p.expected,request.expected))fail();
 return {format:'nestory-local-schema-custody-proof-v1',archiveId:request.archiveId,keyId:request.keyId,archiveSha256:request.archiveSha256,
  ...await verifyPrivateSchemaPackage(p),offHostKeyRecoveryProven:false};
}
function freshVerify(request){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[self,'verify'],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],
   env:{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows'}});
  const chunks=[];let count=0,bad=false;const stop=()=>{bad=true;child.kill()};const timer=setTimeout(stop,180000);
  child.stdout.on('data',b=>{count+=b.length;if(count>16384)stop();else chunks.push(b)});
  child.stderr.on('data',stop);child.on('error',stop);child.stdin.on('error',stop);
  child.on('close',code=>{clearTimeout(timer);if(bad||code!==0)return reject(Error('local_schema_capture_cli_failed'));
   try{resolve(JSON.parse(Buffer.concat(chunks)))}catch{reject(Error('local_schema_capture_cli_failed'))}});
  child.stdin.end(JSON.stringify(request));
 });
}
export async function persistSchemaCapturePackage({keyId,archiveId,package: p}){
 if(!uuid.test(keyId)||!uuid.test(archiveId)||p?.keyId!==keyId)fail();
 const summary=await verifyPrivateSchemaPackage(p),bytes=Buffer.from(JSON.stringify(p));let cipher;
 try{cipher=await encryptLocalBackup(keyId,bytes)}finally{bytes.fill(0)}
 await writePrivateBackupFile(archiveId,'archive.pgp',cipher);
 const request={keyId,archiveId,archiveSha256:backupHash(cipher),expected:p.expected};
 const proof=await freshVerify(request),expectedProof={format:'nestory-local-schema-custody-proof-v1',archiveId,keyId,archiveSha256:request.archiveSha256,...summary,offHostKeyRecoveryProven:false};
 if(!isDeepStrictEqual(proof,expectedProof))fail();
 const receipt={...proof,freshProcessVerified:true};
 await writePrivateBackupFile(archiveId,'proof.json',Buffer.from(JSON.stringify(receipt)));return receipt;
}
async function stdinJson(){const chunks=[];let n=0;for await(const b of process.stdin){n+=b.length;if(n>48*1024*1024)fail();chunks.push(b)}
 const bytes=Buffer.concat(chunks);try{return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes))}finally{bytes.fill(0);chunks.forEach(b=>b.fill(0))}}
async function main(){
 const [action,...args]=process.argv.slice(2);
 if(action==='query'&&[5,7].includes(args.length)){
  const [keyId,operationId,businessSourceSha256,schemaSha256,ledgerSha256,payloadSha256,index]=args;
  const {armored,metadata}=await loadRecoveryPublicKey(keyId);
  if(index!==undefined&&!/^(0|[1-9][0-9]*)$/.test(index))fail();
  process.stdout.write(await buildPilotSchemaCiphertextSql({operationId,businessSourceSha256,schemaSha256,ledgerSha256,publicKeyArmored:armored,publicKeySha256:metadata.publicKeySha256,
   ...(index===undefined?{}:{expectedPayloadSha256:payloadSha256,chunkIndex:Number(index)})}));
 }else if(action==='persist'&&args.length===2){
  process.stdout.write(JSON.stringify(await persistSchemaCapturePackage({keyId:args[0],archiveId:args[1],package:await stdinJson()}))+'\n');
 }else if(action==='verify'&&!args.length){process.stdout.write(JSON.stringify(await verifySavedSchemaArchive(await stdinJson()))+'\n')}
 else fail();
}
if(process.argv[1]&&self===path.resolve(process.argv[1]))
 main().catch(()=>{process.stderr.write('local_schema_capture_cli_failed\n');process.exitCode=1});
