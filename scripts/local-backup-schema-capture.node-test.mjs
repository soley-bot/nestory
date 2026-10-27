import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as pgp from 'openpgp';
import {buildPilotSchemaCiphertextSql,assertSchemaCapturePreview,verifySchemaCaptureChunk,verifySchemaDefinitions,verifySchemaCaptureCompleteness} from './local-backup-schema-capture.mjs';
import {assertSchemaCapturePackage} from './local-backup-schema-capture-cli.mjs';
const h=x=>createHash('sha256').update(x).digest('hex'),id='11111111-1111-4111-8111-111111111111';
function fixture(){
 const definition='["postgres", "[]"]',definitions=[{kind:'schema',name:'public',definition,sha256:h(definition)}];
 const catalog=definitions.map(({kind,name,sha256})=>({kind,name,sha256})),ledger=[{version:'20261026000100',name:'fixture',statements:[]}];
 const catalogText=JSON.stringify(catalog),ledgerText=JSON.stringify(ledger);
 const p={format:'nestory-local-business-schema-definitions-v1',operationId:id,businessSourceSha256:'a'.repeat(64),serverVersionNum:170006,catalog,ledger,catalogText,ledgerText,definitions};
 const bytes=Buffer.from(JSON.stringify(p)),base={format:'nestory-local-schema-ciphertext-chunk-v1',status:'ready',operationId:id,businessSourceSha256:p.businessSourceSha256,
  schemaSha256:h(catalogText),ledgerSha256:h(ledgerText),publicKeySha256:'b'.repeat(64),payloadSha256:h(bytes),payloadBytes:bytes.length,chunkBytes:65536,chunkCount:1,
  chunkIndex:null,plaintextChunkSha256:null,ciphertextSha256:null,ciphertextBase64:null};
 const cipher=Buffer.from('test-cipher'),observation={...base,chunkIndex:0,plaintextChunkSha256:h(bytes),ciphertextSha256:h(cipher),ciphertextBase64:cipher.toString('base64')};
 return{before:base,after:{...base},observations:[observation],plaintextChunks:[bytes],p};
}
test('complete encrypted definition capture proves exact original catalog and ledger',()=>{
 const f=fixture();assert.equal(assertSchemaCapturePreview(f.before),f.before);
 assert.equal(verifySchemaCaptureCompleteness(f).toString(),f.plaintextChunks[0].toString());
 assert.equal(verifySchemaDefinitions(f.plaintextChunks[0],f.before).definitions.length,1);
});
for(const [name,mutate] of Object.entries({missing:f=>f.observations.pop(),swappedSource:f=>f.after.businessSourceSha256='c'.repeat(64),changedSchema:f=>f.before.schemaSha256='d'.repeat(64),
 corrupted:f=>f.plaintextChunks[0][0]^=1,extraOutput:f=>f.observations[0].plaintext='secret',badCipher:f=>f.observations[0].ciphertextBase64+='!',changedIndex:f=>f.observations[0].chunkIndex=1,
 badLength:f=>f.before.payloadBytes++,unknownFormat:f=>f.before.format='other',plaintextPreview:f=>f.before.ciphertextBase64='secret'}))test(`reject ${name}`,()=>{
 const f=fixture();mutate(f);assert.throws(()=>verifySchemaCaptureCompleteness(f),/local_schema_capture_invalid/);
});
test('a correctly hashed outer payload cannot hide missing, changed or duplicate definitions',()=>{
 for(const mutate of [p=>p.definitions[0].definition+='x',p=>p.definitions=[],p=>p.definitions[0].name='other',p=>p.rows=['private'],p=>p.serverVersionNum=140000]){
  const f=fixture();mutate(f.p);const b=Buffer.from(JSON.stringify(f.p));assert.throws(()=>verifySchemaDefinitions(b,{...f.before,payloadSha256:h(b),payloadBytes:b.length}),/local_schema_capture_invalid/);
 }
});

