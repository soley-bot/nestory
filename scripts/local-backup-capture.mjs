// Fixed Pilot-only read-only ciphertext query builder; no network or dispatch.
import { createHash } from 'node:crypto';
import * as pgp from 'openpgp';
import { RESET_REGISTRY, STORAGE_REFERENCES } from './pilot-finance-reset-registry.mjs';
import { catalogExpression, ledgerExpression } from './pilot-finance-reset-hosted-transport-protocol.mjs';
export const PILOT_BACKUP_ORGANIZATION = '752a87b8-bd04-4a45-9cb8-00687af66e73';
export const LOCAL_CAPTURE_CHUNK_BYTES = 65536;
export const LOCAL_CAPTURE_MAX_BYTES = 32 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const relation = value => value.split('.').map(v => `"${v}"`).join('.');
export const LOCAL_CAPTURE_POLICY = Object.freeze(Object.entries(RESET_REGISTRY).filter(([, r]) => r.scope)
  .sort(([a], [b]) => a.localeCompare(b)).map(([table, r]) => Object.freeze({ table, scopeColumn: r.scope,
    capture: table.startsWith('app_private.privileged_email_step_up_') || r.disposition === 'must-be-empty' ? 'count-and-hash-only' : 'full-row-image',
    mustBeEmpty: r.disposition === 'must-be-empty' })));
const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const fail = () => { throw new Error('local_backup_capture_configuration_invalid'); };

