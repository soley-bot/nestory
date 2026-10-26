import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildServerResetPreviewSql,
  buildServerResetMaintenanceCaptureSql,
  buildServerResetPrepareBlock,
} from './pilot-finance-reset-server-materializer.mjs';

const scope = {
  operationId: 'fa231010-0000-4000-8000-000000000100',
  organizationId: 'fa231010-0000-4000-8000-000000000001',
  sourceGeneration: 0,
  sourceSha256: '1'.repeat(64),
};
const expectedManifestSha256 = '2'.repeat(64);
const operationBinding = {
  operation_id: scope.operationId, organization_id: scope.organizationId, operation_kind: 'reset', restore_of: null,
  source_generation: 0, target_generation: 1, manifest_sha256: expectedManifestSha256, plan_sha256: '3'.repeat(64),
  schema_sha256: '4'.repeat(64), archive_sha256: '5'.repeat(64), action_sha256: '6'.repeat(64),
  archive_count: 1, action_count: 1, audit_timestamp: '2026-10-26T02:00:00.000Z', audit_actor: null,
};
const preview = buildServerResetPreviewSql(scope);
const compact = value => value.replace(/\s+/g, ' ').trim();
function section(start, end) {
  const begin = preview.indexOf(start), finish = preview.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, `bounded SQL section: ${start}`);
  return compact(preview.slice(begin, finish));
}

// These are generated-SQL authority contracts, not PostgreSQL behavioral tests.
test('retired attestations require consumed generation-zero evidence and exact published artifact/source matches', () => {
  const retired = section('retired AS (', 'temporary_logical AS');
  const attestation = retired.slice(retired.indexOf("OR r.relation_name='app_private.tenant_commercial_document_upload_attestations'"));
  for (const clause of [
    "AND r.row_json->'financial_generation'='0'::jsonb",
    "AND r.row_json->>'consumed_at' IS NOT NULL AND r.row_json->>'consumed_by' IS NOT NULL",
    "AND r.row_json->'consumed_by'=r.row_json->'attested_by'",
    "AND (r.row_json->>'attested_at')::timestamptz <= (r.row_json->>'consumed_at')::timestamptz",
    "a.relation_name='public.tenant_commercial_document_artifacts' AND a.disposition='archive-remove'",
    "a.row_json->'organization_id'=r.row_json->'organization_id'",
    "a.row_json->'source_kind'=r.row_json->'source_kind'",
    "a.row_json->'source_id'=r.row_json->'source_id'",
    "a.row_json->'financial_generation'='0'::jsonb",
    "a.row_json->>'publication_status'='published' AND a.row_json->>'content_type'='application/pdf'",
    "a.row_json->'published_by'=r.row_json->'consumed_by' AND a.row_json->'published_at'=r.row_json->'consumed_at'",
    "ARRAY['storage_path','storage_object_id','storage_object_version','size_bytes','sha256','renderer_version']",
    "WHERE r.row_json->>k IS NULL OR r.row_json->k IS DISTINCT FROM a.row_json->k",
    "r.row_json->>'presentation_snapshot_sha256'=app_private.tenant_commercial_document_snapshot_sha256(a.row_json->'presentation_snapshot')",
    "src.disposition='archive-remove'",
    "src.relation_name=CASE r.row_json->>'source_kind' WHEN 'invoice' THEN 'public.tenant_invoices' WHEN 'receipt' THEN 'public.tenant_invoice_payments' END",
    "src.row_json->'organization_id'=r.row_json->'organization_id' AND src.row_json->'id'=r.row_json->'source_id'",
    "src.row_json->'financial_generation'='0'::jsonb",
  ]) assert.ok(attestation.includes(clause), clause);
  assert.doesNotMatch(attestation.replace(/^OR /, ''), /\bOR\b(?! r\.row_json->k IS DISTINCT FROM a\.row_json->k)/);
});

test('historical exception admits only retired logical source links and keeps all other blockers', () => {
  const retained = section("UNION ALL SELECT 'retained_reference_to_removed_parent'", "UNION ALL SELECT 'unsupported_dependency_cycle'");
  assert.ok(retained.includes("AND NOT (EXISTS(SELECT 1 FROM retired r WHERE r.row_key=s.row_key) AND e.kind='logical-reference' AND ("));
  assert.ok(retained.includes("s.relation_name='app_private.finance_category_idempotency_result_seals' AND e.column_name='result_id'"));
  assert.ok(retained.includes("s.relation_name='app_private.tenant_commercial_document_upload_attestations' AND e.column_name='source_id'"));
  assert.ok(retained.includes("s.row_json->'organization_id'=t.row_json->'organization_id' AND s.row_json->'source_id'=t.row_json->'id'"));
  assert.ok(retained.includes("t.relation_name=CASE s.row_json->>'source_kind' WHEN 'invoice' THEN 'public.tenant_invoices' WHEN 'receipt' THEN 'public.tenant_invoice_payments' END)))"));
  assert.doesNotMatch(retained, /cleanup_claims|historical|e\.kind='foreign-key'/);
  assert.equal((retained.match(/s\.relation_name=/g) ?? []).length, 2);
  for (const code of ['cross_organization_reference', 'unresolved_logical_reference', 'unknown_polymorphic_kind',
    'unreviewed_retained_intent', 'reset_rule_missing']) assert.ok(preview.includes(`'${code}'`), code);
});

test('all three materialization entry points set the planner option locally before executing the shared CTE', () => {
  const capture = buildServerResetMaintenanceCaptureSql({ scope, expectedManifestSha256 });
  const prepare = buildServerResetPrepareBlock({ scope, expectedManifestSha256, operationBinding });
  const cte = preview.slice(preview.indexOf('WITH RECURSIVE'), preview.lastIndexOf('\nSELECT payload||'));
  for (const sql of [preview, capture, prepare]) {
    assert.equal((sql.match(/SET LOCAL enable_nestloop=off;/g) ?? []).length, 1);
    assert.ok(sql.indexOf('SET LOCAL enable_nestloop=off;') < sql.indexOf('WITH RECURSIVE'));
    assert.ok(sql.includes(cte));
    assert.doesNotMatch(sql, /SET(?: SESSION)? enable_nestloop|ALTER (?:SYSTEM|DATABASE)|set_config\(/i);
  }
});
