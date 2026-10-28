// Fixed ciphertext staging. This transport does not grant execution authority.
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {lstat,realpath,open,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {canonicalJson,hashBytes} from './pilot-finance-reset-operator-core.mjs';
import {digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {RESET_PROJECT,RESET_ORGANIZATION} from './pilot-finance-reset-hosted-workflow-core.mjs';

export const STAGED_PAYLOAD_LIMIT=32*1024*1024;
export const STAGED_TICKET_LIMIT=64*1024;
const bucket='pilot-reset-handoff',origin=`https://${RESET_PROJECT}.supabase.co`;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,hash=/^[a-f0-9]{64}$/;
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const fail=()=>{throw Error('local_dispatch_staging_invalid');};
function locatorChecked(v){if(!exact(v,['operationId','action','nonce'])||!uuid.test(v.operationId)||!uuid.test(v.nonce)||!['freeze','checkpoint','prepare','seal','execute'].includes(v.action))fail();return v;}
export function stagedPayloadPath(locator){const v=locatorChecked(locator);return `${RESET_ORGANIZATION}/october-2026/${v.operationId}/${v.nonce}/payload.bin`;}
export function assertStagedPayloadUrl(value,locator){
 let u;try{u=new URL(value);}catch{fail();}
 if(u.origin!==origin||u.username||u.password||u.hash||u.pathname!==`/storage/v1/object/sign/${bucket}/${stagedPayloadPath(locator)}`||
  [...u.searchParams.keys()].join(',')!=='token'||!/^[A-Za-z0-9_.-]{20,8192}$/.test(u.searchParams.get('token')))fail();
 return u.href;
}
// Called only after the original fixed URL has been validated. Supabase's
// documented cacheNonce bypass prevents an old placeholder hiding publication.
export function freshStorageReadUrl(value){
 const u=new URL(value);if(u.origin!==origin||u.username||u.password||u.hash||!u.pathname.startsWith(`/storage/v1/`))fail();
 if([...u.searchParams.keys()].some(k=>k!=='token'))fail();
 u.searchParams.set('cacheNonce',randomUUID());return u.href;
}
function aad(locator){return Buffer.from(canonicalJson({format:'nestory-local-staged-payload-v1',project:RESET_PROJECT,bucket,path:stagedPayloadPath(locator),action:locator.action}));}
function keyChecked(key){if(!(key instanceof Uint8Array)||key.length!==32)fail();}
export function encryptStagedPayload(payload,key,locator){
 keyChecked(key);const plain=Buffer.from(JSON.stringify(payload));
 try{if(plain.length<1||plain.length>STAGED_PAYLOAD_LIMIT-32)fail();
  const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(aad(locator));
  return Buffer.concat([Buffer.from('NLP1'),iv,c.update(plain),c.final(),c.getAuthTag()]);
 }finally{plain.fill(0);}
}
export function assertStagedPayloadReference(ref,locator){
 if(!exact(ref,['format','objectPath','signedUrl','bytes','cipherSha256','payloadSha256'])||ref.format!=='nestory-local-staged-payload-reference-v1'||
  ref.objectPath!==stagedPayloadPath(locator)||!Number.isSafeInteger(ref.bytes)||ref.bytes<33||ref.bytes>STAGED_PAYLOAD_LIMIT||!hash.test(ref.cipherSha256)||!hash.test(ref.payloadSha256))fail();
 assertStagedPayloadUrl(ref.signedUrl,locator);return ref;
}
export function stagedPayloadReference(payload,cipher,signedUrl,locator){
 return assertStagedPayloadReference({format:'nestory-local-staged-payload-reference-v1',objectPath:stagedPayloadPath(locator),signedUrl,
  bytes:cipher.length,cipherSha256:hashBytes(cipher),payloadSha256:digestDatabaseJson(payload)},locator);
}
export function assertStagedCipher(cipher,ref,locator){
 assertStagedPayloadReference(ref,locator);if(!(cipher instanceof Uint8Array)||cipher.length!==ref.bytes||hashBytes(cipher)!==ref.cipherSha256)fail();return true;
}
export function decryptStagedPayload(cipher,key,locator,ref){
 assertStagedCipher(cipher,ref,locator);keyChecked(key);let plain;
 try{const b=Buffer.from(cipher);if(b.subarray(0,4).toString()!=='NLP1')fail();
  const d=createDecipheriv('aes-256-gcm',key,b.subarray(4,16));d.setAAD(aad(locator));d.setAuthTag(b.subarray(-16));
  plain=Buffer.concat([d.update(b.subarray(16,-16)),d.final()]);const payload=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(plain));
  if(!(exact(payload,['packet','binding','artifacts','recovery','observation'])||exact(payload,['packet','binding','artifacts','recovery','observation','repair']))||digestDatabaseJson(payload)!==ref.payloadSha256)fail();return payload;
 }catch{fail();}finally{plain?.fill(0);}
}
export function stagedWaiting(locator,staged){return {format:'nestory-local-custody-waiting-v2',...locator,staged:assertStagedPayloadReference(staged,locator)};}
export function assertStagedWaiting(value,locator){
 if(!exact(value,['format','operationId','action','nonce','staged'])||value.format!=='nestory-local-custody-waiting-v2'||
  value.operationId!==locator.operationId||value.action!==locator.action||value.nonce!==locator.nonce)fail();return assertStagedPayloadReference(value.staged,locator);
}
export function stagedDispatchTicket(bundle,staged,locator){
 assertStagedPayloadReference(staged,locator);
 if(!bundle?.payload||bundle.ticket?.payloadSha256!==staged.payloadSha256||digestDatabaseJson(bundle.payload)!==staged.payloadSha256)fail();
 const {payload:omitted,...authorization}=bundle;void omitted;
 const document={format:'nestory-local-custody-staged-ticket-v1',staged,authorization};
 if(Buffer.byteLength(JSON.stringify(document))>STAGED_TICKET_LIMIT-64)fail();return document;
}
export function hydrateStagedDispatchTicket(document,cipher,key,locator){
 if(!exact(document,['format','staged','authorization'])||document.format!=='nestory-local-custody-staged-ticket-v1'||
  Buffer.byteLength(JSON.stringify(document))>STAGED_TICKET_LIMIT-64||!document.authorization||Object.hasOwn(document.authorization,'payload')||
  document.authorization.ticket?.payloadSha256!==document.staged?.payloadSha256)fail();
 return {...document.authorization,payload:decryptStagedPayload(cipher,key,locator,document.staged)};
}
export function storageHttpFailureCode(status){
 return ({400:'local_dispatch_storage_request_invalid',401:'local_dispatch_storage_unauthorized',403:'local_dispatch_storage_forbidden',
  404:'local_dispatch_storage_missing',409:'local_dispatch_storage_conflict',413:'local_dispatch_storage_too_large',429:'local_dispatch_storage_rate_limited'})[status]??
  (status>=500&&status<=599?'local_dispatch_storage_server_failed':'local_dispatch_storage_unverified');
}
export function assertStagedObjectMetadata(value,objectPath,bytes){
 if(!value||value.name!==objectPath||value.bucket_id!==bucket||value.size!==bytes||value.content_type!=='application/octet-stream'||
  value.is_delete_marker!==false||typeof value.version!=='string'||!value.version.length||value.version.length>256||
  typeof value.etag!=='string'||!value.etag.length||value.etag.length>256)fail();
 return {version:value.version,etag:value.etag,size:value.size};
}
// The production caller supplies only its fixed authenticated Storage reader.
// This comparison grants no upload, signing, custody or execution authority.
export async function verifyStagedCipherReadback({objectPath,expected,metadata,read}){
 if(!(expected instanceof Uint8Array)||expected.length<1||expected.length>STAGED_PAYLOAD_LIMIT)fail();
 const before=assertStagedObjectMetadata(await metadata(),objectPath,expected.length),bytes=await read();
 try{
  if(!(bytes instanceof Uint8Array)||!Buffer.from(expected).equals(bytes)||
   canonicalJson(before)!==canonicalJson(assertStagedObjectMetadata(await metadata(),objectPath,expected.length)))fail();
 }finally{bytes?.fill?.(0);}
}
export async function publishStagedTicketOnce({write,verify}){
 try{await write();}
 catch(error){if(error?.message!=='local_dispatch_storage_outcome_unknown')throw error;}
 // A lost acknowledgement permits one exact readback, never a second write.
 await verify();
}
async function cachePath(environment){
 const base=environment.RUNNER_TEMP;
 if(process.platform!=='linux'||!path.isAbsolute(base??'')||!/^[1-9][0-9]{0,19}$/.test(environment.GITHUB_RUN_ID??'')||environment.GITHUB_RUN_ATTEMPT!=='1')fail();
 const s=await lstat(base);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||await realpath(base)!==base||(s.mode&0o022)!==0)fail();
 return path.join(base,`nestory-staged-${environment.GITHUB_RUN_ID}-1.bin`);
}
export async function writeStagedPayloadCache(environment,cipher,ref,locator){
 assertStagedCipher(cipher,ref,locator);const target=await cachePath(environment);
 const file=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 let complete=false;
 try{await file.writeFile(cipher);await file.sync();complete=true;}finally{await file.close();if(!complete)await unlink(target);}
}
export async function readStagedPayloadCache(environment,ref,locator){
 const target=await cachePath(environment),file=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await file.stat();if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)!==0||s.nlink!==1||s.size!==ref.bytes||s.size>STAGED_PAYLOAD_LIMIT)fail();
  const bytes=await file.readFile();try{assertStagedCipher(bytes,ref,locator);return bytes;}catch(error){bytes.fill(0);throw error;}
 }finally{await file.close();}
}
export async function removeStagedPayloadCache(environment){
 const target=await cachePath(environment);let s;try{s=await lstat(target);}catch(error){if(error.code==='ENOENT')return;throw error;}
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0||s.nlink!==1)fail();await unlink(target);
}