test('preview checks the caller-pinned original archive identity, not just valid hashes',()=>{
 const f=fixture(),keys=['operationId','businessSourceSha256','schemaSha256','ledgerSha256','publicKeySha256'];
 const expected=Object.fromEntries(keys.map(k=>[k,f.before[k]]));
 assert.equal(assertSchemaCapturePreview(f.before,expected),f.before);
 for(const k of keys) assert.throws(()=>assertSchemaCapturePreview(f.before,{...expected,[k]:'e'.repeat(64)}),/local_schema_capture_invalid/);
 assert.throws(()=>assertSchemaCapturePreview(f.before,{...expected,extra:true}),/local_schema_capture_invalid/);
});
test('exact server descriptor text is hashed and independently matches decoded descriptors',()=>{
 const f=fixture();f.p.catalogText=JSON.stringify(f.p.catalog,null,1);
 let bytes=Buffer.from(JSON.stringify(f.p));
 const expected={...f.before,schemaSha256:h(f.p.catalogText),payloadSha256:h(bytes),payloadBytes:bytes.length};
 assert.equal(verifySchemaDefinitions(bytes,expected).catalogText,f.p.catalogText);
 f.p.catalog[0].name='other';bytes=Buffer.from(JSON.stringify(f.p));
 assert.throws(()=>verifySchemaDefinitions(bytes,{...expected,payloadSha256:h(bytes),payloadBytes:bytes.length}),/local_schema_capture_invalid/);
});

test('custody package requires the separately supplied original binding and complete ordered ciphertext',()=>{
 const f=fixture(),expected=Object.fromEntries(['operationId','businessSourceSha256','schemaSha256','ledgerSha256','publicKeySha256'].map(k=>[k,f.before[k]]));
 const p={format:'nestory-encrypted-schema-capture-package-v1',keyId:id,expected,before:f.before,after:f.after,observations:f.observations};
 assert.equal(assertSchemaCapturePackage(p),p);
 for(const mutate of [x=>x.expected.businessSourceSha256='e'.repeat(64),x=>delete x.expected,x=>x.observations=[],x=>x.after.payloadSha256='e'.repeat(64),x=>x.sql='DROP TABLE public.leases']){
  const x=structuredClone(p);mutate(x);assert.throws(()=>assertSchemaCapturePackage(x),/local_schema_capture/);
 }
});
test('schema SQL is read-only, encrypts definitions and rejects unbound or arbitrary input',async()=>{
 const k=await pgp.generateKey({type:'rsa',rsaBits:3072,userIDs:[{name:'Synthetic schema capture'}],format:'binary',config:{v6Keys:false,aeadProtect:false}});
 const publicKeyArmored=(await pgp.readKey({binaryKey:k.publicKey})).armor();k.privateKey.fill(0);
 const input={operationId:id,businessSourceSha256:'a'.repeat(64),schemaSha256:'b'.repeat(64),ledgerSha256:'c'.repeat(64),publicKeyArmored,publicKeySha256:h(publicKeyArmored)};
 const sql=await buildPilotSchemaCiphertextSql({...input,expectedPayloadSha256:'d'.repeat(64),chunkIndex:1});
 assert.match(sql,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);assert.match(sql,/pg_get_functiondef/);assert.match(sql,/pgp_pub_encrypt_bytea/);
 assert.match(sql,/substring\(payload_bytes FROM 65537 FOR 65536\)/);assert.match(sql,/schema_sha256<>'b{64}' OR ledger_sha256<>'c{64}'/);
 assert.doesNotMatch(sql,/FROM (?:public|auth|storage)\.[a-z_]+/);assert.match(sql,/ELSE NULL::bytea END ciphertext/);
 for(const change of [{chunkIndex:0},{sql:'SELECT secret'},{schemaSha256:'bad'},{expectedPayloadSha256:'d'.repeat(64),chunkIndex:512},{publicKeySha256:'e'.repeat(64)}])
  await assert.rejects(buildPilotSchemaCiphertextSql({...input,...change}),/local_schema_capture_invalid/);
});
