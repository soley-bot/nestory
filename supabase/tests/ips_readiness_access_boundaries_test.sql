BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Generated fixtures belong only to this transaction. No baseline IDs, Auth
-- passwords, shared fixture changes, or hosted service calls are needed.
CREATE TEMP TABLE access_ids (
  label text PRIMARY KEY,
  id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;
INSERT INTO access_ids(label) VALUES
  ('org'), ('foreign_org'), ('admin'), ('finance_manager'), ('finance_member'),
  ('operations_manager'), ('operations_member'), ('foreign_admin'),
  ('custom_viewer'), ('custom_without_person'), ('custom_role'), ('custom_person'),
  ('branch'), ('other_branch'), ('foreign_branch'),
  ('manager_person'), ('member_person'), ('property'), ('other_property'),
  ('foreign_property'), ('unit'), ('assigned_task'), ('unassigned_task'),
  ('other_branch_task'), ('foreign_task'), ('custom_assigned_task'),
  ('draft'), ('approved'), ('foreign_draft');
GRANT SELECT ON access_ids TO authenticated;

CREATE FUNCTION pg_temp.access_id(p_label text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM pg_temp.access_ids WHERE label = p_label
$$;

INSERT INTO auth.users(id, aud, role, email)
SELECT id, 'authenticated', 'authenticated',
  label || '.' || id::text || '@ips-access-boundaries.test'
FROM access_ids
WHERE label IN ('admin', 'finance_manager', 'finance_member',
  'operations_manager', 'operations_member', 'foreign_admin',
  'custom_viewer', 'custom_without_person');

INSERT INTO public.organizations(id, name, slug)
SELECT id, 'IPS access boundary ' || label, 'ips-access-' || id::text
FROM access_ids WHERE label IN ('org', 'foreign_org');

INSERT INTO public.organization_branches(id, organization_id, name, code)
SELECT pg_temp.access_id(label), pg_temp.access_id(org), label, label
FROM (VALUES
  ('branch', 'org'), ('other_branch', 'org'), ('foreign_branch', 'foreign_org')
) fixture(label, org);

INSERT INTO public.people(id, organization_id, display_name)
SELECT id, pg_temp.access_id('org'), label FROM access_ids
WHERE label IN ('manager_person', 'member_person', 'custom_person');
INSERT INTO public.person_roles(organization_id, person_id, role, status)
SELECT pg_temp.access_id('org'), id, 'staff', 'active' FROM access_ids
WHERE label IN ('manager_person', 'member_person', 'custom_person');
INSERT INTO public.person_branch_relationships(organization_id, person_id, branch_id)
SELECT pg_temp.access_id('org'), pg_temp.access_id(person), pg_temp.access_id(branch)
FROM (VALUES
  ('manager_person', 'branch'), ('member_person', 'branch'),
  ('member_person', 'other_branch'), ('custom_person', 'branch')
) fixture(person, branch);

-- These RPCs retain legacy role checks. Exercise that existing contract without
-- assuming custom permission grants imply a legacy Operations/Finance role.
INSERT INTO public.organization_members(organization_id, user_id, role, person_id, branch_id)
SELECT pg_temp.access_id(org), pg_temp.access_id(actor), actor,
  pg_temp.access_id(person), pg_temp.access_id(branch)
FROM (VALUES
  ('org', 'finance_manager', NULL::text, NULL::text),
  ('org', 'finance_member', NULL, NULL),
  ('org', 'operations_manager', 'manager_person', 'branch'),
  ('org', 'operations_member', 'member_person', 'branch')
) fixture(org, actor, person, branch);
INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES
  (pg_temp.access_id('org'), pg_temp.access_id('admin'), 'super_admin'),
  (pg_temp.access_id('foreign_org'), pg_temp.access_id('foreign_admin'), 'super_admin');

INSERT INTO public.organization_roles(id, organization_id, name, created_by, updated_by)
VALUES (pg_temp.access_id('custom_role'), pg_temp.access_id('org'), 'Property viewer only',
  pg_temp.access_id('admin'), pg_temp.access_id('admin'));
INSERT INTO public.organization_role_permissions(organization_id, role_id, permission_key, granted_by)
VALUES (pg_temp.access_id('org'), pg_temp.access_id('custom_role'), 'properties.view',
  pg_temp.access_id('admin'));
INSERT INTO public.organization_members(
  organization_id, user_id, role, person_id, branch_id, custom_role_id
)
SELECT pg_temp.access_id('org'), pg_temp.access_id(actor), 'custom',
  pg_temp.access_id(person), pg_temp.access_id('branch'), pg_temp.access_id('custom_role')
FROM (VALUES ('custom_viewer', 'custom_person'), ('custom_without_person', NULL)) fixture(actor, person);

-- Only Property fixture insertion skips the unrelated checked branch-assignment
-- command trigger, matching existing isolated SQL fixtures. All assertions and
-- all other fixtures run with normal triggers and constraints.
SET LOCAL session_replication_role = replica;
INSERT INTO public.properties(id, organization_id, branch_id, name, code, property_type, status)
SELECT pg_temp.access_id(label), pg_temp.access_id(org), pg_temp.access_id(branch),
  label, label, 'apartment', 'active'
FROM (VALUES
  ('property', 'org', 'branch'), ('other_property', 'org', 'other_branch'),
  ('foreign_property', 'foreign_org', 'foreign_branch')
) fixture(label, org, branch);
SET LOCAL session_replication_role = origin;

INSERT INTO public.units(id, organization_id, property_id, unit_number, status)
VALUES (pg_temp.access_id('unit'), pg_temp.access_id('org'),
  pg_temp.access_id('property'), 'ACCESS-1', 'vacant');

INSERT INTO public.finance_expense_items(
  organization_id, property_id, unit_id, expense_type, vendor_label,
  invoice_date, due_date, amount, currency, category, status
)
SELECT pg_temp.access_id(org), pg_temp.access_id(property), pg_temp.access_id(unit),
  'vendor_bill', 'Boundary vendor', DATE '2026-01-10', DATE '2026-01-15',
  amount, 'USD', 'Repairs', status
FROM (VALUES
  ('org', 'property', 'unit'::text, 11::numeric, 'approved'),
  ('org', 'property', NULL, 7, 'draft'),
  ('org', 'other_property', NULL, 13, 'draft'),
  ('foreign_org', 'foreign_property', NULL, 997, 'approved')
) fixture(org, property, unit, amount, status);

CREATE TEMP TABLE access_tasks AS
SELECT pg_temp.access_id(label) id, pg_temp.access_id(org) organization_id,
  pg_temp.access_id(property) property_id, pg_temp.access_id(branch) branch_id,
  pg_temp.access_id(person) assignee_person_id, gen_random_uuid() request_id
FROM (VALUES
  ('assigned_task', 'org', 'property', 'branch', 'member_person'),
  ('unassigned_task', 'org', 'property', 'branch', 'manager_person'),
  ('other_branch_task', 'org', 'other_property', 'other_branch', 'member_person'),
  ('custom_assigned_task', 'org', 'property', 'branch', 'custom_person'),
  ('foreign_task', 'foreign_org', 'foreign_property', 'foreign_branch', NULL)
) fixture(label, org, property, branch, person);
GRANT SELECT ON access_tasks TO authenticated;

INSERT INTO public.tenant_requests(id, organization_id, property_id, title, category, status)
SELECT request_id, organization_id, property_id, 'Boundary request', 'Repairs', 'open'
FROM access_tasks;
INSERT INTO public.tasks(
  id, organization_id, tenant_request_id, property_id, branch_id,
  assignee_person_id, title, category, status
)
SELECT id, organization_id, request_id, property_id, branch_id,
  assignee_person_id, 'Boundary task', 'Repairs', 'pending'
FROM access_tasks;

CREATE TEMP TABLE access_history AS
SELECT task.id task_id, gen_random_uuid() submission_id, 'submitted'::text status,
  NULL::text review_reason, TIMESTAMPTZ '2026-01-10 12:00:00+00' submitted_at
FROM access_tasks task
UNION ALL
SELECT pg_temp.access_id('assigned_task'), gen_random_uuid(), 'rejected',
  'Earlier rejected receipt', TIMESTAMPTZ '2026-01-09 12:00:00+00';
GRANT SELECT ON access_history TO authenticated;
INSERT INTO public.expense_submissions(
  id, organization_id, property_id, source_type, source_id, customer_category,
  vendor_label, expense_date, internal_cost_amount, recorded_total_amount,
  previously_approved_amount, responsibility, reference, status, idempotency_key,
  request_payload_hash, submitted_by, submitted_at, review_reason
)
SELECT history.submission_id, task.organization_id, task.property_id,
  'maintenance_task', task.id, 'repairs_maintenance', 'Boundary vendor',
  DATE '2026-01-10', 10, 10, 0, 'owner', 'Boundary receipt', history.status,
  'access-history-' || history.submission_id::text, repeat('a', 64),
  CASE WHEN task.organization_id = pg_temp.access_id('org')
    THEN pg_temp.access_id('admin') ELSE pg_temp.access_id('foreign_admin') END,
  history.submitted_at, history.review_reason
FROM access_history history JOIN access_tasks task ON task.id = history.task_id;

INSERT INTO public.rent_policy_versions(
  id, organization_id, version_number, effective_from, lifecycle,
  approved_at, approved_by
)
VALUES
  (pg_temp.access_id('draft'), pg_temp.access_id('org'), 1, DATE '2026-01-01', 'draft', NULL, NULL),
  (pg_temp.access_id('approved'), pg_temp.access_id('org'), 2, DATE '2026-02-01', 'approved',
    TIMESTAMPTZ '2026-01-01 00:00:00+00', pg_temp.access_id('admin')),
  (pg_temp.access_id('foreign_draft'), pg_temp.access_id('foreign_org'), 1,
    DATE '2026-01-01', 'draft', NULL, NULL);

-- The snapshot is collected as postgres, so RLS cannot hide a rejected write.
CREATE FUNCTION pg_temp.policy_state() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)
      FROM public.rent_policy_versions p
      WHERE p.organization_id IN (pg_temp.access_id('org'), pg_temp.access_id('foreign_org'))),
    'activity', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
      FROM public.activity_logs a
      WHERE a.organization_id IN (pg_temp.access_id('org'), pg_temp.access_id('foreign_org')))
  )
