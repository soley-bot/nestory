import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as pgp from 'openpgp';
import { buildPilotCiphertextCaptureSql, LOCAL_CAPTURE_POLICY, LOCAL_CAPTURE_CHUNK_BYTES, verifyCaptureChunk, verifyCaptureCompleteness } from './local-backup-capture.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const operationId = '11111111-1111-4111-8111-111111111111';
// In-memory fixture only. No DPAPI, private C files, customer keys or network.
const generated = await pgp.generateKey({ type:'rsa',rsaBits:3072,userIDs:[{name:'Synthetic capture test'}],format:'binary',config:{v6Keys:false,aeadProtect:false} });
const publicKeyArmored = (await pgp.readKey({binaryKey:generated.publicKey})).armor();
generated.privateKey.fill(0);
const input = {operationId,publicKeyArmored,publicKeySha256:hash(publicKeyArmored)};
test('fixed export preserves complete row images and separates credential witnesses', async () => {
  assert.equal(LOCAL_CAPTURE_POLICY.length,161);
  assert.equal(LOCAL_CAPTURE_POLICY.filter(p=>p.capture==='full-row-image').length,149);
  const sql = await buildPilotCiphertextCaptureSql(input);
  assert.match(sql,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(sql,/SET LOCAL search_path=pg_catalog,public/);
  assert.match(sql,/to_jsonb\(t\)::text row_text/);
  assert.match(sql,/unclassified_schema/);
  assert.match(sql,/capabilities_present/);
  assert.match(sql,/securityMetadataIncluded/);
  assert.match(sql,/pgp_pub_encrypt_bytea/);
  assert.match(sql,/cipher-algo=aes256,compress-algo=0/);
  assert.doesNotMatch(sql,/FROM "auth"\./);
  assert.match(sql,/ELSE NULL::bytea END ciphertext/);
});
test('preview has no ciphertext chunk while capture pins complete payload and bounded segment', async () => {
  const preview = await buildPilotCiphertextCaptureSql(input);
  assert.match(preview,/NULL::bytea chunk_bytes/);
  const capture = await buildPilotCiphertextCaptureSql({...input,expectedSourceSha256:'a'.repeat(64),chunkIndex:2});
  assert.match(capture,/substring\(payload_bytes FROM 131073 FOR 65536\)/);
  assert.match(capture,/source_sha256<>'a{64}'/);
});
for (const changed of [{organizationId:'foreign'}, {operationId:"';DELETE"}, {publicKeySha256:'0'.repeat(64)},
 {chunkIndex:0}, {expectedSourceSha256:'a'.repeat(64),chunkIndex:-1}, {expectedSourceSha256:'a'.repeat(64),chunkIndex:4096}]) {
 test('capture rejects altered scope, key or incomplete chunk binding '+JSON.stringify(changed),async()=>{
  await assert.rejects(buildPilotCiphertextCaptureSql({...input,...changed}),/configuration_invalid/);
 });
}
function fixture() {
 const parts=[Buffer.alloc(LOCAL_CAPTURE_CHUNK_BYTES,1),Buffer.from('last')], payload=Buffer.concat(parts);
 const base={format:'nestory-local-pilot-ciphertext-chunk-v2',chunkBytes:LOCAL_CAPTURE_CHUNK_BYTES,status:'ready',operationId,sourceSha256:hash(payload),schemaSha256:'b'.repeat(64),ledgerSha256:'c'.repeat(64),publicKeySha256:input.publicKeySha256,
 payloadBytes:payload.length,businessRows:2,tableCount:161,chunkCount:2,chunkIndex:null,plaintextChunkSha256:null,ciphertextSha256:null,ciphertextBase64:null};
 const observations=parts.map((bytes,chunkIndex)=>{const cipher=Buffer.from('synthetic-encrypted-'+chunkIndex);return {...base,chunkIndex,plaintextChunkSha256:hash(bytes),ciphertextSha256:hash(cipher),ciphertextBase64:cipher.toString('base64')};});
 return {before:base,after:{...base},observations,plaintextChunks:parts};
}
test('complete source-bound chunks reconstruct exact bytes',()=>{
 const f=fixture();assert.equal(hash(verifyCaptureCompleteness(f)),f.before.sourceSha256);
});
for(const mutate of [f=>f.observations.pop(),f=>f.observations.reverse(),f=>{f.after.sourceSha256='d'.repeat(64);},
 f=>{f.observations[1].ciphertextBase64+='!';},f=>{f.plaintextChunks[0][0]^=1;},f=>{f.observations[0].schemaSha256='e'.repeat(64);},
 f=>{f.observations[0].payloadBytes++;}])test('missing, reordered, changed, corrupt or cross-source chunks cannot complete',()=>{
 const f=fixture();mutate(f);assert.throws(()=>verifyCaptureCompleteness(f),/configuration_invalid/);
});
test('plaintext/extra fields in connector observation are refused',()=>{
 const f=fixture();assert.throws(()=>verifyCaptureChunk({...f.observations[0],rows:[]},{...f.before,chunkIndex:0}),/configuration_invalid/);
});
test('prior v1 eight-KiB archives remain readable and cannot mix chunk protocols',()=>{
 const f=fixture();f.plaintextChunks=[Buffer.alloc(8192,1),Buffer.from('last')];
 const payload=Buffer.concat(f.plaintextChunks);
 for(const o of [f.before,f.after,...f.observations]){o.format='nestory-local-pilot-ciphertext-chunk-v1';delete o.chunkBytes;o.payloadBytes=payload.length;o.sourceSha256=hash(payload);}
 f.observations.forEach((o,i)=>{o.plaintextChunkSha256=hash(f.plaintextChunks[i]);});
 assert.equal(hash(verifyCaptureCompleteness(f)),hash(payload));
 f.observations[1].format='nestory-local-pilot-ciphertext-chunk-v2';f.observations[1].chunkBytes=65536;
 assert.throws(()=>verifyCaptureCompleteness(f),/configuration_invalid/);
});
