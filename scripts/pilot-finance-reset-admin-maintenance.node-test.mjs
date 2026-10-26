import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdminMaintenanceBillingPreviewSql, buildAdminMaintenanceRehearsalSql, buildAdminMaintenanceCommitSql,
  adminMaintenanceApprovalBinding } from './pilot-finance-reset-admin-maintenance.mjs';
import { MAINTENANCE_GUARDS, MAINTENANCE_ORGANIZATION } from './pilot-finance-reset-maintenance-guards.mjs';

const request = { scope: { operationId: 'fd261026-0000-4000-8000-000000000100', organizationId: MAINTENANCE_ORGANIZATION,
  sourceGeneration: 0, sourceSha256: 'a'.repeat(64) }, expectedManifestSha256: 'b'.repeat(64), billingReviewSha256: 'c'.repeat(64),
  expectedDeferredCount: 1, requestedBy: 'fd261026-0000-4000-8000-000000000010',
  expectedGuards: MAINTENANCE_GUARDS.map(signature => ({ signature, definitionSha256: 'd'.repeat(64) })) };

test('commit and rehearsal execute identical body with controlled terminator', () => {
  const rollback = buildAdminMaintenanceRehearsalSql(request);
  const commit = buildAdminMaintenanceCommitSql(request, adminMaintenanceApprovalBinding(request));
  assert.ok(rollback.endsWith('\nROLLBACK;'));
  assert.equal(commit, rollback.replace(/ROLLBACK;$/, 'COMMIT;'));
  assert.match(commit, /SET CONSTRAINTS ALL IMMEDIATE/);
});

test('commit rejects missing, stale or widened approval binding', () => {
  const binding = adminMaintenanceApprovalBinding(request);
  assert.throws(() => buildAdminMaintenanceCommitSql(request), /exact_approval_required/);
  assert.throws(() => buildAdminMaintenanceCommitSql(request, { ...binding, confirmation: 'yes' }), /exact_approval_required/);
  assert.throws(() => buildAdminMaintenanceCommitSql({ ...request, expectedDeferredCount: 5 }, binding), /exact_approval_required/);
  assert.throws(() => buildAdminMaintenanceCommitSql(request, { ...binding, extra: true }), /exact_approval_required/);
});

test('scope and attribution cannot broaden beyond exact Pilot owner request', () => {
  assert.throws(() => buildAdminMaintenanceRehearsalSql({ ...request, scope: { ...request.scope,
    organizationId: 'fd261026-0000-4000-8000-000000000999' } }), /request_invalid/);
  assert.throws(() => buildAdminMaintenanceRehearsalSql({ ...request, requestedBy: "'; SELECT secrets; --" }), /request_invalid/);
  assert.throws(() => buildAdminMaintenanceRehearsalSql({ ...request, expectedDeferredCount: -1 }), /request_invalid/);
});

test('composer does not fabricate app sessions or bypass normal opening approvals', () => {
  const sql = buildAdminMaintenanceRehearsalSql(request);
  assert.doesNotMatch(sql, /SET ROLE|set_config\('request\.jwt|submit_owner_opening_balance|review_owner_opening_balance|DISABLE TRIGGER|set_financial_projection_context\(/);
  assert.match(sql, /auth\.uid\(\) IS NOT NULL/);
  assert.match(sql, /maintenance_deposit_journal_must_be_empty/);
  assert.match(sql, /'financial_month',operation_id,'administrator_reset'/);
  assert.match(sql, /'authenticated_application_actor',NULL/);
  assert.match(sql, /'owner_opening_authority','staff_approval_required'/);
});

test('billing preview exports a digest and aggregates, never invoice rows', () => {
  const sql = buildAdminMaintenanceBillingPreviewSql();
  assert.ok(sql.startsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;'));
  assert.match(sql, /'billing_review_sha256',app_private\.financial_reset_hash\(payload\)/);
  assert.doesNotMatch(sql.slice(sql.lastIndexOf('SELECT jsonb_build_object')), /'original_invoice',/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/);
});