$$;
CREATE TEMP TABLE access_policy_before AS SELECT pg_temp.policy_state() snapshot;

CREATE FUNCTION pg_temp.policy_command(p_org uuid, p_policy uuid, p_due_day integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format(
    'SELECT public.update_rent_policy_draft(%L::uuid,%L::uuid,ARRAY[''monthly'']::text[],''UTC'',''policy_default'',%s,''last_calendar_day'',''actual_days'',''actual_days'',''through_lease_end'',''next_full_period'',''unsupported'',''unsupported'',''unsupported'')',
    p_org, p_policy, p_due_day)
$$;

-- Expense aggregation must require an admin and keep explicit scope filters.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('admin')::text, true);
SELECT results_eq(
  $$ SELECT * FROM public.get_finance_expense_scoped_summary(
    pg_temp.access_id('org'), DATE '2026-01-01', DATE '2026-02-01', DATE '2026-01-20') $$,
  $$ VALUES (1::bigint, 2::bigint, 3::bigint, 0::numeric, 31::numeric) $$,
  'expense summary includes own-org expenses and excludes the foreign 997 sentinel');
SELECT results_eq(
  $$ SELECT * FROM public.get_finance_expense_scoped_summary(
    pg_temp.access_id('org'), DATE '2026-01-01', DATE '2026-02-01', DATE '2026-01-20',
    pg_temp.access_id('property'), pg_temp.access_id('unit')) $$,
  $$ VALUES (1::bigint, 0::bigint, 1::bigint, 0::numeric, 11::numeric) $$,
  'expense summary keeps the selected Property and Unit boundary');
