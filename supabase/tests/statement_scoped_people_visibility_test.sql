BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

CREATE TEMP TABLE visibility_state AS SELECT
  gen_random_uuid() org, gen_random_uuid() foreign_org,
  gen_random_uuid() actor, gen_random_uuid() admin, gen_random_uuid() outsider,
  gen_random_uuid() role_id, gen_random_uuid() branch_a, gen_random_uuid() branch_b,
  gen_random_uuid() property_a, gen_random_uuid() property_b,
  gen_random_uuid() request_id;
GRANT SELECT ON visibility_state TO authenticated;
INSERT INTO auth.users(id, email)
SELECT actor, actor || '@visibility.test' FROM visibility_state UNION ALL
SELECT admin, admin || '@visibility.test' FROM visibility_state UNION ALL
SELECT outsider, outsider || '@visibility.test' FROM visibility_state;
INSERT INTO public.organizations(id, name, slug)
SELECT org, 'Visibility fixtures', 'visibility-' || org FROM visibility_state UNION ALL
SELECT foreign_org, 'Foreign visibility fixtures', 'visibility-' || foreign_org FROM visibility_state;
INSERT INTO public.organization_branches(id, organization_id, name, code)
SELECT branch_a, org, 'A', 'A' FROM visibility_state UNION ALL
SELECT branch_b, org, 'B', 'B' FROM visibility_state;
INSERT INTO public.organization_roles(id, organization_id, name)
SELECT role_id, org, 'People reader' FROM visibility_state;
INSERT INTO public.organization_role_permissions(organization_id, role_id, permission_key)
SELECT org, role_id, permission_key FROM visibility_state
CROSS JOIN unnest(ARRAY['people.view', 'properties.view']::public.organization_permission_key[]) permission_key;

-- Synthetic, rollback-only read fixtures retain FK and CHECK constraints.
-- Disable mutation workflow hooks while constructing each relationship in
-- isolation, then restore all hooks before exercising policies or writes.
DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'people', 'person_roles', 'properties', 'property_owners', 'leases',
    'lease_parties', 'lease_occupancies', 'tenant_requests', 'tasks',
    'maintenance_recurrence_series', 'maintenance_recurrence_revisions',
    'person_branch_relationships'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', relation_name);
  END LOOP;
END;
$$;

CREATE TEMP TABLE visibility_people AS
SELECT kind, gen_random_uuid() id,
  CASE WHEN kind = 'foreign' THEN foreign_org ELSE org END organization_id,
  kind = ANY(ARRAY[
    'own', 'owner', 'primary', 'party_today', 'occupancy', 'request',
    'task_vendor', 'task_assignee', 'recurrence_vendor', 'recurrence_assignee',
    'recurrence_paused', 'explicit', 'archived_person', 'lease_anchor'
  ]) AS expected
FROM visibility_state CROSS JOIN unnest(ARRAY[
  'own', 'owner', 'owner_ends_today', 'owner_future', 'owner_archived_null_start', 'owner_archived',
  'primary', 'primary_ended', 'primary_archived', 'lease_anchor',
  'party_today', 'party_yesterday', 'party_void', 'party_archived',
  'occupancy', 'occupancy_void', 'occupancy_vacated', 'occupancy_archived',
  'request', 'request_archived', 'task_vendor', 'task_assignee', 'task_archived',
  'task_branch_mismatch', 'recurrence_vendor', 'recurrence_assignee',
  'recurrence_paused', 'recurrence_retired', 'recurrence_superseded',
  'explicit', 'explicit_archived', 'archived_person', 'other_branch', 'foreign', 'unlinked'
]) kind;
-- Enough rows to expose a correlated policy regression in the executor plan.
INSERT INTO visibility_people(kind, id, organization_id, expected)
SELECT 'bulk_' || n, gen_random_uuid(), org, true
FROM visibility_state CROSS JOIN generate_series(1, 300) n;
GRANT SELECT ON visibility_people TO authenticated;
INSERT INTO public.people(id, organization_id, display_name, archived_at)
SELECT id, organization_id, kind, CASE WHEN kind = 'archived_person' THEN now() END
FROM visibility_people;
INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, id, 'tenant' FROM visibility_people;
INSERT INTO public.properties(id, organization_id, branch_id, code, name, property_type, rental_structure)
SELECT property_a, org, branch_a, 'VIS-A', 'Visibility A', 'apartment', 'multi_unit' FROM visibility_state UNION ALL
SELECT property_b, org, branch_b, 'VIS-B', 'Visibility B', 'apartment', 'multi_unit' FROM visibility_state;
INSERT INTO public.organization_members(organization_id, user_id, role, branch_id, custom_role_id, person_id)
SELECT org, actor, 'custom', branch_a, role_id, p.id
FROM visibility_state CROSS JOIN visibility_people p WHERE p.kind = 'own'
UNION ALL
SELECT org, admin, 'super_admin', NULL, NULL, NULL FROM visibility_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled = true
WHERE organization_id = (SELECT org FROM visibility_state);

