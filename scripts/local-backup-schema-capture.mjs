// Schema definitions only. No connection, data-row reader, DDL or restore gate.
// The fixed catalog witness must match the already saved business archive.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import * as pgp from 'openpgp';
import { schemaCensusSql } from './ips-readiness-recovery-core.mjs';
import { catalogExpression, ledgerExpression } from './pilot-finance-reset-hosted-transport-protocol.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const digest=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fail=()=>{throw Error('local_schema_capture_invalid')};
const exact=(v,k)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const literal=v=>`'${String(v).replaceAll("'","''")}'`;
export const SCHEMA_CAPTURE_CHUNK_BYTES=65536,SCHEMA_CAPTURE_MAX_BYTES=32*1024*1024;
const begin=schemaCensusSql.indexOf('WITH objects AS ('),end=schemaCensusSql.indexOf(") SELECT jsonb_build_object('kind',kind,'name',name,'sha256'");
if(begin<0||end<begin)fail();
const objectsCte=schemaCensusSql.slice(begin,end+1);
const kinds=new Set(['schema','relation','column','constraint','index','policy','function','trigger','enum','default_acl']);
export async function buildPilotSchemaCiphertextSql(input){
 const fields=['operationId','businessSourceSha256','schemaSha256','ledgerSha256','publicKeyArmored','publicKeySha256'];
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>![...fields,'expectedPayloadSha256','chunkIndex'].includes(k))||fields.some(k=>!Object.hasOwn(input,k)||typeof input[k]!=='string'))fail();
 const {operationId,businessSourceSha256,schemaSha256,ledgerSha256,publicKeyArmored,publicKeySha256,expectedPayloadSha256=null,chunkIndex=null}=input;
 if(!uuid.test(operationId)||![businessSourceSha256,schemaSha256,ledgerSha256,publicKeySha256].every(v=>digest.test(v))||
  typeof publicKeyArmored!=='string'||publicKeyArmored.length>16384||hash(publicKeyArmored)!==publicKeySha256||
  expectedPayloadSha256!==null&&!digest.test(expectedPayloadSha256)||chunkIndex!==null&&(!Number.isSafeInteger(chunkIndex)||chunkIndex<0||chunkIndex>=512||expectedPayloadSha256===null))fail();
 let key;try{key=await pgp.readKey({armoredKey:publicKeyArmored,config:{v6Keys:false}})}catch{fail()}
 if(key.isPrivate()||key.keyPacket.version!==4||key.getAlgorithmInfo().algorithm!=='rsaEncryptSign'||key.getAlgorithmInfo().bits!==3072)fail();
 const chunk=chunkIndex===null?'NULL::bytea':`substring(payload_bytes FROM ${chunkIndex*SCHEMA_CAPTURE_CHUNK_BYTES+1} FOR ${SCHEMA_CAPTURE_CHUNK_BYTES})`;
 return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='60s'; SET LOCAL idle_in_transaction_session_timeout='65s'; SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC'; SET LOCAL standard_conforming_strings=on;
${objectsCte}, metadata AS MATERIALIZED (SELECT ${catalogExpression} catalog,${ledgerExpression} ledger),
payload AS MATERIALIZED (SELECT jsonb_build_object('format','nestory-local-business-schema-definitions-v1',
 'operationId',${literal(operationId)},'businessSourceSha256',${literal(businessSourceSha256)},
 'serverVersionNum',current_setting('server_version_num')::integer,'catalog',m.catalog,'ledger',m.ledger,'catalogText',m.catalog::text,'ledgerText',m.ledger::text,
 'definitions',(SELECT jsonb_agg(jsonb_build_object('kind',kind,'name',name,'definition',definition,'sha256',encode(extensions.digest(definition,'sha256'),'hex')) ORDER BY kind COLLATE "C",name COLLATE "C") FROM objects))::text value,
 encode(extensions.digest(m.catalog::text,'sha256'),'hex') schema_sha256,encode(extensions.digest(m.ledger::text,'sha256'),'hex') ledger_sha256 FROM metadata m),
