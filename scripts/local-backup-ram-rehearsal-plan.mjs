// Pure fixed-Pilot RAM rehearsal planning. No connection, credentials, file I/O,
// SQL input, hosted dispatch, customer approval or synthetic-inventory relabeling.
import { createHash } from 'node:crypto';
import { validateBusinessSnapshot } from './local-backup-business-restore.mjs';
import { PILOT_BACKUP_ORGANIZATION } from './local-backup-capture.mjs';
import { RESET_REGISTRY } from './pilot-finance-reset-registry.mjs';
import { patchRowText, ownerContributionRestoreRemovalEdges } from './pilot-finance-reset-executor-plan.mjs';
import { buildServerResetPreviewSql, buildServerResetMaintenanceCaptureSql, SERVER_MATERIALIZER_POLICY_SHA256 } from './pilot-finance-reset-server-materializer.mjs';
import { digestDatabaseJson, catalogExpression, ledgerExpression } from './pilot-finance-reset-hosted-transport-protocol.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const digest = /^[a-f0-9]{64}$/, uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const fail = code => { throw Error(`pilot_ram_plan_${code}`); };
const plain = v => v && Object.getPrototypeOf(v) === Object.prototype;
const sorted = v => Array.isArray(v) ? v.map(sorted) : plain(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const exact = (v, fields) => plain(v) && same(Object.keys(v).sort(), [...fields].sort());
const identity = v => JSON.stringify([v.relation_name, sorted(v.primary_key)]);
const literal = v => `'${String(v).replaceAll("'", "''")}'`;
const jsonSql = v => `${literal(JSON.stringify(v))}::jsonb`;
const sessionSettings = "SET LOCAL standard_conforming_strings=on; SET LOCAL search_path=pg_catalog,public; SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='120s';";
const plans = new WeakMap();
const cyclePatches = Object.freeze({
  'public.expense_transactions': { replaces_transaction_id: null },
  'public.finance_expense_items': { ledger_entry_id: null },
  'public.finance_payment_allocations': { ledger_entry_id: null },
  'public.finance_receipt_allocations': { ledger_entry_id: null },
  'public.lease_deposit_events': { ledger_entry_id: null },
  'public.owner_payments': { ledger_entry_id: null },
  'public.petty_cash_entries': { ledger_entry_id: null },
  'public.property_withdrawals': { ledger_entry_id: null },
  'public.owner_close_series': { state: 'open', active_revision_id: null, current_closed_revision_id: null },
});
const normalizationPatches = Object.freeze({
  'public.tasks': { actual_cost_amount: null, actual_cost_currency: null, actual_cost_date: null, actual_cost_document_id: null, actual_cost_reference: null },
  'public.timeline_events': { ledger_entry_id: null, cost_amount: null, cost_currency: null },
});
const localGuard = `DO $pilot_ram_only$ BEGIN
 IF session_user<>'postgres' OR current_user<>'postgres' OR current_database()<>'postgres' OR inet_server_addr() IS NOT NULL
 OR current_setting('data_directory')<>'/db/pg' OR current_setting('listen_addresses')<>'' THEN
 RAISE EXCEPTION 'pilot_ram_plan_local_socket_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261027005615' AND name='financial_reset_empty_books_preserved_contracts')
 OR to_regprocedure('app_private.financial_reset_preserved_contracts(uuid)') IS NULL THEN
 RAISE EXCEPTION 'pilot_ram_plan_empty_books_migration_required'; END IF;
END $pilot_ram_only$;`;
// This SQL guard is additional defense. Only the separately verified owned RAM
// runtime may execute it; a SQL predicate cannot attest container custody.
function baselineGuard(snapshot) {
  const tables = snapshot.tables.filter(t => t.capture === 'full-row-image' || t.mustBeEmpty)
    .map(t => ({ table_name: t.table_name, scope_column: t.scopeColumn, expected_rows: t.row_count }));
  const rows = snapshot.tables.flatMap(t => (t.rows ?? []).map(r => ({ relation_name: t.table_name, primary_key: r.primaryKey, row_sha256: r.rowSha256 })));
  return `${localGuard}
DO $pilot_ram_captured_baseline$ DECLARE r record; n bigint; actual text; BEGIN
 FOR r IN SELECT * FROM jsonb_to_recordset(${jsonSql(tables)}) AS x(table_name text,scope_column text,expected_rows bigint) LOOP
  EXECUTE format('SELECT count(*) FROM %s WHERE %I=$1',r.table_name::regclass,r.scope_column) INTO n USING ${literal(PILOT_BACKUP_ORGANIZATION)}::uuid;
  IF n<>r.expected_rows THEN RAISE EXCEPTION 'pilot_ram_plan_baseline_count_changed'; END IF;
 END LOOP;
 FOR r IN SELECT * FROM jsonb_to_recordset(${jsonSql(rows)}) AS x(relation_name text,primary_key jsonb,row_sha256 text) LOOP
  EXECUTE format('SELECT to_jsonb(t)::text FROM %s t WHERE to_jsonb(t) @> $1',r.relation_name::regclass) INTO STRICT actual USING r.primary_key;
  IF encode(extensions.digest(actual,'sha256'),'hex')<>r.row_sha256 THEN RAISE EXCEPTION 'pilot_ram_plan_baseline_row_changed'; END IF;
 END LOOP;
END $pilot_ram_captured_baseline$;`;
}
function patchFor(row) {
  const disposition = RESET_REGISTRY[row.relation_name]?.disposition, value = JSON.parse(row.row_text);
  let patch = {};
  if (disposition === 'archive-remove') patch = cyclePatches[row.relation_name] ?? {};
  else if (row.relation_name === 'public.lease_deposits') {
    if (!uuid.test(value.lease_id ?? '') || !['held','received','partially_returned','pending','returned','forfeited','waived'].includes(value.status)) fail('deposit_header_ineligible');
    if (['held','received','partially_returned'].includes(value.status)) {
      if (value.archived_at !== null || value.currency !== 'USD') fail('deposit_header_ineligible');
      patch = { status: 'pending', received_on: null, returned_on: null };
    }
  } else if (disposition === 'normalize-reviewed') patch = normalizationPatches[row.relation_name] ?? {};
  if (Object.keys(patch).some(k => !Object.hasOwn(value, k))) fail('patch_column_missing');
  return patch;
}
function checkedRowText(text, primaryKey, relationName) {
  if (typeof text !== 'string' || !plain(primaryKey) || !Object.keys(primaryKey).length) fail('row_invalid');
  if(Object.values(primaryKey).some(v=>typeof v!=='string'&&!Number.isSafeInteger(v)))fail('primary_key_precision_unsupported');
  let value; try { value = JSON.parse(text); patchRowText(text, {}); } catch { fail('row_invalid'); }
  const rule = RESET_REGISTRY[relationName];
  if (!rule?.scope || value[rule.scope] !== PILOT_BACKUP_ORGANIZATION || Object.entries(primaryKey).some(([k,v]) => v == null || !same(value[k], v))) fail('row_scope_invalid');
  return value;
}
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
function checkedText(text, value, expectedHash) {
  if (typeof text !== 'string' || !text.length || Buffer.byteLength(text) > 32 * 1024 * 1024 || hash(text) !== expectedHash) fail('canonical_text_changed');
  let parsed; try { parsed = JSON.parse(text); } catch { fail('canonical_text_invalid'); }
  if (!same(parsed, value)) fail('canonical_text_value_changed');
  return text;
}
const summaryFields = ['format','operation_id','organization_id','source_generation','source_sha256','policy_sha256','archive_count','action_count',
  'archive_sha256','action_sha256','source_snapshot_sha256','foreign_snapshot_sha256','catalog_snapshot_sha256','ledger_snapshot_sha256',
  'counts','deleted_rows','normalized_rows','cycle_stage_rows','accepted','blockers'];

export function createPilotRamRehearsalPlanner(options) {
  if (!exact(options, ['manifestBytes','expectedSourceSha256','operationId']) || !uuid.test(options.operationId)) fail('options_invalid');
  const { snapshot } = validateBusinessSnapshot(options.manifestBytes, options.expectedSourceSha256);
  if (snapshot.tables.some(t => t.table_name.startsWith('app_private.financial_reset_') && t.row_count !== 0)) fail('prior_reset_evidence_present');
  const controls = snapshot.tables.find(t => t.table_name === 'app_private.financial_write_controls').rows;
  // Generation zero is the unenrolled state: the schema only stores controls
  // with generation>0. This narrow rehearsal does not reset an enrolled scope.
  if (controls.length) fail('source_generation_changed');
  const scope = { operationId: options.operationId, organizationId: PILOT_BACKUP_ORGANIZATION, sourceGeneration: 0, sourceSha256: options.expectedSourceSha256 };
  const captured = snapshot.tables.flatMap(t => (t.rows ?? []).map(r => ({ relation_name: t.table_name, primary_key: structuredClone(r.primaryKey), row_text: r.rowText, row_sha256: r.rowSha256 })));
  const expectedArchive = captured.filter(r => ['archive-remove','normalize-reviewed','retire-intent'].includes(RESET_REGISTRY[r.relation_name].disposition));
  const expected = new Map(expectedArchive.map(r => [identity(r), r])), baseline = baselineGuard(snapshot);
  function acceptPreview(value) {
    if (!exact(value, [...summaryFields, 'manifest_sha256', 'summary_text'])) fail('preview_invalid');
    const { manifest_sha256, summary_text, ...summary } = structuredClone(value);
    checkedText(summary_text, summary, manifest_sha256);
    if (!digest.test(manifest_sha256) ||
      summary.format !== 'nestory-server-reset-materialization-v1' || summary.operation_id !== scope.operationId || summary.organization_id !== scope.organizationId ||
      summary.source_generation !== 0 || summary.source_sha256 !== scope.sourceSha256 || summary.policy_sha256 !== SERVER_MATERIALIZER_POLICY_SHA256 ||
      summary.accepted !== true || !Array.isArray(summary.blockers) || summary.blockers.length || !Array.isArray(summary.counts) ||
      ['archive_sha256','action_sha256','source_snapshot_sha256','foreign_snapshot_sha256','catalog_snapshot_sha256','ledger_snapshot_sha256'].some(k => !digest.test(summary[k])) ||
      summary.archive_count !== expectedArchive.length || !['action_count','deleted_rows','normalized_rows','cycle_stage_rows'].every(k => Number.isSafeInteger(summary[k]) && summary[k] >= 0)) fail('preview_blocked_or_changed');
    return { summary, manifest_sha256, summary_text };
  }
  return Object.freeze({
    previewSql() {
      const original = buildServerResetPreviewSql(scope), old = "jsonb_build_object('manifest_sha256',app_private.financial_reset_hash(payload))";
      if (original.split(old).length !== 2) fail('preview_source_changed');
      const sql = original.replace(old,"jsonb_build_object('manifest_sha256',app_private.financial_reset_hash(payload),'summary_text',payload::text)"), boundary = sql.indexOf('\n');
      return `${sql.slice(0,boundary)}\n${sessionSettings}\n${baseline}\n${sql.slice(boundary+1)}`;
    },
    materializeSql(preview) {
      const p = acceptPreview(preview);
      return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;\n${sessionSettings}\n${baseline}\n` +
        buildServerResetMaintenanceCaptureSql({ scope, expectedManifestSha256: p.manifest_sha256 }) +
        `\nSELECT jsonb_build_object('summary',summary,'summary_text',summary::text,'archive',archive,'actions',actions,
 'archive_descriptor_text',(SELECT coalesce(jsonb_agg(jsonb_build_object('relation_name',x->'relation_name','primary_key',x->'primary_key','row_sha256',x->'row_sha256') ORDER BY x->>'relation_name',(x->'primary_key')::text),'[]'::jsonb)::text FROM jsonb_array_elements(archive) x),
 'action_descriptor_text',(SELECT coalesce(jsonb_agg(jsonb_build_object('action_id',x->'action_id','ordinal',x->'ordinal','relation_name',x->'relation_name','primary_key',x->'primary_key','kind',x->'kind','before_sha256',x->'before_sha256','after_sha256',x->'after_sha256') ORDER BY (x->>'ordinal')::integer),'[]'::jsonb)::text FROM jsonb_array_elements(actions) x),
 'catalog_text',${catalogExpression}::text,'ledger_text',${ledgerExpression}::text)
 FROM pg_temp.nestory_maintenance_materialized;\nROLLBACK;`;
    },
    acceptMaterialization(preview, value) {
      const p = acceptPreview(preview);
      if (!exact(value, ['summary','summary_text','archive','actions','archive_descriptor_text','action_descriptor_text','catalog_text','ledger_text']) || !same(value.summary, p.summary) || !Array.isArray(value.archive) || !Array.isArray(value.actions) ||
        value.archive.length !== expected.size || value.actions.length !== p.summary.action_count) fail('materialization_changed');
      checkedText(value.summary_text,p.summary,p.manifest_sha256);
      if(value.summary_text!==p.summary_text)fail('materialization_changed');
      let catalog,ledger;try{catalog=JSON.parse(value.catalog_text);ledger=JSON.parse(value.ledger_text);}catch{fail('canonical_text_invalid')}
      if(!Array.isArray(catalog)||!Array.isArray(ledger))fail('canonical_text_invalid');
      checkedText(value.catalog_text,catalog,p.summary.catalog_snapshot_sha256);
      checkedText(value.ledger_text,ledger,p.summary.ledger_snapshot_sha256);
      const archives = new Map();
      for (const r of value.archive) {
        if (!exact(r, ['relation_name','primary_key','row_text','row_sha256']) || archives.has(identity(r)) || !same(r, expected.get(identity(r)))) fail('archive_changed');
        checkedRowText(r.row_text, r.primary_key, r.relation_name); archives.set(identity(r), structuredClone(r));
      }
      checkedText(value.archive_descriptor_text,value.archive.map(({ relation_name, primary_key, row_sha256 }) => ({ relation_name, primary_key, row_sha256 })),p.summary.archive_sha256);
      const current = new Map([...archives].map(([k,r]) => [k,r.row_text])), actions = [], seenIds = new Set(); let phase = 0;
      for (const a of value.actions) {
        if (!exact(a, ['action_id','ordinal','relation_name','primary_key','kind','before_row_text','after_row_text','before_sha256','after_sha256','changed_columns']) ||
          !uuid.test(a.action_id) || seenIds.has(a.action_id) || a.ordinal !== actions.length + 1 || !Array.isArray(a.changed_columns)) fail('action_invalid');
        seenIds.add(a.action_id);
        const id = identity(a), row = archives.get(id), disposition = RESET_REGISTRY[a.relation_name]?.disposition;
        if (!row || current.get(id) == null || a.before_row_text !== current.get(id) || hash(a.before_row_text) !== a.before_sha256) fail('action_before_changed');
        const nextPhase = a.kind === 'archive-delete' ? 1 : disposition === 'archive-remove' ? 0 : 2;
        if (nextPhase < phase) fail('action_phase_changed'); phase = nextPhase;
        if (a.kind === 'archive-delete') {
          if (disposition !== 'archive-remove' || a.after_row_text !== null || a.after_sha256 !== null || a.changed_columns.length ||
            a.before_row_text !== patchRowText(row.row_text, patchFor(row))) fail('deletion_invalid');
        } else if (a.kind === 'normalization') {
          const patch = patchFor(row), before = JSON.parse(a.before_row_text);
          const columns = Object.keys(patch).filter(k => !same(before[k], patch[k])).sort();
          if (!columns.length || !same(columns, [...a.changed_columns].sort()) || new Set(a.changed_columns).size !== a.changed_columns.length ||
            patchRowText(a.before_row_text, patch) !== a.after_row_text || hash(a.after_row_text) !== a.after_sha256) fail('normalization_changed');
          checkedRowText(a.after_row_text, a.primary_key, a.relation_name);
        } else fail('action_kind_invalid');
        current.set(id, a.after_row_text); actions.push(structuredClone(a));
      }
      const descriptors = actions.map(({ action_id, ordinal, relation_name, primary_key, kind, before_sha256, after_sha256 }) =>
        ({ action_id, ordinal, relation_name, primary_key, kind, before_sha256, after_sha256 }));
      checkedText(value.action_descriptor_text,descriptors,p.summary.action_sha256);
      if (actions.filter(a => a.kind === 'archive-delete').length !== p.summary.deleted_rows ||
        actions.filter(a => a.kind === 'normalization' && RESET_REGISTRY[a.relation_name].disposition === 'archive-remove').length !== p.summary.cycle_stage_rows ||
        actions.filter(a => a.kind === 'normalization' && RESET_REGISTRY[a.relation_name].disposition === 'normalize-reviewed').length !== p.summary.normalized_rows) fail('action_counts_changed');
      for (const [id,row] of archives) {
        const disposition = RESET_REGISTRY[row.relation_name].disposition;
        const desired = disposition === 'archive-remove' ? null : patchRowText(row.row_text, patchFor(row));
        if (current.get(id) !== desired) fail('row_disposition_incomplete');
      }
      const result = freeze({ format: 'nestory-local-pilot-ram-reset-plan-v1', scope: 'selected-org-business-ram-rehearsal', operationId: scope.operationId,
        sourceSha256: scope.sourceSha256, manifestSha256: p.manifest_sha256, materializerPolicySha256: SERVER_MATERIALIZER_POLICY_SHA256,
        // The accepted source readback is preserved verbatim and deeply frozen.
        // Consumers derive packet hashes from this value; it is not a claim of
        // completed reset/recovery or permission to substitute actor identities.
        materializationReadback: { summary: structuredClone(p.summary), summaryText:p.summary_text, manifestSha256: p.manifest_sha256,
          archiveDescriptorText:value.archive_descriptor_text,actionDescriptorText:value.action_descriptor_text },
        archiveRows: [...archives.values()], actions, retainedRows: captured.filter(r => RESET_REGISTRY[r.relation_name].disposition !== 'archive-remove')
          .map(r => ({ ...r, expected_row_text: current.has(identity(r)) ? current.get(identity(r)) : r.row_text,
            disposition: RESET_REGISTRY[r.relation_name].disposition })),
        excludedCredentialTables: snapshot.tables.filter(t => t.capture !== 'full-row-image').map(t => ({ table: t.table_name, observedRows: t.row_count, restored: false })),
        retainedProjectionPhase: 'after-source-actions-before-known-zero-continuation-reports',
        retirement: { mechanism: 'unchanged-historical-intent-rejected-by-control-generation', sourceGeneration: 0, resetControlGeneration: 1, recoveryControlGeneration: 2 },
        originalRows: captured, materializationReadbackValidated: true, runtimeCustodyVerificationRequired: true,
        actualResetRecoveryProven: false, hostedExecutionSupported: false });
      plans.set(result, { captured, archives, actions, current, inspection: freeze({operationId:scope.operationId,organizationId:scope.organizationId,sourceSha256:scope.sourceSha256,
        materializationReadback:structuredClone(result.materializationReadback),recoveryBaseline:{catalog:structuredClone(snapshot.catalog),ledger:structuredClone(snapshot.ledger)},
        executionBaseline:{catalog:structuredClone(catalog),ledger:structuredClone(ledger),catalogText:value.catalog_text,ledgerText:value.ledger_text}}) }); return result;
    },
  });
}

// Only accepted, in-process plans carry this provenance. A JSON copy cannot
// obtain the brand; this still proves planning readback, not a completed reset.
export function inspectPilotRamRehearsalPlan(plan) {
  const value=plans.get(plan);if(!value)fail('plan_provenance_missing');return value.inspection;
}

const phaseRelations = {
  'known-zero': ['public.owner_opening_balance_requests','public.owner_opening_balance_entries'],
  reports: ['public.owner_event_allocation_sets','public.owner_event_owner_allocations','public.owner_component_movements','public.owner_balance_periods','public.owner_balance_period_components'],
};
export function buildPilotRamInversePlan(plan, options) {
  const privatePlan = plans.get(plan);
  if (!privatePlan || !exact(options, ['phaseSources','incomingEdges']) || !Array.isArray(options.phaseSources) || !Array.isArray(options.incomingEdges)) fail('inverse_inputs_invalid');
  const { archives, actions, captured } = privatePlan;
  const generated = new Map(), edges = new Map(), indegree = new Map();
  for (const row of options.phaseSources) {
    if (!exact(row, ['relation_name','primary_key','kind','before_row_text','after_row_text','before_sha256','after_sha256','provenance']) ||
      row.kind !== 'recovery-prune' || row.after_row_text !== null || row.after_sha256 !== null || !phaseRelations[row.provenance]?.includes(row.relation_name) ||
      hash(row.before_row_text) !== row.before_sha256 || generated.has(identity(row)) || archives.has(identity(row))) fail('phase_source_invalid');
    const phaseRow = checkedRowText(row.before_row_text, row.primary_key, row.relation_name);
    if (Object.hasOwn(phaseRow, 'financial_generation') && phaseRow.financial_generation !== 1) fail('phase_generation_invalid');
    const id = identity(row); generated.set(id, row); edges.set(id, new Set()); indegree.set(id, 0);
  }
  for (const edge of options.incomingEdges) {
    if (!exact(edge, ['source','target']) || !exact(edge.target, ['relation_name','primary_key']) || !exact(edge.source, ['relation_name','primary_key'])) fail('phase_edge_invalid');
    const from = identity(edge.source), to = identity(edge.target);
    if (!generated.has(from) || !generated.has(to)) fail('surviving_phase_reference');
    if (from !== to && !edges.get(from).has(to)) { edges.get(from).add(to); indegree.set(to, indegree.get(to) + 1); }
  }
  const ready = [...generated.keys()].filter(id => indegree.get(id) === 0).sort(), inverse = [];
  while (ready.length) {
    const id = ready.shift(), row = generated.get(id);
    inverse.push({ relation_name: row.relation_name, primary_key: structuredClone(row.primary_key), kind: 'recovery-prune',
      before_row_text: row.before_row_text, before_sha256: row.before_sha256, candidate_after_row_text: null, changed_columns: [] });
    for (const to of edges.get(id)) { indegree.set(to, indegree.get(to) - 1); if (indegree.get(to) === 0) { ready.push(to); ready.sort(); } }
  }
  if (inverse.length !== generated.size) fail('phase_dependency_cycle');
  const generation = text => Object.hasOwn(JSON.parse(text), 'financial_generation') ? patchRowText(text, { financial_generation: 2 }) : text;
  const pointers = [], removedRows = actions.filter(a => a.kind === 'archive-delete');
  const asHistorical = row => ({ table: row.relation_name, pk: [row.primary_key.id], rowText: row.row_text, sha256: row.row_sha256 });
  const contributionEdges = ownerContributionRestoreRemovalEdges([...archives.values()].filter(r=>r.relation_name==='public.owner_cash_events').map(asHistorical),
    removedRows.map(r=>({table:r.relation_name,pk:[r.primary_key.id]})), PILOT_BACKUP_ORGANIZATION);
  const removalIndexes = new Map(removedRows.map((r,i)=>[JSON.stringify([r.relation_name,[r.primary_key.id]]),i]));
  for (const edge of contributionEdges) if (removalIndexes.get(JSON.stringify([edge.source.table,edge.source.pk])) >= removalIndexes.get(JSON.stringify([edge.target.table,edge.target.pk]))) fail('contribution_restore_order_invalid');
  for (const removed of [...removedRows].reverse()) {
    const original = archives.get(identity(removed)), staged = generation(removed.before_row_text), final = generation(original.row_text);
    inverse.push({ relation_name: removed.relation_name, primary_key: structuredClone(removed.primary_key), kind: 'restore', before_row_text: null,
      before_sha256: null, candidate_after_row_text: staged, changed_columns: [] });
    if (staged !== final) pointers.push({ relation_name: removed.relation_name, primary_key: structuredClone(removed.primary_key), kind: 'restore',
      before_row_text: staged, before_sha256: hash(staged), candidate_after_row_text: final, changed_columns: Object.keys(patchFor(original)) });
  }
  inverse.push(...pointers);
  for (const [id,row] of archives) if (RESET_REGISTRY[row.relation_name].disposition === 'normalize-reviewed') {
    const before = privatePlan.current.get(id), after = generation(row.row_text);
    if (before !== after) inverse.push({ relation_name: row.relation_name, primary_key: structuredClone(row.primary_key), kind: 'restore',
      before_row_text: before, before_sha256: hash(before), candidate_after_row_text: after,
      changed_columns: [...new Set([...Object.keys(patchFor(row)), ...(Object.hasOwn(JSON.parse(row.row_text), 'financial_generation') ? ['financial_generation'] : [])])] });
  }
  return freeze({ format: 'nestory-local-pilot-ram-inverse-candidates-v1', resetManifestSha256: plan.manifestSha256, targetGeneration: 2,
    actions: inverse, phaseSourceCount: generated.size, phaseSourcesSha256: digestDatabaseJson(options.phaseSources),
    // This complete roster is an exact expected projection of original rows.
    // The runtime must additionally prove only exact DB-derived phase/audit
    // receipts were appended. Unknown extras/mutations may not be ignored.
    originalRowsExpectedAfterInverse: captured.map(r => ({ ...r,
      expected_row_text: ['archive-remove','normalize-reviewed'].includes(RESET_REGISTRY[r.relation_name].disposition) ? generation(r.row_text) : r.row_text })),
    typedAfterImageVerificationRequired: true, exactLifecycleDeltaVerificationRequired: true, actualResetRecoveryProven: false, hostedExecutionSupported: false });
}