INSERT INTO public.property_owners(organization_id, property_id, person_id, ownership_percent, started_on, ended_on, archived_at)
SELECT s.org, s.property_a, p.id, 10,
  CASE p.kind WHEN 'owner_future' THEN current_date + 1 WHEN 'owner_archived_null_start' THEN NULL ELSE current_date - 1 END,
  CASE WHEN p.kind = 'owner_ends_today' THEN current_date END,
  CASE WHEN p.kind IN ('owner_archived', 'owner_archived_null_start') THEN now() END
FROM visibility_state s CROSS JOIN visibility_people p WHERE p.kind LIKE 'owner%';

CREATE TEMP TABLE visibility_leases AS
SELECT p.kind, gen_random_uuid() id, p.id person_id FROM visibility_people p
WHERE p.kind LIKE 'primary%' OR p.kind LIKE 'party_%' OR p.kind LIKE 'occupancy%';
INSERT INTO public.leases(id, organization_id, property_id, primary_tenant_person_id, status, archived_at)
SELECT l.id, s.org, s.property_a,
  CASE WHEN l.kind LIKE 'primary%' THEN l.person_id ELSE anchor.id END,
  CASE WHEN l.kind = 'primary_ended' OR l.kind LIKE 'occupancy%' THEN 'ended' ELSE 'active' END,
  CASE WHEN l.kind = 'primary_archived' THEN now() END
FROM visibility_leases l CROSS JOIN visibility_state s
CROSS JOIN visibility_people anchor WHERE anchor.kind = 'lease_anchor';
INSERT INTO public.lease_parties(organization_id, lease_id, person_id, party_role,
  ended_on, ended_on_kind, evidence_state, archived_at)
SELECT s.org, l.id, l.person_id, 'co_tenant',
  CASE WHEN l.kind = 'party_today' THEN current_date
    WHEN l.kind = 'party_yesterday' OR l.kind LIKE 'occupancy%' THEN current_date - 1 END,
  CASE WHEN l.kind IN ('party_today', 'party_yesterday') OR l.kind LIKE 'occupancy%' THEN 'known' ELSE 'unknown' END,
  CASE WHEN l.kind = 'party_void' THEN 'voided' ELSE 'accepted' END,
  CASE WHEN l.kind = 'party_archived' THEN now() END
FROM visibility_leases l CROSS JOIN visibility_state s
WHERE l.kind LIKE 'party_%' OR l.kind LIKE 'occupancy%';
-- The established occupancy path deliberately does not inspect the lease
-- status or party end date. Its ended leases/parties test that exact boundary.
INSERT INTO public.lease_occupancies(organization_id, lease_id, property_id,
  evidence_state, business_lifecycle, archived_at)
SELECT s.org, l.id, s.property_a,
  CASE WHEN l.kind = 'occupancy_void' THEN 'voided' ELSE 'accepted' END,
  CASE WHEN l.kind = 'occupancy_vacated' THEN 'vacated' ELSE 'reserved' END,
  CASE WHEN l.kind = 'occupancy_archived' THEN now() END
