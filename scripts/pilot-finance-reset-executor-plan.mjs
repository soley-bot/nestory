// Pure exact-action materialization. No database, filesystem, or approval authority.
import { TARGET, json, sha256 } from './pilot-finance-reset-core.mjs';

const digest = /^[a-f0-9]{64}$/;
const key = row => json([row.table, row.pk]);
const equal = (a, b) => json(a) === json(b);
const actorUuid = /^00000000-0000-0000-0000-000000000[15678]01$/;
const anyUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function intact(value, field, label) {
  if (!value || typeof value !== 'object') throw Error(`Missing ${label}.`);
  const { [field]: hash, ...body } = value;
  if (!digest.test(hash ?? '') || sha256(json(body)) !== hash) throw Error(`${label} digest mismatch.`);
}

// This is explicit synthetic semantic review, not a customer approval or a
// signature for unknown rows that the checked commands will later generate.
export function assertCheckedPhaseReview(review, materialized) {
  intact(review, 'reviewSha256', 'Checked phase review');
  const keys = (value, names) => value && equal(Object.keys(value).sort(), [...names].sort());
  if (!keys(review, ['format', 'syntheticOnly', 'customerApproval', 'manifestSha256', 'actionsSha256', 'zero', 'continuation', 'reviewSha256']) ||
      review.format !== 'nestory-synthetic-checked-reset-phase-review-v1' || review.syntheticOnly !== true || review.customerApproval !== false ||
      review.manifestSha256 !== materialized.sourceBinding.manifestSha256 || review.actionsSha256 !== materialized.actionsSha256) throw Error('Checked phase review binding mismatch.');
  const zero = review.zero, continuation = review.continuation;
  if (!keys(zero, ['makerActorId', 'reviewerActorId', 'effectiveDate', 'currencies', 'scopes']) ||
      !actorUuid.test(zero.makerActorId) || !actorUuid.test(zero.reviewerActorId) || zero.makerActorId === zero.reviewerActorId ||
      zero.effectiveDate !== TARGET.cutoff || !equal(zero.currencies, ['USD']) || !Array.isArray(zero.scopes) || !zero.scopes.length) throw Error('Known-zero synthetic actor or scope review is invalid.');
  const scopeIds = new Set();
  for (const scope of zero.scopes) {
    if (!keys(scope, ['property_id', 'property_owner_id', 'owner_person_id', 'ownership_percent', 'ownership_roster_hash', 'property_row_sha256', 'property_archived_at', 'currency']) ||
        !['property_id', 'property_owner_id', 'owner_person_id'].every(key => anyUuid.test(scope[key] ?? '')) ||
        !digest.test(scope.ownership_roster_hash ?? '') || !digest.test(scope.property_row_sha256 ?? '') || scope.currency !== 'USD' ||
        (scope.property_archived_at !== null && (typeof scope.property_archived_at !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(scope.property_archived_at) ||
          !Number.isFinite(Date.parse(scope.property_archived_at)))) ||
        !/^(?:\d{1,3})(?:\.\d+)?$/.test(String(scope.ownership_percent)) || Number(scope.ownership_percent) <= 0 || Number(scope.ownership_percent) > 100 ||
        scopeIds.has(scope.property_owner_id)) throw Error('Invalid or repeated reviewed zero scope.');
    scopeIds.add(scope.property_owner_id);
  }
  if (!keys(continuation, ['version', 'actor_id', 'billing_period_start', 'issue_date', 'leases']) || continuation.version !== 1 ||
      !actorUuid.test(continuation.actor_id ?? '') || continuation.billing_period_start !== TARGET.cutoff ||
      !/^2026-10-(?:0[1-9]|[12][0-9]|3[01])$/.test(continuation.issue_date ?? '') || !Array.isArray(continuation.leases) || !continuation.leases.length) throw Error('Continuation semantic review is invalid.');
  const leaseIds = new Set();
  for (const lease of continuation.leases) {
    if (!keys(lease, ['lease_id', 'term_id', 'billing_rule_id', 'continue_month_to_month', 'rent_amount', 'management_fee_amount', 'currency', 'recipient_person_id', 'collection_route', 'due_date']) ||
        !['lease_id', 'term_id', 'billing_rule_id', 'recipient_person_id'].every(key => anyUuid.test(lease[key] ?? '')) ||
        typeof lease.continue_month_to_month !== 'boolean' || lease.currency !== 'USD' || !['through_ips', 'direct_to_owner'].includes(lease.collection_route) ||
        !['rent_amount', 'management_fee_amount'].every(key => typeof lease[key] === 'string' && /^\d+(?:\.\d{1,2})?$/.test(lease[key])) ||
        (lease.continue_month_to_month && Number(lease.rent_amount) === 0) || !/^\d{4}-\d{2}-\d{2}$/.test(lease.due_date ?? '') || leaseIds.has(lease.lease_id)) throw Error('Invalid or repeated reviewed continuation lease.');
    leaseIds.add(lease.lease_id);
  }
  return review;
}