encoded AS MATERIALIZED (SELECT *,convert_to(value,'UTF8') payload_bytes,encode(extensions.digest(value,'sha256'),'hex') payload_sha256 FROM payload),
checked AS MATERIALIZED (SELECT *,${chunk} chunk_bytes,CASE
 WHEN schema_sha256<>${literal(schemaSha256)} OR ledger_sha256<>${literal(ledgerSha256)} THEN 'catalog_changed'
 WHEN octet_length(payload_bytes)>${SCHEMA_CAPTURE_MAX_BYTES} THEN 'payload_limit'
 WHEN ${expectedPayloadSha256===null?'false':`payload_sha256<>${literal(expectedPayloadSha256)}`} THEN 'payload_changed'
 WHEN ${chunkIndex===null?'false':`${chunkIndex*SCHEMA_CAPTURE_CHUNK_BYTES}>=octet_length(payload_bytes)`} THEN 'chunk_invalid' ELSE 'ready' END status FROM encoded),
sealed AS MATERIALIZED (SELECT *,CASE WHEN status='ready' AND chunk_bytes IS NOT NULL THEN
 extensions.pgp_pub_encrypt_bytea(chunk_bytes,extensions.dearmor(${literal(publicKeyArmored)}),'cipher-algo=aes256,compress-algo=0') ELSE NULL::bytea END ciphertext FROM checked)
SELECT jsonb_build_object('format','nestory-local-schema-ciphertext-chunk-v1','status',status,'operationId',${literal(operationId)},
 'businessSourceSha256',${literal(businessSourceSha256)},'schemaSha256',schema_sha256,'ledgerSha256',ledger_sha256,'publicKeySha256',${literal(publicKeySha256)},
 'payloadSha256',payload_sha256,'payloadBytes',octet_length(payload_bytes),'chunkBytes',${SCHEMA_CAPTURE_CHUNK_BYTES},
 'chunkIndex',${chunkIndex===null?'NULL':chunkIndex},'chunkCount',ceil(octet_length(payload_bytes)::numeric/${SCHEMA_CAPTURE_CHUNK_BYTES})::integer,
 'plaintextChunkSha256',CASE WHEN ciphertext IS NOT NULL THEN encode(extensions.digest(chunk_bytes,'sha256'),'hex') ELSE NULL END,
 'ciphertextSha256',CASE WHEN ciphertext IS NOT NULL THEN encode(extensions.digest(ciphertext,'sha256'),'hex') ELSE NULL END,
 'ciphertextBase64',CASE WHEN ciphertext IS NOT NULL THEN replace(encode(ciphertext,'base64'),E'\\n','') ELSE NULL END) AS encrypted_schema_capture FROM sealed;
