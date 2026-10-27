// Pure, local-rehearsal SQL construction. No connections, credentials, customer
// intake, trigger changes on a hosted database, or permission to execute SQL.
import { createHash } from 'node:crypto';
import { LOCAL_CAPTURE_POLICY, PILOT_BACKUP_ORGANIZATION, LOCAL_CAPTURE_MAX_BYTES } from './local-backup-capture.mjs';
import { catalogExpression, ledgerExpression } from './pilot-finance-reset-hosted-transport-protocol.mjs';
import {verifyResetMigrationLedgerDescriptors} from './pilot-finance-reset-migration-parity.mjs';
import { STORAGE_REFERENCES } from './pilot-finance-reset-registry.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fail = code => { throw new Error(`local_business_restore_${code}`); };
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
const plain = value => value !== null && Object.getPrototypeOf(value) === Object.prototype;
const replayContracts = new WeakMap();
export {selectCapturedMigrations} from './pilot-finance-reset-migration-parity.mjs';
export function verifyBusinessMigrationReplay(ledger,localSources,manifestBytes){
 const{sources,contract,installedLedger}=verifyResetMigrationLedgerDescriptors(ledger,localSources,manifestBytes);
 replayContracts.set(contract,{capturedLedgerSha256:hash(JSON.stringify(ledger)),installedLedger});
 return{sources,contract};
}

function checkedImage(row) {
  if (!plain(row) || typeof row.rowText !== 'string' || !digest.test(row.rowSha256) || hash(row.rowText) !== row.rowSha256) fail('row_digest_invalid');
  let value; try { value = JSON.parse(row.rowText); } catch { fail('row_json_invalid'); }
  if (!plain(value)) fail('row_json_invalid');
  return value;
}

