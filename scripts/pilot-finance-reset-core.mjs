import { createHash } from 'node:crypto';
import path from 'node:path';
import { RESET_REGISTRY, POLYMORPHIC_REFERENCES, STORAGE_REFERENCES, STATIC_REFERENCES, RETAINED_IDENTITY_FIELDS, REBUILD_REQUIREMENTS } from './pilot-finance-reset-registry.mjs';

export const TARGET = Object.freeze({ project: 'nestory-pilot-reset-20261023', container: 'supabase_db_nestory-pilot-reset-20261023',
  organization: '00000000-0000-0000-0000-000000000001', slug: 'nestory-sample-operations', database: 'postgres', cutoff: '2026-10-01',
  baseSha: '4129597c75f948a83deab46546a58e70a613b6c5', fixtureSha256: 'f771601086a819691d42dae3c3f978c6cb3959fd09f4aa4db96cad4a9bc56b38' });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = /^[a-f0-9]{64}$/;
export const VALIDATION_SOURCE_ARTIFACTS = Object.freeze([
  ...[
    '20261024013600_financial_write_lifecycle_fence.sql',
    '20261024013601_enforce_lease_deposit_event_chronology.sql',
    '20261024013602_owner_close_monthly_rent_completeness.sql',
    '20261024013603_checked_month_to_month_continuation.sql',
    '20261024013604_financial_artifact_generation_retirement.sql',
    '20261024013605_financial_report_source_revisions.sql',
    '20261024013606_financial_report_revision_transaction_entries.sql',
    '20261024013607_preserve_deposit_chronology_lock_order.sql',
    '20261024013608_financial_report_revision_parent_lock_removal.sql',
    '20261024013609_timeline_financial_lifecycle_coverage.sql',
    '20261024013610_financial_document_lifecycle_coverage.sql',
    '20261024013611_checked_operational_command_authority.sql',
    '20261024013612_financial_reset_private_action_foundation.sql',
    '20261024013613_financial_reset_exact_row_guard_integration.sql',
    '20261024013614_paid_cost_evidence_generation_retirement.sql',
    '20261024013615_financial_reset_known_zero_checked_phase.sql',
    '20261024013616_financial_reset_checked_continuation_billing.sql',
    '20261024013617_financial_reset_phase_recovery_sources.sql',
    '20261024013618_financial_reset_contract_recovery_guards.sql',
    '20261024013619_financial_reset_archived_property_known_zero.sql',
    '20261024013620_financial_reset_report_finalization_checkpoint.sql',
    '20261024013621_financial_reset_reviewed_deferred_leases_and_deposits.sql',
  ].map(name => ({ name, root: 'project', directory: 'supabase/migrations' })),
  { name: 'baseline.sql', root: 'project', directory: 'supabase/test-fixtures' },
  { name: 'archived-property-overlay.sql', root: 'project', directory: 'supabase/test-fixtures' },
  { name: 'load-paid-cost-scenarios-fixture.ts', root: 'project', directory: 'scripts' },
  { name: 'load-owner-statement-publication-fixture.ts', root: 'project', directory: 'scripts' },
  { name: 'lease-deposit-chronology-concurrency.node-test.mjs', root: 'workspace', directory: 'scripts' },
  { name: 'financial-report-revision-concurrency.node-test.mjs', root: 'workspace', directory: 'scripts' },
  { name: 'checked-operational-command-concurrency.node-test.mjs', root: 'workspace', directory: 'scripts' },
  { name: 'financial-reset-phase-concurrency.node-test.mjs', root: 'workspace', directory: 'scripts' },
].map(Object.freeze));