COMMIT;`;
}
const common=['format','status','operationId','businessSourceSha256','schemaSha256','ledgerSha256','publicKeySha256','payloadSha256','payloadBytes','chunkBytes','chunkCount'];
const fields=[...common,'chunkIndex','plaintextChunkSha256','ciphertextSha256','ciphertextBase64'];
export function assertSchemaCapturePreview(o,expected){
 if(!exact(o,fields)||o.format!=='nestory-local-schema-ciphertext-chunk-v1'||o.status!=='ready'||!uuid.test(o.operationId)||
  !['businessSourceSha256','schemaSha256','ledgerSha256','publicKeySha256','payloadSha256'].every(k=>digest.test(o[k]))||
  !Number.isSafeInteger(o.payloadBytes)||o.payloadBytes<1||o.payloadBytes>SCHEMA_CAPTURE_MAX_BYTES||o.chunkBytes!==SCHEMA_CAPTURE_CHUNK_BYTES||o.chunkCount!==Math.ceil(o.payloadBytes/SCHEMA_CAPTURE_CHUNK_BYTES)||
  ['chunkIndex','plaintextChunkSha256','ciphertextSha256','ciphertextBase64'].some(k=>o[k]!==null))fail();
 if(expected!==undefined){
  const keys=['operationId','businessSourceSha256','schemaSha256','ledgerSha256','publicKeySha256'];
  if(!exact(expected,keys)||keys.some(k=>o[k]!==expected[k]))fail();
 }
 return o;
}
export function verifySchemaCaptureChunk(o,expected){
 if(!exact(o,fields)||common.some(k=>o[k]!==expected[k])||!Number.isSafeInteger(o.chunkIndex)||o.chunkIndex!==expected.chunkIndex||o.chunkIndex<0||o.chunkIndex>=o.chunkCount||
  !digest.test(o.plaintextChunkSha256)||!digest.test(o.ciphertextSha256)||typeof o.ciphertextBase64!=='string'||o.ciphertextBase64.length>90000)fail();
 assertSchemaCapturePreview({...o,chunkIndex:null,plaintextChunkSha256:null,ciphertextSha256:null,ciphertextBase64:null});
 const bytes=Buffer.from(o.ciphertextBase64,'base64');if(bytes.toString('base64')!==o.ciphertextBase64||hash(bytes)!==o.ciphertextSha256)fail();return bytes;
}
export function verifySchemaDefinitions(bytes,expected){
 assertSchemaCapturePreview(expected);
 if(!(bytes instanceof Uint8Array)||bytes.length!==expected.payloadBytes||hash(bytes)!==expected.payloadSha256)fail();
 let p;try{p=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes))}catch{fail()}
 if(!exact(p,['format','operationId','businessSourceSha256','serverVersionNum','catalog','ledger','catalogText','ledgerText','definitions'])||p.format!=='nestory-local-business-schema-definitions-v1'||
  p.operationId!==expected.operationId||p.businessSourceSha256!==expected.businessSourceSha256||!Number.isSafeInteger(p.serverVersionNum)||p.serverVersionNum<150000||p.serverVersionNum>=180000||
  !Array.isArray(p.catalog)||!p.catalog.length||!Array.isArray(p.ledger)||!p.ledger.length||!Array.isArray(p.definitions)||p.catalog.length!==p.definitions.length||
  typeof p.catalogText!=='string'||typeof p.ledgerText!=='string'||hash(p.catalogText)!==expected.schemaSha256||hash(p.ledgerText)!==expected.ledgerSha256)fail();
 // Hash the exact PostgreSQL text. A JavaScript JSON canonicalizer has different
 // key ordering and separators and cannot substitute for this source witness.
 try{if(!isDeepStrictEqual(JSON.parse(p.catalogText),p.catalog)||!isDeepStrictEqual(JSON.parse(p.ledgerText),p.ledger))fail()}catch{fail()}
 const seen=new Set();
 for(let i=0;i<p.definitions.length;i++){
  const d=p.definitions[i],c=p.catalog[i];
  if(!exact(d,['kind','name','definition','sha256'])||!exact(c,['kind','name','sha256'])||!kinds.has(d.kind)||typeof d.name!=='string'||typeof d.definition!=='string'||
   !d.name.length||!d.definition.length||!digest.test(d.sha256)||hash(d.definition)!==d.sha256||c.kind!==d.kind||c.name!==d.name||c.sha256!==d.sha256||seen.has(d.kind+':'+d.name)||
   i>0&&(Buffer.compare(Buffer.from(p.definitions[i-1].kind),Buffer.from(d.kind))>0||p.definitions[i-1].kind===d.kind&&Buffer.compare(Buffer.from(p.definitions[i-1].name),Buffer.from(d.name))>=0))fail();
  seen.add(d.kind+':'+d.name);
 }
 return p;
}
export function verifySchemaCaptureCompleteness({before,after,observations,plaintextChunks,expected}){
 assertSchemaCapturePreview(before,expected);assertSchemaCapturePreview(after,expected);
 if(common.some(k=>before[k]!==after[k])||!Array.isArray(observations)||!Array.isArray(plaintextChunks)||observations.length!==before.chunkCount||plaintextChunks.length!==before.chunkCount)fail();
 for(let i=0;i<observations.length;i++){
  verifySchemaCaptureChunk(observations[i],{...before,chunkIndex:i});const b=plaintextChunks[i];
  if(!(b instanceof Uint8Array)||b.length!==Math.min(SCHEMA_CAPTURE_CHUNK_BYTES,before.payloadBytes-i*SCHEMA_CAPTURE_CHUNK_BYTES)||hash(b)!==observations[i].plaintextChunkSha256)fail();
 }
 const bytes=Buffer.concat(plaintextChunks);try{verifySchemaDefinitions(bytes,before);return bytes}catch(e){bytes.fill(0);throw e}
}
