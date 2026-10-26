import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildServerResetPreviewSql,
  buildServerResetMaintenanceCaptureSql,
} from './pilot-finance-reset-server-materializer.mjs';

const scope = {
  operationId: 'fa231010-0000-4000-8000-000000000100',
  organizationId: 'fa231010-0000-4000-8000-000000000001',
  sourceGeneration: 0,
  sourceSha256: '1'.repeat(64),
};
const preview = buildServerResetPreviewSql(scope);
const patchMatch = preview.match(/WHEN 'public\.expense_transactions' THEN '([^']+)'::jsonb/);
const expensePatch = patchMatch ? JSON.parse(patchMatch[1]) : null;
const migration = readFileSync(new URL('../supabase/migrations/20260910071901_expense_transaction_corrections.sql', import.meta.url), 'utf8');
const replacementFields = ['replacement_transaction_id', 'replacement_idempotency_key', 'replacement_payload_hash', 'replaced_by'];

// Synthetic correction rows only. This tests FK deletion behavior and the
// correction CHECK's truth conditions; it does not claim to execute PostgreSQL.
function chain(length, prefix = 'expense', organizationId = scope.organizationId) {
  return Array.from({ length }, (_, i) => ({
    id: `${prefix}-${i}`,
    organization_id: organizationId,
    replaces_transaction_id: i ? `${prefix}-${i - 1}` : null,
    replacement_transaction_id: i < length - 1 ? `${prefix}-${i + 1}` : null,
    replacement_idempotency_key: i < length - 1 ? `${prefix}-correction-${i}` : null,
    replacement_payload_hash: i < length - 1 ? 'a'.repeat(64) : null,
    replaced_by: i < length - 1 ? 'synthetic-actor' : null,
    status: i < length - 1 ? 'reversed' : 'submitted',
    cancelled_at: null,
    cancelled_by: null,
    audit_actors: { createdBy: 'synthetic-actor', updatedBy: 'synthetic-actor' },
    supporting_document_id: 'synthetic-evidence',
    financial_generation: 0,
  }));
}

function replacementCheck(row) {
  return replacementFields.every(k => row[k] === null) || (
    replacementFields.every(k => row[k] !== null) &&
    /^[0-9a-f]{64}$/.test(row.replacement_payload_hash) &&
    ['rejected', 'reversed'].includes(row.status)
  );
}

function correctionChecks(rows) {
  const replaces = new Set();
  const keys = new Set();
  for (const row of rows) {
    assert.ok(replacementCheck(row), 'replacement_check');
    assert.ok((row.cancelled_at === null && row.cancelled_by === null) ||
      (row.cancelled_at !== null && row.cancelled_by !== null && row.status === 'rejected'), 'cancelled_check');
    if (row.replaces_transaction_id !== null) {
      assert.ok(!replaces.has(row.replaces_transaction_id), 'replaces_once');
      replaces.add(row.replaces_transaction_id);
    }
    if (row.replacement_idempotency_key !== null) {
      const key = `${row.organization_id}/${row.replacement_idempotency_key}`;
      assert.ok(!keys.has(key), 'replacement_key');
      keys.add(key);
    }
    for (const column of ['replaces_transaction_id', 'replacement_transaction_id']) {
      if (row[column] === null) continue; // Composite FK defaults to MATCH SIMPLE.
      assert.ok(rows.some(target => target.id === row[column] &&
        target.organization_id === row.organization_id), `${column} FK`);
    }
  }
}

function removable(rows, target) {
  return !rows.some(source => source.id !== target.id && source.organization_id === target.organization_id &&
    ['replaces_transaction_id', 'replacement_transaction_id'].some(k => source[k] === target.id));
}

function deleteWithRestrict(rows) {
  const remaining = structuredClone(rows);
  const deleted = [];
  while (remaining.length) {
    const next = remaining.find(row => removable(remaining, row));
    assert.ok(next, 'every next deletion must satisfy both immediate RESTRICT FKs');
    remaining.splice(remaining.indexOf(next), 1);
    deleted.push(next.id);
    correctionChecks(remaining);
  }
  return deleted;
}

function stage(rows) {
  assert.ok(expensePatch, 'materializer must provide the expense cycle patch');
  return rows.map(row => row.organization_id === scope.organizationId ? { ...row, ...expensePatch } : structuredClone(row));
}

test('generated preview and maintenance capture stage only the nullable back reference', () => {
  assert.deepEqual(expensePatch, { replaces_transaction_id: null });
  const capture = buildServerResetMaintenanceCaptureSql({ scope, expectedManifestSha256: '2'.repeat(64) });
  const cte = preview.slice(preview.indexOf('WITH RECURSIVE'), preview.lastIndexOf('\nSELECT payload||'));
  assert.ok(capture.includes(cte), 'maintenance must consume identical reviewed row images');
  assert.match(cte, /staged_fk_sources[\s\S]+f\.confmatchtype='s'/);
  assert.match(cte, /removal_edges[\s\S]+AND NOT e\.staged/);
  assert.match(cte, /0 phase,'normalization'[\s\S]+1,'archive-delete'/);
  assert.match(cte, /ORDER BY phase,depth,relation_name,primary_key::text/);
  assert.match(cte, /'unsupported_dependency_cycle'/);
});