// Retain all unchanged PostgreSQL JSONB number lexemes, including numeric scale
// and integers beyond JavaScript precision. Only reviewed top-level fields are
// replaced. The result is an allowed JSONB image, NOT a guessed stored-row hash.
export function patchRowText(text, patch) {
  const parsed = JSON.parse(text);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw Error('Row image must be an object.');
  for (const [column, value] of Object.entries(patch)) {
    const generation = column === 'financial_generation' && Number.isSafeInteger(value) && value >= 0;
    if (!Object.hasOwn(parsed, column) || (!generation && ![null, 'string', 'boolean'].includes(value === null ? null : typeof value))) {
      throw Error('Unsupported exact row patch.');
    }
  }
  const replacements = [], columns = new Set();
  let index = 0;
  const whitespace = () => { while (/\s/.test(text[index] ?? '') && index < text.length) index++; };
  const stringEnd = start => {
    let end = start + 1;
    for (; end < text.length; end++) {
      if (text[end] === '\\') end++;
      else if (text[end] === '"') return end + 1;
    }
    throw Error('Invalid JSON string.');
  };
  whitespace(); index++;
  while (true) {
    whitespace(); if (text[index] === '}') break;
    const nameStart = index, nameEnd = stringEnd(index);
    const column = JSON.parse(text.slice(nameStart, nameEnd));
    if (columns.has(column)) throw Error('Duplicate row-image column.');
    columns.add(column); index = nameEnd; whitespace(); index++; whitespace();
    const start = index;
    let nesting = 0;
    while (index < text.length) {
      const char = text[index];
      if (char === '"') { index = stringEnd(index); continue; }
      if (char === '[' || char === '{') nesting++;
      if (char === ']' || char === '}') {
        if (nesting === 0) break;
        nesting--;
      }
      if (char === ',' && nesting === 0) break;
      index++;
    }
    let end = index; while (/\s/.test(text[end - 1] ?? '')) end--;
    if (Object.hasOwn(patch, column)) replacements.push({ start, end, text: JSON.stringify(patch[column]) });
    if (text[index] === '}') break;
    index++;
  }
  let result = text;
  for (const change of replacements.reverse()) result = result.slice(0, change.start) + change.text + result.slice(change.end);
  return result;
}

const normalizations = {
  'normalize-cash-status': { table: 'public.lease_deposits', fields: { status: 'pending', received_on: null, returned_on: null } },
  'clear-actual-cost-projection': { table: 'public.tasks', fields: { actual_cost_amount: null, actual_cost_currency: null, actual_cost_date: null, actual_cost_document_id: null, actual_cost_reference: null } },
  'clear-financial-timeline-projection': { table: 'public.timeline_events', fields: { ledger_entry_id: null, cost_amount: null, cost_currency: null } },
  'cancel-unclaimed-synthetic-reminder': { table: 'public.notification_outbox', fields: { status: 'cancelled' } },
};
const cycleColumns = {
  'public.finance_expense_items': ['ledger_entry_id'], 'public.finance_payment_allocations': ['ledger_entry_id'],
  'public.finance_receipt_allocations': ['ledger_entry_id'],
  'public.lease_deposit_events': ['ledger_entry_id'],
  'public.owner_payments': ['ledger_entry_id'], 'public.petty_cash_entries': ['ledger_entry_id'],
  'public.property_withdrawals': ['ledger_entry_id'],
};