SELECT results_eq(
  $$ SELECT * FROM public.get_finance_expense_scoped_summary(
    pg_temp.access_id('org'), DATE '2026-01-01', DATE '2026-02-01', DATE '2026-01-20',
    pg_temp.access_id('foreign_property')) $$,
  $$ VALUES (0::bigint, 0::bigint, 0::bigint, 0::numeric, 0::numeric) $$,
  'an admin cannot include another organization by supplying its Property ID');

SELECT results_eq(
  $$ SELECT user_id, email FROM public.get_organization_access_members(pg_temp.access_id('org'))
    ORDER BY user_id $$,
  $$ SELECT id, label || '.' || id::text || '@ips-access-boundaries.test'
    FROM pg_temp.access_ids WHERE label IN
    ('admin','finance_manager','finance_member','operations_manager','operations_member',
      'custom_viewer','custom_without_person')
    ORDER BY id $$,
  'access register exposes exactly the own-org membership emails to its admin');

SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('foreign_admin')::text, true);
SELECT results_eq(
  $$ SELECT * FROM public.get_finance_expense_scoped_summary(
    pg_temp.access_id('foreign_org'), DATE '2026-01-01', DATE '2026-02-01', DATE '2026-01-20') $$,
  $$ VALUES (1::bigint, 0::bigint, 1::bigint, 0::numeric, 997::numeric) $$,
  'the foreign aggregate sentinel exists and is readable only by its own admin');