FROM visibility_leases l CROSS JOIN visibility_state s WHERE l.kind LIKE 'occupancy%';

INSERT INTO public.tenant_requests(id, organization_id, property_id, title)
SELECT request_id, org, property_a, 'Task parent' FROM visibility_state;
INSERT INTO public.tenant_requests(organization_id, property_id, requested_by_person_id, title, archived_at)
SELECT s.org, s.property_a, p.id, p.kind, CASE WHEN p.kind = 'request_archived' THEN now() END
FROM visibility_state s CROSS JOIN visibility_people p WHERE p.kind LIKE 'request%';
INSERT INTO public.tasks(organization_id, property_id, branch_id, tenant_request_id,
  title, vendor_person_id, assignee_person_id, archived_at)
SELECT s.org, s.property_a,
  CASE WHEN p.kind = 'task_branch_mismatch' THEN s.branch_b ELSE s.branch_a END,
  s.request_id, p.kind,
  CASE WHEN p.kind <> 'task_assignee' THEN p.id END,
  CASE WHEN p.kind = 'task_assignee' THEN p.id END,
  CASE WHEN p.kind = 'task_archived' THEN now() END
FROM visibility_state s CROSS JOIN visibility_people p WHERE p.kind LIKE 'task_%';

CREATE TEMP TABLE visibility_series AS
SELECT kind, gen_random_uuid() id, p.id person_id FROM visibility_people p WHERE p.kind LIKE 'recurrence_%';
INSERT INTO public.maintenance_recurrence_series(id, organization_id, branch_id, property_id,
  lifecycle, created_by, retired_at, retired_by)
SELECT r.id, s.org, s.branch_a, s.property_a,
  CASE r.kind WHEN 'recurrence_paused' THEN 'paused' WHEN 'recurrence_retired' THEN 'retired' ELSE 'active' END,
  s.admin, CASE WHEN r.kind = 'recurrence_retired' THEN now() END,
  CASE WHEN r.kind = 'recurrence_retired' THEN s.admin END
FROM visibility_series r CROSS JOIN visibility_state s;
INSERT INTO public.maintenance_recurrence_revisions(organization_id, series_id, revision_number,
  frequency, timezone, next_occurrence_at, title, category, priority,
  vendor_person_id, assignee_person_id, effective_from, created_by, superseded_at, superseded_by)
SELECT s.org, r.id, 1, 'monthly', 'UTC', now(), r.kind, 'General', 'normal',
  CASE WHEN r.kind <> 'recurrence_assignee' THEN r.person_id END,
  CASE WHEN r.kind = 'recurrence_assignee' THEN r.person_id END, now(), s.admin,
  CASE WHEN r.kind = 'recurrence_superseded' THEN now() END,
  CASE WHEN r.kind = 'recurrence_superseded' THEN s.admin END
FROM visibility_series r CROSS JOIN visibility_state s;
INSERT INTO public.person_branch_relationships(organization_id, person_id, branch_id, archived_at)
SELECT s.org, p.id, CASE WHEN p.kind = 'other_branch' THEN s.branch_b ELSE s.branch_a END,
  CASE WHEN p.kind = 'explicit_archived' THEN now() END
FROM visibility_state s CROSS JOIN visibility_people p
WHERE p.kind IN ('explicit', 'explicit_archived', 'archived_person', 'other_branch') OR p.kind LIKE 'bulk_%';

DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'people', 'person_roles', 'properties', 'property_owners', 'leases',
    'lease_parties', 'lease_occupancies', 'tenant_requests', 'tasks',
    'maintenance_recurrence_series', 'maintenance_recurrence_revisions',
    'person_branch_relationships'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', relation_name);
  END LOOP;
END;
$$;

SELECT ok(p.prosecdef AND p.provolatile = 's'
  AND p.pronargs = 0 AND 'search_path=""' = ANY(p.proconfig),
  'private read-set helper is stable, has no caller-supplied scope, and fixes its search path')