export function assertValidationSourceEvidence(evidence, { workspaceRoot, projectRoot }) {
  if (!Array.isArray(evidence)) throw Error('Final synthetic validation source evidence is missing.');
  const expected = new Map(VALIDATION_SOURCE_ARTIFACTS.map(artifact => [artifact.name,
    path.resolve(artifact.root === 'project' ? projectRoot : workspaceRoot, artifact.directory, artifact.name)]));
  const seen = new Map();
  for (const item of evidence) {
    if (!item || typeof item.path !== 'string' || !path.isAbsolute(item.path) || !digest.test(item.sha256 ?? '')) throw Error('Invalid validation source artifact.');
    const name = path.basename(item.path);
    if (!expected.has(name) || path.resolve(item.path) !== expected.get(name) || seen.has(name)) throw Error('Unexpected or duplicate validation source artifact.');
    seen.set(name, { name, path: expected.get(name), sha256: item.sha256 });
  }
  if (seen.size !== expected.size || [...expected.keys()].some(name => !seen.has(name))) throw Error('Final synthetic validation source evidence is incomplete.');
  return [...expected.keys()].map(name => seen.get(name));
}
// Both adapters and their local helpers are part of the reviewed operation.
// Capturing only the entry points would miss a changed census or Docker guard.
export const RESET_TOOL_SOURCE_FILES = Object.freeze([
  'scripts/hosted-migration-parity-core.mjs',
  'scripts/ips-readiness-recovery-core.mjs',
  'scripts/local-recovery-docker.mjs',
  'scripts/pilot-finance-reset-core.mjs',
  'scripts/pilot-finance-reset-manifest.mjs',
  'scripts/pilot-finance-reset-recovery-core.mjs',
  'scripts/pilot-finance-reset-recovery.mjs',
  'scripts/pilot-finance-reset-registry.mjs',
]);
export function assertCandidateSources(sources) {
  if (!Array.isArray(sources) || sources.length !== RESET_TOOL_SOURCE_FILES.length ||
      sources.some(item => !item || !digest.test(item.sha256 ?? '')) ||
      JSON.stringify(sources.map(item => item.name).sort()) !== JSON.stringify(RESET_TOOL_SOURCE_FILES)) {
    throw Error('Inventory tool dependency binding is incomplete or invalid.');
  }
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical); // Array order is semantic.
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const normalizedSource = value => value.replaceAll('\r\n', '\n').replace(/^\uFEFF/, '');
export const json = value => JSON.stringify(canonical(value));
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const sorted = values => [...values].sort((a, b) => json(a) < json(b) ? -1 : json(a) > json(b) ? 1 : 0);
export const registrySha256 = () => sha256(json({ registry: RESET_REGISTRY, polymorphic: POLYMORPHIC_REFERENCES, storage: STORAGE_REFERENCES, static: STATIC_REFERENCES, retained: RETAINED_IDENTITY_FIELDS, rebuild: REBUILD_REQUIREMENTS }));
export function assertLocalContainer({ config, inspect, baseSha, fixtureSha256 }) {
  const projects = [...config.matchAll(/^\s*project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/gm)];
  const port = section => config.match(new RegExp(`^\\[${section}\\]\\s*\\r?\\n([^]*?)(?=^\\[|$(?![^]))`, 'm'))?.[1]?.match(/^\s*port\s*=\s*(\d+)\s*$/m)?.[1];
  if (projects.length !== 1 || projects[0][1] !== TARGET.project || port('api') !== '61321' || port('db') !== '61322') throw Error('Dedicated local project configuration mismatch.');
  if (inspect.name !== `/${TARGET.container}` || inspect.project !== TARGET.project || !digest.test(inspect.id ?? '') || !inspect.running || !/^sha256:[a-f0-9]{64}$/.test(inspect.image ?? '')) throw Error('Dedicated local container identity mismatch.');
  if (baseSha !== TARGET.baseSha || fixtureSha256 !== TARGET.fixtureSha256) throw Error('Candidate base or committed synthetic fixture hash mismatch.');
}
export function assertLocalSource(input) {
  assertLocalContainer(input);
  const { identities } = input;
  if (identities.cronLaunch !== 'off') throw Error('Local scheduled writers have not been contained.');
  const users = [101, 501, 601, 701, 801].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
  if (json([...identities.authUsers].sort()) !== json(users.sort())) throw Error('Unexpected Auth identities in synthetic source.');
  if (identities.organizations.filter(o => o.id === TARGET.organization && o.slug === TARGET.slug).length !== 1) throw Error('Synthetic organization identity mismatch.');
  for (const org of identities.organizations) {
    if (org.id !== TARGET.organization && (!uuid.test(org.id) || !['isolation-', 'freeze-', 'revision-'].some(prefix => org.slug === `${prefix}${org.id}`))) throw Error('Unexpected organization outside committed synthetic/concurrency fixtures.');
  }
}

