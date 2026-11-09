BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

-- Transaction-only fixtures; no hosted data or shared fixture edits.
CREATE TEMP TABLE label_ids (
  label text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;
INSERT INTO label_ids(label) VALUES
  ('org'), ('foreign_org'), ('admin'), ('member'), ('viewer'),
  ('maintenance_role'), ('property_role'), ('branch'), ('other_branch'), ('foreign_branch'),
  ('assignee'), ('property'), ('other_property'), ('foreign_property'),
  ('assigned_task'), ('unassigned_task'), ('other_task'), ('foreign_task');
GRANT SELECT ON label_ids TO authenticated;
CREATE FUNCTION pg_temp.label_id(p_label text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM pg_temp.label_ids WHERE label = p_label
$$;

INSERT INTO auth.users(id, aud, role, email)
SELECT id, 'authenticated', 'authenticated', id::text || '@maintenance-labels.test'
FROM label_ids WHERE label IN ('admin', 'member', 'viewer');
INSERT INTO public.organizations(id, name, slug)
SELECT id, 'Maintenance labels ' || label, 'maintenance-labels-' || id::text
FROM label_ids WHERE label IN ('org', 'foreign_org');
INSERT INTO public.organization_branches(id, organization_id, name, code)
SELECT pg_temp.label_id(label), pg_temp.label_id(org), label, label
FROM (VALUES ('branch', 'org'), ('other_branch', 'org'), ('foreign_branch', 'foreign_org'))
  fixture(label, org);
INSERT INTO public.people(id, organization_id, display_name)
VALUES (pg_temp.label_id('assignee'), pg_temp.label_id('org'), 'Assigned staff member');
INSERT INTO public.person_roles(organization_id, person_id, role, status)
VALUES (pg_temp.label_id('org'), pg_temp.label_id('assignee'), 'staff', 'active');
INSERT INTO public.person_branch_relationships(organization_id, person_id, branch_id)
VALUES (pg_temp.label_id('org'), pg_temp.label_id('assignee'), pg_temp.label_id('branch'));
INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES (pg_temp.label_id('org'), pg_temp.label_id('admin'), 'super_admin');
INSERT INTO public.organization_roles(id, organization_id, name, created_by, updated_by)
SELECT id, pg_temp.label_id('org'), label, pg_temp.label_id('admin'), pg_temp.label_id('admin')
FROM label_ids WHERE label IN ('maintenance_role', 'property_role');
INSERT INTO public.organization_role_permissions(organization_id, role_id, permission_key, granted_by)
VALUES (pg_temp.label_id('org'), pg_temp.label_id('maintenance_role'), 'maintenance.view',
  pg_temp.label_id('admin')),
  (pg_temp.label_id('org'), pg_temp.label_id('property_role'), 'properties.view',
  pg_temp.label_id('admin'));
INSERT INTO public.organization_members(organization_id, user_id, role, branch_id, custom_role_id)
SELECT pg_temp.label_id('org'), pg_temp.label_id(actor), 'custom', pg_temp.label_id('branch'),
  pg_temp.label_id(role_name)
FROM (VALUES ('member', 'maintenance_role'), ('viewer', 'property_role')) fixture(actor, role_name);
UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true, transition_manifest_required = false
WHERE organization_id = pg_temp.label_id('org');

-- Skip only the unrelated checked Property branch-assignment command trigger.
SET LOCAL session_replication_role = replica;
INSERT INTO public.properties(id, organization_id, branch_id, name, code, property_type, status)
SELECT pg_temp.label_id(label), pg_temp.label_id(org), pg_temp.label_id(branch),
  label, upper(label), 'apartment', 'active'
FROM (VALUES ('property', 'org', 'branch'), ('other_property', 'org', 'other_branch'),
  ('foreign_property', 'foreign_org', 'foreign_branch')) fixture(label, org, branch);
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE label_tasks AS
SELECT pg_temp.label_id(label) id, pg_temp.label_id(org) organization_id,
  pg_temp.label_id(property) property_id, pg_temp.label_id(branch) branch_id,
  pg_temp.label_id(person) assignee_person_id, gen_random_uuid() request_id
FROM (VALUES ('assigned_task', 'org', 'property', 'branch', 'assignee'),
  ('unassigned_task', 'org', 'property', 'branch', NULL),
  ('other_task', 'org', 'other_property', 'other_branch', NULL),
  ('foreign_task', 'foreign_org', 'foreign_property', 'foreign_branch', NULL)
) fixture(label, org, property, branch, person);
GRANT SELECT ON label_tasks TO authenticated;
INSERT INTO public.tenant_requests(id, organization_id, property_id, title, category, status)
SELECT request_id, organization_id, property_id, 'Label request', 'Repairs', 'open' FROM label_tasks;
INSERT INTO public.tasks(id, organization_id, tenant_request_id, property_id, branch_id,
  assignee_person_id, title, category, status)
SELECT id, organization_id, request_id, property_id, branch_id, assignee_person_id,
  'Label task', 'Repairs', 'pending' FROM label_tasks;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.label_id('member')::text, true);
SELECT is((SELECT count(*) FROM public.properties WHERE id = pg_temp.label_id('property')), 0::bigint,
  'maintenance permission does not grant Property directory access');
SELECT is((SELECT count(*) FROM public.people WHERE id = pg_temp.label_id('assignee')), 0::bigint,
  'maintenance permission does not grant People directory access');
SELECT results_eq(
  $$ SELECT property_label, assignee_label FROM public.get_maintenance_task_labels(
    pg_temp.label_id('org'), ARRAY[pg_temp.label_id('assigned_task')]) $$,
  $$ VALUES ('PROPERTY - property'::text, 'Assigned staff member'::text) $$,
  'task labels remain available without either directory permission');
SELECT results_eq(
  $$ SELECT task_id FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
    ARRAY(SELECT id FROM pg_temp.label_tasks)) ORDER BY task_id $$,
  $$ SELECT id FROM public.tasks WHERE organization_id = pg_temp.label_id('org') ORDER BY id $$,
  'label visibility exactly matches existing task visibility');
