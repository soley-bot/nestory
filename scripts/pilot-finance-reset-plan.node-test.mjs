import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { json, sha256, catalogSql, rowInventorySql, buildManifest, logicalInboundDescriptors, logicalInboundIssues, TARGET } from './pilot-finance-reset-core.mjs';
import { buildResetDependencyPlan } from './pilot-finance-reset-plan-core.mjs';

const row = (id, references = {}) => ({ pk: [id], sha256: sha256(`before:${id}`), references: { id, organization_id: 'scope', ...references } });
const fk = (target, { onDelete = 'a', columns = ['parent_id'], targetColumns = ['id'], name = 'parent', matchType = 's', deleteColumns = columns } = {}) =>
  ({ name, target, columns, targetColumns, onDelete, matchType, deleteColumns });
const table = (name, disposition, selectedRows, foreignKeys = [], nullableColumns = ['parent_id']) =>
  ({ table: name, pk: ['id'], columns: ['id', 'organization_id', 'parent_id', 'other_id'], nullableColumns,
    policy: { disposition, scope: 'organization_id' }, foreignKeys, selectedRows });
function inventory(tables, extra = {}) {
  const body = { format: 'nestory-local-finance-reset-inventory-v1', operationId: 'synthetic-operation',
    syntheticOnly: true, inventoryAccepted: true, executionSupported: false, issues: [],
    binding: { authUsers: [], candidateHead: 'a'.repeat(40) }, tables, inbound: [], logicalInbound: [], staticReferences: [], polymorphic: [], ...extra };
  return { ...body, manifestSha256: sha256(json(body)) };
}
const review = (manifest, normalizations = [], cycleBreaks = []) => ({ format: 'nestory-local-finance-reset-plan-review-v1',
  reviewId: 'synthetic-reviewed-declaration', manifestSha256: manifest.manifestSha256, normalizations, cycleBreaks });
const detach = (source, id, before, extra = {}) => ({ table: source, pk: [id], beforeSha256: sha256(`before:${id}`),
  afterSha256: sha256(`after:${id}`), changes: [{ column: 'parent_id', before, after: null }], reason: 'Reviewed synthetic detachment', ...extra });
const hasIssue = (plan, code) => plan.issues.some(item => item.code === code);

test('removal order is row-specific, child first, including reversal self references', () => {
  const manifest = inventory([
    table('public.parent', 'archive-remove', [row('p')]),
    table('public.child', 'archive-remove', [row('original', { parent_id: null }), row('reversal', { parent_id: 'original' })], [fk('public.child')]),
    table('public.line', 'archive-remove', [row('line', { parent_id: 'p' })], [fk('public.parent', { onDelete: 'c' })]),
  ]);
  const plan = buildResetDependencyPlan(manifest);
  assert.equal(plan.dependencyPlanAccepted, true);
  const ids = plan.candidateRemovalOrder.map(item => item.pk[0]);
  assert.ok(ids.indexOf('reversal') < ids.indexOf('original'));
  assert.ok(ids.indexOf('line') < ids.indexOf('p'));
  assert.equal(plan.implicitEffects[0].preventedBy, 'child-first-removal');
  assert.equal(plan.executionSupported, false);
  assert.equal(plan.actualResetRecoveryProven, false);
  const { planSha256, ...body } = plan;
  assert.equal(planSha256, sha256(json(body)));
});

test('preserved children block CASCADE, SET NULL, SET DEFAULT, RESTRICT and NO ACTION', () => {
  for (const onDelete of ['c', 'n', 'd', 'r', 'a']) {
    const plan = buildResetDependencyPlan(inventory([
      table('public.ledger', 'archive-remove', [row('ledger')]),
      table('public.documents', 'preserve', [row('document', { parent_id: 'ledger' })], [fk('public.ledger', { onDelete })]),
    ]));
    assert.equal(plan.dependencyPlanAccepted, false);
    assert.equal(hasIssue(plan, 'retained_row_references_removed_parent'), true);
    if (['c', 'n', 'd'].includes(onDelete)) assert.equal(plan.implicitEffects[0].preventedBy, null);
  }
});

