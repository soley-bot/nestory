// Fixed encrypted schema recovery source, captured read-only from the same
// catalog/ledger as the immutable business archive. No network or SQL execution.
import {backupHash,readPrivateBackupFile,decryptLocalBackup,decryptLocalBackupChunks,loadRecoveryPublicKey} from './local-backup-crypto.mjs';
import {assertSchemaCapturePackage} from './local-backup-schema-capture-cli.mjs';
import {verifySchemaCaptureChunk,verifySchemaCaptureCompleteness,verifySchemaDefinitions} from './local-backup-schema-capture.mjs';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,digest=/^[a-f0-9]{64}$/;
const fail=()=>{throw Error('local_business_schema_source_changed')};
export function assertBusinessSchemaArchiveReference(r){
 if(!r||Object.getPrototypeOf(r)!==Object.prototype||Object.keys(r).sort().join(',')!==['keyId','archiveId','archiveSha256','payloadSha256'].sort().join(',')||
  !uuid.test(r.keyId)||!uuid.test(r.archiveId)||!digest.test(r.archiveSha256)||!digest.test(r.payloadSha256))fail();return r;
}
export async function readBusinessSchemaSource(reference){
 const r=assertBusinessSchemaArchiveReference(reference);
 let cipher,packageBytes,payloadBytes;const chunks=[];
 try{
  cipher=await readPrivateBackupFile(r.archiveId,'archive.pgp');if(backupHash(cipher)!==r.archiveSha256)fail();
  packageBytes=await decryptLocalBackup(r.keyId,cipher);const p=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(packageBytes));assertSchemaCapturePackage(p);
  const {metadata}=await loadRecoveryPublicKey(r.keyId);
  if(p.keyId!==r.keyId||p.expected.publicKeySha256!==metadata.publicKeySha256||p.before.payloadSha256!==r.payloadSha256)fail();
  chunks.push(...await decryptLocalBackupChunks(r.keyId,p.observations.map((o,i)=>verifySchemaCaptureChunk(o,{...p.before,chunkIndex:i}))));
  payloadBytes=verifySchemaCaptureCompleteness({...p,plaintextChunks:chunks});const payload=verifySchemaDefinitions(payloadBytes,p.before);
  if(payload.definitions.length!==8229||payload.ledger.length!==259||payload.serverVersionNum!==170006)fail();
  return{payload,evidence:{...r,...p.expected,currentBusinessParityProven:false}};
 }finally{cipher?.fill(0);packageBytes?.fill(0);payloadBytes?.fill(0);chunks.forEach(b=>b.fill(0))}
}
