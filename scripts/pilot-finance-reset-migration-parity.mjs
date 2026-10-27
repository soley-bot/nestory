// Shared finite raw-ledger verification. No history edits or generic trimming.
import {createHash} from 'node:crypto';
import {reconstructLocalMigrationDescriptors,canonicalMigrationHash,hashGitMigrationBody,describeMigrationStatement} from './hosted-migration-parity-core.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=code=>{throw Error(`local_business_restore_${code}`)};
const reconciliationSha256 = '9055cb96b84a50dd23a1e1a090c76763f871d9e035b35c4e988c3283af58018e';
// Read-only ledger observation, 2026-10-27. Capture retains outer whitespace;
// production parity trims it. This bridges one exact historical descriptor to
// the existing immutable legacy exception, never creates a new SQL exception.
const baselineDescriptorBridge = Object.freeze({version:'20260808235616',name:'operational_schema_baseline',
  captured:Object.freeze({byteLength:1238466,sha256:'4c449a7a22c37bf7867a008e6b5b42dbf20b91667fe0630cb4bec79f9aa83f3d'}),
  canonical:Object.freeze({byteLength:1238464,sha256:'e90c8983fc0659d258f4d7704c779113fcef170914d53239a7628c38fac0c4ec'})});
function canonicalLegacyEntry(entry) {
  const b=baselineDescriptorBridge;
  if(entry.version===b.version&&entry.name===b.name&&entry.statements?.length===1&&
    entry.statements[0].byteLength===b.captured.byteLength&&entry.statements[0].sha256===b.captured.sha256)
    return {...entry,statements:[b.canonical]};
  return entry;
}

// A replay contract is minted only after independent captured-ledger/source
// comparison. The sole historical exception authority is the existing reviewed
// immutable manifest, pinned by bytes; no Boolean or caller exception list.
export function verifyResetMigrationLedgerDescriptors(ledger, localSources, manifestBytes) {
  if (!(manifestBytes instanceof Uint8Array)) fail('reconciliation_manifest_invalid');
  const normalized = new TextDecoder('utf8', { fatal: true }).decode(manifestBytes).replaceAll('\r\n', '\n');
  if (hash(normalized) !== reconciliationSha256) fail('reconciliation_manifest_invalid');
  const manifest = JSON.parse(normalized), selected = [], reconciledVersions = [], installedLedger = [], descriptorBridgeVersions=[];
  const entries = new Map(manifest.hostedMigrationHashes.map(e => [e.version, e]));
  if (!Array.isArray(ledger) || !ledger.length || !Array.isArray(localSources)) fail('migration_inputs_invalid');
  const sourceNames = new Set();
  for (const source of localSources) {
    if (!plain(source) || !/^\d{14}_[a-z0-9_]+\.sql$/.test(source.name) || typeof source.sql !== 'string' || sourceNames.has(source.name)) fail('migration_source_invalid');
    sourceNames.add(source.name);
  }
  for (const entry of ledger) {
    let result;
    try { result = selectCapturedMigrations([entry], localSources)[0]; }
    catch {
      const source = localSources.find(s => s.name === `${entry.version}_${entry.name}.sql`), pinned = entries.get(entry.version);
      const canonicalEntry=canonicalLegacyEntry(entry);
      if (!source || !pinned || pinned.legacyException !== true || pinned.name !== entry.name ||
        pinned.gitSqlSha256 !== hashGitMigrationBody(source.sql) || pinned.canonicalSha256 !== canonicalMigrationHash(canonicalEntry)) fail('migration_content_unproven');
      if(canonicalEntry!==entry)descriptorBridgeVersions.push(entry.version);
      result = Object.freeze({ name: source.name, sql: source.sql.replaceAll('\r\n', '\n'), sha256: hash(source.sql.replaceAll('\r\n', '\n')) });
      reconciledVersions.push(entry.version);
    }
    if (selected.length && selected.at(-1).name >= result.name) fail('migration_ledger_order_invalid');
    selected.push(result); installedLedger.push({ version: entry.version, name: entry.name, statements: [describeMigrationStatement(result.sql)] });
  }
  const contract = Object.freeze({ format: 'nestory-verified-business-migration-replay-v1', versions: Object.freeze(ledger.map(e => e.version)),
    reconciledVersions: Object.freeze(reconciledVersions), descriptorBridgeVersions:Object.freeze(descriptorBridgeVersions), capturedLedgerDescriptorSha256: hash(JSON.stringify(ledger)),
    installedLedgerDescriptorSha256: hash(JSON.stringify(installedLedger)), reconciliationManifestSha256: reconciliationSha256 });
  return { sources: Object.freeze(selected), contract, installedLedger };
}

export function selectCapturedMigrations(ledger, localSources) {
  if (!Array.isArray(ledger) || ledger.length < 1 || !Array.isArray(localSources)) fail('migration_inputs_invalid');
  const sources = new Map(), versions = new Set(), result = [];
  for (const s of localSources) {
    if (!plain(s) || !/^\d{14}_[a-z0-9_]+\.sql$/.test(s.name) || typeof s.sql !== 'string' || sources.has(s.name)) fail('migration_source_invalid');
    sources.set(s.name, s.sql.replaceAll('\r\n', '\n'));
  }
  for (const entry of ledger) {
    if (!plain(entry) || !/^\d{14}$/.test(entry.version) || !/^[a-z0-9_]+$/.test(entry.name) || versions.has(entry.version)) fail('migration_ledger_invalid');
    const name = `${entry.version}_${entry.name}.sql`, sql = sources.get(name);
    const exactWholeFile = sql !== undefined && Array.isArray(entry.statements) && entry.statements.length === 1 &&
      [sql,sql+'\n'].some(candidate=>entry.statements[0].byteLength === Buffer.byteLength(candidate, 'utf8') && entry.statements[0].sha256 === hash(candidate));
    if (sql === undefined || !exactWholeFile && reconstructLocalMigrationDescriptors(sql, entry.statements).issue) fail('migration_content_unproven');
    versions.add(entry.version); result.push(Object.freeze({ name, sql, sha256: hash(sql) }));
  }
  if (result.some((r, i) => i > 0 && result[i - 1].name >= r.name)) fail('migration_ledger_order_invalid');
  // Extra local migrations are deliberately excluded. A 259-version snapshot
  // must never silently restore into the current 260-version schema.
  return Object.freeze(result);
}
