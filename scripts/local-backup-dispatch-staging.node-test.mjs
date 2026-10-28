import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm,stat,chmod,writeFile,symlink,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {digestDatabaseJson} from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {stagedPayloadPath,encryptStagedPayload,stagedPayloadReference,decryptStagedPayload,stagedWaiting,assertStagedWaiting,
 stagedDispatchTicket,hydrateStagedDispatchTicket,freshStorageReadUrl,assertStagedPayloadReference,storageHttpFailureCode,verifyStagedCipherReadback,publishStagedTicketOnce,
 writeStagedPayloadCache,readStagedPayloadCache,removeStagedPayloadCache} from './local-backup-dispatch-staging.mjs';
const locator={operationId:'11111111-1111-4111-8111-111111111111',action:'prepare',nonce:'22222222-2222-4222-8222-222222222222'};
function fixture(){const key=randomBytes(32),payload={packet:{},binding:{},artifacts:{synthetic:'x'.repeat(1024*1024)},recovery:null,observation:{}};
 const cipher=encryptStagedPayload(payload,key,locator),url=`https://pfvmztxktkwyewvxfgot.supabase.co/storage/v1/object/sign/pilot-reset-handoff/${stagedPayloadPath(locator)}?token=${'a'.repeat(40)}`;
 const ref=stagedPayloadReference(payload,cipher,url,locator),bundle={format:'nestory-local-custody-dispatch-bundle-v1',ticket:{payloadSha256:digestDatabaseJson(payload)},payload,signingPublicKeySha256:'a'.repeat(64),signatureBase64:'synthetic'};return {key,payload,cipher,ref,bundle};}