SELECT throws_ok(
  $$ SELECT * FROM public.get_finance_expense_scoped_summary(
    pg_temp.access_id('org'), DATE '2026-01-01', DATE '2026-02-01', DATE '2026-01-20') $$,
  '42501', 'Not authorized', 'unrelated-org admin cannot read the expense summary');
SELECT is((SELECT count(*) FROM public.get_organization_access_members(pg_temp.access_id('org'))),
  0::bigint, 'unrelated-org admin receives no access-register emails');

SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('finance_member')::text, true);
SELECT throws_ok(
  $$ SELECT * FROM public.get_finance_expense_scoped_summary(
    pg_temp.access_id('org'), DATE '2026-01-01', DATE '2026-02-01', DATE '2026-01-20') $$,
  '42501', 'Not authorized', 'ordinary Finance member cannot read the admin expense summary');
SELECT is((SELECT count(*) FROM public.get_organization_access_members(pg_temp.access_id('org'))),
  0::bigint, 'ordinary member receives no access-register emails');

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
  $$ SELECT * FROM public.get_finance_expense_scoped_summary(
    pg_temp.access_id('org'), DATE '2026-01-01', DATE '2026-02-01', DATE '2026-01-20') $$,
  '28000', 'Not authenticated', 'expense summary rejects a null authenticated subject');
SELECT is((SELECT count(*) FROM public.get_organization_access_members(pg_temp.access_id('org'))),
  0::bigint, 'null subject receives no access-register emails');

-- History must include all submissions only for the caller's task scope.
SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('operations_manager')::text, true);
SELECT results_eq(
  $$ SELECT * FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('org'), ARRAY(SELECT id FROM pg_temp.access_tasks))
    ORDER BY task_id, submission_id $$,
  $$ SELECT * FROM pg_temp.access_history
    WHERE task_id IN (pg_temp.access_id('assigned_task'), pg_temp.access_id('unassigned_task'),
      pg_temp.access_id('custom_assigned_task'))
    ORDER BY task_id, submission_id $$,
  'manager sees all same-branch tasks and complete submission history, never foreign branch/org');
SELECT is((SELECT count(*) FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('org'), ARRAY[pg_temp.access_id('other_branch_task'), pg_temp.access_id('foreign_task')])),
  0::bigint, 'allowed manager cannot request another branch or foreign organization task');