// Immediate historical validators impose two row-specific restore sequences
// beyond foreign keys. Express their inverse as extra removal-order edges;
// these do not remove or reclassify any catalog dependency.
export function historicalRestoreRemovalEdges(archiveRows, removalRows) {
  const relevant = new Set(['public.owner_opening_balance_entries', 'public.owner_charge_cash_allocations',
    'public.owner_invoice_lines', 'public.expense_customer_adjustments']);
  const captured = new Map(), removable = new Set(removalRows.map(key)), edges = [];
  const identity = row => ({ table: row.table, pk: row.pk });
  for (const row of archiveRows) {
    if (!relevant.has(row.table)) continue;
    const values = JSON.parse(row.rowText);
    patchRowText(row.rowText, {});
    if (captured.has(key(row)) || sha256(row.rowText) !== row.sha256 || !anyUuid.test(values.id ?? '') ||
        values.organization_id !== TARGET.organization || !equal(row.pk, [values.id])) throw Error('Historical restore row identity or archive hash is invalid.');
    captured.set(key(row), { ...row, values });
  }
  const rows = [...captured.values()];
  const add = (source, target, rule) => {
    if (!removable.has(key(source)) || !removable.has(key(target))) throw Error('Historical restore ordering endpoint is not archived and removable.');
    edges.push({ kind: 'historical-restore-order', rule, source: identity(source), target: identity(target) });
  };
  for (const replacement of rows.filter(row => row.table === 'public.owner_opening_balance_entries' && row.values.entry_kind === 'correction_replacement')) {
    if (!anyUuid.test(replacement.values.request_id ?? '')) throw Error('Historical correction request identity is missing.');
    const reversals = rows.filter(row => row.table === replacement.table && row.values.entry_kind === 'correction_reversal' &&
      row.values.request_id === replacement.values.request_id);
    if (reversals.length !== 1) throw Error('Historical correction requires one exact archived same-request reversal.');
    const reversal = reversals[0];
    const scope = ['organization_id', 'property_id', 'owner_person_id', 'currency', 'effective_date', 'component'];
    if (!anyUuid.test(reversal.values.reversal_of_entry_id ?? '') || scope.some(column =>
      typeof replacement.values[column] !== 'string' || !replacement.values[column] || replacement.values[column] !== reversal.values[column])) {
      throw Error('Historical correction reversal scope is ambiguous.');
    }
    add(replacement, reversal, 'opening-correction-reversal-before-replacement');
  }
  for (const allocation of rows.filter(row => row.table === 'public.owner_charge_cash_allocations')) {
    if (allocation.values.reversal_of_id !== null) {
      if (!anyUuid.test(allocation.values.reversal_of_id ?? '')) throw Error('Historical held-cash reversal shape is unknown.');
      continue;
    }
    if (!anyUuid.test(allocation.values.owner_invoice_line_id ?? '')) throw Error('Historical held-cash invoice-line identity is missing.');
    const line = captured.get(key({ table: 'public.owner_invoice_lines', pk: [allocation.values.owner_invoice_line_id] }));
    if (!line || !removable.has(key(line)) || typeof line.values.source_type !== 'string') throw Error('Historical held-cash source line is not archived and removable.');
    if (line.values.source_type !== 'owner_expense') continue;
    if (!anyUuid.test(line.values.source_id ?? '')) throw Error('Historical owner expense responsibility identity is missing.');
    const adjustments = rows.filter(row => row.table === 'public.expense_customer_adjustments' &&
      row.values.responsibility_id === line.values.source_id);
    if (adjustments.some(row => !['owner', 'tenant'].includes(row.values.responsibility))) throw Error('Historical expense adjustment responsibility is unknown.');
    const ownerAdjustments = adjustments.filter(row => row.values.responsibility === 'owner');
    if (ownerAdjustments.length > 1) throw Error('Historical owner expense adjustment is ambiguous.');
    for (const adjustment of ownerAdjustments) add(adjustment, allocation, 'held-cash-before-owner-expense-adjustment');
  }
  return edges.sort((a, b) => json(a) < json(b) ? -1 : json(a) > json(b) ? 1 : 0);
}