test('large immutable payload round-trips separately from a small unchanged signed bundle',()=>{
 const f=fixture(),ticket=stagedDispatchTicket(f.bundle,f.ref,locator);
 assert.ok(f.cipher.length>1024*1024);assert.ok(Buffer.byteLength(JSON.stringify(ticket))<2048);
 assert.deepEqual(hydrateStagedDispatchTicket(ticket,f.cipher,f.key,locator),f.bundle);
 assert.deepEqual(assertStagedWaiting(stagedWaiting(locator,f.ref),locator),f.ref);
});
test('payload tampering and mismatched key, operation, nonce, action fail before bundle verification',()=>{
 const f=fixture();const bad=Buffer.from(f.cipher);bad[50]^=1;
 for(const [cipher,key,loc]of [[bad,f.key,locator],[f.cipher,randomBytes(32),locator],
  [f.cipher,f.key,{...locator,action:'execute'}],[f.cipher,f.key,{...locator,nonce:'33333333-3333-4333-8333-333333333333'}]])
  assert.throws(()=>decryptStagedPayload(cipher,key,loc,f.ref),/local_dispatch_staging_invalid/);
});
test('reference rejects foreign host, bucket, path, credentials, duplicate tokens and caller cache query',()=>{
 const f=fixture();for(const url of [f.ref.signedUrl.replace('pfvmztxktkwyewvxfgot','attacker'),f.ref.signedUrl.replace('pilot-reset-handoff','other'),
  f.ref.signedUrl.replace('payload.bin','bundle.bin'),f.ref.signedUrl.replace('https://','https://secret@'),f.ref.signedUrl+'&token=other',f.ref.signedUrl+'&cacheNonce=caller'])
  assert.throws(()=>assertStagedPayloadReference({...f.ref,signedUrl:url},locator),/local_dispatch_staging_invalid/);
});
test('tiny ticket cannot substitute a different payload digest or carry a second plaintext payload',()=>{
 const f=fixture();assert.throws(()=>stagedDispatchTicket({...f.bundle,ticket:{payloadSha256:'b'.repeat(64)}},f.ref,locator));
 const t=stagedDispatchTicket(f.bundle,f.ref,locator);t.authorization.payload={};assert.throws(()=>hydrateStagedDispatchTicket(t,f.cipher,f.key,locator));
});
test('staged reference and actual ciphertext enforce exact bounded size',()=>{
 const f=fixture();for(const bytes of [0,32,32*1024*1024+1,1.5])assert.throws(()=>assertStagedPayloadReference({...f.ref,bytes},locator));
 assert.throws(()=>decryptStagedPayload(f.cipher,f.key,locator,{...f.ref,bytes:f.ref.bytes+1}));
});
test('cache bypass is generated internally, unique, and preserves exact origin/path/token',()=>{
 const f=fixture(),a=new URL(freshStorageReadUrl(f.ref.signedUrl)),b=new URL(freshStorageReadUrl(f.ref.signedUrl));
 assert.equal(a.origin,new URL(f.ref.signedUrl).origin);assert.equal(a.pathname,new URL(f.ref.signedUrl).pathname);
 assert.equal(a.searchParams.get('token'),'a'.repeat(40));assert.notEqual(a.searchParams.get('cacheNonce'),b.searchParams.get('cacheNonce'));
 assert.throws(()=>freshStorageReadUrl('https://attacker.example/storage/v1/object/a'));
 assert.throws(()=>freshStorageReadUrl(f.ref.signedUrl+'&arbitrary=secret'));
});
test('HTTP classification preserves actionable status categories without body or arbitrary error messages',()=>{
 assert.equal(storageHttpFailureCode(403),'local_dispatch_storage_forbidden');assert.equal(storageHttpFailureCode(413),'local_dispatch_storage_too_large');
 assert.equal(storageHttpFailureCode(429),'local_dispatch_storage_rate_limited');assert.equal(storageHttpFailureCode(503),'local_dispatch_storage_server_failed');
 assert.equal(storageHttpFailureCode('private body'),'local_dispatch_storage_unverified');
});
test('authoritative metadata and byte readback must agree before and after, without using ETag as a content hash',async()=>{
 const f=fixture(),objectPath=stagedPayloadPath(locator),metadata={name:objectPath,bucket_id:'pilot-reset-handoff',size:f.cipher.length,
  content_type:'application/octet-stream',version:'version-1',etag:'etag-1',is_delete_marker:false,unrelated:'allowed'};
 const readback=Buffer.from(f.cipher),calls=[];
 await verifyStagedCipherReadback({objectPath,expected:f.cipher,metadata:async()=>{calls.push('metadata');return metadata;},read:async()=>{calls.push('bytes');return readback;}});
 assert.deepEqual(calls,['metadata','bytes','metadata']);assert.ok(readback.every(b=>b===0));assert.ok(f.cipher.some(b=>b!==0));
 for(const change of [{name:'other'}, {bucket_id:'other'}, {size:196}, {content_type:'text/plain'}, {is_delete_marker:true}, {version:''}, {etag:''}]){
  let reads=0;await assert.rejects(verifyStagedCipherReadback({objectPath,expected:f.cipher,metadata:async()=>({...metadata,...change}),read:async()=>{reads++;return Buffer.from(f.cipher);}}));assert.equal(reads,0);
 }
 let n=0;await assert.rejects(verifyStagedCipherReadback({objectPath,expected:f.cipher,metadata:async()=>({...metadata,version:++n===1?'version-1':'version-2'}),read:async()=>Buffer.from(f.cipher)}));
 const altered=Buffer.from(f.cipher);altered[50]^=1;
 await assert.rejects(verifyStagedCipherReadback({objectPath,expected:f.cipher,metadata:async()=>metadata,read:async()=>altered}));assert.ok(altered.every(b=>b===0));
});
test('six-field repaired payload is carried exactly, without ticket rewriting',()=>{
 const f=fixture();f.payload.repair={synthetic:'unchanged'};const cipher=encryptStagedPayload(f.payload,f.key,locator);
 const ref=stagedPayloadReference(f.payload,cipher,f.ref.signedUrl,locator),bundle={...f.bundle,format:'nestory-local-custody-dispatch-bundle-v2',
  payload:f.payload,ticket:{payloadSha256:digestDatabaseJson(f.payload),repairSha256:'a'.repeat(64)}};
 assert.deepEqual(hydrateStagedDispatchTicket(stagedDispatchTicket(bundle,ref,locator),cipher,f.key,locator),bundle);
});
test('ticket publication never retries: definite rejection surfaces, ambiguous acknowledgement requires exact readback',async()=>{
 for(const code of [null,'local_dispatch_storage_outcome_unknown','local_dispatch_storage_forbidden','local_dispatch_storage_rate_limited']){
  const calls=[];const run=()=>publishStagedTicketOnce({write:async()=>{calls.push('write');if(code)throw Error(code);},verify:async()=>{calls.push('verify');}});
  if(code&&code!=='local_dispatch_storage_outcome_unknown'){await assert.rejects(run, {message:code});assert.deepEqual(calls,['write']);}
  else{await run();assert.deepEqual(calls,['write','verify']);}
 }
 let writes=0;await assert.rejects(publishStagedTicketOnce({write:async()=>{writes++;throw Error('local_dispatch_storage_outcome_unknown');},verify:async()=>{throw Error('local_dispatch_staging_invalid');}}),/staging_invalid/);assert.equal(writes,1);
});
test('seven-field execute resume stays byte-bound; other actions, missing history and extra fields reject',()=>{
 const f=fixture(),loc={...locator,action:'execute'},payload={...f.payload,repair:{historical:true},resume:{record:{synthetic:true},observation:{foreignSha256:'b'.repeat(64)}}};
 const pack=(p,l)=>{const cipher=encryptStagedPayload(p,f.key,l),ref=stagedPayloadReference(p,cipher,f.ref.signedUrl,l);return {cipher,ref};};
 const {cipher,ref}=pack(payload,loc),bundle={...f.bundle,format:'nestory-local-custody-dispatch-bundle-v3',payload,
  ticket:{payloadSha256:digestDatabaseJson(payload),repairSha256:'a'.repeat(64),resumeSha256:'b'.repeat(64)}};
 assert.deepEqual(hydrateStagedDispatchTicket(stagedDispatchTicket(bundle,ref,loc),cipher,f.key,loc),bundle);
 for(const [p,l]of [[payload,locator],[Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='repair')),loc],[{...payload,sql:'SELECT 1'},loc]]){
  const v=pack(p,l);assert.throws(()=>decryptStagedPayload(v.cipher,f.key,l,v.ref),/staging_invalid/);
 }
});
test('Linux prefetch cache is exclusive ciphertext only, private, no-follow and checked on read', {skip:process.platform!=='linux'},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'nestory-staging-test-')),env={RUNNER_TEMP:dir,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1'};
 const file=path.join(dir,'nestory-staged-123-1.bin'),f=fixture();
 try{
  await writeStagedPayloadCache(env,f.cipher,f.ref,locator);assert.equal((await stat(file)).mode&0o777,0o600);
  assert.deepEqual(await readStagedPayloadCache(env,f.ref,locator),f.cipher);
  await assert.rejects(writeStagedPayloadCache(env,f.cipher,f.ref,locator));
  await chmod(file,0o644);await assert.rejects(readStagedPayloadCache(env,f.ref,locator));await chmod(file,0o600);
  const bad=Buffer.from(f.cipher);bad[80]^=1;await writeFile(file,bad);await assert.rejects(readStagedPayloadCache(env,f.ref,locator));
  await removeStagedPayloadCache(env);await assert.rejects(stat(file),{code:'ENOENT'});
  const other=path.join(dir,'other');await writeFile(other,f.cipher,{mode:0o600});await symlink(other,file);
  await assert.rejects(readStagedPayloadCache(env,f.ref,locator));await assert.rejects(removeStagedPayloadCache(env));await unlink(file);
  assert.equal((await stat(other)).size,f.cipher.length);
 }finally{await rm(dir,{recursive:true,force:true});}
});
