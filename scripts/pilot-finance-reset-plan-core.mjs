// Pure dependency planning only. No SQL, connections or mutation capability.
import { json, sha256, logicalInboundIssues } from './pilot-finance-reset-core.mjs';

const digest = /^[a-f0-9]{64}$/;
const dispositions = new Set(['archive-remove', 'preserve', 'preserve-global', 'normalize-reviewed', 'retire-intent', 'must-be-empty']);
const actions = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
const key = (table, pk) => json([table, pk]);
const identity = row => ({ table: row.table, pk: row.pk });
const sorted = values => [...values].sort((a, b) => json(a) < json(b) ? -1 : json(a) > json(b) ? 1 : 0);
const equal = (a, b) => json(a) === json(b);

export function buildResetDependencyPlan(manifest, review = null) {
  const { manifestSha256, ...payload } = manifest;
  if (!digest.test(manifestSha256 ?? '') || sha256(json(payload)) !== manifestSha256 ||
      manifest.format !== 'nestory-local-finance-reset-inventory-v1' || manifest.syntheticOnly !== true ||
      manifest.inventoryAccepted !== true || manifest.executionSupported !== false || manifest.issues?.length !== 0) {
    throw Error('Dependency planning requires an intact accepted synthetic inventory.');
  }
  if (review && (review.format !== 'nestory-local-finance-reset-plan-review-v1' ||
      review.manifestSha256 !== manifestSha256 || typeof review.reviewId !== 'string' || !review.reviewId.trim() ||
      !Array.isArray(review.normalizations) || !Array.isArray(review.cycleBreaks))) {
    throw Error('Review declarations must bind the exact inventory digest.');
  }
  const issues = [], tables = new Map(), rows = new Map(), byTable = new Map();
  const addIssue = (code, details = {}) => issues.push({ code, ...details });
  for (const table of manifest.tables) {
    if (tables.has(table.table)) throw Error('Duplicate catalog table.');
    tables.set(table.table, table);
    if (!dispositions.has(table.policy?.disposition)) addIssue('unknown_disposition', { table: table.table });
    if (!Array.isArray(table.nullableColumns)) addIssue('nullable_catalog_required', { table: table.table });
    byTable.set(table.table, []);
    for (const source of table.selectedRows) {
      if (!Array.isArray(source.pk) || source.pk.length !== table.pk.length || source.pk.some(v => v == null) ||
          !digest.test(source.sha256 ?? '') || rows.has(key(table.table, source.pk))) throw Error('Invalid selected row identity.');
      const row = { ...source, table: table.table, disposition: table.policy?.disposition, key: key(table.table, source.pk) };
      rows.set(row.key, row); byTable.get(table.table).push(row);
      if (!source.references || Array.isArray(source.references) || typeof source.references !== 'object') addIssue('captured_references_required', identity(row));
      if (row.disposition === 'must-be-empty') addIssue('inflight_capability_rows', identity(row));
    }
  }
  const beforeValue = (row, column) => {
    const pk = tables.get(row.table).pk.indexOf(column);
    if (pk >= 0) return row.pk[pk];
    if (!Object.hasOwn(row.references ?? {}, column)) throw Error(`Uncaptured reference column: ${row.table}.${column}`);
    return row.references[column];
  };
  const changes = new Map(), declarations = [], consumed = new Set();
  // A declared after hash is a review target, never proof that that image exists.
  // Only captured FK columns can be normalized here. Projection/opaque values
  // need a richer archived-row proof before a future executor can accept them.
  for (const [kind, entries] of [['normalize', review?.normalizations ?? []], ['cycle-break', review?.cycleBreaks ?? []]]) {
    for (const entry of entries) {
      const row = rows.get(key(entry?.table, entry?.pk)), table = row && tables.get(row.table);
      if (!row || consumed.has(row.key) || entry.beforeSha256 !== row.sha256 || !digest.test(entry.afterSha256 ?? '') ||
          typeof entry.reason !== 'string' || !entry.reason.trim() || !Array.isArray(entry.changes) || !entry.changes.length ||
          (kind === 'cycle-break') !== (row.disposition === 'archive-remove') ||
          !['archive-remove', 'normalize-reviewed', 'preserve', 'retire-intent'].includes(row.disposition)) {
        addIssue('invalid_reviewed_after_image', { table: entry?.table ?? null, pk: entry?.pk ?? null }); continue;
      }
      consumed.add(row.key);
      const constraint = kind === 'cycle-break' && table.foreignKeys.find(fk => fk.name === entry.constraint);
      if (kind === 'cycle-break' && !constraint) { addIssue('unknown_cycle_break_constraint', identity(row)); continue; }
      const proposed = new Map();
      let valid = entry.afterSha256 !== row.sha256;
      for (const change of entry.changes) {
        const column = change?.column;
        const referencedParent = [...tables.values()].some(child => child.foreignKeys.some(fk => fk.target === row.table && fk.targetColumns.includes(column)));
        const childReference = table.foreignKeys.some(fk => fk.columns.includes(column));
        if (typeof column !== 'string' || proposed.has(column) || !Object.hasOwn(change, 'before') || !Object.hasOwn(change, 'after') ||
            !Object.hasOwn(row.references ?? {}, column) || !equal(change.before, beforeValue(row, column)) ||
            equal(change.before, change.after) || table.pk.includes(column) || table.policy.scope === column ||
            referencedParent || !childReference || !table.nullableColumns?.includes(column) || change.after !== null ||
            (constraint && !constraint.columns.includes(column))) { valid = false; continue; }
        proposed.set(column, change.after);
      }
      if (!valid || proposed.size !== entry.changes.length) { addIssue('unsupported_or_unknown_after_image', identity(row)); continue; }
      changes.set(row.key, proposed);
      declarations.push({ ...identity(row), kind, constraint: entry.constraint ?? null, beforeSha256: row.sha256,
        expectedAfterSha256: entry.afterSha256, changes: sorted(entry.changes), reason: entry.reason, afterImageVerified: false });
    }
  }
  for (const row of rows.values()) {
    if (row.disposition === 'normalize-reviewed' && !changes.has(row.key)) addIssue('normalization_after_image_required', identity(row));
    if (row.disposition === 'retire-intent') addIssue('retirement_semantics_not_planned', identity(row));
  }
  const effectiveValue = (row, column) => changes.get(row.key)?.has(column) ? changes.get(row.key).get(column) : beforeValue(row, column);
  const resolve = (table, columns, values) => (byTable.get(table) ?? []).filter(row => columns.every((column, i) => equal(beforeValue(row, column), values[i])));
  const dependencies = [], implicitEffects = [], usedDetaches = new Set();
  const graph = new Map([...rows.values()].filter(row => row.disposition === 'archive-remove').map(row => [row.key, new Set()]));
  const addDependency = (child, parent, detail) => {
    if (parent.disposition !== 'archive-remove') return;
    dependencies.push({ source: identity(child), target: identity(parent), ...detail });
    if (child.disposition === 'archive-remove') graph.get(child.key).add(parent.key);
    else addIssue('retained_row_references_removed_parent', { ...identity(child), target: identity(parent), ...detail });
  };
  for (const table of tables.values()) for (const fk of table.foreignKeys) {
    if (!actions[fk.onDelete] || !['s', 'f'].includes(fk.matchType) || !Array.isArray(fk.deleteColumns) ||
        !fk.columns.length || fk.columns.length !== fk.targetColumns.length || fk.deleteColumns.some(column => !fk.columns.includes(column))) {
      addIssue('unsupported_foreign_key_catalog', { table: table.table, constraint: fk.name }); continue;
    }
    for (const child of byTable.get(table.table)) {
      let original, effective, matches;
      try {
        original = fk.columns.map(column => beforeValue(child, column));
        effective = fk.columns.map(column => effectiveValue(child, column));
        matches = original.some(v => v == null) ? [] : resolve(fk.target, fk.targetColumns, original);
      } catch { addIssue('captured_reference_values_incomplete', { ...identity(child), constraint: fk.name }); continue; }
      const nullCount = effective.filter(v => v == null).length;
      if (fk.matchType === 'f' && nullCount > 0 && nullCount < effective.length) {
        addIssue('match_full_partial_null', { ...identity(child), constraint: fk.name }); continue;
      }
      if (!original.some(v => v == null) && matches.length !== 1) {
        if (fk.target === 'auth.users' && original.length === 1 && manifest.binding.authUsers?.includes(original[0])) continue;
        addIssue('foreign_key_target_not_unique_or_missing', { ...identity(child), constraint: fk.name }); continue;
      }
      const parent = matches[0];
      if (!parent || parent.disposition !== 'archive-remove') continue;
      const detached = nullCount > 0;
      if (detached) usedDetaches.add(child.key);
      const detail = { kind: 'foreign-key', constraint: fk.name, onDelete: actions[fk.onDelete] };
      if (['c', 'n', 'd'].includes(fk.onDelete)) implicitEffects.push({ source: identity(child), target: identity(parent), ...detail,
        columns: fk.deleteColumns, preventedBy: detached ? 'explicit-reviewed-detach' : child.disposition === 'archive-remove' ? 'child-first-removal' : null });
      if (!detached) addDependency(child, parent, detail);
    }
  }
  for (const declaration of declarations) if (!usedDetaches.has(key(declaration.table, declaration.pk))) {
    addIssue('reviewed_detach_has_no_removed_parent', { table: declaration.table, pk: declaration.pk });
  }
  for (const reference of [...(manifest.staticReferences ?? []).map(ref => ({ ...ref, kind: 'static-reference' })),
    ...(manifest.polymorphic ?? []).map(ref => ({ ...ref, kind: 'polymorphic-reference' }))]) {
    if (reference.historicalSnapshot) continue;
    const child = rows.get(key(reference.table, reference.pk));
    if (!child) { addIssue('logical_reference_source_missing'); continue; }
    let effective;
    try { effective = effectiveValue(child, reference.column); } catch { addIssue('captured_reference_values_incomplete', identity(child)); continue; }
    if (effective == null || reference.target === 'auth.users') continue;
    let parents;
    try { parents = resolve(reference.target, ['id'], [effective]); } catch { parents = []; }
    if (!reference.resolved || parents.length !== 1) { addIssue('logical_reference_target_missing', { ...identity(child), column: reference.column }); continue; }
    addDependency(child, parents[0], { kind: reference.kind, column: reference.column });
  }
  for (const incoming of manifest.inbound ?? []) if (incoming.rows !== 0) addIssue('cross_scope_inbound_dependency', incoming);
  issues.push(...logicalInboundIssues(manifest.tables, manifest.logicalInbound));
  const indegrees = new Map([...graph.keys()].map(k => [k, 0]));
  for (const parents of graph.values()) for (const parent of parents) indegrees.set(parent, indegrees.get(parent) + 1);
  const ready = [...indegrees].filter(([, degree]) => degree === 0).map(([k]) => k).sort(), ordered = [];
  while (ready.length) {
    const next = ready.shift(); ordered.push(identity(rows.get(next)));
    for (const parent of graph.get(next)) {
      indegrees.set(parent, indegrees.get(parent) - 1);
      if (indegrees.get(parent) === 0) { ready.push(parent); ready.sort(); }
    }
  }
  if (ordered.length !== graph.size) addIssue('unsupported_dependency_cycle', {
    unresolvedRows: sorted([...indegrees].filter(([, count]) => count > 0).map(([k]) => identity(rows.get(k)))),
  });
  const plan = { format: 'nestory-local-finance-reset-dependency-plan-v1', syntheticOnly: true, readOnly: true,
    executionSupported: false, actualResetRecoveryProven: false, dependencyPlanAccepted: issues.length === 0,
    manifestSha256, operationId: manifest.operationId, candidateHead: manifest.binding.candidateHead,
    reviewSha256: review ? sha256(json(review)) : null, reviewId: review?.reviewId ?? null,
    normalizationDeclarations: sorted(declarations), dependencies: sorted(dependencies), implicitEffects: sorted(implicitEffects),
    candidateRemovalOrder: ordered, issues: sorted(issues),
    unprovedExecutorRequirements: ['full before/after row archive verification', 'trigger and projection side effects',
      'frozen operation capability and exact generation', 'retired intent and Storage containment',
      'atomic known-zero checkpoint', 'generation-aware restoration and recovery'],
  };
  return { ...plan, planSha256: sha256(json(plan)) };
}
