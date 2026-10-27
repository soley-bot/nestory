import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { LOCAL_CAPTURE_POLICY, PILOT_BACKUP_ORGANIZATION } from './local-backup-capture.mjs';
import { describeMigrationStatement } from './hosted-migration-parity-core.mjs';
import { selectCapturedMigrations, verifyBusinessMigrationReplay, validateBusinessSnapshot, buildSelectedBusinessRestoreSql } from './local-backup-business-restore.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const id = '11111111-1111-4111-8111-111111111111';
function snapshot() {
  const tables = LOCAL_CAPTURE_POLICY.map(p => ({ table_name: p.table, scopeColumn: p.scopeColumn, capture: p.capture,
    mustBeEmpty: p.mustBeEmpty, row_count: 0, rows_sha256: hash(''), rows: p.capture === 'full-row-image' ? [] : null }));
  const restoreMetadata = LOCAL_CAPTURE_POLICY.map(p => ({ table: p.table,
    columns: [...new Set(['id', p.scopeColumn])].map(name => ({ name, type: 'uuid', notNull: true, generated: '', identity: '', default: null })), constraints: [] }));
  const t = tables.find(t => t.table_name === 'public.properties');
  const rowText = JSON.stringify({ id, organization_id: PILOT_BACKUP_ORGANIZATION });
  t.rows = [{ primaryKey: { id }, rowText, rowSha256: hash(rowText) }]; t.row_count = 1; t.rows_sha256 = hash(hash(rowText));
  return { format: 'nestory-local-pilot-business-capture-v1', scope: 'selected-org-business', operationId: id,
    organizationId: PILOT_BACKUP_ORGANIZATION, authBackupIncluded: false, securityMetadataIncluded: true,
    excludedCredentialRelations: ['auth.*', ...LOCAL_CAPTURE_POLICY.filter(p => p.capture === 'count-and-hash-only').map(p => p.table)], tables, restoreMetadata, catalog: [],
    ledger: [{ version: '20261026000100', name: 'example', statements: [describeMigrationStatement('SELECT 1;')] }],
    storageReferences: [], storageMetadata: [], storageBucketMetadata: [] };
}
function encoded(s) { const bytes = Buffer.from(JSON.stringify(s)); return { bytes, expectedSourceSha256: hash(bytes) }; }
test('captured ledger chooses exact historical sources and excludes newer local migration', () => {
  const s = snapshot();
  const sources = [{ name: '20261026000100_example.sql', sql: 'SELECT 1;' }, { name: '20261027005615_newer.sql', sql: 'SELECT 2;' }];
  const selected = selectCapturedMigrations(s.ledger, sources);
  assert.deepEqual(selected.map(s => s.name), ['20261026000100_example.sql']);
  assert.throws(() => selectCapturedMigrations(s.ledger, [{ ...sources[0], sql: 'SELECT 999;' }]), /migration_content_unproven/);
  assert.throws(() => selectCapturedMigrations(s.ledger, []), /migration_content_unproven/);
  assert.throws(() => selectCapturedMigrations([...s.ledger, ...s.ledger], sources), /migration_ledger_invalid/);
  const wholeBody = '\n\nSELECT 1;\n';
  const exactWhole = [{ ...s.ledger[0], statements: [describeMigrationStatement(wholeBody)] }];
  assert.equal(selectCapturedMigrations(exactWhole, [{ name: sources[0].name, sql: wholeBody }]).length, 1);
  assert.throws(() => selectCapturedMigrations(exactWhole, sources), /migration_content_unproven/);
});

test('whole-file compatibility proves exactly one additional LF and rejects other bytes',()=>{
 const name='20261026000100_example.sql',sql='SELECT 1;\n',entry={version:'20261026000100',name:'example',statements:[describeMigrationStatement(sql+'\n')]};
 assert.equal(selectCapturedMigrations([entry],[{name,sql}]).length,1);
 for(const suffix of ['\n\n',' ','\t','\nSELECT 2;'])assert.throws(()=>selectCapturedMigrations([{...entry,statements:[describeMigrationStatement(sql+suffix)]}],[{name,sql}]),/migration_content_unproven/);
});