test('explicit bound retained-reference normalization prevents SET NULL and CASCADE side effects', () => {
  for (const onDelete of ['n', 'c']) {
    const manifest = inventory([
    table('public.ledger', 'archive-remove', [row('ledger')]),
      table('public.documents', 'preserve', [row('document', { parent_id: 'ledger' })], [fk('public.ledger', { onDelete })]),
    ]);
    const plan = buildResetDependencyPlan(manifest, review(manifest, [detach('public.documents', 'document', 'ledger')]));
    assert.equal(plan.dependencyPlanAccepted, true);
    assert.equal(plan.implicitEffects[0].preventedBy, 'explicit-reviewed-detach');
    assert.equal(plan.normalizationDeclarations[0].afterImageVerified, false);
    assert.equal(plan.executionSupported, false);
  }
});

test('normalized projections require reviewed known after-images and cannot invent uncaptured values', () => {
  const manifest = inventory([table('public.deposits', 'normalize-reviewed', [row('deposit')])]);
  assert.equal(hasIssue(buildResetDependencyPlan(manifest), 'normalization_after_image_required'), true);
  const unknown = detach('public.deposits', 'deposit', 5, { changes: [{ column: 'cash_amount', before: 5, after: 0 }] });
  const plan = buildResetDependencyPlan(manifest, review(manifest, [unknown]));
  assert.equal(hasIssue(plan, 'unsupported_or_unknown_after_image'), true);
  assert.equal(plan.dependencyPlanAccepted, false);
});

test('a reviewed normalization must bind row hash, before value, after hash and exact manifest', () => {
  const manifest = inventory([
    table('public.parent', 'archive-remove', [row('p')]),
    table('public.retained', 'normalize-reviewed', [row('r', { parent_id: 'p' })], [fk('public.parent')]),
  ]);
  for (const delta of [{ beforeSha256: '0'.repeat(64) }, { afterSha256: null }, { afterSha256: sha256('before:r') },
    { changes: [{ column: 'parent_id', before: 'wrong', after: null }] }, { changes: [] }]) {
    const plan = buildResetDependencyPlan(manifest, review(manifest, [detach('public.retained', 'r', 'p', delta)]));
    assert.equal(plan.dependencyPlanAccepted, false);
  }
  const declaration = review(manifest, [detach('public.retained', 'r', 'p')]);
  declaration.manifestSha256 = '0'.repeat(64);
  assert.throws(() => buildResetDependencyPlan(manifest, declaration), /exact inventory/);
  assert.equal(buildResetDependencyPlan(manifest, review(manifest, [detach('public.retained', 'r', 'p')])).dependencyPlanAccepted, true);
});

test('cycles fail closed until an exact nullable FK break is reviewed', () => {
  const manifest = inventory([
    table('public.a', 'archive-remove', [row('a', { parent_id: 'b' })], [fk('public.b')]),
    table('public.b', 'archive-remove', [row('b', { parent_id: 'a' })], [fk('public.a')]),
  ]);
  assert.equal(hasIssue(buildResetDependencyPlan(manifest), 'unsupported_dependency_cycle'), true);
  const plan = buildResetDependencyPlan(manifest, review(manifest, [], [detach('public.a', 'a', 'b', { constraint: 'parent' })]));
  assert.equal(plan.dependencyPlanAccepted, true);
  assert.deepEqual(plan.candidateRemovalOrder.map(item => item.pk[0]), ['b', 'a']);
  assert.equal(plan.normalizationDeclarations[0].kind, 'cycle-break');
});

test('a nonnullable cycle edge and a different constraint cannot be detached', () => {
  const manifest = inventory([
    table('public.a', 'archive-remove', [row('a', { parent_id: 'b' })], [fk('public.b')], []),
    table('public.b', 'archive-remove', [row('b', { parent_id: 'a' })], [fk('public.a')]),
  ]);
  for (const constraint of ['parent', 'not-present']) {
    const plan = buildResetDependencyPlan(manifest, review(manifest, [], [detach('public.a', 'a', 'b', { constraint })]));
    assert.equal(plan.dependencyPlanAccepted, false);
    assert.equal(hasIssue(plan, 'unsupported_dependency_cycle'), true);
  }
});

test('normalization cannot change parent keys, scope, unrelated rows or duplicate declarations', () => {
  const manifest = inventory([
    table('public.parent', 'preserve', [row('p')]),
    table('public.child', 'preserve', [row('c', { parent_id: 'p' })], [fk('public.parent')]),
  ]);
  assert.equal(hasIssue(buildResetDependencyPlan(manifest, review(manifest, [detach('public.child', 'c', 'p')])), 'reviewed_detach_has_no_removed_parent'), true);
  for (const column of ['id', 'organization_id']) {
    const entry = detach('public.child', 'c', 'p', { changes: [{ column, before: column === 'id' ? 'c' : 'scope', after: null }] });
    assert.equal(buildResetDependencyPlan(manifest, review(manifest, [entry])).dependencyPlanAccepted, false);
  }
  const entry = detach('public.child', 'c', 'p');
  assert.equal(hasIssue(buildResetDependencyPlan(manifest, review(manifest, [entry, entry])), 'invalid_reviewed_after_image'), true);
  const altered = structuredClone(manifest); altered.tables[0].policy.disposition = 'archive-remove';
  assert.throws(() => buildResetDependencyPlan(altered), /intact accepted/);
});