function sourceCtes(operationId) {
  const rosterJson = JSON.stringify(LOCAL_CAPTURE_POLICY.map(({ table, ...rest }) => ({ table_name: table, ...rest })));
  const images = LOCAL_CAPTURE_POLICY.map(p => `SELECT ${literal(p.table)}::text table_name, ${literal(p.capture)}::text capture,
    ${p.mustBeEmpty}::boolean must_be_empty, app_private.financial_reset_primary_key(${literal(p.table)}::regclass,to_jsonb(t)) primary_key,
    to_jsonb(t)::text row_text, encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex') row_sha256
    FROM ${relation(p.table)} t WHERE t.${relation(p.scopeColumn)}=${literal(PILOT_BACKUP_ORGANIZATION)}::uuid`).join('\nUNION ALL\n');
  const refs = STORAGE_REFERENCES.map(r => `SELECT r.table_name,r.primary_key,${literal(r.bucket)}::text bucket,
    r.row_text::jsonb->>${literal(r.pathColumn)} path, ${r.objectColumn ? `r.row_text::jsonb->>${literal(r.objectColumn)}` : 'NULL::text'} object_id
    FROM images r WHERE r.capture='full-row-image' AND r.table_name=${literal(r.table)}
    AND (r.row_text::jsonb->>${literal(r.pathColumn)} IS NOT NULL${r.objectColumn ? ` OR r.row_text::jsonb->>${literal(r.objectColumn)} IS NOT NULL` : ''})`).join('\nUNION ALL\n');
  return `WITH classified_schema AS MATERIALIZED (SELECT count(*) unclassified_tables FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','app_private') AND c.relkind IN ('r','p') AND n.nspname||'.'||c.relname NOT IN (${Object.keys(RESET_REGISTRY).sort().map(literal).join(',')})),
images AS MATERIALIZED (${images}),
roster AS (SELECT * FROM jsonb_to_recordset(${literal(rosterJson)}::jsonb) r(table_name text,"scopeColumn" text,capture text,"mustBeEmpty" boolean)),
table_payload AS MATERIALIZED (
 SELECT r.table_name,r."scopeColumn",r.capture,r."mustBeEmpty",count(i.table_name) row_count,
 encode(extensions.digest(coalesce(string_agg(i.row_sha256,'' ORDER BY i.primary_key::text),''),'sha256'),'hex') rows_sha256,
 CASE WHEN r.capture='full-row-image' THEN coalesce(jsonb_agg(jsonb_build_object('primaryKey',i.primary_key,'rowText',i.row_text,'rowSha256',i.row_sha256)
 ORDER BY i.primary_key::text) FILTER (WHERE i.table_name IS NOT NULL),'[]'::jsonb) ELSE NULL::jsonb END rows
 FROM roster r LEFT JOIN images i ON i.table_name=r.table_name GROUP BY r.table_name,r."scopeColumn",r.capture,r."mustBeEmpty"),
refs AS MATERIALIZED (${refs}),
storage_images AS MATERIALIZED (SELECT DISTINCT o.id, to_jsonb(o)::text row_text FROM storage.objects o JOIN refs r
 ON o.bucket_id=r.bucket AND (r.path IS NULL OR o.name=r.path) AND (r.object_id IS NULL OR o.id::text=r.object_id)),
storage_buckets AS MATERIALIZED (SELECT b.id,to_jsonb(b)::text row_text FROM storage.buckets b
 WHERE b.id IN (SELECT s.row_text::jsonb->>'bucket_id' FROM storage_images s)),
metadata AS MATERIALIZED (SELECT ${catalogExpression} catalog,${ledgerExpression} ledger,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('table',r.table_name,'columns',
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
    'notNull',a.attnotnull,'generated',a.attgenerated,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=r.table_name::regclass AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conname),'[]'::jsonb)
    FROM pg_constraint c WHERE c.conrelid=r.table_name::regclass)) ORDER BY r.table_name),'[]'::jsonb)
 FROM (SELECT table_name FROM roster UNION ALL SELECT 'storage.objects' UNION ALL SELECT 'storage.buckets') r) restore_metadata),
snapshot AS MATERIALIZED (SELECT jsonb_build_object('format','nestory-local-pilot-business-capture-v1','scope','selected-org-business',
 'operationId',${literal(operationId)},'organizationId',${literal(PILOT_BACKUP_ORGANIZATION)},'authBackupIncluded',false,
 'securityMetadataIncluded',true,'excludedCredentialRelations',${literal(JSON.stringify(['auth.*', ...LOCAL_CAPTURE_POLICY.filter(p => p.capture === 'count-and-hash-only').map(p => p.table)]))}::jsonb,
 'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.table_name) FROM table_payload t),
 'storageReferences',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.table_name,r.primary_key::text,r.bucket,r.path),'[]'::jsonb) FROM refs r),
 'storageMetadata',(SELECT coalesce(jsonb_agg(jsonb_build_object('rowText',s.row_text,'rowSha256',encode(extensions.digest(s.row_text,'sha256'),'hex')) ORDER BY s.id),'[]'::jsonb) FROM storage_images s),
 'storageBucketMetadata',(SELECT coalesce(jsonb_agg(jsonb_build_object('rowText',s.row_text,'rowSha256',encode(extensions.digest(s.row_text,'sha256'),'hex')) ORDER BY s.id),'[]'::jsonb) FROM storage_buckets s),
 'catalog',m.catalog,'ledger',m.ledger,'restoreMetadata',m.restore_metadata)::text payload,
 encode(extensions.digest(m.catalog::text,'sha256'),'hex') schema_sha256,encode(extensions.digest(m.ledger::text,'sha256'),'hex') ledger_sha256,
 (SELECT coalesce(sum(row_count),0) FROM table_payload WHERE capture='full-row-image') business_rows,
 (SELECT count(*) FROM table_payload WHERE "mustBeEmpty" AND row_count<>0) nonempty_capability_tables,
 (SELECT count(*) FROM refs r WHERE (SELECT count(*) FROM storage_images s WHERE s.row_text::jsonb->>'bucket_id'=r.bucket
   AND (r.path IS NULL OR s.row_text::jsonb->>'name'=r.path) AND (r.object_id IS NULL OR s.id::text=r.object_id))<>1) missing_storage_references
 FROM metadata m),
encoded AS MATERIALIZED (SELECT *,convert_to(payload,'UTF8') payload_bytes,encode(extensions.digest(payload,'sha256'),'hex') source_sha256 FROM snapshot)`;
}

// Reuse the fixed scoped capture projection for aggregate-only admission
// witnesses. This exports SQL construction only, never a connection or rows.
export function buildPilotCaptureSourceCtes(operationId) {
  if(!uuid.test(operationId))fail();return sourceCtes(operationId);
}