// Incoming unconstrained references are scanned by the same closed vocabulary as
// selected rows. Counts expose no other organization's row IDs or payloads.
export function logicalInboundDescriptors(tables, registry = RESET_REGISTRY) {
  const existing = new Map(tables.map(table => [table.table, table]));
  const removable = target => existing.has(target) && registry[target]?.scope && registry[target].disposition === 'archive-remove';
  const descriptors = [];
  for (const ref of STATIC_REFERENCES) {
    const source = existing.get(ref.table);
    if (!source || !removable(ref.target) || (ref.optionalColumn && !source.columns.includes(ref.column))) continue;
    descriptors.push({ referenceKind: 'static', table: ref.table, column: ref.column, target: ref.target });
  }
  for (const ref of POLYMORPHIC_REFERENCES) {
    if (!existing.has(ref.table)) continue;
    let hasRemovableTarget = false;
    for (const [type, targets] of Object.entries(ref.targets)) for (const target of [targets].flat()) {
      if (!removable(target)) continue;
      hasRemovableTarget = true;
      descriptors.push({ referenceKind: 'polymorphic', table: ref.table, column: ref.idColumn, typeColumn: ref.typeColumn, type, target });
    }
    if (hasRemovableTarget) descriptors.push({ referenceKind: 'unknown-polymorphic', table: ref.table, column: ref.idColumn,
      typeColumn: ref.typeColumn, knownTypes: Object.keys(ref.targets).sort() });
  }
  return sorted([...new Map(descriptors.map(item => [json(item), item])).values()]);
}

export function logicalInboundIssues(tables, evidence, registry = RESET_REGISTRY) {
  const expected = new Map(logicalInboundDescriptors(tables, registry).map(item => [json(item), item])), seen = new Set(), issues = [];
  if (!Array.isArray(evidence)) return [{ code: 'logical_inbound_census_required' }];
  for (const item of evidence) {
    if (!item || !Number.isSafeInteger(item.rows) || item.rows < 0) { issues.push({ code: 'invalid_logical_inbound_census' }); continue; }
    const { rows, ...descriptor } = item, descriptorKey = json(descriptor);
    if (!expected.has(descriptorKey) || seen.has(descriptorKey)) { issues.push({ code: 'unexpected_or_duplicate_logical_inbound_census' }); continue; }
    seen.add(descriptorKey);
    if (rows > 0) issues.push({ code: descriptor.referenceKind === 'unknown-polymorphic' ? 'unknown_cross_scope_logical_association' : 'cross_scope_logical_inbound_dependency', ...item });
  }
  for (const [descriptorKey, descriptor] of expected) if (!seen.has(descriptorKey)) issues.push({ code: 'logical_inbound_census_missing', ...descriptor });
  return issues;
}

