import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixture = await readFile(new URL('../supabase/test-fixtures/baseline.sql', import.meta.url), 'utf8');
const admission = fixture.slice(0, fixture.indexOf('WITH fixture_users'));

test('fixture admission preserves existing tenant, Auth and reset evidence', () => {
  assert.doesNotMatch(admission, /\bTRUNCATE\s+TABLE\b|\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(admission, /session_replication_role|DISABLE\s+TRIGGER/i);
  assert.match(admission, /'app_private', 'public', 'auth'/);
  assert.match(admission, /tables\.schemaname = 'storage' AND tables\.tablename = 'objects'/);
  assert.match(admission, /LOCK TABLE %I\.%I IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(admission, /requires a fresh disposable database/);
  assert.match(admission, /supabase db reset --local --no-seed/);
  assert.match(admission, /ERRCODE = '55000'/);
});

test('freshness exemptions are limited to platform migrations, static reset rules and global maintenance observations', () => {
  const exemption = admission.match(/AND NOT \(([\s\S]*?)\)\s*ORDER BY/)?.[1];
  assert.ok(exemption);
  assert.match(exemption, /'schema_migrations'/);
  assert.match(exemption, /'financial_reset_relation_rules', 'maintenance_automation_runs'/);
  assert.doesNotMatch(exemption, /LIKE|capability|financial_reset_operations|users|identities|sessions/);
});

test('only the eight migration-seeded capability singletons are accepted without reading private values', async () => {
  const actual = [...admission.match(/bootstrap_tables constant text\[\] := ARRAY\[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(actual, [
    'finance_settlement_context_capability',
    'financial_projection_context_capability',
    'tenant_invoice_settlement_context_capability',
    'property_branch_assignment_context_capability',
    'finance_branch_authority_capability',
    'maintenance_branch_authority_capability',
    'expense_transaction_capability',
    'financial_scheduler_capability',
  ]);
  const migrationFiles = [
    '20260808235721_operational_runtime_bootstrap.sql',
    '20260822023001_property_branch_scope_foundation.sql',
    '20260822071638_remaining_branch_scope_domain_enforcement.sql',
    '20260908015355_integrate_chart_paid_expense_transactions.sql',
    '20261024013600_financial_write_lifecycle_fence.sql',
  ];
  const migrations = (await Promise.all(migrationFiles.map((file) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')))).join('\n');
  for (const table of actual) assert.match(migrations, new RegExp(`INSERT INTO app_private\\.${table}\\s*\\(`));
  assert.match(admission, /count\(\*\) = 1 AND bool_and\(singleton\)/);
  assert.match(admission, /bootstrap_valid IS DISTINCT FROM true/);
  assert.doesNotMatch(admission, /SELECT\s+(?:\*|capability_token|secret|token)\b/i);
});