export function validateBusinessSnapshot(bytes, expectedSourceSha256) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > LOCAL_CAPTURE_MAX_BYTES ||
    !digest.test(expectedSourceSha256) || hash(bytes) !== expectedSourceSha256) fail('payload_digest_invalid');
  let s; try { s = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)); } catch { fail('payload_invalid'); }
  if (!plain(s) || s.format !== 'nestory-local-pilot-business-capture-v1' || s.scope !== 'selected-org-business' ||
    s.organizationId !== PILOT_BACKUP_ORGANIZATION || !uuid.test(s.operationId) || s.authBackupIncluded !== false ||
    s.securityMetadataIncluded !== true || !Array.isArray(s.excludedCredentialRelations) ||
    JSON.stringify([...s.excludedCredentialRelations].sort()) !== JSON.stringify(['auth.*', ...LOCAL_CAPTURE_POLICY.filter(p => p.capture === 'count-and-hash-only').map(p => p.table)].sort()) ||
    !Array.isArray(s.tables) || s.tables.length !== LOCAL_CAPTURE_POLICY.length || !Array.isArray(s.catalog) ||
    !Array.isArray(s.ledger) || s.ledger.length < 1 || !Array.isArray(s.restoreMetadata) ||
    !Array.isArray(s.storageReferences) || !Array.isArray(s.storageMetadata)) fail('payload_scope_invalid');
  const tables = new Map(), metadata = new Map(); let businessRows = 0;
  for (const m of s.restoreMetadata) {
    if (!plain(m) || typeof m.table !== 'string' || metadata.has(m.table) || !Array.isArray(m.columns) || !Array.isArray(m.constraints)) fail('restore_metadata_invalid');
    metadata.set(m.table, m);
  }
  for (const t of s.tables) {
    const p = LOCAL_CAPTURE_POLICY.find(p => p.table === t.table_name);
    if (!p || tables.has(t.table_name) || t.scopeColumn !== p.scopeColumn || t.capture !== p.capture || t.mustBeEmpty !== p.mustBeEmpty ||
      !Number.isSafeInteger(t.row_count) || t.row_count < 0 || !digest.test(t.rows_sha256) || t.mustBeEmpty && t.row_count !== 0) fail('table_coverage_invalid');
    const m = metadata.get(t.table_name);
    if (!m || m.columns.length < 1 || m.columns.some(c => !plain(c) || !/^[a-z_][a-z0-9_]*$/.test(c.name)) ||
      new Set(m.columns.map(c => c.name)).size !== m.columns.length) fail('restore_metadata_invalid');
    if (t.capture === 'count-and-hash-only') {
      if (t.rows !== null) fail('excluded_rows_present');
    } else {
      if (!Array.isArray(t.rows) || t.rows.length !== t.row_count) fail('row_count_invalid');
      const seen = new Set();
      for (const r of t.rows) {
        const v = checkedImage(r);
        if (!plain(r.primaryKey) || !Object.keys(r.primaryKey).length || Object.entries(r.primaryKey).some(([k, x]) => x == null || v[k] !== x) ||
          v[t.scopeColumn] !== s.organizationId || Object.keys(v).sort().join(',') !== m.columns.map(c => c.name).sort().join(',')) fail('row_scope_invalid');
        const key = JSON.stringify(Object.entries(r.primaryKey).sort(([a], [b]) => a.localeCompare(b)));
        if (seen.has(key)) fail('duplicate_row'); seen.add(key);
      }
      businessRows += t.row_count;
    }
    tables.set(t.table_name, t);
  }
  const objects = new Map(), buckets = new Map(), expectedReferences = new Map();
  const referenceKey = (table, pk) => JSON.stringify([table, Object.entries(pk).sort(([a], [b]) => a.localeCompare(b))]);
  for (const rule of STORAGE_REFERENCES) {
    for (const r of tables.get(rule.table)?.rows ?? []) {
      const row = JSON.parse(r.rowText), path = row[rule.pathColumn] ?? null, object_id = rule.objectColumn ? row[rule.objectColumn] ?? null : null;
      if (path !== null || object_id !== null) expectedReferences.set(referenceKey(rule.table, r.primaryKey), { bucket: rule.bucket, path, object_id });
    }
  }
  for (const r of s.storageMetadata) {
    const v = checkedImage(r);
    if (!uuid.test(v.id) || typeof v.bucket_id !== 'string' || typeof v.name !== 'string' || objects.has(v.id)) fail('storage_metadata_invalid');
    objects.set(v.id, v);
  }
  for (const r of s.storageBucketMetadata ?? []) {
    const v = checkedImage(r);
    if (typeof v.id !== 'string' || !v.id || buckets.has(v.id)) fail('storage_bucket_invalid');
    buckets.set(v.id, v);
  }
  const used = new Set(), seenReferences = new Set();
  for (const r of s.storageReferences) {
    if (!plain(r) || !tables.has(r.table_name) || !plain(r.primary_key) || typeof r.bucket !== 'string' ||
      r.path !== null && typeof r.path !== 'string' || r.object_id !== null && !uuid.test(r.object_id) || r.path === null && r.object_id === null) fail('storage_reference_invalid');
    const refKey = referenceKey(r.table_name, r.primary_key), source = expectedReferences.get(refKey);
    if (!source || seenReferences.has(refKey) || source.bucket !== r.bucket || source.path !== r.path || source.object_id !== r.object_id) fail('storage_reference_source_mismatch');
    seenReferences.add(refKey);
    const matches = [...objects.values()].filter(v => v.bucket_id === r.bucket && (r.path === null || v.name === r.path) && (r.object_id === null || v.id === r.object_id));
    if (matches.length !== 1 || !buckets.has(r.bucket)) fail('storage_reference_unrestorable');
    used.add(matches[0].id);
  }
  if (seenReferences.size !== expectedReferences.size || used.size !== objects.size || [...objects.values()].some(v => !buckets.has(v.bucket_id)) ||
    [...buckets.keys()].some(b => ![...objects.values()].some(o => o.bucket_id === b))) fail('storage_scope_invalid');
  return { snapshot: s, businessRows, tableCount: tables.size, storageObjects: objects.size, sourceSha256: expectedSourceSha256 };
}