export function materializeResetActions({ inventory, dependencyPlan, review, snapshot }) {
  intact(inventory, 'manifestSha256', 'Inventory');
  if (Object.hasOwn(dependencyPlan, 'artifactSha256')) {
    intact(dependencyPlan, 'artifactSha256', 'Planner artifact');
    const plan = { ...dependencyPlan }; delete plan.artifactSha256; delete plan.plannerSourceFiles;
    intact(plan, 'planSha256', 'Dependency plan');
  } else intact(dependencyPlan, 'planSha256', 'Dependency plan');
  intact(review, 'reviewSha256', 'Exact review'); intact(snapshot, 'sha256', 'Row snapshot');
  const reviewedIssueKinds = new Set(['normalization_after_image_required', 'retirement_semantics_not_planned',
    'retained_row_references_removed_parent', 'unsupported_dependency_cycle']);
  if ((dependencyPlan.issues ?? []).some(issue => !reviewedIssueKinds.has(issue.code))) throw Error('Dependency plan has an unsupported catalog, scope or orphan issue.');
  if (inventory.format !== 'nestory-local-finance-reset-inventory-v1' || inventory.syntheticOnly !== true ||
      inventory.inventoryAccepted !== true || inventory.issues?.length !== 0 ||
      review.format !== 'synthetic-finance-reset-exact-review-proposal-v1' || review.syntheticOnly !== true ||
      review.customerApproval !== false || review.executionSupported !== false ||
      snapshot.format !== 'synthetic-row-review-supplement-v1' ||
      inventory.binding.project !== TARGET.project || inventory.binding.organization !== TARGET.organization ||
      inventory.binding.cutoff !== TARGET.cutoff || inventory.binding.baseSha !== TARGET.baseSha ||
      inventory.binding.fixtureSha256 !== TARGET.fixtureSha256) throw Error('Exact synthetic reset scope mismatch.');
  const binding = review.sourceBinding;
  if (binding.manifestSha256 !== inventory.manifestSha256 || dependencyPlan.manifestSha256 !== inventory.manifestSha256 ||
      snapshot.manifestSha256 !== inventory.manifestSha256 || binding.planSha256 !== dependencyPlan.planSha256 ||
      binding.supplementSha256 !== snapshot.sha256 || snapshot.containerId !== inventory.binding.containerId ||
      snapshot.endpoint !== inventory.binding.endpoint ||
      ['candidateHead', 'schemaSha256', 'migrationsSha256'].some(field => binding[field] !== inventory.binding[field]) ||
      !equal(binding.candidateSources, inventory.binding.candidateSources) ||
      !equal(binding.validatedSourceArtifacts, inventory.binding.fixtureArtifacts)) throw Error('Review source binding mismatch.');
  const tables = new Map(), declared = new Map(), captured = new Map();
  for (const table of inventory.tables) {
    if (tables.has(table.table)) throw Error('Duplicate inventory table.');
    tables.set(table.table, table);
    if (!['archive-remove', 'normalize-reviewed', 'retire-intent'].includes(table.policy.disposition)) continue;
    for (const row of table.selectedRows) {
      const identity = { table: table.table, pk: row.pk }, id = key(identity);
      if (declared.has(id)) throw Error('Duplicate inventory row.');
      declared.set(id, { ...row, ...identity });
    }
  }
  for (const row of snapshot.rows) {
    const id = key(row), source = declared.get(id), table = tables.get(row.table);
    if (!source || captured.has(id) || row.sha256 !== source.sha256 || sha256(row.rowText) !== row.sha256) throw Error('Exact captured row mismatch.');
    const values = JSON.parse(row.rowText);
    patchRowText(row.rowText, {}); // Also rejects duplicate keys.
    if (!equal(table.pk.map(column => values[column]), row.pk) ||
        (table.policy.scope && values[table.policy.scope] !== TARGET.organization)) throw Error('Captured row scope or primary key mismatch.');
    captured.set(id, { ...row, values });
  }
  if (declared.size !== captured.size) throw Error('Full selected-row archive is incomplete.');
  const blockers = [], actions = [], decisions = new Set();
  const block = (code, row) => blockers.push({ code, ...(row ? { table: row.table, pk: row.pk } : {}) });
  const boundMigration = name => binding.validatedSourceArtifacts.some(item => item.name === name && digest.test(item.sha256 ?? ''));
  for (const decision of [...review.normalizationDecisions, ...review.retirementDecisions, ...review.cycleBreakDecisions]) {
    const id = key(decision), row = captured.get(id), table = tables.get(decision.table);
    if (!row || decisions.has(id) || decision.beforeSha256 !== row.sha256 || decision.preserveAllUnlistedColumns !== true ||
        !Array.isArray(decision.changes) || decision.expectedStoredAfterSha256 !== null || decision.afterImageVerified !== false) throw Error('Decision does not bind an exact unchanged source row.');
    decisions.add(id);
    let allowed, kind = decision.kind;
    if (normalizations[kind]?.table === row.table) allowed = normalizations[kind].fields;
    else if (kind === 'stage-exact-null-cycle-edges' && cycleColumns[row.table]) {
      allowed = Object.fromEntries(cycleColumns[row.table].map(column => [column, null]));
      if (table.policy.disposition !== 'archive-remove') throw Error('Cycle stage must precede removal.');
      for (const column of Object.keys(allowed)) if (!table.nullableColumns.includes(column) ||
          !table.foreignKeys.some(fk => fk.columns.includes(column))) throw Error('Cycle stage lacks a nullable foreign key.');
    } else if (kind === 'stage-exact-null-cycle-edges' && row.table === 'public.owner_close_series' &&
        boundMigration('20261023101000_financial_reset_private_action_foundation.sql') &&
        boundMigration('20261023102000_financial_reset_exact_row_guard_integration.sql')) {
      allowed = { state: 'open', active_revision_id: null, current_closed_revision_id: null };
      if (table.policy.disposition !== 'archive-remove' || !['active_revision_id', 'current_closed_revision_id'].every(column =>
          table.nullableColumns.includes(column) && table.foreignKeys.some(fk => fk.columns.includes(column)))) throw Error('Compound close stage lacks exact nullable pointer authority.');
    } else if (kind === 'retain-registration-retired-generation' && row.table === 'app_private.paid_cost_evidence_registrations' &&
        boundMigration('20261023103000_paid_cost_evidence_generation_retirement.sql')) {
      if (row.values.financial_generation !== 0 || decision.changes.length || decision.retirementCondition?.oldGeneration !== 0 ||
          decision.retirementCondition?.newGenerationMustBeGreaterThan !== 0 || decision.retirementCondition?.controlMustRemainFrozen !== true) throw Error('Paid evidence generation retirement is unproven.');
      allowed = {};
    } else if (kind === 'retain-retired-generation' && row.table === 'app_private.financial_idempotency_requests') {
      if (row.values.status !== 'completed' || row.values.financial_generation !== 0 || decision.changes.length) throw Error('Unknown idempotency retirement state.');
      allowed = {};
    } else if (kind === 'retain-retired-request-result-seal' && row.table === 'app_private.finance_category_idempotency_result_seals') {
      const parent = captured.get(key(decision.parent ?? {}));
      if (!parent || parent.table !== 'app_private.financial_idempotency_requests' || parent.sha256 !== decision.parent.sha256 ||
          parent.values.financial_generation !== 0 || parent.values.status !== 'completed' || decision.changes.length ||
          ['organization_id', 'operation', 'idempotency_key'].some(column => !equal(row.values[column], parent.values[column]))) throw Error('Retired seal parent is unproven.');
      allowed = {};
    } else {
      block(kind === 'retain-registration-require-retirement-tombstone' ? 'paid_evidence_retirement_unimplemented' :
        row.table === 'public.owner_close_series' ? 'compound_close_cycle_unimplemented' : 'unsupported_decision', row);
      continue;
    }
    if (kind === 'cancel-unclaimed-synthetic-reminder' && (row.values.status !== 'pending' || row.values.claimed_at !== null ||
        row.values.delivered_at !== null || row.values.event_type !== 'maintenance_reminder')) throw Error('Reminder may already have external effects.');
    const patch = {};
    for (const change of decision.changes) {
      if (!Object.hasOwn(allowed, change.column) || Object.hasOwn(patch, change.column) ||
          !Object.hasOwn(row.values, change.column) || !equal(change.before, row.values[change.column]) ||
          !equal(change.after, allowed[change.column]) || table.pk.includes(change.column) || change.column === table.policy.scope) throw Error('Unreviewed or unsafe column change.');
      patch[change.column] = change.after;
    }
    for (const [column, after] of Object.entries(allowed)) if (!Object.hasOwn(row.values, column) ||
        (!equal(row.values[column], after) && !Object.hasOwn(patch, column))) throw Error('Decision omits a required normalized field.');
    actions.push({ table: row.table, pk: row.pk, kind, beforeRowText: row.rowText, beforeSha256: row.sha256,
      allowedAfterRowText: patchRowText(row.rowText, patch), changedColumns: Object.keys(patch).sort(),
      expectedStoredAfterSha256: null, auditValues: 'preserve-unlisted-columns', storedImageVerified: false });
  }
  const removalIds = new Set();
  for (const identity of review.graphResolution.candidateRemovalOrder) {
    const id = key(identity), row = captured.get(id);
    if (!row || removalIds.has(id) || tables.get(row.table).policy.disposition !== 'archive-remove') throw Error('Invalid exact removal order.');
    removalIds.add(id);
    const stage = actions.find(action => key(action) === id);
    actions.push({ table: row.table, pk: row.pk, kind: 'archive-remove', beforeRowText: row.rowText,
      beforeSha256: row.sha256, requiredCurrentRowText: stage?.allowedAfterRowText ?? row.rowText,
      allowedAfterRowText: null, changedColumns: [], expectedStoredAfterSha256: null, storedImageVerified: false });
  }
  for (const row of captured.values()) {
    const disposition = tables.get(row.table).policy.disposition;
    if (disposition === 'archive-remove' && !removalIds.has(key(row))) throw Error('Removal set is incomplete.');
    if (['normalize-reviewed', 'retire-intent'].includes(disposition) && !decisions.has(key(row))) throw Error('Required exact decision is absent.');
    if (disposition === 'must-be-empty') block('inflight_capability_row', row);
  }
  const indexes = new Map([...removalIds].map((id, index) => [id, index]));
  const graph = review.graphResolution;
  const temporarilyAbsentLogicalEdges = graph.temporarilyAbsentLogicalEdges ?? [];
  const partition = [...graph.remainingEdges, ...graph.removedForeignKeyEdges, ...graph.conditionallyRetiredLogicalEdges, ...temporarilyAbsentLogicalEdges];
  if (!equal(partition.map(json).sort(), dependencyPlan.dependencies.map(json).sort())) throw Error('Reviewed dependency partition is incomplete.');
  for (const edge of graph.removedForeignKeyEdges) {
    const action = actions.find(value => key(value) === key(edge.source) && value.kind === 'stage-exact-null-cycle-edges');
    const fk = tables.get(edge.source.table)?.foreignKeys.find(value => value.name === edge.constraint);
    if (edge.kind !== 'foreign-key' || !fk || fk.target !== edge.target.table) throw Error('Unproved removed foreign key edge.');
    // Unsupported compound-close staging remains a blocker, never permission to
    // erase its edges. Its exact reviewed tuple is deferred to its own contract.
    if (!action && edge.source.table === 'public.owner_close_series') continue;
    const after = action ? JSON.parse(action.allowedAfterRowText) : null;
    const nulls = after ? fk.columns.filter(column => after[column] === null).length : 0;
    if (!action || !['s', 'f'].includes(fk.matchType) || !fk.columns.some(column => action.changedColumns.includes(column)) ||
        !nulls || (fk.matchType === 'f' && nulls !== fk.columns.length)) throw Error('Unproved removed foreign key edge.');
  }
  for (const edge of graph.conditionallyRetiredLogicalEdges) {
    const action = actions.find(value => key(value) === key(edge.source) && value.kind === 'retain-retired-request-result-seal');
    const row = captured.get(key(edge.source)), target = captured.get(key(edge.target));
    if (!['static-reference', 'polymorphic-reference'].includes(edge.kind) || !action || !target || edge.column !== 'result_id' || row.values.result_id !== target.values.id ||
        !removalIds.has(key(target))) throw Error('Retired logical edge lacks exact archived result.');
  }
  // These two provenance cycles have CHECK-constrained physical back-links.
  // Keep those FKs intact: delete their child first and restore their parent
  // first. Only the named logical source_id may temporarily lack its target,
  // within the exact archived pair; every original image is restored below.
  const temporaryShapes = [
    ['public.ledger_entries', 'owner_collection_allocation', 'public.owner_collection_confirmation_allocations', 'ledger_entry_id'],
    ['public.owner_invoice_lines', 'owner_expense', 'public.ips_expense_responsibilities', 'owner_invoice_line_id'],
  ];
  for (const edge of temporarilyAbsentLogicalEdges) {
    const source = captured.get(key(edge.source)), target = captured.get(key(edge.target));
    const shape = temporaryShapes.find(([table, type, child]) => edge.source.table === table &&
      source?.values.source_type === type && edge.target.table === child);
    if (edge.kind !== 'polymorphic-reference' || edge.column !== 'source_id' || !shape || !source || !target ||
        source.values.source_id !== target.values.id || target.values[shape[3]] !== source.values.id ||
        !removalIds.has(key(source)) || !removalIds.has(key(target)) ||
        tables.get(source.table).foreignKeys.some(fk => fk.columns.includes('source_id')) ||
        actions.some(action => [key(source), key(target)].includes(key(action)) && action.kind !== 'archive-remove')) {
      throw Error('Temporary logical provenance lacks an exact archived removal pair.');
    }
    const reverse = graph.remainingEdges.find(candidate => candidate.kind === 'foreign-key' &&
      key(candidate.source) === key(target) && key(candidate.target) === key(source) &&
      tables.get(target.table).foreignKeys.some(fk => fk.name === candidate.constraint && fk.target === source.table &&
        fk.columns.includes(shape[3]) && fk.columns.length === fk.targetColumns?.length &&
        fk.columns.every((column, index) => target.values[column] != null &&
          equal(target.values[column], source.values[fk.targetColumns[index]]))));
    if (!reverse) throw Error('Temporary logical provenance must preserve its exact physical foreign key.');
  }
  for (const edge of review.graphResolution.remainingEdges) if (!indexes.has(key(edge.source)) || !indexes.has(key(edge.target)) ||
      indexes.get(key(edge.source)) >= indexes.get(key(edge.target))) throw Error('Removal order violates remaining dependency.');
  const historicalEdges = historicalRestoreRemovalEdges(snapshot.rows, graph.candidateRemovalOrder);
  if (!equal(graph.historicalOrderingEdges ?? [], historicalEdges)) throw Error('Reviewed historical ordering edges differ from exact archived rows.');
  for (const edge of historicalEdges) if (indexes.get(key(edge.source)) >= indexes.get(key(edge.target))) {
    throw Error('Removal order violates historical restore sequence.');
  }
  if (!equal(review.graphResolution.candidateRestoreInsertionOrder,
    [...review.graphResolution.candidateRemovalOrder].reverse())) throw Error('Restore insertion order is not exact inverse.');
  block('known_zero_authority_unimplemented');
  // Stage nullable cycle references first; remove all financial source rows in
  // dependency order; only then normalize retained financial projections.
  const phase = action => action.kind === 'stage-exact-null-cycle-edges' ? 0 : action.kind === 'archive-remove' ? 1 : 2;
  actions.sort((a, b) => phase(a) - phase(b));
  const result = { format: 'nestory-synthetic-reset-materialized-actions-v1', syntheticOnly: true, customerApproval: false,
    sourceBinding: binding, reviewSha256: review.reviewSha256, archiveRows: snapshot.rows,
    actions, blockers, executionSupported: blockers.length === 0, actualResetRecoveryProven: false };
  return { ...result, actionsSha256: sha256(json(result)) };
}