FROM pg_proc p WHERE p.oid = 'app_private.current_branch_visible_people()'::regprocedure;
SELECT ok(has_function_privilege('authenticated', 'app_private.current_branch_visible_people()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'app_private.current_branch_visible_people()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'app_private.current_branch_visible_people()', 'EXECUTE'),
  'only authenticated clients may execute the current-caller read set');
SELECT ok(has_function_privilege('authenticated', 'app_private.current_admin_organization_ids()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'app_private.current_admin_organization_ids()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'app_private.current_admin_organization_ids()', 'EXECUTE'),
  'administrator organization keys have the same authenticated-only ACL');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('people', 'person_roles') AND cmd IN ('SELECT', 'ALL')), 2::bigint,
  'each table has one combined SELECT policy, with no overlapping ALL policy');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('people', 'person_roles') AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  AND coalesce(qual, with_check) = 'app_private.is_org_admin(organization_id)'), 6::bigint,
  'the six command policies preserve the original administrator write predicate');

SELECT set_config('request.jwt.claim.sub', (SELECT actor::text FROM visibility_state), true);
-- Differential oracle: the original production helper stays unchanged.
SELECT is(app_private.person_is_visible_in_branch(p.organization_id, p.id,
  app_private.current_active_branch_id(p.organization_id)), p.expected,
  'original visibility contract: ' || p.kind)
FROM visibility_people p WHERE p.kind NOT LIKE 'bulk_%';
CREATE TEMP TABLE visibility_expected AS
SELECT p.organization_id, p.id FROM visibility_people p
WHERE app_private.is_org_admin(p.organization_id)
   OR app_private.person_is_visible_in_branch(p.organization_id, p.id,
     app_private.current_active_branch_id(p.organization_id));
GRANT SELECT ON visibility_expected TO authenticated;

-- EXPLAIN executes only this rollback-only synthetic fixture on local/CI DBs.
CREATE FUNCTION pg_temp.visibility_plan(query_text text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON, COSTS OFF, TIMING OFF) ' || query_text INTO result;
  RETURN result;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT results_eq(
  'SELECT organization_id, id FROM public.people ORDER BY organization_id, id',
  'SELECT organization_id, id FROM visibility_expected ORDER BY organization_id, id',
  'people policy matches the original helper for every relationship and exclusion');
SELECT results_eq(
  'SELECT organization_id, person_id FROM public.person_roles ORDER BY organization_id, person_id',
  'SELECT organization_id, id FROM visibility_expected ORDER BY organization_id, id',
  'role rows inherit exactly the same person visibility');
SELECT results_eq(
  'SELECT organization_id, person_id FROM app_private.current_branch_visible_people() ORDER BY organization_id, person_id',
  'SELECT organization_id, id FROM visibility_expected ORDER BY organization_id, id',
  'direct helper calls expose only the same visible person keys');
SELECT is((SELECT count(*) FROM public.people WHERE id = (SELECT id FROM visibility_people WHERE kind = 'explicit')),
  1::bigint, 'an ID-filtered detail read retains a visible person');
SELECT is((SELECT count(*) FROM public.people WHERE id = (SELECT id FROM visibility_people WHERE kind = 'other_branch')),
  0::bigint, 'an ID-filtered detail read cannot bypass the branch boundary');
SELECT is((SELECT count(*) FROM public.person_roles WHERE person_id = (SELECT id FROM visibility_people WHERE kind = 'foreign')),
  0::bigint, 'an ID-filtered role read cannot bypass the organization boundary');
