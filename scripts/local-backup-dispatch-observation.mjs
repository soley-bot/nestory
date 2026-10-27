// Fixed read-only connector transport. Only ciphertext and bounded witnesses
// leave PostgreSQL. Native SELECTs are reused, not replaced with an authority API.
import * as pgp from 'openpgp';
import {randomUUID} from 'node:crypto';
import {canonicalJson,assertOperatorPacket} from './pilot-finance-reset-operator-core.mjs';
import {ledgerExpression,observationSql,hostedBinding} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {approvalObservationQuery,validateApprovalObservation} from './pilot-finance-reset-hosted-protocol.mjs';
import {backupHash,loadRecoveryPublicKey,encryptLocalBackup,decryptLocalBackup,decryptLocalBackupChunks,readPrivateBackupFile,writePrivateBackupFile} from './local-backup-crypto.mjs';
import {assertSavedPilotRehearsalHeld,inspectSavedPilotRehearsal} from './local-backup-saved-rehearsal.mjs';
const chunkBytes=65536,maxBytes=4*1024*1024;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/;
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const fail=()=>{throw Error('local_dispatch_observation_unverified')};
const literal=v=>"'"+v.replaceAll("'","''")+"'";
function source(request){
 if(request?.kind==='ledger'){
  if(!exact(request,['kind','operationId'])||!uuid.test(request.operationId))fail();
  return {operationId:request.operationId,select:`SELECT jsonb_build_object('ledgerText',${ledgerExpression}::text)`};
 }
 if(!['stage','approvals'].includes(request?.kind)||!exact(request,request.kind==='stage'?['kind','packet','continuationPlan','action']:['kind','packet']))fail();
 const p=request.packet;assertOperatorPacket(p);
 if(p.operation.projectRef!=='pfvmztxktkwyewvxfgot'||p.operation.organizationId!=='752a87b8-bd04-4a45-9cb8-00687af66e73'||p.operation.invoiceDatePolicy!=='empty-books-no-invoices')fail();
 if(request.kind==='stage'){
  if(!['freeze','checkpoint','prepare','seal','execute'].includes(request.action))fail();
  const sql=observationSql(p,hostedBinding(p,request.continuationPlan),null,request.action),start=sql.indexOf('\nSELECT jsonb_build_object('),end=';\nCOMMIT;';
  if(start<0||!sql.endsWith(end))fail();
  return {operationId:p.operation.operationId,select:sql.slice(start+1,-end.length)};
 }
 const q=approvalObservationQuery(p,null),prefix='WITH requested AS (SELECT $1::uuid AS operation_id,$2::integer AS endorsement_number),';
 if(!q.text.startsWith(prefix)||q.values[0]!==p.operation.operationId||q.values[1]!==null||q.text.slice(prefix.length).includes('$'))fail();
 const native=`WITH requested AS (SELECT ${literal(p.operation.operationId)}::uuid AS operation_id,NULL::integer AS endorsement_number),`+q.text.slice(prefix.length);
 return {operationId:p.operation.operationId,select:`SELECT jsonb_build_array(jsonb_build_object('financial_reset_approval_observation',(${native})))`};
}
function identity(request,publicKeySha256){const s=source(request);if(!hash.test(publicKeySha256))fail();return{...s,requestSha256:backupHash(canonicalJson({request,select:s.select,publicKeySha256}))};}
export async function buildLocalDispatchObservationSql(input){
 input=structuredClone(input);
 if(!exact(input,['request','publicKeyArmored','publicKeySha256','expectedPayloadSha256','chunkIndex']))fail();
 const{request,publicKeyArmored,publicKeySha256,expectedPayloadSha256,chunkIndex}=input,s=identity(request,publicKeySha256),single=request.kind==='approvals';
 if(typeof publicKeyArmored!=='string'||publicKeyArmored.length>16384||backupHash(publicKeyArmored)!==publicKeySha256||
  expectedPayloadSha256!==null&&!hash.test(expectedPayloadSha256)||
  single&&(chunkIndex!==0||expectedPayloadSha256!==null)||!single&&(chunkIndex===null?expectedPayloadSha256!==null:
   !Number.isSafeInteger(chunkIndex)||chunkIndex<0||chunkIndex>=maxBytes/chunkBytes||expectedPayloadSha256===null))fail();
 let key;try{key=await pgp.readKey({armoredKey:publicKeyArmored,config:{v6Keys:false}})}catch{fail()}
 if(key.isPrivate()||key.keyPacket.version!==4||key.getAlgorithmInfo().algorithm!=='rsaEncryptSign'||key.getAlgorithmInfo().bits!==3072)fail();
 const chunk=chunkIndex===null?'NULL::bytea':`substring(payload FROM ${chunkIndex*chunkBytes+1} FOR ${chunkBytes})`;
 return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL standard_conforming_strings=on; SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='60s'; SET LOCAL idle_in_transaction_session_timeout='65s';
WITH native AS MATERIALIZED (SELECT (${s.select}) value),
encoded AS MATERIALIZED (SELECT convert_to(value::text,'UTF8') payload FROM native),
checked AS MATERIALIZED (SELECT *,${chunk} chunk,encode(extensions.digest(payload,'sha256'),'hex') payload_sha,
 CASE WHEN octet_length(payload) NOT BETWEEN 1 AND ${single?chunkBytes:maxBytes} THEN 'size_limit'
 WHEN ${expectedPayloadSha256===null?'false':`encode(extensions.digest(payload,'sha256'),'hex')<>${literal(expectedPayloadSha256)}`} THEN 'source_changed'
 WHEN ${chunkIndex===null?'false':`${chunkIndex*chunkBytes}>=octet_length(payload)`} THEN 'chunk_invalid' ELSE 'ready' END status FROM encoded),
sealed AS MATERIALIZED (SELECT *,CASE WHEN status='ready' AND chunk IS NOT NULL THEN extensions.pgp_pub_encrypt_bytea(chunk,extensions.dearmor(${literal(publicKeyArmored)}),'cipher-algo=aes256,compress-algo=0') ELSE NULL::bytea END cipher FROM checked)
SELECT jsonb_build_object('format','nestory-local-dispatch-observation-chunk-v1','status',status,'operationId',${literal(s.operationId)},
 'kind',${literal(request.kind)},'requestSha256',${literal(s.requestSha256)},'publicKeySha256',${literal(publicKeySha256)},
 'payloadSha256',payload_sha,'payloadBytes',octet_length(payload),'chunkBytes',${chunkBytes},'chunkCount',ceil(octet_length(payload)::numeric/${chunkBytes})::integer,
 'chunkIndex',${chunkIndex===null?'NULL':chunkIndex},'plaintextChunkSha256',CASE WHEN cipher IS NULL THEN NULL ELSE encode(extensions.digest(chunk,'sha256'),'hex') END,
 'ciphertextSha256',CASE WHEN cipher IS NULL THEN NULL ELSE encode(extensions.digest(cipher,'sha256'),'hex') END,
 'ciphertextBase64',CASE WHEN cipher IS NULL THEN NULL ELSE replace(encode(cipher,'base64'),E'\\n','') END) AS encrypted_observation FROM sealed;
COMMIT;`;
}
const fields=['format','status','operationId','kind','requestSha256','publicKeySha256','payloadSha256','payloadBytes','chunkBytes','chunkCount','chunkIndex','plaintextChunkSha256','ciphertextSha256','ciphertextBase64'];
const stable=['operationId','kind','requestSha256','publicKeySha256','payloadSha256','payloadBytes','chunkBytes','chunkCount'];
export function verifyLocalDispatchObservationChunk({request,publicKeySha256,observation,chunkIndex}){
 const s=identity(request,publicKeySha256),o=observation;
 if(!exact(o,fields)||o.format!=='nestory-local-dispatch-observation-chunk-v1'||o.status!=='ready'||o.operationId!==s.operationId||o.kind!==request.kind||
  o.requestSha256!==s.requestSha256||o.publicKeySha256!==publicKeySha256||!hash.test(o.payloadSha256)||o.chunkBytes!==chunkBytes||
  !Number.isSafeInteger(o.payloadBytes)||o.payloadBytes<1||o.payloadBytes>(request.kind==='approvals'?chunkBytes:maxBytes)||o.chunkCount!==Math.ceil(o.payloadBytes/chunkBytes)||o.chunkIndex!==chunkIndex)fail();
 if(chunkIndex===null){if(request.kind==='approvals'||[o.plaintextChunkSha256,o.ciphertextSha256,o.ciphertextBase64].some(v=>v!==null))fail();return null;}
 if(!Number.isSafeInteger(chunkIndex)||chunkIndex<0||chunkIndex>=o.chunkCount||!hash.test(o.plaintextChunkSha256)||!hash.test(o.ciphertextSha256)||typeof o.ciphertextBase64!=='string'||o.ciphertextBase64.length>90000)fail();
 const bytes=Buffer.from(o.ciphertextBase64,'base64');if(bytes.length<1||bytes.toString('base64')!==o.ciphertextBase64||backupHash(bytes)!==o.ciphertextSha256)fail();return bytes;
}
export function verifyLocalDispatchObservationPackage({request,publicKeySha256,before,after,chunks,plaintextChunks}){
 const single=request.kind==='approvals';
 verifyLocalDispatchObservationChunk({request,publicKeySha256,observation:before,chunkIndex:single?0:null});
 verifyLocalDispatchObservationChunk({request,publicKeySha256,observation:after,chunkIndex:single?0:null});
 if(stable.some(k=>before[k]!==after[k])||single&&canonicalJson(before)!==canonicalJson(after)||!Array.isArray(chunks)||chunks.length!==before.chunkCount||
  !Array.isArray(plaintextChunks)||plaintextChunks.length!==chunks.length)fail();
 for(let i=0;i<chunks.length;i++){
  verifyLocalDispatchObservationChunk({request,publicKeySha256,observation:chunks[i],chunkIndex:i});
  if(stable.some(k=>chunks[i][k]!==before[k])||single&&canonicalJson(chunks[i])!==canonicalJson(before)||!(plaintextChunks[i] instanceof Uint8Array)||
   plaintextChunks[i].length!==Math.min(chunkBytes,before.payloadBytes-i*chunkBytes)||backupHash(plaintextChunks[i])!==chunks[i].plaintextChunkSha256)fail();
 }
 const bytes=Buffer.concat(plaintextChunks);try{if(bytes.length!==before.payloadBytes||backupHash(bytes)!==before.payloadSha256)fail();return bytes}catch{bytes.fill(0);fail()}
}
async function unpack(context,request,p){
 await assertSavedPilotRehearsalHeld(context);
 if(!exact(p,['format','keyId','before','after','chunks'])||p.format!=='nestory-local-dispatch-observation-package-v1'||!uuid.test(p.keyId)||
  context.operationId!==source(request).operationId||!Array.isArray(p.chunks)||p.chunks.length<1||p.chunks.length>maxBytes/chunkBytes)fail();
 const saved=inspectSavedPilotRehearsal(context);saved.manifestBytes.fill(0);if(saved.request.keyId!==p.keyId)fail();
 const{metadata}=await loadRecoveryPublicKey(p.keyId),publicKeySha256=metadata.publicKeySha256;
 const cipher=p.chunks.map((o,i)=>verifyLocalDispatchObservationChunk({request,publicKeySha256,observation:o,chunkIndex:i}));let plain,bytes;
 try{plain=await decryptLocalBackupChunks(p.keyId,cipher);bytes=verifyLocalDispatchObservationPackage({request,publicKeySha256,...p,plaintextChunks:plain});
  const value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes));
  if(request.kind==='ledger'){if(!exact(value,['ledgerText'])||typeof value.ledgerText!=='string'||!Array.isArray(JSON.parse(value.ledgerText)))fail();}
  else if(request.kind==='approvals')validateApprovalObservation(request.packet,value);
  else if(!value||!Array.isArray(value.catalog)||!Array.isArray(value.ledger)||value.authorization!==null)fail();
  await assertSavedPilotRehearsalHeld(context);return value;
 }finally{cipher.forEach(b=>b.fill(0));plain?.forEach(b=>b.fill(0));bytes?.fill(0)}
}
export async function persistLocalDispatchObservation({context,request,package:input}){
 request=structuredClone(request);const p=structuredClone(input);await unpack(context,request,p);
 const bytes=Buffer.from(JSON.stringify(p)),archiveId=randomUUID();let cipher;
 try{cipher=await encryptLocalBackup(p.keyId,bytes);await assertSavedPilotRehearsalHeld(context);await writePrivateBackupFile(archiveId,'archive.pgp',cipher);
  const readback=await readPrivateBackupFile(archiveId,'archive.pgp');try{if(!readback.equals(cipher))fail()}finally{readback.fill(0)}
  await assertSavedPilotRehearsalHeld(context);return{keyId:p.keyId,archiveId,archiveSha256:backupHash(cipher),plaintextSha256:backupHash(bytes),plaintextBytes:bytes.length};
 }finally{bytes.fill(0);cipher?.fill(0)}
}
// Returns private values only to the existing caller-owned held context. Never
// serialize this return value to a connector, console or ordinary artifact.
export async function openLocalDispatchObservation({context,request,reference}){
 request=structuredClone(request);reference=structuredClone(reference);
 await assertSavedPilotRehearsalHeld(context);
 if(!exact(reference,['keyId','archiveId','archiveSha256','plaintextSha256','plaintextBytes'])||![reference.keyId,reference.archiveId].every(v=>uuid.test(v))||
  ![reference.archiveSha256,reference.plaintextSha256].every(v=>hash.test(v))||!Number.isSafeInteger(reference.plaintextBytes)||reference.plaintextBytes<1||reference.plaintextBytes>8*1024*1024)fail();
 let cipher,plain;try{cipher=await readPrivateBackupFile(reference.archiveId,'archive.pgp');if(backupHash(cipher)!==reference.archiveSha256)fail();plain=await decryptLocalBackup(reference.keyId,cipher);
  if(plain.length!==reference.plaintextBytes||backupHash(plain)!==reference.plaintextSha256)fail();const p=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(plain));
  if(p.keyId!==reference.keyId)fail();return await unpack(context,request,p);
 }finally{cipher?.fill(0);plain?.fill(0)}
}