test('MATCH FULL composite references reject partial null normalization', () => {
  const parent = table('public.parent', 'archive-remove', [row('p', { other_id: 'q' })]);
  const child = table('public.child', 'preserve', [row('c', { parent_id: 'p', other_id: 'q' })],
    [fk('public.parent', { columns: ['parent_id', 'other_id'], targetColumns: ['id', 'other_id'], matchType: 'f', onDelete: 'n' })], ['parent_id', 'other_id']);
  const manifest = inventory([parent, child]);
  const plan = buildResetDependencyPlan(manifest, review(manifest, [detach('public.child', 'c', 'p')]));
  assert.equal(hasIssue(plan, 'match_full_partial_null'), true);
  assert.equal(plan.dependencyPlanAccepted, false);
  const complete = detach('public.child', 'c', 'p'); complete.changes.push({ column: 'other_id', before: 'q', after: null });
  assert.equal(buildResetDependencyPlan(manifest, review(manifest, [complete])).dependencyPlanAccepted, true);
});

test('logical and polymorphic dependencies prevent dangling retained references', () => {
  for (const type of ['staticReferences', 'polymorphic']) {
    const manifest = inventory([
      table('public.parent', 'archive-remove', [row('p')]),
      table('public.retained', 'preserve', [row('r', { source_id: 'p' })]),
    ], { [type]: [{ table: 'public.retained', pk: ['r'], column: 'source_id', id: 'p', target: 'public.parent', resolved: true }] });
    assert.equal(hasIssue(buildResetDependencyPlan(manifest), 'retained_row_references_removed_parent'), true);
  }
});

test('old inventories, unknown delete metadata, inbound rows and live intents fail closed', () => {
  for (const mutate of [
    tables => { delete tables[1].selectedRows[0].references; },
    tables => { delete tables[1].nullableColumns; },
    tables => { tables[1].foreignKeys[0].onDelete = 'unknown'; },
  ]) {
    const tables = [table('public.p', 'archive-remove', [row('p')]),
      table('public.c', 'archive-remove', [row('c', { parent_id: 'p' })], [fk('public.p')])];
    mutate(tables);
    assert.equal(buildResetDependencyPlan(inventory(tables)).dependencyPlanAccepted, false);
  }
  assert.equal(hasIssue(buildResetDependencyPlan(inventory([], { inbound: [{ rows: 1 }] })), 'cross_scope_inbound_dependency'), true);
  assert.equal(hasIssue(buildResetDependencyPlan(inventory([table('public.intent', 'retire-intent', [row('i')])])), 'retirement_semantics_not_planned'), true);
});

test('inventory catalog captures delete semantics/nullability and preserves reference values', () => {
  assert.match(catalogSql, /'nullableColumns'/);
  assert.match(catalogSql, /'onDelete',f\.confdeltype/);
  assert.match(catalogSql, /'matchType',f\.confmatchtype/);
  assert.match(catalogSql, /f\.confdelsetcols/);
  const t = { ...table('public.example', 'preserve', []), jsonColumns: [], unconstrainedUuidColumns: [] };
  const source = { ...row('r', { parent_id: null }), table: t.table, scope: TARGET.organization };
  const manifest = buildManifest({ operationId: '11111111-1111-4111-8111-111111111111', binding: { ...TARGET, migrationsSha256: 'a'.repeat(64), containerId: 'b'.repeat(64) },
    tables: [t], rows: [source], schema: [], storageObjects: [], registry: { [t.table]: { ...t.policy, opaqueColumns: [] } } });
  assert.deepEqual(manifest.tables[0].selectedRows[0].references, source.references);
});