SELECT ok((SELECT count(*) FROM public.people) > 300, 'plan fixture reads hundreds of visible rows');
CREATE TEMP TABLE visibility_plans AS
SELECT 'people' table_name, pg_temp.visibility_plan('SELECT id FROM public.people') plan
UNION ALL
SELECT 'person_roles', pg_temp.visibility_plan('SELECT person_id FROM public.person_roles');
SELECT ok(
  jsonb_array_length(jsonb_path_query_array(plan,
    '$.** ? (@."Node Type" == "Function Scan" && @."Function Name" == "current_branch_visible_people")')) > 0
  AND NOT jsonb_path_exists(plan,
    '$.** ? (@."Node Type" == "Function Scan" && @."Function Name" == "current_branch_visible_people" && @."Actual Loops" != 1)'),
  table_name || ': visible-person set executes once, not once per returned row')
FROM visibility_plans;
SELECT diag(table_name || ' executor plan: ' || plan::text) FROM visibility_plans;
SELECT set_config('app.finance_branch_authority_context', (SELECT branch_b::text FROM visibility_state), true);
SELECT results_eq('SELECT id FROM public.people ORDER BY id', 'SELECT id FROM visibility_expected ORDER BY id',
  'a client-supplied branch setting cannot widen person access');
SELECT throws_ok(format('INSERT INTO public.people(organization_id, display_name) VALUES (%L, %L)',
  (SELECT org FROM visibility_state), 'Ordinary direct write'), '42501', NULL,
  'ordinary read access does not grant direct person insertion');
RESET ROLE;

-- Authorization is recomputed on every statement rather than cached across a
-- transaction/session, so live revocation is still immediate.
-- Archiving an assigned role is normally blocked. Construct that invalid
-- historical state only in this rollback fixture to prove reads fail closed.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.organization_roles DISABLE TRIGGER organization_roles_prevent_assigned_archival;
UPDATE public.organization_roles SET status = 'archived', archived_at = now(),
  archived_by = (SELECT admin FROM visibility_state)
WHERE id = (SELECT role_id FROM visibility_state);
ALTER TABLE public.organization_roles ENABLE TRIGGER organization_roles_prevent_assigned_archival;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.people), 0::bigint, 'archived custom role removes people visibility');
SELECT is((SELECT count(*) FROM public.person_roles), 0::bigint, 'archived custom role removes role visibility');
RESET ROLE;
UPDATE public.organization_roles SET status = 'active', archived_at = NULL, archived_by = NULL
WHERE id = (SELECT role_id FROM visibility_state);
UPDATE public.organization_branches SET status = 'inactive' WHERE id = (SELECT branch_a FROM visibility_state);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.people), 0::bigint, 'inactive branch removes all person relationships');
RESET ROLE;
UPDATE public.organization_branches SET status = 'active' WHERE id = (SELECT branch_a FROM visibility_state);
DELETE FROM public.organization_role_permissions
WHERE role_id = (SELECT role_id FROM visibility_state) AND permission_key = 'people.view';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.people), 0::bigint, 'revoking people.view grants no visibility even while another permission remains');
RESET ROLE;
INSERT INTO public.organization_role_permissions(organization_id, role_id, permission_key)
SELECT org, role_id, 'people.view' FROM visibility_state;
UPDATE public.organization_authorization_states SET ordinary_access_enabled = false
WHERE organization_id = (SELECT org FROM visibility_state);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.people), 0::bigint, 'disabled ordinary access closes every branch relationship');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT admin::text FROM visibility_state), true);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  'SELECT id FROM public.people ORDER BY id',
  'SELECT id FROM visibility_people WHERE kind <> ''foreign'' ORDER BY id',
  'administrators retain unlinked, archived and other-branch people in their organization');
SELECT results_eq(
  'SELECT person_id FROM public.person_roles ORDER BY person_id',
  'SELECT id FROM visibility_people WHERE kind <> ''foreign'' ORDER BY id',
  'administrator role reads remain organization scoped');
SELECT throws_ok(format('INSERT INTO public.people(organization_id, display_name) VALUES (%L, %L)',
  (SELECT org FROM visibility_state), 'Administrator direct write'), '42501', NULL,
  'existing direct-write grant revocation still applies to administrators');
