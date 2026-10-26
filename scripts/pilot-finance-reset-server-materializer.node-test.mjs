import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServerResetPreviewSql, buildServerResetPrepareBlock, SERVER_MATERIALIZER_POLICY_SHA256 } from './pilot-finance-reset-server-materializer.mjs';

const scope = { operationId: 'fa231010-0000-4000-8000-000000000100', organizationId: 'fa231010-0000-4000-8000-000000000001',
  sourceGeneration: 0, sourceSha256: '1'.repeat(64) };
const binding = { operation_id: scope.operationId, organization_id: scope.organizationId, operation_kind: 'reset', restore_of: null,
  source_generation: 0, target_generation: 1, manifest_sha256: '2'.repeat(64), plan_sha256: '3'.repeat(64), schema_sha256: '4'.repeat(64),
  archive_sha256: '5'.repeat(64), action_sha256: '6'.repeat(64), archive_count: 1, action_count: 1,
  audit_timestamp: '2026-10-26T02:00:00.000Z', audit_actor: null };
const prepare = patch => buildServerResetPrepareBlock({ scope, expectedManifestSha256: binding.manifest_sha256,
  operationBinding: { ...binding, ...patch } });

test('public preview has read-only transaction and aggregate-only terminal SELECT', () => {
  const sql = buildServerResetPreviewSql(scope);
  assert.ok(sql.startsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;'));
  assert.ok(sql.endsWith("SELECT payload||jsonb_build_object('manifest_sha256',app_private.financial_reset_hash(payload)) AS summary FROM summary;\nCOMMIT;"));
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|COPY|GRANT|SET ROLE)\b/);
  assert.doesNotMatch(sql, /consume_financial_reset_actor|prepare_financial_reset_operation|request\.jwt/);
  assert.match(SERVER_MATERIALIZER_POLICY_SHA256, /^[a-f0-9]{64}$/);
});

test('scope validation rejects SQL injection, unknown authority and generation changes', () => {
  for (const patch of [{ organizationId: "x'; COMMIT; --" }, { operationId: '../operation' }, { sourceGeneration: 1 },
    { sourceSha256: 'x' }, { rawCustomerRows: [] }, { syntheticOnly: true }, { authority: 'admin' }]) {
    assert.throws(() => buildServerResetPreviewSql({ ...scope, ...patch }), /scope_invalid/);
  }
});

test('preview and prepare use byte-identical server materialization and typed images', () => {
  const preview = buildServerResetPreviewSql(scope), prepared = prepare();
  const cte = preview.slice(preview.indexOf('WITH RECURSIVE'), preview.lastIndexOf('\nSELECT payload||'));
  assert.ok(prepared.includes(cte));
  assert.match(preview, /financial_reset_typed_row\(relation_oid,row_json\|\|patch\)/);
  assert.match(prepared, /financial_reset_hash\(v_summary\)<>/);
  assert.match(prepared, /archive_sha256' IS DISTINCT FROM/);
  assert.match(prepared, /action_sha256' IS DISTINCT FROM/);
  assert.ok(prepared.indexOf('server_reset_materialization_changed') < prepared.indexOf('PERFORM app_private.prepare_financial_reset_operation'));
});

test('prepare rejects alternate tenant, actor, mode, manifest, count or timestamp before SQL exists', () => {
  for (const patch of [{ organization_id: 'fa231010-0000-4000-8000-000000000002' }, { audit_actor: scope.organizationId },
    { operation_kind: 'restore' }, { restore_of: scope.operationId }, { manifest_sha256: 'f'.repeat(64) },
    { source_generation: 1 }, { target_generation: 2 }, { action_count: -1 }, { archive_count: 1.5 }, { audit_timestamp: 'not a timestamp' },
    { audit_timestamp: '2026-02-30T00:00:00Z' }, { unexpected: "\\'; SELECT secret; --" }]) {
    assert.throws(() => prepare(patch), /prepare_binding_invalid/);
  }
});

test('server-only prepare preserves guarded contract and does not execute row actions or confer authority', () => {
  const sql = prepare();
  assert.match(sql, /PERFORM app_private.prepare_financial_reset_operation\(v_binding\)/);
  assert.match(sql, /PERFORM app_private.archive_financial_reset_rows\([^;]+v_archive\)/);
  assert.match(sql, /PERFORM app_private.prepare_financial_reset_actions\([^;]+v_actions\)/);
  assert.doesNotMatch(sql, /start_financial_reset_actions|arm_financial_reset_action|apply_financial_reset|SET ROLE|request\.jwt|DISABLE TRIGGER|session_replication_role/);
});

test('deterministic output is pinned to operation, organization and source with no runtime random IDs', () => {
  assert.equal(buildServerResetPreviewSql(scope), buildServerResetPreviewSql({ ...scope }));
  assert.notEqual(buildServerResetPreviewSql(scope), buildServerResetPreviewSql({ ...scope, sourceSha256: 'a'.repeat(64) }));
  assert.notEqual(buildServerResetPreviewSql(scope), buildServerResetPreviewSql({ ...scope, operationId: 'fa231010-0000-4000-8000-000000000101' }));
  assert.doesNotMatch(buildServerResetPreviewSql(scope), /gen_random_uuid|random\(/);
});