SELECT throws_ok(
  $$ SELECT * FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('foreign_org'), ARRAY[pg_temp.access_id('foreign_task')]) $$,
  '42501', 'Not authorized', 'manager without foreign membership is denied before task lookup');

SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('operations_member')::text, true);
SELECT results_eq(
  $$ SELECT * FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('org'), ARRAY(SELECT id FROM pg_temp.access_tasks))
    ORDER BY task_id, submission_id $$,
  $$ SELECT * FROM pg_temp.access_history WHERE task_id = pg_temp.access_id('assigned_task')
    ORDER BY task_id, submission_id $$,
  'member sees only own assigned same-branch task, even when also assigned in another branch');
SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('admin')::text, true);
SELECT results_eq(
  $$ SELECT * FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('org'), ARRAY(SELECT id FROM pg_temp.access_tasks))
    ORDER BY task_id, submission_id $$,
  $$ SELECT * FROM pg_temp.access_history WHERE task_id <> pg_temp.access_id('foreign_task')
    ORDER BY task_id, submission_id $$,
  'super admin can read both own branches while foreign history remains excluded');
SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('foreign_admin')::text, true);
SELECT throws_ok(
  $$ SELECT * FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('org'), ARRAY(SELECT id FROM pg_temp.access_tasks)) $$,
  '42501', 'Not authorized', 'unrelated admin with no membership is denied before task lookup');
SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('finance_member')::text, true);
SELECT throws_ok(
  $$ SELECT * FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('org'), ARRAY(SELECT id FROM pg_temp.access_tasks)) $$,
  '42501', 'Not authorized', 'non-Operations role cannot read maintenance history');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
  $$ SELECT * FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('org'), ARRAY(SELECT id FROM pg_temp.access_tasks)) $$,
  '28000', 'Not authenticated', 'maintenance history rejects a null authenticated subject');

-- A NULL legacy role is not permission. A custom member may have a real branch
-- and assigned Person even though the role has no maintenance permission.
SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('custom_viewer')::text, true);
SELECT ok(
  app_private.current_workspace_role(pg_temp.access_id('org')) IS NULL
    AND NOT app_private.has_org_permission(pg_temp.access_id('org'), 'maintenance.view')
    AND NOT app_private.has_org_permission(pg_temp.access_id('org'), 'maintenance.review'),
  'custom adversary has a NULL legacy role and no maintenance read/review permission');
SELECT throws_ok(
  $$ SELECT * FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('org'), ARRAY[pg_temp.access_id('custom_assigned_task')]) $$,
  '42501', 'Not authorized',
  'assignment alone cannot expose history to a custom role without maintenance permission');
SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('custom_without_person')::text, true);
SELECT throws_ok(
  $$ SELECT * FROM public.get_maintenance_cost_status_history(
    pg_temp.access_id('org'), ARRAY(SELECT id FROM pg_temp.access_tasks)) $$,
  '42501', 'Not authorized', 'NULL legacy role is denied even without a Person assignment');

-- Rejections must leave every fixture policy and audit record unchanged.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
  pg_temp.policy_command(pg_temp.access_id('org'), pg_temp.access_id('draft'), 17),
  '42501', 'Not authorized', 'rent draft rejects null subject');
RESET ROLE;
SELECT is(pg_temp.policy_state(), (SELECT snapshot FROM access_policy_before),
  'rent draft rejection preserves complete policy rows and audit activity: null subject');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('foreign_admin')::text, true);
SELECT throws_ok(
  pg_temp.policy_command(pg_temp.access_id('org'), pg_temp.access_id('draft'), 17),
  '42501', 'Not authorized', 'rent draft rejects unrelated-org admin');
RESET ROLE;
SELECT is(pg_temp.policy_state(), (SELECT snapshot FROM access_policy_before),
  'rent draft rejection preserves complete policy rows and audit activity: unrelated-org admin');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('finance_member')::text, true);