export function materializeRestoreActions(materialized, targetGeneration) {
  intact(materialized, 'actionsSha256', 'Materialized reset');
  if (!Number.isSafeInteger(targetGeneration) || targetGeneration < 2 || targetGeneration > 2147483647) throw Error('Restore requires a fresh generation.');
  const actions = [], finalPointers = [];
  const generationImage = text => Object.hasOwn(JSON.parse(text), 'financial_generation')
    ? patchRowText(text, { financial_generation: targetGeneration }) : text;
  const removed = materialized.actions.filter(action => action.kind === 'archive-remove');
  const historicalEdges = historicalRestoreRemovalEdges(materialized.archiveRows ?? removed.map(action => ({ ...action,
    rowText: action.beforeRowText, sha256: sha256(action.beforeRowText) })), removed);
  const removalIndexes = new Map(removed.map((row, index) => [key(row), index]));
  for (const edge of historicalEdges) if (removalIndexes.get(key(edge.source)) >= removalIndexes.get(key(edge.target))) {
    throw Error('Restore order violates historical restore sequence.');
  }
  for (const original of [...removed].reverse()) {
    const stage = materialized.actions.find(action => key(action) === key(original) && action.kind === 'stage-exact-null-cycle-edges');
    const final = generationImage(original.beforeRowText), staged = generationImage(stage?.allowedAfterRowText ?? original.beforeRowText);
    actions.push({ table: original.table, pk: original.pk, kind: 'restore', beforeRowText: null, allowedAfterRowText: staged,
      changedColumns: [], expectedStoredAfterSha256: null });
    if (stage) finalPointers.push({ table: original.table, pk: original.pk, kind: 'restore', beforeRowText: staged,
      allowedAfterRowText: final, changedColumns: stage.changedColumns, expectedStoredAfterSha256: null });
  }
  actions.push(...finalPointers);
  for (const normalized of materialized.actions.filter(action => normalizations[action.kind] && action.changedColumns.length)) {
    // Old idempotency, registration, and external-delivery intent never regain
    // authority on restore. In particular, cancelled reminders stay cancelled.
    if (normalized.table === 'public.notification_outbox') continue;
    actions.push({ table: normalized.table, pk: normalized.pk, kind: 'restore', beforeRowText: normalized.allowedAfterRowText,
      allowedAfterRowText: generationImage(normalized.beforeRowText), changedColumns: [...new Set([...normalized.changedColumns,
        ...(Object.hasOwn(JSON.parse(normalized.beforeRowText), 'financial_generation') ? ['financial_generation'] : [])])],
      expectedStoredAfterSha256: null });
  }
  const result = { format: 'nestory-synthetic-reset-materialized-restore-v1', syntheticOnly: true,
    resetActionsSha256: materialized.actionsSha256, sourceBinding: materialized.sourceBinding, targetGeneration,
    actions, retainedRetiredRows: materialized.actions.filter(action => action.kind.startsWith('retain-') || action.table === 'public.notification_outbox')
      .map(action => ({ table: action.table, pk: action.pk, requiredRowText: action.allowedAfterRowText })),
    blockers: materialized.blockers, actualResetRecoveryProven: false };
  return { ...result, restorePlanSha256: sha256(json(result)) };
}