test('complete incoming logical census rejects cross-scope static, polymorphic and unknown associations', () => {
  const tables = [
    table('public.owner_balance_periods', 'archive-remove', [], [], []),
    table('public.owner_close_revisions', 'archive-remove', [], [], []),
    table('public.ledger_entries', 'archive-remove', [], [], []),
    table('public.owner_cash_events', 'archive-remove', [row('cash')], [], []),
  ];
  const census = logicalInboundDescriptors(tables).map(descriptor => ({ ...descriptor, rows: 0 }));
  assert.ok(census.some(item => item.referenceKind === 'static'));
  assert.ok(census.some(item => item.referenceKind === 'polymorphic'));
  assert.ok(census.some(item => item.referenceKind === 'unknown-polymorphic'));
  assert.deepEqual(logicalInboundIssues(tables, census), []);
  assert.equal(buildResetDependencyPlan(inventory(tables, { logicalInbound: census })).dependencyPlanAccepted, true);
  for (const referenceKind of ['static', 'polymorphic', 'unknown-polymorphic']) {
    const changed = structuredClone(census); changed.find(item => item.referenceKind === referenceKind).rows = 1;
    const plan = buildResetDependencyPlan(inventory(tables, { logicalInbound: changed }));
    assert.equal(plan.dependencyPlanAccepted, false);
    assert.equal(hasIssue(plan, referenceKind === 'unknown-polymorphic' ? 'unknown_cross_scope_logical_association' : 'cross_scope_logical_inbound_dependency'), true);
    const actualInventory = buildManifest({ operationId: '11111111-1111-4111-8111-111111111111',
      binding: { ...TARGET, migrationsSha256: 'a'.repeat(64), containerId: 'b'.repeat(64) },
      tables: tables.map(t => ({ ...t, jsonColumns: [], unconstrainedUuidColumns: [] })), rows: [], schema: [], storageObjects: [],
      registry: Object.fromEntries(tables.map(t => [t.table, { ...t.policy, opaqueColumns: [] }])), logicalInbound: changed });
    assert.equal(actualInventory.inventoryAccepted, false);
    assert.equal(hasIssue(actualInventory, referenceKind === 'unknown-polymorphic' ? 'unknown_cross_scope_logical_association' : 'cross_scope_logical_inbound_dependency'), true);
  }
  for (const incomplete of [undefined, census.slice(1), [...census, census[0]], census.map((entry, index) => index === 0 ? { ...entry, rows: -1 } : entry)]) {
    assert.ok(logicalInboundIssues(tables, incomplete).length > 0);
  }
});

test('logical incoming queries use closed registry types, every candidate target and outside-scope counts only', () => {
  const tables = [
    { ...table('public.owner_balance_periods', 'archive-remove', []), columns: ['id', 'organization_id', 'closed_revision_id'] },
    table('public.owner_close_revisions', 'archive-remove', []),
    { ...table('public.ledger_entries', 'archive-remove', []), columns: ['id', 'organization_id', 'source_type', 'source_id'] },
    table('public.owner_cash_events', 'archive-remove', []),
    { ...table('public.property_withdrawals', 'archive-remove', []), columns: ['id', 'organization_id', 'ledger_entry_id'] },
  ];
  const sql = rowInventorySql(tables);
  const incoming = sql.split('\n').filter(line => line.includes("'logical-inbound'"));
  assert.equal(incoming.length, logicalInboundDescriptors(tables).length);
  assert.ok(incoming.every(line => line.includes('IS DISTINCT FROM') && line.includes('count(*)')));
  assert.ok(incoming.some(line => line.includes('c."closed_revision_id"=p."id"')));
  assert.ok(incoming.some(line => line.includes('c."source_type"=\'owner_cash_event\'') && line.includes('"owner_cash_events" p')));
  assert.ok(incoming.some(line => line.includes('c."source_type"=\'owner_cash_event\'') && line.includes('"property_withdrawals" p')));
  assert.ok(incoming.some(line => line.includes('c."source_type" IS NULL OR c."source_type" NOT IN')));
  assert.ok(incoming.every(line => !line.includes('to_jsonb(c)') && !line.includes('jsonb_agg')));
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|INSERT|TRUNCATE|COPY)\b/);
});

test('planner adapters remain offline and cannot emit a deletion script or database command', async () => {
  const core = await readFile(new URL('./pilot-finance-reset-plan-core.mjs', import.meta.url), 'utf8');
  const cli = await readFile(new URL('./pilot-finance-reset-plan.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(core, /from ['"](?:node:child_process|pg|postgres|@supabase)/);
  assert.doesNotMatch(cli, /(?:psql|pg_restore|pg_dump|localRecoveryDocker|DATABASE_URL)/);
  assert.match(cli, /assertInventoryManifest\(manifest\)/);
  assert.match(cli, /check-ignore/);
  assert.match(cli, /candidateHead !== binding\.candidateHead/);
});