export async function buildPilotCiphertextCaptureSql(input) {
  if (!input || Object.keys(input).some(k => !['operationId','publicKeyArmored','publicKeySha256','expectedSourceSha256','chunkIndex'].includes(k))) fail();
  const { operationId, publicKeyArmored, publicKeySha256, expectedSourceSha256 = null, chunkIndex = null } = input;
  if (!uuid.test(operationId) || typeof publicKeyArmored !== 'string' || publicKeyArmored.length > 16384 || !digest.test(publicKeySha256) ||
      hash(publicKeyArmored) !== publicKeySha256 || expectedSourceSha256 !== null && !digest.test(expectedSourceSha256) ||
      chunkIndex !== null && (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= LOCAL_CAPTURE_MAX_BYTES / LOCAL_CAPTURE_CHUNK_BYTES || expectedSourceSha256 === null)) fail();
  let key; try { key = await pgp.readKey({ armoredKey: publicKeyArmored, config: { v6Keys: false } }); } catch { fail(); }
  if (key.isPrivate() || key.keyPacket.version !== 4 || key.getAlgorithmInfo().algorithm !== 'rsaEncryptSign' || key.getAlgorithmInfo().bits !== 3072) fail();
  const chunk = chunkIndex === null ? 'NULL::bytea' : `substring(payload_bytes FROM ${chunkIndex * LOCAL_CAPTURE_CHUNK_BYTES + 1} FOR ${LOCAL_CAPTURE_CHUNK_BYTES})`;
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='60s'; SET LOCAL idle_in_transaction_session_timeout='65s'; SET LOCAL timezone='UTC'; SET LOCAL search_path=pg_catalog,public;
${sourceCtes(operationId)},
checked AS MATERIALIZED (SELECT *,${chunk} chunk_bytes,
 CASE WHEN (SELECT unclassified_tables FROM classified_schema)<>0 THEN 'unclassified_schema'
 WHEN nonempty_capability_tables<>0 THEN 'capabilities_present'
 WHEN missing_storage_references<>0 THEN 'storage_references_missing'
 WHEN octet_length(payload_bytes)>${LOCAL_CAPTURE_MAX_BYTES} THEN 'payload_limit'
 WHEN ${expectedSourceSha256 === null ? 'false' : `source_sha256<>${literal(expectedSourceSha256)}`} THEN 'source_changed'
 WHEN ${chunkIndex === null ? 'false' : `${chunkIndex * LOCAL_CAPTURE_CHUNK_BYTES}>=octet_length(payload_bytes)`} THEN 'chunk_invalid'
 ELSE 'ready' END status FROM encoded),
sealed AS MATERIALIZED (SELECT *,CASE WHEN status='ready' AND chunk_bytes IS NOT NULL THEN
 extensions.pgp_pub_encrypt_bytea(chunk_bytes,extensions.dearmor(${literal(publicKeyArmored)}),'cipher-algo=aes256,compress-algo=0') ELSE NULL::bytea END ciphertext FROM checked)
SELECT jsonb_build_object('format','nestory-local-pilot-ciphertext-chunk-v2','chunkBytes',${LOCAL_CAPTURE_CHUNK_BYTES},'status',status,'operationId',${literal(operationId)},
 'sourceSha256',source_sha256,'schemaSha256',schema_sha256,'ledgerSha256',ledger_sha256,'publicKeySha256',${literal(publicKeySha256)},
 'payloadBytes',octet_length(payload_bytes),'businessRows',business_rows,'tableCount',${LOCAL_CAPTURE_POLICY.length},
 'chunkIndex',${chunkIndex === null ? 'NULL' : chunkIndex},'chunkCount',ceil(octet_length(payload_bytes)::numeric/${LOCAL_CAPTURE_CHUNK_BYTES})::int,
 'plaintextChunkSha256',CASE WHEN ciphertext IS NOT NULL THEN encode(extensions.digest(chunk_bytes,'sha256'),'hex') ELSE NULL END,
 'ciphertextSha256',CASE WHEN ciphertext IS NOT NULL THEN encode(extensions.digest(ciphertext,'sha256'),'hex') ELSE NULL END,
 'ciphertextBase64',CASE WHEN ciphertext IS NOT NULL THEN replace(encode(ciphertext,'base64'),E'\\n','') ELSE NULL END) AS encrypted_capture
FROM sealed; COMMIT;`;
}

// Every transaction must independently observe the same complete payload hash.
// This does not claim that different connector calls share a database snapshot.
export function verifyCaptureChunk(o, expected) {
  const fields = ['format','status','operationId','sourceSha256','schemaSha256','ledgerSha256','publicKeySha256','payloadBytes','businessRows','tableCount','chunkIndex','chunkCount','plaintextChunkSha256','ciphertextSha256','ciphertextBase64'];
  const chunkBytes=captureChunkBytes(o);
  if(o.format==='nestory-local-pilot-ciphertext-chunk-v2')fields.push('chunkBytes');
  if (!o || Object.keys(o).sort().join(',') !== fields.sort().join(',') || o.status !== 'ready' ||
      !digest.test(o.sourceSha256) || !digest.test(o.schemaSha256) || !digest.test(o.ledgerSha256) ||
      !Number.isInteger(o.payloadBytes) || o.payloadBytes < 1 || o.payloadBytes > LOCAL_CAPTURE_MAX_BYTES ||
      o.chunkCount !== Math.ceil(o.payloadBytes / chunkBytes) || o.tableCount !== LOCAL_CAPTURE_POLICY.length ||
      !Number.isInteger(o.chunkIndex) || o.chunkIndex < 0 || o.chunkIndex >= o.chunkCount ||
      !Number.isInteger(o.businessRows) || o.businessRows < 0 ||
      ['format','chunkBytes','operationId','sourceSha256','schemaSha256','ledgerSha256','publicKeySha256','payloadBytes','chunkCount','chunkIndex'].some(k => o[k] !== expected[k]) ||
      !digest.test(o.plaintextChunkSha256) || !digest.test(o.ciphertextSha256) ||
      typeof o.ciphertextBase64 !== 'string' || o.ciphertextBase64.length > (chunkBytes===8192?16000:90000)) fail();
  const bytes = Buffer.from(o.ciphertextBase64,'base64');
  if (bytes.toString('base64') !== o.ciphertextBase64 || hash(bytes) !== o.ciphertextSha256) fail();
  return bytes;
}

function captureChunkBytes(o){
  if(o?.format==='nestory-local-pilot-ciphertext-chunk-v1'&&!Object.hasOwn(o,'chunkBytes'))return 8192;
  if(o?.format==='nestory-local-pilot-ciphertext-chunk-v2'&&o.chunkBytes===65536)return 65536;
  fail();
}

export function verifyCaptureCompleteness({ before, after, observations, plaintextChunks }) {
  const stable = ['format','chunkBytes','operationId','sourceSha256','schemaSha256','ledgerSha256','publicKeySha256','payloadBytes','chunkCount','businessRows','tableCount'];
  if (!before || !after || before.status !== 'ready' || after.status !== 'ready' ||
      stable.some(k => before[k] !== after[k]) || !Array.isArray(observations) || !Array.isArray(plaintextChunks) ||
      observations.length !== before.chunkCount || plaintextChunks.length !== before.chunkCount) fail();
  let total = 0;
  const chunkBytes=captureChunkBytes(before);
  for (let index = 0; index < observations.length; index++) {
    const o = observations[index], bytes = plaintextChunks[index];
    verifyCaptureChunk(o, { ...before, chunkIndex: index });
    const length = Math.min(chunkBytes, before.payloadBytes - index * chunkBytes);
    if (!(bytes instanceof Uint8Array) || bytes.length !== length || hash(bytes) !== o.plaintextChunkSha256) fail();
    total += bytes.length;
  }
  if (total !== before.payloadBytes) fail();
  const bytes = Buffer.concat(plaintextChunks);
  if (hash(bytes) !== before.sourceSha256) { bytes.fill(0); fail(); }
  return bytes;
}