export function buildSelectedBusinessRestoreSql({ bytes, expectedSourceSha256, migrationReplay }) {
  const v = validateBusinessSnapshot(bytes, expectedSourceSha256), s = v.snapshot;
  let installedLedger = s.ledger;
  if (migrationReplay !== undefined) {
    const verified = replayContracts.get(migrationReplay);
    if (!verified || verified.capturedLedgerSha256 !== hash(JSON.stringify(s.ledger))) fail('migration_replay_contract_invalid');
    installedLedger = verified.installedLedger;
  }
  const storageTables = [
    { table_name: 'storage.buckets', rows: s.storageBucketMetadata ?? [] },
    { table_name: 'storage.objects', rows: s.storageMetadata },
  ];
  const rows = [...s.tables.filter(t => t.capture === 'full-row-image').flatMap(t => t.rows.map(r => ({ table_name: t.table_name, ...r }))),
    ...storageTables.flatMap(t => t.rows.map(r => ({ table_name: t.table_name, primaryKey: { id: JSON.parse(r.rowText).id }, ...r })))];
  // This is intentionally not executable through a hosted adapter. A caller
  // must supply the verified owned RAM runtime; the module exposes no transport.
  return `BEGIN;
SET LOCAL standard_conforming_strings=on; SET LOCAL timezone='UTC'; SET LOCAL search_path=pg_catalog,public; SET LOCAL statement_timeout='120s';
DO $schema$ BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres' OR inet_server_addr() IS NOT NULL THEN RAISE EXCEPTION 'local_business_restore_local_owner_required'; END IF;
 IF ${catalogExpression} IS DISTINCT FROM ${json(s.catalog)} OR ${ledgerExpression} IS DISTINCT FROM ${json(installedLedger)} THEN
  RAISE EXCEPTION 'local_business_restore_schema_or_ledger_mismatch'; END IF;
END $schema$;
CREATE TEMP TABLE restore_images(table_name text NOT NULL, primary_key jsonb NOT NULL, row_text text NOT NULL, row_sha256 text NOT NULL,
 PRIMARY KEY(table_name,primary_key)) ON COMMIT DROP;
INSERT INTO restore_images SELECT x->>'table_name',x->'primaryKey',x->>'rowText',x->>'rowSha256' FROM jsonb_array_elements(${json(rows)}) x;
CREATE TEMP TABLE restore_tables(table_name text PRIMARY KEY, scope_column text NOT NULL, expected_rows bigint NOT NULL, expected_sha256 text NOT NULL) ON COMMIT DROP;
INSERT INTO restore_tables SELECT x->>'table_name',x->>'scopeColumn',(x->>'row_count')::bigint,x->>'rows_sha256' FROM jsonb_array_elements(${json(s.tables.filter(t => t.capture === 'full-row-image'))}) x;
CREATE TEMP TABLE restore_auth_anchors(id uuid PRIMARY KEY) ON COMMIT DROP;
DO $empty$ DECLARE r record; n bigint; BEGIN
 FOR r IN SELECT table_name FROM restore_tables UNION SELECT DISTINCT table_name FROM restore_images LOOP
  EXECUTE format('SELECT count(*) FROM %s',r.table_name::regclass) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'local_business_restore_destination_not_empty'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM auth.sessions) THEN RAISE EXCEPTION 'local_business_restore_auth_not_empty'; END IF;
END $empty$;
-- Local import only: no DDL alteration or constraint deletion. All original
-- CHECK/NOT NULL constraints still run; every FK is validated explicitly below.
SET LOCAL session_replication_role=replica;
DO $anchors$ DECLARE f record; r record; k text; target text; value text; BEGIN
 FOR f IN SELECT format('%I.%I',n.nspname,t.relname) table_name,c.conkey,c.confkey,c.confrelid FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE c.contype='f' AND c.confrelid='auth.users'::regclass AND c.conrelid IN(SELECT DISTINCT table_name::regclass FROM restore_images) LOOP
  IF cardinality(f.conkey)<>1 OR cardinality(f.confkey)<>1 THEN RAISE EXCEPTION 'local_business_restore_auth_reference_unsupported'; END IF;
  SELECT attname INTO STRICT k FROM pg_attribute WHERE attrelid=f.table_name::regclass AND attnum=f.conkey[1];
  SELECT attname INTO STRICT target FROM pg_attribute WHERE attrelid=f.confrelid AND attnum=f.confkey[1];
  IF target<>'id' THEN RAISE EXCEPTION 'local_business_restore_auth_reference_unsupported'; END IF;
  FOR r IN SELECT row_text FROM restore_images WHERE table_name=f.table_name LOOP
   value:=r.row_text::jsonb->>k;
   IF value IS NOT NULL THEN INSERT INTO restore_auth_anchors VALUES(value::uuid) ON CONFLICT DO NOTHING; END IF;
  END LOOP;
 END LOOP;
 INSERT INTO auth.users(id) SELECT id FROM restore_auth_anchors;
END $anchors$;
DO $load$ DECLARE r record; columns_sql text; select_sql text; actual text; BEGIN
 FOR r IN SELECT * FROM restore_images ORDER BY table_name,primary_key::text LOOP
  SELECT string_agg(format('%I',attname),',' ORDER BY attnum),string_agg(format('v.%I',attname),',' ORDER BY attnum)
   INTO columns_sql,select_sql FROM pg_attribute WHERE attrelid=r.table_name::regclass AND attnum>0 AND NOT attisdropped AND attgenerated='';
  EXECUTE format('INSERT INTO %s (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_record(NULL::%s,$1::jsonb) v',
   r.table_name::regclass,columns_sql,select_sql,r.table_name::regclass) USING r.row_text;
 END LOOP;
END $load$;
SET LOCAL session_replication_role=origin;
DO $verify$ DECLARE r record; actual text; n bigint; combined text; f record; equality_sql text; all_nonnull text; all_null text; predicate text; BEGIN
 FOR r IN SELECT * FROM restore_images LOOP
  EXECUTE format('SELECT to_jsonb(t)::text FROM %s t WHERE to_jsonb(t) @> $1',r.table_name::regclass) INTO STRICT actual USING r.primary_key;
  IF encode(extensions.digest(actual,'sha256'),'hex')<>r.row_sha256 OR actual<>r.row_text THEN RAISE EXCEPTION 'local_business_restore_row_mismatch'; END IF;
 END LOOP;
 FOR r IN SELECT * FROM restore_tables LOOP
  EXECUTE format('SELECT count(*),encode(extensions.digest(coalesce(string_agg(encode(extensions.digest(to_jsonb(t)::text,''sha256''),''hex''),'''' ORDER BY app_private.financial_reset_primary_key(%L::regclass,to_jsonb(t))::text),''''),''sha256''),''hex'') FROM %s t',r.table_name,r.table_name::regclass) INTO n,combined;
  IF n<>r.expected_rows OR combined<>r.expected_sha256 THEN RAISE EXCEPTION 'local_business_restore_table_mismatch'; END IF;
  EXECUTE format('SELECT count(*) FROM %s t WHERE t.%I IS DISTINCT FROM $1::uuid',r.table_name::regclass,r.scope_column) INTO n USING ${literal(PILOT_BACKUP_ORGANIZATION)};
  IF n<>0 THEN RAISE EXCEPTION 'local_business_restore_foreign_organization_present'; END IF;
 END LOOP;
 FOR f IN SELECT * FROM pg_constraint WHERE contype='f' AND conrelid IN(SELECT DISTINCT table_name::regclass FROM restore_images) LOOP
  IF f.confmatchtype NOT IN ('s','f') THEN RAISE EXCEPTION 'local_business_restore_fk_match_unsupported'; END IF;
  SELECT string_agg(format('s.%I=t.%I',a.attname,b.attname),' AND ' ORDER BY u.i),
   string_agg(format('s.%I IS NOT NULL',a.attname),' AND ' ORDER BY u.i),string_agg(format('s.%I IS NULL',a.attname),' AND ' ORDER BY u.i)
   INTO equality_sql,all_nonnull,all_null FROM unnest(f.conkey,f.confkey) WITH ORDINALITY u(source_att,target_att,i)
   JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=u.source_att JOIN pg_attribute b ON b.attrelid=f.confrelid AND b.attnum=u.target_att;
  predicate:=CASE WHEN f.confmatchtype='f' THEN format('NOT (%s) AND (NOT (%s) OR NOT EXISTS(SELECT 1 FROM %s t WHERE %s))',all_null,all_nonnull,f.confrelid::regclass,equality_sql)
   ELSE format('(%s) AND NOT EXISTS(SELECT 1 FROM %s t WHERE %s)',all_nonnull,f.confrelid::regclass,equality_sql) END;
  EXECUTE format('SELECT count(*) FROM %s s WHERE %s',f.conrelid::regclass,predicate) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'local_business_restore_foreign_key_unresolved'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM auth.sessions) OR EXISTS(SELECT 1 FROM auth.users WHERE encrypted_password IS NOT NULL AND encrypted_password<>'') THEN
  RAISE EXCEPTION 'local_business_restore_auth_credentials_present'; END IF;
END $verify$;
SELECT jsonb_build_object('format','nestory-local-business-row-restore-v1','sourceSha256',${literal(expectedSourceSha256)},
 'businessRows',(SELECT count(*) FROM restore_images WHERE table_name NOT LIKE 'storage.%'),'businessTables',(SELECT count(*) FROM restore_tables),
 'identityOnlyAuthAnchors',(SELECT count(*) FROM restore_auth_anchors),'storageMetadataRows',(SELECT count(*) FROM restore_images WHERE table_name='storage.objects'),
 'canonicalRowsVerified',true,'foreignKeysVerified',true,'foreignOrganizationRows',0,'physicalFileBytesVerified',false,'financialResetInverseProven',false);
COMMIT;`;
}