test('17 reciprocal correction pairs become removable while preserving replacement metadata', () => {
  const original = Array.from({ length: 17 }, (_, i) => chain(2, `pair-${i}`)).flat();
  correctionChecks(original);
  assert.equal(original.length, 34);
  assert.equal(original.filter(row => removable(original, row)).length, 0);
  const staged = stage(original);
  correctionChecks(staged);
  assert.equal(staged.filter((row, i) => row.replaces_transaction_id !== original[i].replaces_transaction_id).length, 17);
  for (let i = 0; i < staged.length; i++) {
    const before = { ...original[i] };
    const after = { ...staged[i] };
    delete before.replaces_transaction_id;
    delete after.replaces_transaction_id;
    assert.deepEqual(after, before, 'only replaces_transaction_id may change');
  }
  const order = deleteWithRestrict(staged);
  for (let i = 0; i < 17; i++) assert.ok(order.indexOf(`pair-${i}-0`) < order.indexOf(`pair-${i}-1`));
});

test('repeated corrections delete oldest to newest without disabling either FK', () => {
  for (const length of [1, 2, 3, 17]) {
    const original = chain(length);
    const snapshot = structuredClone(original);
    const staged = stage(original);
    correctionChecks(staged);
    assert.deepEqual(deleteWithRestrict(staged), original.map(row => row.id));
    assert.deepEqual(original, snapshot, 'source/archive images remain unchanged');
  }
});

test('rejected and reversed corrections preserve CHECK groups, audit actors and evidence', () => {
  for (const status of ['rejected', 'reversed']) {
    const rows = chain(3);
    rows[0].status = status;
    if (status === 'rejected') {
      rows[0].cancelled_at = '2026-10-01T00:00:00Z';
      rows[0].cancelled_by = 'synthetic-actor';
    }
    const staged = stage(rows);
    correctionChecks(staged);
    for (const key of [...replacementFields, 'status', 'cancelled_at', 'cancelled_by', 'audit_actors', 'supporting_document_id', 'financial_generation']) {
      assert.deepEqual(staged.map(row => row[key]), rows.map(row => row[key]), key);
    }
    assert.equal(replacementCheck({ ...staged[0], replacement_transaction_id: null }), false,
      'clearing the forward pointer alone would violate the coupled replacement CHECK');
  }
});

test('unreplaced rows need no staging change and other organizations stay byte identical', () => {
  const single = chain(1);
  assert.deepEqual(stage(single), single);
  const foreign = chain(2, 'foreign', 'fa231010-0000-4000-8000-000000000002');
  const combined = [...chain(2), ...foreign];
  const staged = stage(combined);
  assert.deepEqual(staged.slice(2), foreign);
  assert.match(preview, /selected AS MATERIALIZED \(SELECT r\.\* FROM rows r,params p WHERE r\.organization_id=p\.organization_id::text\)/);
  assert.match(preview, /cross_organization_reference/);
});

test('migration evidence keeps back reference nullable and outside replacement/cancellation CHECKs', () => {
  assert.match(migration, /ADD COLUMN replaces_transaction_id uuid,/);
  for (const name of ['replaces', 'replacement']) {
    assert.match(migration, new RegExp(`expense_transactions_${name}_fk FOREIGN KEY \\(organization_id, ${name === 'replaces' ? 'replaces' : 'replacement'}_transaction_id\\)\\s+REFERENCES public\\.expense_transactions\\(organization_id,id\\) ON DELETE RESTRICT`));
  }
  const replacement = migration.match(/CONSTRAINT expense_transactions_replacement_check CHECK \(([\s\S]+?)\),\s+ADD CONSTRAINT/)[1];
  assert.doesNotMatch(replacement, /replaces_transaction_id/);
  for (const field of replacementFields) assert.ok(replacement.includes(field));
  assert.match(migration, /expense_transactions_replaces_once UNIQUE \(replaces_transaction_id\)/);
  assert.match(migration, /expense_transactions_replacement_key UNIQUE \(organization_id,replacement_idempotency_key\)/);
});

test('forward migration admits only the reviewed expense staging column and fails on rule drift', () => {
  const update = readFileSync(new URL('../supabase/migrations/20261026000100_financial_reset_retired_upload_attestations.sql', import.meta.url), 'utf8');
  const rule = update.match(/DO \$expense_rule\$([\s\S]+?)\$expense_rule\$/)?.[1];
  assert.ok(rule, 'a forward migration must update the immutable reset rule');
  assert.match(rule, /SET normalize_columns=ARRAY\['replaces_transaction_id'\]/);
  assert.match(rule, /WHERE relation_name='public\.expense_transactions'\s+AND archive_remove AND normalize_columns='\{\}'::text\[\]/);
  assert.match(rule, /GET DIAGNOSTICS v_changed=ROW_COUNT/);
  assert.match(rule, /IF v_changed<>1 THEN RAISE EXCEPTION 'financial_expense_reset_rule_predecessor_changed'/);
  assert.doesNotMatch(rule, /replacement_transaction_id|replacement_idempotency_key|replacement_payload_hash|replaced_by/);
  assert.doesNotMatch(update, /(?:UPDATE|DELETE FROM|ALTER TABLE) public\.expense_transactions\b/);
  assert.match(update, /CREATE TRIGGER financial_reset_rules_immutable BEFORE INSERT OR UPDATE OR DELETE/);
  assert.ok(update.trimEnd().endsWith('COMMIT;'));
});