test('historical descriptor bridge requires exact captured bytes plus existing Git and canonical pins',async()=>{
 const version='20260808235616',name='operational_schema_baseline';
 const source={name:`${version}_${name}.sql`,sql:await readFile(new URL(`../supabase/migrations/${version}_${name}.sql`,import.meta.url),'utf8')};
 const manifest=await readFile(new URL('../supabase/migration-reconciliations/20260821-hosted-migration-canonical-hashes.json',import.meta.url));
 const entry={version,name,statements:[{byteLength:1238466,sha256:'4c449a7a22c37bf7867a008e6b5b42dbf20b91667fe0630cb4bec79f9aa83f3d'}]};
 const replay=verifyBusinessMigrationReplay([entry],[source],manifest);
 assert.deepEqual(replay.contract.reconciledVersions,[version]);assert.deepEqual(replay.contract.descriptorBridgeVersions,[version]);
 assert.notEqual(replay.contract.capturedLedgerDescriptorSha256,replay.contract.installedLedgerDescriptorSha256);
 for(const bad of [{...entry,name:'other'},{...entry,version:'20260808235617'},{...entry,statements:[{...entry.statements[0],byteLength:1238465}]},{...entry,statements:[{...entry.statements[0],sha256:'a'.repeat(64)}]}])
  assert.throws(()=>verifyBusinessMigrationReplay([bad],[source],manifest),/migration_content_unproven/);
 assert.throws(()=>verifyBusinessMigrationReplay([entry],[{...source,sql:source.sql+'\nSELECT 123;'}],manifest),/migration_content_unproven/);
 assert.throws(()=>verifyBusinessMigrationReplay([entry],[source],Buffer.from(manifest.toString().replace('legacyException','notAnException'))),/reconciliation_manifest_invalid/);
});
test('all classified tables and complete row digests are required', async t => {
  const s = snapshot(), e = encoded(s);
  assert.equal(validateBusinessSnapshot(e.bytes, e.expectedSourceSha256).businessRows, 1);
  const cases = {
    truncatedRoster: s => s.tables.pop(),
    duplicateTable: s => { s.tables[1] = s.tables[0]; },
    wrongOrganization: s => { s.organizationId = id; },
    authExport: s => { s.authBackupIncluded = true; },
    omittedExclusion: s => { s.excludedCredentialRelations.pop(); },
    misleadingSecurityMetadata: s => { s.securityMetadataIncluded = false; },
    missingColumn: s => { s.restoreMetadata.find(m => m.table === 'public.properties').columns.pop(); },
    rowHash: s => { s.tables.find(t => t.row_count).rows[0].rowSha256 = 'f'.repeat(64); },
    rowCount: s => { s.tables.find(t => t.row_count).row_count++; },
    rowScope: s => { const r = s.tables.find(t => t.row_count).rows[0]; r.rowText = JSON.stringify({ id, organization_id: id }); r.rowSha256 = hash(r.rowText); },
    nonemptyCapability: s => { s.tables.find(t => t.mustBeEmpty).row_count = 1; },
    excludedRowExposure: s => { s.tables.find(t => t.capture === 'count-and-hash-only').rows = [{}]; },
  };
  for (const [name, mutate] of Object.entries(cases)) await t.test(name, () => {
    const s = snapshot(); mutate(s); const e = encoded(s);
    assert.throws(() => validateBusinessSnapshot(e.bytes, e.expectedSourceSha256), /local_business_restore_/);
  });
  assert.throws(() => validateBusinessSnapshot(e.bytes, 'f'.repeat(64)), /payload_digest_invalid/);
});
test('Storage reference metadata cannot substitute for missing buckets or physical bytes', () => {
  const s = snapshot();
  const object = { id, bucket_id: 'nestory-documents', name: 'synthetic.pdf' };
  const document = JSON.stringify({ id, organization_id: PILOT_BACKUP_ORGANIZATION, storage_path: 'synthetic.pdf', storage_object_id: id });
  const table = s.tables.find(t => t.table_name === 'public.documents');
  table.rows = [{ primaryKey: { id }, rowText: document, rowSha256: hash(document) }]; table.row_count = 1; table.rows_sha256 = hash(hash(document));
  s.restoreMetadata.find(m => m.table === 'public.documents').columns.push({ name: 'storage_path' }, { name: 'storage_object_id' });
  s.storageMetadata = [{ rowText: JSON.stringify(object), rowSha256: hash(JSON.stringify(object)) }];
  s.storageReferences = [{ table_name: 'public.documents', primary_key: { id }, bucket: 'nestory-documents', path: 'synthetic.pdf', object_id: id }];
  let e = encoded(s); assert.throws(() => validateBusinessSnapshot(e.bytes, e.expectedSourceSha256), /storage_reference_unrestorable/);
  const bucket = JSON.stringify({ id: 'nestory-documents', name: 'nestory-documents', public: false });
  s.storageBucketMetadata = [{ rowText: bucket, rowSha256: hash(bucket) }];
  e = encoded(s); assert.equal(validateBusinessSnapshot(e.bytes, e.expectedSourceSha256).storageObjects, 1);
  const sql = buildSelectedBusinessRestoreSql(e);
  assert.match(sql, /'physicalFileBytesVerified',false/);
  assert.match(sql, /'financialResetInverseProven',false/);
});
test('local import verifies schema first, restores triggers, validates canonical images and every FK', () => {
  assert.throws(() => buildSelectedBusinessRestoreSql({ ...encoded(snapshot()), migrationReplay: { verified: true } }), /migration_replay_contract_invalid/);
  const sql = buildSelectedBusinessRestoreSql(encoded(snapshot()));
  assert.match(sql, /SET LOCAL search_path=pg_catalog,public/);
  assert.ok(sql.indexOf('schema_or_ledger_mismatch') < sql.indexOf('session_replication_role=replica'));
  assert.ok(sql.indexOf('session_replication_role=origin') < sql.indexOf('$verify$'));
  assert.match(sql, /INSERT INTO auth\.users\(id\) SELECT id FROM restore_auth_anchors/);
  assert.doesNotMatch(sql, /INSERT INTO auth\.sessions/);
  assert.match(sql, /local_business_restore_auth_credentials_present/);
  assert.match(sql, /OVERRIDING SYSTEM VALUE/);
  assert.match(sql, /attgenerated=''/);
  assert.match(sql, /local_business_restore_foreign_key_unresolved/);
  assert.match(sql, /f\.confmatchtype='f'/);
  assert.match(sql, /actual<>r\.row_text/);
  assert.match(sql, /local_business_restore_table_mismatch/);
  assert.match(sql, /COMMIT;$/);
});
