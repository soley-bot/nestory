// Source contracts only. These tests do not execute or prove SQL authorization.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
const proposal = read('supabase/migrations/20261006031038_authorize_business_date_by_view_permission.sql');
const original = read('supabase/migrations/20260928060000_allow_effective_month_rent_changes.sql');
const functionDefinition = original.match(/CREATE FUNCTION public\.get_lease_rent_business_date\(p_organization_id uuid\)[\s\S]*?\n\$\$;/)?.[0];
const permissionKeys = ['leases.view', 'finance.view', 'properties.view'];

test('proposal changes only the existing business-date authorization predicate', () => {
  assert.ok(functionDefinition);
  const oldGuard = 'IF (SELECT auth.uid()) IS NULL OR NOT app_private.is_org_member(p_organization_id) THEN';
  assert.ok(functionDefinition.includes(oldGuard));
  const newGuard = `IF (SELECT auth.uid()) IS NULL OR NOT (\n    ${permissionKeys.map((key) => `app_private.has_org_permission(p_organization_id,'${key}')`).join('\n    OR ')}\n  ) THEN`;
  assert.equal(proposal.replace(/^--.*\n/gm, '').trim(), functionDefinition
    .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
    .replace(oldGuard, newGuard));
});

test('replacement has no privilege, membership, policy or financial-data statements', () => {
  const executable = proposal.replace(/^--.*$/gm, '');
  assert.doesNotMatch(executable, /\b(?:GRANT|REVOKE|INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
  assert.equal((executable.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
  assert.doesNotMatch(executable, /is_org_member|current_workspace_role|auth\.jwt|user_metadata|current_date/i);
  assert.match(executable, /RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''/);
  assert.match(executable, /RETURN app_private\.rent_business_date\(p_organization_id,pg_catalog\.statement_timestamp\(\)\);/);
});

test('each supported view permission has an existing date-dependent application caller', () => {
  assert.match(read('src/app/(dashboard)/leases/page.tsx'), /requirePermission\("leases\.view"\)/);
  assert.match(read('src/features/leases/data/leases.ts'), /supabase\.rpc\("get_lease_rent_business_date"/);
  assert.match(read('src/app/(dashboard)/properties/[propertyId]/page.tsx'), /requirePermission\("properties\.view"\)/);
  assert.match(read('src/app/(dashboard)/properties/[propertyId]/page.tsx'), /getLeaseBillingFormConfig\(context\.organizationId\)/);
  assert.match(read('src/app/(dashboard)/finance/page.tsx'), /requireFinanceContext\(\)/);
  assert.match(read('src/lib/auth/context.ts'), /requireFinanceContext = cache\(async \(\) =>\s*requireCapability\("canReadFinance"\)/);
  assert.match(read('src/lib/auth/capabilities.ts'), /canReadFinance: has\("finance\.view"\)/);
  assert.match(read('src/features/finance-operations/data/finance-operations.ts'), /supabase\.rpc\(\s*"get_lease_rent_business_date"/);
});

test('canonical helper checks same-company active custom membership and owns legacy fallback', () => {
  const migration = read('supabase/migrations/20260822071638_remaining_branch_scope_domain_enforcement.sql');
  const helper = migration.match(/CREATE OR REPLACE FUNCTION app_private\.has_org_permission\([\s\S]*?\n\$\$;/)?.[0];
  assert.ok(helper);
  for (const fragment of [
    'member.user_id=(SELECT auth.uid())', 'member.organization_id=p_organization_id',
    'authorization_state.ordinary_access_enabled',
    'branch.organization_id=member.organization_id', "branch.status='active'", 'branch.archived_at IS NULL',
    'role_record.organization_id=member.organization_id', "role_record.status='active'", 'role_record.archived_at IS NULL',
    'permission_record.permission_key=p_permission_key',
    'NOT authorization_state.ordinary_access_enabled', 'app_private.legacy_role_has_permission(',
  ]) assert.ok(helper.includes(fragment), `Canonical helper contract: ${fragment}`);
});

test('prepared SQL suite retains transactional isolation and exercises public authenticated calls', () => {
  const suite = read('supabase/tests/business_date_access_test.sql');
  assert.match(suite, /\nBEGIN;/);
  assert.match(suite, /SELECT \* FROM finish\(\);\nROLLBACK;\s*$/);
  assert.doesNotMatch(suite, /\bCOMMIT\b|DISABLE TRIGGER|session_replication_role|CREATE OR REPLACE FUNCTION/);
  assert.match(suite, /SET LOCAL ROLE authenticated;/);
  assert.match(suite, /SET LOCAL ROLE anon;/);
  for (const [, ordinaryRoleCalls] of suite.matchAll(/SET LOCAL ROLE (?:authenticated|anon);([\s\S]*?)RESET ROLE;/g)) {
    assert.doesNotMatch(ordinaryRoleCalls, /app_private\.rent_business_date/,
      'ordinary actors cannot execute the private date helper as an assertion oracle');
  }
  for (const label of [
    'manager can read', 'member can read', 'lease_reader can read', 'finance_reader can read',
    'property_reader can read', 'branch_b_reader can read', 'cross-company request denied',
    'non-member denied', 'missing authenticated subject denied', 'membership revoked',
    'all relevant permissions revoked', 'ordinary custom access disabled', 'custom role archived',
    'assigned branch inactive', 'assigned branch archived', 'foreign-company branch assignment rejected',
    'foreign-company role assignment rejected', 'date access grants no other-branch property access',
    'legacy operations has no supported view permission', 'company date at month boundary',
  ]) assert.ok(suite.includes(label), `Prepared database coverage: ${label}`);
});