export function orderRecoverySources(sources, incomingEdges) {
  const identity = row => json([row.relation_name, row.primary_key]);
  const rows = new Map(), graph = new Map(), incoming = new Map();
  for (const row of sources) {
    const id = identity(row), before = JSON.parse(row.before_row_text);
    if (rows.has(id) || !/^public\.[a-z][a-z0-9_]*$/.test(row.relation_name ?? '') ||
        before.organization_id !== TARGET.organization || sha256(row.before_row_text) !== row.before_sha256 ||
        !row.primary_key || !Object.keys(row.primary_key).length || Object.entries(row.primary_key).some(([column, value]) => !equal(before[column], value)) ||
        !['recovery-prune', 'recovery-repair'].includes(row.kind)) throw Error('Recovery source identity or typed hash is invalid.');
    if (row.kind === 'recovery-prune') {
      if (row.after_row_text !== null || row.after_sha256 !== null) throw Error('Recovery prune cannot have an after image.');
      graph.set(id, new Set()); incoming.set(id, 0);
    } else {
      const after = JSON.parse(row.after_row_text);
      if (row.relation_name !== 'public.lease_terms' || before.status !== 'expired' || after.status !== 'active' ||
          sha256(row.after_row_text) !== row.after_sha256 || !Array.isArray(row.changed_columns) || !row.changed_columns.includes('status') ||
          row.changed_columns.some(column => !['status', 'updated_at', 'updated_by'].includes(column))) throw Error('Recovery repair is outside the exact predecessor-term contract.');
      const beforeComparable = { ...before }, afterComparable = { ...after };
      for (const column of ['status', 'updated_at', 'updated_by']) { delete beforeComparable[column]; delete afterComparable[column]; }
      if (!equal(beforeComparable, afterComparable)) throw Error('Recovery repair changes unreviewed fields.');
    }
    rows.set(id, row);
  }
  for (const edge of incomingEdges) {
    const target = identity(edge.target), source = edge.source ? identity(edge.source) : null;
    if (!graph.has(target)) throw Error('Recovery edge target is not a prune source.');
    if (!source || !graph.has(source)) throw Error('Generated authority has a surviving incoming foreign-key row.');
    if (source === target) continue; // A row's own reference disappears with it.
    if (!graph.get(source).has(target)) { graph.get(source).add(target); incoming.set(target, incoming.get(target) + 1); }
  }
  const ready = [...graph.keys()].filter(id => incoming.get(id) === 0).sort(), ordered = [];
  while (ready.length) {
    const id = ready.shift(); ordered.push(rows.get(id));
    for (const target of graph.get(id)) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) { ready.push(target); ready.sort(); }
    }
  }
  if (ordered.length !== graph.size) throw Error('Generated recovery graph contains an unsupported cycle.');
  return [...ordered, ...[...rows.values()].filter(row => row.kind === 'recovery-repair').sort((a, b) => identity(a).localeCompare(identity(b)))];
}