SELECT throws_ok(format('INSERT INTO public.people(organization_id, display_name) VALUES (%L, %L)',
  (SELECT foreign_org FROM visibility_state), 'Foreign write'), '42501', NULL,
  'administrator insert authority cannot cross organizations');
RESET ROLE;

-- Production keeps direct writes revoked. Grant only inside this rolled-back
-- transaction to verify that splitting the old ALL policy preserves its RLS
-- semantics for new rows, RETURNING, and both ON CONFLICT branches.
CREATE TEMP TABLE visibility_write_ids AS
SELECT gen_random_uuid() person_id, gen_random_uuid() role_id;
GRANT SELECT ON visibility_write_ids TO authenticated;
GRANT INSERT, UPDATE ON public.people, public.person_roles TO authenticated;
SET LOCAL ROLE authenticated;
SELECT lives_ok(format(
  'INSERT INTO public.people(id, organization_id, display_name) VALUES (%L, %L, %L) RETURNING id',
  (SELECT person_id FROM visibility_write_ids), (SELECT org FROM visibility_state), 'Admin returning'),
  'administrator INSERT RETURNING authorizes the new person before it exists in the statement snapshot');
SELECT lives_ok(format(
  'INSERT INTO public.people(id, organization_id, display_name) VALUES (%L, %L, %L) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id',
  (SELECT person_id FROM visibility_write_ids), (SELECT org FROM visibility_state), 'Admin upsert'),
  'administrator upsert UPDATE RETURNING retains the original write authority');
SELECT lives_ok(format(
  'INSERT INTO public.people(organization_id, display_name) VALUES (%L, %L) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id',
  (SELECT org FROM visibility_state), 'Admin upsert insert'),
  'administrator upsert INSERT RETURNING also accepts a new person');
SELECT lives_ok(format(
  'INSERT INTO public.person_roles(id, organization_id, person_id, role) VALUES (%L, %L, %L, %L) RETURNING id',
  (SELECT role_id FROM visibility_write_ids), (SELECT org FROM visibility_state),
  (SELECT person_id FROM visibility_write_ids), 'tenant'),
  'administrator role INSERT RETURNING retains organization-scoped read authority');
SELECT lives_ok(format(
  'INSERT INTO public.person_roles(id, organization_id, person_id, role) VALUES (%L, %L, %L, %L) ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role RETURNING id',
  (SELECT role_id FROM visibility_write_ids), (SELECT org FROM visibility_state),
  (SELECT person_id FROM visibility_write_ids), 'vendor'),
  'administrator role upsert UPDATE RETURNING retains its write authority');
SELECT throws_ok(format(
  'INSERT INTO public.people(organization_id, display_name) VALUES (%L, %L) RETURNING id',
  (SELECT foreign_org FROM visibility_state), 'Foreign returning'), '42501', NULL,
  'even with a temporary grant, RLS denies cross-organization administrator inserts');
RESET ROLE;
UPDATE public.organization_authorization_states SET ordinary_access_enabled = true
WHERE organization_id = (SELECT org FROM visibility_state);
SELECT set_config('request.jwt.claim.sub', (SELECT actor::text FROM visibility_state), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format(
  'INSERT INTO public.people(organization_id, display_name) VALUES (%L, %L) RETURNING id',
  (SELECT org FROM visibility_state), 'Ordinary returning'), '42501', NULL,
  'even with a temporary grant, ordinary readers cannot insert people');
RESET ROLE;
REVOKE INSERT, UPDATE ON public.people, public.person_roles FROM authenticated;

SELECT set_config('request.jwt.claim.sub', (SELECT outsider::text FROM visibility_state), true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.people), 0::bigint, 'an authenticated outsider cannot read person rows');
SELECT is((SELECT count(*) FROM public.person_roles), 0::bigint, 'an authenticated outsider cannot read role rows');
SELECT is((SELECT count(*) FROM app_private.current_branch_visible_people()), 0::bigint,
  'an authenticated outsider cannot retrieve keys through the private helper');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.people), 0::bigint, 'a missing authenticated identity fails closed');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