SELECT is((SELECT count(*) FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
  ARRAY[pg_temp.label_id('other_task'), pg_temp.label_id('foreign_task'),
    pg_temp.label_id('property'), pg_temp.label_id('assignee')])), 0::bigint,
  'explicit IDs cannot reveal other branches, organizations, or arbitrary directory records');
SELECT is((SELECT count(*) FROM public.get_maintenance_task_labels(pg_temp.label_id('foreign_org'),
  ARRAY[pg_temp.label_id('foreign_task')])), 0::bigint,
  'changing the organization argument does not bypass membership');
SELECT results_eq(
  $$ SELECT property_label, assignee_label FROM public.get_maintenance_task_labels(
    pg_temp.label_id('org'), ARRAY[pg_temp.label_id('unassigned_task')]) $$,
  $$ VALUES ('PROPERTY - property'::text, NULL::text) $$,
  'genuinely unassigned tasks keep a null assignee label');
SELECT is((SELECT count(*) FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
  ARRAY[]::uuid[])), 0::bigint, 'an empty request returns no labels');
SELECT is((SELECT count(*) FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
  NULL::uuid[])), 0::bigint, 'a null request returns no labels');
SELECT throws_ok(
  $$ SELECT * FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
    array_fill(pg_temp.label_id('assigned_task'), ARRAY[1001])) $$,
  '22023', 'Maintenance label query is limited to 1000 tasks', 'label requests are bounded');

SELECT set_config('request.jwt.claim.sub', pg_temp.label_id('admin')::text, true);
SELECT public.archive_person(pg_temp.label_id('org'), pg_temp.label_id('assignee'));
SELECT set_config('request.jwt.claim.sub', pg_temp.label_id('member')::text, true);
SELECT is((SELECT assignee_label FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
  ARRAY[pg_temp.label_id('assigned_task')])), 'Assigned staff member',
  'archiving a person preserves their historical task label');

SELECT set_config('request.jwt.claim.sub', pg_temp.label_id('admin')::text, true);
SELECT results_eq(
  $$ SELECT task_id FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
    ARRAY(SELECT id FROM pg_temp.label_tasks)) ORDER BY task_id $$,
  $$ SELECT id FROM pg_temp.label_tasks WHERE organization_id = pg_temp.label_id('org') ORDER BY id $$,
  'an administrator sees own-organization task labels across branches only');
SELECT set_config('request.jwt.claim.sub', pg_temp.label_id('viewer')::text, true);
SELECT is((SELECT count(*) FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
  ARRAY(SELECT id FROM pg_temp.label_tasks))), 0::bigint,
  'membership without maintenance permission cannot read task labels');

RESET ROLE;
INSERT INTO public.organization_role_permissions(organization_id, role_id, permission_key, granted_by)
VALUES (pg_temp.label_id('org'), pg_temp.label_id('maintenance_role'), 'properties.view',
  pg_temp.label_id('admin'));
DELETE FROM public.organization_role_permissions
WHERE role_id = pg_temp.label_id('maintenance_role') AND permission_key = 'maintenance.view';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.label_id('member')::text, true);
SELECT is((SELECT count(*) FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
  ARRAY(SELECT id FROM pg_temp.label_tasks))), 0::bigint,
  'permission revocation takes effect on the next label read');
RESET ROLE;
INSERT INTO public.organization_role_permissions(organization_id, role_id, permission_key, granted_by)
VALUES (pg_temp.label_id('org'), pg_temp.label_id('maintenance_role'), 'maintenance.view',
  pg_temp.label_id('admin'));
UPDATE public.organization_authorization_states SET ordinary_access_enabled = false
WHERE organization_id = pg_temp.label_id('org');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.get_maintenance_task_labels(pg_temp.label_id('org'),
  ARRAY(SELECT id FROM pg_temp.label_tasks))), 0::bigint,
  'disabled ordinary access also blocks label reads');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok(
  $$ SELECT * FROM public.get_maintenance_task_labels(pg_temp.label_id('org'), ARRAY[]::uuid[]) $$,
  '28000', 'Not authenticated', 'a missing authenticated identity fails closed');

RESET ROLE;
SELECT ok(NOT has_function_privilege('anon', 'public.get_maintenance_task_labels(uuid,uuid[])', 'EXECUTE'),
  'anonymous callers cannot invoke the public label function');
SELECT ok(NOT has_function_privilege('anon', 'app_private.maintenance_task_labels(uuid,uuid[])', 'EXECUTE'),
  'anonymous callers cannot invoke the private implementation');
SELECT * FROM finish();
ROLLBACK;