export function buildManifest({ operationId, binding, tables, rows, schema, storageObjects, inbound = [], logicalInbound = [], registry = RESET_REGISTRY }) {
  if (!uuid.test(operationId ?? '')) throw Error('Operation ID must be an explicit UUID.');
  if (binding.baseSha !== TARGET.baseSha || binding.fixtureSha256 !== TARGET.fixtureSha256 || binding.organization !== TARGET.organization || binding.cutoff !== TARGET.cutoff || !digest.test(binding.migrationsSha256 ?? '') || !digest.test(binding.containerId ?? '')) throw Error('Manifest source binding is invalid.');
  const issues = [];
  const tableMap = new Map();
  for (const table of tables) {
    if (tableMap.has(table.table)) throw Error('Duplicate catalog table identity.');
    tableMap.set(table.table, table);
    const policy = registry[table.table];
    if (!policy) { issues.push({ code: 'unclassified_table', table: table.table }); continue; }
    if (!table.pk.length) issues.push({ code: 'missing_primary_key', table: table.table });
    if (policy.scope && !table.columns.includes(policy.scope)) issues.push({ code: 'scope_column_missing', table: table.table });
    if (policy.scope && json([...table.jsonColumns].sort()) !== json([...policy.opaqueColumns].sort())) issues.push({ code: 'unreviewed_json_columns', table: table.table });
    const known = new Set([...(RETAINED_IDENTITY_FIELDS[table.table] ?? []), ...STATIC_REFERENCES.filter(r => r.table === table.table).map(r => r.column), ...POLYMORPHIC_REFERENCES.filter(r => r.table === table.table).map(r => r.idColumn), ...STORAGE_REFERENCES.filter(r => r.table === table.table).map(r => r.objectColumn)]);
    if (policy.scope) for (const column of table.unconstrainedUuidColumns ?? []) if (!known.has(column)) issues.push({ code: 'unreviewed_uuid_reference', table: table.table, column });
  }
  for (const table of Object.keys(registry)) if (!tableMap.has(table)) issues.push({ code: 'required_table_missing', table });
  const byTable = new Map();
  const seen = new Set();
  for (const row of rows) {
    const table = tableMap.get(row.table), policy = registry[row.table];
    if (!table || !policy?.scope) throw Error('Unexpected or unscoped row payload.');
    if (!digest.test(row.sha256) || row.pk.length !== table.pk.length || row.pk.some(v => v === null)) throw Error('Row identity/hash is invalid.');
    if (row.scope !== TARGET.organization) throw Error('Foreign organization row escaped the selector.');
    const key = json([row.table, row.pk]);
    if (seen.has(key)) throw Error('Duplicate row identity.');
    seen.add(key);
    if (!byTable.has(row.table)) byTable.set(row.table, []);
    byTable.get(row.table).push(row);
  }
  const value = (row, column) => {
    const index = tableMap.get(row.table).pk.indexOf(column);
    if (index < 0 && !Object.hasOwn(row.references, column)) throw Error(`Missing captured reference: ${row.table}.${column}`);
    return index < 0 ? row.references[column] : row.pk[index];
  };
  const resolve = (table, columns, values) => (byTable.get(table) ?? []).some(row => columns.every((col, index) => json(value(row, col)) === json(values[index])));
  const fkEdges = [];
  for (const table of tables) {
    const selected = byTable.get(table.table) ?? [];
    const policy = registry[table.table];
    if (policy?.disposition === 'must-be-empty' && selected.length) issues.push({ code: 'inflight_capability_rows', table: table.table, count: selected.length });
    for (const fk of table.foreignKeys) {
      fkEdges.push({ from: table.table, ...fk });
      for (const row of selected) {
        const values = fk.columns.map(column => value(row, column));
        if (values.some(v => v == null)) continue;
        if (fk.target === 'auth.users' && fk.targetColumns.length === 1 && binding.authUsers.includes(values[0])) continue;
        if (!resolve(fk.target, fk.targetColumns, values)) issues.push({ code: 'unresolved_or_cross_scope_fk', table: table.table, pk: row.pk, constraint: fk.name, target: fk.target });
      }
    }
  }
  for (const edge of inbound) if (edge.rows > 0) issues.push({ code: 'cross_scope_inbound_dependency', ...edge });
  issues.push(...logicalInboundIssues(tables, logicalInbound, registry));
  const staticReferences = [];
  for (const ref of STATIC_REFERENCES) for (const row of byTable.get(ref.table) ?? []) {
    if (ref.optionalColumn && !tableMap.get(ref.table).columns.includes(ref.column)) continue;
    const id = value(row, ref.column);
    if (id == null) continue;
    const resolved = ref.target === 'auth.users' ? (binding.authUsers.includes(id) || (ref.allowOrganizationSeedActor && id === TARGET.organization)) : resolve(ref.target, ['id'], [id]);
    staticReferences.push({ ...ref, pk: row.pk, id, resolved });
    if (!resolved && !ref.historicalSnapshot) issues.push({ code: 'unresolved_static_reference', table: ref.table, pk: row.pk, column: ref.column });
  }
  const polymorphic = [];
  for (const ref of POLYMORPHIC_REFERENCES) for (const row of byTable.get(ref.table) ?? []) {
    const id = value(row, ref.idColumn), type = value(row, ref.typeColumn);
    if (id == null) continue;
    const targets = ref.targets[type] ? [ref.targets[type]].flat() : [];
    const matches = targets.filter(target => resolve(target, ['id'], [id]) && (ref.table !== 'public.ledger_entries' || !['public.property_withdrawals','public.owner_payments'].includes(target) || resolve(target, ['id','ledger_entry_id'], [id,value(row,'id')])));
    const resolved = matches.length === 1;
    polymorphic.push({ table: ref.table, pk: row.pk, column: ref.idColumn, type, id, target: resolved ? matches[0] : null, resolved, historicalSnapshot: ref.historicalKinds?.includes(type) ?? false });
    if (!resolved && !(matches.length === 0 && targets.length > 0 && ref.historicalKinds?.includes(type))) issues.push({ code: targets.length ? 'unresolved_polymorphic_reference' : 'unreviewed_polymorphic_kind', table: ref.table, pk: row.pk, column: ref.idColumn, type });
  }
  const storage = [];
  for (const ref of STORAGE_REFERENCES) for (const row of byTable.get(ref.table) ?? []) {
    const path = value(row, ref.pathColumn), objectId = ref.objectColumn && tableMap.get(ref.table).columns.includes(ref.objectColumn) ? value(row, ref.objectColumn) : null;
    if (!path && !objectId) continue;
    const matches = storageObjects.filter(object => object.bucket === ref.bucket && (objectId ? object.id === objectId && (!path || object.name === path) : object.name === path));
    const resolved = matches.length === 1;
    storage.push({ table: ref.table, pk: row.pk, path, objectId, resolved, metadata: resolved ? matches[0] : null, bytesVerified: false });
    if (!resolved) issues.push({ code: 'storage_metadata_missing_or_ambiguous', table: ref.table, pk: row.pk });
  }
  const inventory = tables.map(table => ({ ...table, policy: registry[table.table] ?? null,
    selectedRows: sorted((byTable.get(table.table) ?? []).map(row => ({ pk: row.pk, sha256: row.sha256, references: row.references }))) }));
  const manifest = { format: 'nestory-local-finance-reset-inventory-v1', operationId, syntheticOnly: true, inventoryAccepted: issues.length === 0,
    executionSupported: false, productionRecoveryProven: false, binding: { ...binding, registrySha256: registrySha256(), schemaSha256: sha256(json(sorted(schema))) },
    tables: sorted(inventory), foreignKeys: sorted(fkEdges), inbound: sorted(inbound), logicalInbound: sorted(logicalInbound), staticReferences: sorted(staticReferences), retainedIdentityFields: RETAINED_IDENTITY_FIELDS, polymorphic: sorted(polymorphic), storage: sorted(storage), schema: sorted(schema),
    rebuildRequirements: REBUILD_REQUIREMENTS, issues: sorted(issues),
    missingExecutorPhases: ['private archive and exact-row copy verification', 'reviewed normalization after-values', 'row dependency/cycle execution order', 'narrow frozen operation capability', 'atomic removal and known-zero evidence', 'frozen continuation and October billing', 'restoration with generation authority and Storage bytes'] };
  return { ...manifest, manifestSha256: sha256(json(manifest)) };
}