SELECT throws_ok(
  pg_temp.policy_command(pg_temp.access_id('org'), pg_temp.access_id('draft'), 17),
  '42501', 'Not authorized', 'rent draft rejects ordinary Finance member');
RESET ROLE;
SELECT is(pg_temp.policy_state(), (SELECT snapshot FROM access_policy_before),
  'rent draft rejection preserves complete policy rows and audit activity: ordinary Finance member');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('finance_member')::text, true);
SELECT throws_ok(
  pg_temp.policy_command(pg_temp.access_id('org'), gen_random_uuid(), 17),
  '42501', 'Not authorized', 'rent draft rejects ordinary member with nonexistent policy');
RESET ROLE;
SELECT is(pg_temp.policy_state(), (SELECT snapshot FROM access_policy_before),
  'rent draft rejection preserves complete policy rows and audit activity: ordinary member with nonexistent policy');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('admin')::text, true);
SELECT throws_ok(
  pg_temp.policy_command(pg_temp.access_id('org'), pg_temp.access_id('foreign_draft'), 17),
  '23503', 'Rent policy version was not found', 'rent draft rejects allowed admin with foreign policy ID');
RESET ROLE;
SELECT is(pg_temp.policy_state(), (SELECT snapshot FROM access_policy_before),
  'rent draft rejection preserves complete policy rows and audit activity: allowed admin with foreign policy ID');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('admin')::text, true);
SELECT throws_ok(
  pg_temp.policy_command(pg_temp.access_id('org'), pg_temp.access_id('approved'), 17),
  '42501', 'Only draft rent policy versions can be edited', 'rent draft rejects allowed admin with approved policy');
RESET ROLE;
SELECT is(pg_temp.policy_state(), (SELECT snapshot FROM access_policy_before),
  'rent draft rejection preserves complete policy rows and audit activity: allowed admin with approved policy');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', pg_temp.access_id('finance_manager')::text, true);
SELECT lives_ok(
  pg_temp.policy_command(pg_temp.access_id('org'), pg_temp.access_id('draft'), 17),
  'legacy Finance Manager can edit a draft through delegated lease configuration authority');
RESET ROLE;
SELECT is(
  (SELECT policy_default_due_day FROM public.rent_policy_versions WHERE id = pg_temp.access_id('draft')),
  17, 'allowed policy update persists the requested draft value');
SELECT is(
  (SELECT updated_by FROM public.rent_policy_versions WHERE id = pg_temp.access_id('draft')),
  pg_temp.access_id('finance_manager'), 'allowed policy update records the caller');
SELECT is(
  (SELECT count(*) FROM public.activity_logs WHERE organization_id = pg_temp.access_id('org')
    AND entity_id = pg_temp.access_id('draft') AND action = 'rent_policy_draft_updated'),
  1::bigint, 'allowed policy update creates exactly one audit event');
SELECT ok(
  (SELECT actor_id = pg_temp.access_id('finance_manager')
    AND previous_values->>'policy_default_due_day' IS NULL
    AND new_values->>'policy_default_due_day' = '17'
    FROM public.activity_logs WHERE organization_id = pg_temp.access_id('org')
    AND entity_id = pg_temp.access_id('draft') AND action = 'rent_policy_draft_updated'),
  'allowed policy audit preserves before/after values and actor');
SELECT is(
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.rent_policy_versions p
    WHERE p.id IN (pg_temp.access_id('approved'), pg_temp.access_id('foreign_draft'))),
  (SELECT jsonb_agg(policy_row ORDER BY policy_row->>'id') FROM access_policy_before,
    jsonb_array_elements(snapshot->'policies') policy_row
    WHERE policy_row->>'id' IN (pg_temp.access_id('approved')::text, pg_temp.access_id('foreign_draft')::text)),
  'allowed draft edit leaves the approved and foreign policy rows unchanged');

SELECT * FROM finish();
ROLLBACK;