export const identitySql = `SELECT jsonb_build_object('organizations',(SELECT jsonb_agg(jsonb_build_object('id',id,'slug',slug) ORDER BY id) FROM public.organizations),'authUsers',(SELECT jsonb_agg(id ORDER BY id) FROM auth.users),'cronLaunch',current_setting('cron.launch_active_jobs'));`;
export const catalogSql = `SELECT jsonb_build_object('table',n.nspname||'.'||c.relname,
 'columns',(SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'nullableColumns',coalesce((SELECT jsonb_agg(a.attname ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND NOT a.attnotnull),'[]'::jsonb),
 'jsonColumns',coalesce((SELECT jsonb_agg(a.attname ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.atttypid IN('json'::regtype,'jsonb'::regtype)),'[]'::jsonb),
 'unconstrainedUuidColumns',coalesce((SELECT jsonb_agg(a.attname ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.atttypid='uuid'::regtype AND a.attname NOT IN('id','organization_id') AND NOT EXISTS(SELECT 1 FROM pg_constraint f WHERE f.conrelid=c.oid AND f.contype IN('p','f') AND a.attnum=ANY(f.conkey))),'[]'::jsonb),
 'pk',coalesce((SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE i.indrelid=c.oid AND i.indisprimary),'[]'::jsonb),
 'foreignKeys',coalesce((SELECT jsonb_agg(jsonb_build_object('name',f.conname,'target',rn.nspname||'.'||rc.relname,'columns',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(f.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum),'targetColumns',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(f.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=rc.oid AND a.attnum=k.attnum),'onDelete',f.confdeltype,'matchType',f.confmatchtype,'deleteColumns',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(coalesce(f.confdelsetcols,f.conkey)) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum),'definition',pg_get_constraintdef(f.oid)) ORDER BY f.conname) FROM pg_constraint f JOIN pg_class rc ON rc.oid=f.confrelid JOIN pg_namespace rn ON rn.oid=rc.relnamespace WHERE f.contype='f' AND f.conrelid=c.oid),'[]'::jsonb))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','app_private') AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname;`;
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
export function rowInventorySql(tables) {
  const statements = [];
  for (const table of tables) {
    const policy = RESET_REGISTRY[table.table];
    if (!policy) throw Error(`Unclassified catalog table: ${table.table}`);
    const relation = table.table.split('.').map(quote).join('.');
    // Global hashes expose no secret fields or capability primary keys.
    statements.push(`SELECT jsonb_build_object('kind','census','table',${literal(table.table)},'rows',count(*),'sha256',encode(extensions.digest(coalesce(string_agg(encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex'),'' ORDER BY encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex')),''),'sha256'),'hex')) FROM ${relation} t;`);
    if (!policy.scope) continue;
    const referenceColumns = new Set(table.pk);
    for (const fk of table.foreignKeys) for (const column of fk.columns) referenceColumns.add(column);
    for (const child of tables) for (const fk of child.foreignKeys) if (fk.target === table.table) for (const column of fk.targetColumns) referenceColumns.add(column);
    for (const ref of POLYMORPHIC_REFERENCES.filter(ref => ref.table === table.table)) { referenceColumns.add(ref.typeColumn); referenceColumns.add(ref.idColumn); }
    for (const ref of STORAGE_REFERENCES.filter(ref => ref.table === table.table)) { referenceColumns.add(ref.pathColumn); if (ref.objectColumn && table.columns.includes(ref.objectColumn)) referenceColumns.add(ref.objectColumn); }
    for (const ref of STATIC_REFERENCES.filter(ref => ref.table === table.table)) if (!ref.optionalColumn || table.columns.includes(ref.column)) referenceColumns.add(ref.column);
    if (['public.property_withdrawals','public.owner_payments'].includes(table.table)) referenceColumns.add('ledger_entry_id');
    const columns = [...referenceColumns].sort();
    if (columns.some(column => !table.columns.includes(column))) throw Error(`Reviewed reference column missing: ${table.table}`);
    if (!table.pk.length) throw Error(`Primary key missing: ${table.table}`);
    statements.push(`SELECT jsonb_build_object('kind','row','table',${literal(table.table)},'scope',t.${quote(policy.scope)},'pk',jsonb_build_array(${table.pk.map(col => `t.${quote(col)}`).join(',')}),'sha256',encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex'),'references',jsonb_build_object(${columns.flatMap(col => [literal(col), `t.${quote(col)}`]).join(',')})) FROM ${relation} t WHERE t.${quote(policy.scope)}=${literal(TARGET.organization)}::uuid ORDER BY ${table.pk.map(col => `t.${quote(col)}`).join(',')};`);
  }
  for (const child of tables) for (const fk of child.foreignKeys) {
    const parentPolicy = RESET_REGISTRY[fk.target], childPolicy = RESET_REGISTRY[child.table];
    if (!parentPolicy?.scope) continue;
    const parent = fk.target.split('.').map(quote).join('.'), relation = child.table.split('.').map(quote).join('.');
    const outside = childPolicy.scope ? `c.${quote(childPolicy.scope)} IS DISTINCT FROM ${literal(TARGET.organization)}::uuid` : 'true';
    statements.push(`SELECT jsonb_build_object('kind','inbound','table',${literal(child.table)},'target',${literal(fk.target)},'constraint',${literal(fk.name)},'rows',count(*)) FROM ${relation} c JOIN ${parent} p ON ${fk.columns.map((col,i) => `c.${quote(col)}=p.${quote(fk.targetColumns[i])}`).join(' AND ')} WHERE p.${quote(parentPolicy.scope)}=${literal(TARGET.organization)}::uuid AND ${outside};`);
  }
  for (const descriptor of logicalInboundDescriptors(tables)) {
    const childPolicy = RESET_REGISTRY[descriptor.table];
    const relation = descriptor.table.split('.').map(quote).join('.');
    const outside = childPolicy.scope ? `c.${quote(childPolicy.scope)} IS DISTINCT FROM ${literal(TARGET.organization)}::uuid` : 'true';
    const output = `${literal(json(descriptor))}::jsonb || jsonb_build_object('kind','logical-inbound','rows',count(*))`;
    if (descriptor.referenceKind === 'unknown-polymorphic') {
      statements.push(`SELECT ${output} FROM ${relation} c WHERE ${outside} AND c.${quote(descriptor.column)} IS NOT NULL AND (c.${quote(descriptor.typeColumn)} IS NULL OR c.${quote(descriptor.typeColumn)} NOT IN (${descriptor.knownTypes.map(literal).join(',')}));`);
    } else {
      const parent = descriptor.target.split('.').map(quote).join('.'), parentPolicy = RESET_REGISTRY[descriptor.target];
      const typeFilter = descriptor.referenceKind === 'polymorphic' ? ` AND c.${quote(descriptor.typeColumn)}=${literal(descriptor.type)}` : '';
      statements.push(`SELECT ${output} FROM ${relation} c JOIN ${parent} p ON c.${quote(descriptor.column)}=p."id" WHERE p.${quote(parentPolicy.scope)}=${literal(TARGET.organization)}::uuid AND ${outside}${typeFilter};`);
    }
  }
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='30s'; SET LOCAL timezone='UTC';\n${statements.join('\n')}\nCOMMIT;`;
}
