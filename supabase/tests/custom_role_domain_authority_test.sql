BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(75);

CREATE FUNCTION pg_temp.eval_boolean(p_sql text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  result boolean;
BEGIN
  EXECUTE p_sql INTO result;
  RETURN result;
EXCEPTION
  WHEN undefined_function THEN
    RETURN NULL;
END;
$$;

CREATE FUNCTION pg_temp.eval_uuid(p_sql text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  result uuid;
BEGIN
  EXECUTE p_sql INTO result;
  RETURN result;
EXCEPTION
  WHEN undefined_function THEN
    RETURN NULL;
END;
$$;

-- Organizations A-F.
INSERT INTO auth.users (id, email)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'domain-super-a@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'domain-both-a@example.test'),
  ('a0000000-0000-0000-0000-000000000003', 'domain-people-a@example.test'),
  ('a0000000-0000-0000-0000-000000000004', 'domain-properties-a@example.test'),
  ('b0000000-0000-0000-0000-000000000001', 'domain-super-b@example.test'),
  ('c0000000-0000-0000-0000-000000000001', 'domain-state-off@example.test'),
  ('d0000000-0000-0000-0000-000000000001', 'domain-inactive-role@example.test'),
  ('e0000000-0000-0000-0000-000000000001', 'domain-inactive-branch@example.test'),
  ('f0000000-0000-0000-0000-000000000001', 'domain-legacy@example.test');

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Domain A', 'domain-a'),
  ('b1000000-0000-0000-0000-000000000001', 'Domain B', 'domain-b'),
  ('c1000000-0000-0000-0000-000000000001', 'Domain State Off', 'domain-state-off'),
  ('d1000000-0000-0000-0000-000000000001', 'Domain Inactive Role', 'domain-inactive-role'),
  ('e1000000-0000-0000-0000-000000000001', 'Domain Inactive Branch', 'domain-inactive-branch'),
  ('f1000000-0000-0000-0000-000000000001', 'Domain Legacy', 'domain-legacy');

INSERT INTO public.organization_branches (id, organization_id, name, code)
VALUES
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'A One', 'A-ONE'),
  ('a2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'A Two', 'A-TWO'),
  ('a2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'A Inactive', 'A-INACTIVE'),
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'C One', 'C-ONE'),
  ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'D One', 'D-ONE'),
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'E One', 'E-ONE'),
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'F One', 'F-ONE');

INSERT INTO public.organization_roles (id, organization_id, name)
VALUES
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Property and People'),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'People Only'),
  ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Properties Only'),
  ('c3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'State Off Role'),
  ('d3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Later Archived Role'),
  ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Inactive Branch Role');

INSERT INTO public.organization_role_permissions (organization_id, role_id, permission_key)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'properties.view'),
  ('a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'people.view'),
  ('a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', 'people.view'),
  ('a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000003', 'properties.view'),
  ('c1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'properties.view'),
  ('d1000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'properties.view'),
  ('e1000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'properties.view');

INSERT INTO public.people (id, organization_id, display_name)
VALUES
  ('a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Own Membership'),
  ('a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Owner Relationship'),
  ('a4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Primary Tenant Relationship'),
  ('a4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'Lease Party Relationship'),
  ('a4000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'Request Relationship'),
  ('a4000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'Task Vendor Relationship'),
  ('a4000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'Task Assignee Relationship'),
  ('a4000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001', 'Recurrence Vendor Relationship'),
  ('a4000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001', 'Recurrence Assignee Relationship'),
  ('a4000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'Unrelated Person'),
  ('a4000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'Other Branch Person'),
  ('a4000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'Conflicting Task Person'),
  ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Cross Organization Person');

INSERT INTO public.organization_members (organization_id, user_id, role, branch_id, person_id, custom_role_id)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'super_admin', NULL, NULL, NULL),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'custom', 'a2000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'custom', 'a2000000-0000-0000-0000-000000000001', NULL, 'a3000000-0000-0000-0000-000000000002'),
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'custom', 'a2000000-0000-0000-0000-000000000001', NULL, 'a3000000-0000-0000-0000-000000000003'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'super_admin', NULL, NULL, NULL),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'custom', 'c2000000-0000-0000-0000-000000000001', NULL, 'c3000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'custom', 'd2000000-0000-0000-0000-000000000001', NULL, 'd3000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'custom', 'e2000000-0000-0000-0000-000000000001', NULL, 'e3000000-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'finance_member', NULL, NULL, NULL);

ALTER TABLE public.properties DISABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.properties (id, organization_id, branch_id, name, code, property_type)
VALUES
  ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'A One Property', 'A1-P', 'apartment'),
  ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'A Two Property', 'A2-P', 'apartment'),
  ('a5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', 'A Inactive Property', 'A3-P', 'apartment'),
  ('c5000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'C Property', 'C-P', 'apartment'),
  ('d5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'D Property', 'D-P', 'apartment'),
  ('e5000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'E Property', 'E-P', 'apartment');
ALTER TABLE public.properties ENABLE TRIGGER properties_guard_branch_scope;

UPDATE public.organization_authorization_states
SET ordinary_access_enabled = true
WHERE organization_id IN (
  'a1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001'
);

ALTER TABLE public.properties DISABLE TRIGGER properties_guard_branch_scope;
INSERT INTO public.properties (id, organization_id, branch_id, name, code, property_type)
VALUES ('a5000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', NULL, 'A Unresolved Property', 'A0-P', 'apartment');
ALTER TABLE public.properties ENABLE TRIGGER properties_guard_branch_scope;

UPDATE public.organization_branches
SET status = 'inactive'
WHERE id IN ('a2000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-000000000001');

ALTER TABLE public.organization_roles DISABLE TRIGGER organization_roles_prevent_assigned_archival;
UPDATE public.organization_roles
SET status = 'archived', archived_at = now()
WHERE id = 'd3000000-0000-0000-0000-000000000001';
ALTER TABLE public.organization_roles ENABLE TRIGGER organization_roles_prevent_assigned_archival;

INSERT INTO public.units (id, organization_id, property_id, unit_number)
VALUES
  ('a6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'A1-U'),
  ('a6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', 'A2-U'),
  ('a6000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000004', 'A0-U');

INSERT INTO public.asset_photos (id, organization_id, property_id, unit_id, file_name, storage_path, mime_type, size_bytes)
VALUES
  ('a7000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a1.jpg', 'domain/a1.jpg', 'image/jpeg', 10),
  ('a7000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000002', 'a2.jpg', 'domain/a2.jpg', 'image/jpeg', 10),
  ('a7000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000004', 'a6000000-0000-0000-0000-000000000003', 'a0.jpg', 'domain/a0.jpg', 'image/jpeg', 10),
  ('a7000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'conflict.jpg', 'domain/conflict.jpg', 'image/jpeg', 10);

INSERT INTO public.property_owners (organization_id, property_id, person_id, ownership_percent, is_primary, started_on)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000002', 100, true, current_date),
  ('a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000011', 100, true, current_date);

INSERT INTO public.person_roles (organization_id, person_id, role)
SELECT
  'a1000000-0000-0000-0000-000000000001',
  id,
  CASE
    WHEN id = 'a4000000-0000-0000-0000-000000000002'::uuid THEN 'owner'
    WHEN id IN (
      'a4000000-0000-0000-0000-000000000006'::uuid,
      'a4000000-0000-0000-0000-000000000008'::uuid
    ) THEN 'vendor'
    WHEN id IN (
      'a4000000-0000-0000-0000-000000000007'::uuid,
      'a4000000-0000-0000-0000-000000000009'::uuid
    ) THEN 'staff'
    ELSE 'tenant'
  END
FROM public.people
WHERE organization_id = 'a1000000-0000-0000-0000-000000000001';

INSERT INTO public.leases (id, organization_id, property_id, unit_id, primary_tenant_person_id)
VALUES ('a8000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000003');

ALTER TABLE public.lease_parties DISABLE TRIGGER guard_lease_party_history_mutation;
INSERT INTO public.lease_parties (organization_id, lease_id, person_id, party_role, business_lifecycle, ended_on_kind)
VALUES ('a1000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000004', 'co_tenant', 'effective', 'open_current');
ALTER TABLE public.lease_parties ENABLE TRIGGER guard_lease_party_history_mutation;

ALTER TABLE public.lease_occupancies DISABLE TRIGGER guard_lease_occupancy_history_mutation;
INSERT INTO public.lease_occupancies (organization_id, lease_id, property_id, unit_id, status, business_lifecycle, actual_move_out_kind)
VALUES ('a1000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'occupied', 'occupied', 'open_current');
ALTER TABLE public.lease_occupancies ENABLE TRIGGER guard_lease_occupancy_history_mutation;

INSERT INTO public.tenant_requests (id, organization_id, property_id, unit_id, title, requested_by_person_id)
VALUES
  ('a9000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'Visible request', 'a4000000-0000-0000-0000-000000000005'),
  ('a9000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'Task request', NULL),
  ('a9000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000002', 'Other-branch task request', NULL);

ALTER TABLE public.tasks DISABLE TRIGGER validate_tasks_scope;
INSERT INTO public.tasks (organization_id, tenant_request_id, property_id, unit_id, branch_id, title, vendor_person_id, assignee_person_id)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Visible task', 'a4000000-0000-0000-0000-000000000006', 'a4000000-0000-0000-0000-000000000007'),
  ('a1000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'Other-branch task', 'a4000000-0000-0000-0000-000000000012', NULL);
ALTER TABLE public.tasks ENABLE TRIGGER validate_tasks_scope;

INSERT INTO public.maintenance_recurrence_series (id, organization_id, branch_id, property_id, unit_id, created_by)
VALUES ('aa000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

INSERT INTO public.maintenance_recurrence_revisions (organization_id, series_id, revision_number, frequency, timezone, next_occurrence_at, title, category, priority, vendor_person_id, assignee_person_id, effective_from, created_by)
VALUES ('a1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 1, 'monthly', 'UTC', now() + interval '1 month', 'Visible recurrence', 'General', 'normal', 'a4000000-0000-0000-0000-000000000008', 'a4000000-0000-0000-0000-000000000009', now(), 'a0000000-0000-0000-0000-000000000001');

INSERT INTO public.organization_invitations (organization_id, email, role, branch_id, custom_role_id, invited_by)
VALUES ('a1000000-0000-0000-0000-000000000001', 'domain-invite@example.test', 'custom', 'a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

INSERT INTO public.organization_teams (organization_id, branch_id, name)
VALUES ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Domain Team');

SELECT has_function('app_private', 'has_org_permission', ARRAY['uuid', 'organization_permission_key'], 'permission helper exists');
SELECT has_function('app_private', 'current_active_branch_id', ARRAY['uuid'], 'current active branch helper exists');
SELECT has_function('app_private', 'can_access_branch', ARRAY['uuid', 'uuid'], 'branch access helper exists');
SELECT has_function('app_private', 'property_branch_id', ARRAY['uuid', 'uuid'], 'Property branch helper exists');
SELECT has_function('app_private', 'can_access_property', ARRAY['uuid', 'uuid', 'organization_permission_key'], 'Property access helper exists');
SELECT has_function('app_private', 'person_is_visible_in_branch', ARRAY['uuid', 'uuid', 'uuid'], 'Person relationship helper exists');

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app_private'
      AND p.proname IN ('has_org_permission', 'current_active_branch_id', 'can_access_branch', 'property_branch_id', 'can_access_property', 'person_is_visible_in_branch')
      AND (NOT p.prosecdef OR p.provolatile <> 's' OR NOT ('search_path=""' = ANY (coalesce(p.proconfig, '{}'::text[]))))
  ),
  'authorization helpers are stable security definers with empty search paths'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app_private'
      AND p.proname IN ('has_org_permission', 'current_active_branch_id', 'can_access_branch', 'property_branch_id', 'can_access_property', 'person_is_visible_in_branch')
      AND (
        EXISTS (
          SELECT 1
          FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS privilege
          WHERE privilege.grantee = 0
            AND privilege.privilege_type = 'EXECUTE'
        )
        OR has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('service_role', p.oid, 'EXECUTE')
        OR (p.proname <> 'property_branch_id' AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))
        OR (p.proname = 'property_branch_id' AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      )
  ),
  'helper ACLs expose only the RLS-safe authenticated entry points'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('properties','units','people','person_roles','asset_photos','organizations','organization_branches','organization_members','organization_invitations','organization_teams')
      AND policyname IN ('Members can read properties','Members can read units','Members can read people','Members can read person roles','Members can read asset photos','Members can read organizations','Members can read branches','Members can read organization memberships','Members can read teams')
  ),
  'broad fixed-role member read policies are removed'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('properties','units','people','person_roles','asset_photos','organizations','organization_branches','organization_members','organization_invitations','organization_teams')
      AND cmd = 'SELECT'
      AND NOT ('authenticated' = ANY (roles))
  ),
  'every core SELECT policy explicitly targets authenticated callers'
);

SELECT ok(
  to_regclass('public.maintenance_recurrence_revisions_org_vendor_idx') IS NOT NULL
  AND to_regclass('public.maintenance_recurrence_revisions_org_assignee_idx') IS NOT NULL
  AND to_regclass('public.maintenance_recurrence_series_org_scope_idx') IS NOT NULL
  AND to_regclass('public.tenant_requests_org_requester_idx') IS NOT NULL,
  'Person relationship predicates have supporting composite indexes'
);

-- Helper behavior runs through dynamic SQL so the RED suite reports missing
-- functions instead of aborting before the raw RLS failures are counted.
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;

SELECT is(pg_temp.eval_boolean($$SELECT app_private.has_org_permission('a1000000-0000-0000-0000-000000000001','properties.view')$$), true, 'ordinary user has an explicitly granted permission');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.has_org_permission('a1000000-0000-0000-0000-000000000001','finance.view')$$), false, 'ordinary user lacks an ungranted permission');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.has_org_permission('b1000000-0000-0000-0000-000000000001','properties.view')$$), false, 'permission helper rejects cross-organization identifiers');
SELECT is(pg_temp.eval_uuid($$SELECT app_private.current_active_branch_id('a1000000-0000-0000-0000-000000000001')$$), 'a2000000-0000-0000-0000-000000000001'::uuid, 'ordinary user resolves exactly one active branch');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.can_access_branch('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001')$$), true, 'ordinary user can access the assigned branch');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.can_access_branch('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002')$$), false, 'ordinary user cannot access another active branch');
RESET ROLE;
SELECT is(pg_temp.eval_uuid($$SELECT app_private.property_branch_id('a1000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001')$$), 'a2000000-0000-0000-0000-000000000001'::uuid, 'resolved Property returns its active branch');
SELECT is(pg_temp.eval_uuid($$SELECT app_private.property_branch_id('a1000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000004')$$), NULL::uuid, 'unresolved Property has no ordinary branch truth');
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.eval_boolean($$SELECT app_private.can_access_property('a1000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000001','properties.view')$$), true, 'same-branch Property with permission is accessible');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.can_access_property('a1000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000002','properties.view')$$), false, 'other-branch Property remains inaccessible with the same permission');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.can_access_property('a1000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000004','properties.view')$$), false, 'unresolved Property remains inaccessible to ordinary users');

SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001')$$), true, 'active ownership makes Person identity visible in branch');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000001')$$), true, 'active primary lease relationship makes Person identity visible');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000001')$$), true, 'active lease party and occupancy make Person identity visible');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000005','a2000000-0000-0000-0000-000000000001')$$), true, 'active tenant request makes requester identity visible');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000006','a2000000-0000-0000-0000-000000000001')$$), true, 'same-branch task makes vendor identity visible');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000007','a2000000-0000-0000-0000-000000000001')$$), true, 'same-branch task makes assignee identity visible');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000008','a2000000-0000-0000-0000-000000000001')$$), true, 'current recurrence makes vendor identity visible');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000009','a2000000-0000-0000-0000-000000000001')$$), true, 'current recurrence makes assignee identity visible');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001')$$), true, 'caller own membership Person is visible');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000010','a2000000-0000-0000-0000-000000000001')$$), false, 'unrelated Person identity remains hidden');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000011','a2000000-0000-0000-0000-000000000001')$$), false, 'other-branch Person relationship remains hidden');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000012','a2000000-0000-0000-0000-000000000001')$$), false, 'conflicting task branch and Property branch never guesses Person scope');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.person_is_visible_in_branch('b1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001')$$), false, 'Person helper rejects cross-organization inputs');

SELECT results_eq($$SELECT id FROM public.properties ORDER BY id$$, $$VALUES ('a5000000-0000-0000-0000-000000000001'::uuid)$$, 'ordinary raw Property read is one branch only');
SELECT results_eq($$SELECT id FROM public.units ORDER BY id$$, $$VALUES ('a6000000-0000-0000-0000-000000000001'::uuid)$$, 'ordinary raw Unit read inherits one branch');
SELECT results_eq($$SELECT id FROM public.asset_photos ORDER BY id$$, $$VALUES ('a7000000-0000-0000-0000-000000000001'::uuid)$$, 'ordinary raw asset read inherits one branch');
SELECT results_eq($$SELECT id FROM public.organizations ORDER BY id$$, $$VALUES ('a1000000-0000-0000-0000-000000000001'::uuid)$$, 'ordinary raw organization read exposes only own organization');
SELECT results_eq($$SELECT id FROM public.organization_branches ORDER BY id$$, $$VALUES ('a2000000-0000-0000-0000-000000000001'::uuid)$$, 'ordinary raw branch read exposes only assigned branch');
SELECT results_eq($$SELECT user_id FROM public.organization_members ORDER BY user_id$$, $$VALUES ('a0000000-0000-0000-0000-000000000002'::uuid)$$, 'ordinary raw membership read exposes only self');
SELECT is_empty($$SELECT id FROM public.organization_invitations$$, 'ordinary raw invitation read is denied');
SELECT is_empty($$SELECT id FROM public.organization_teams$$, 'ordinary raw team read is denied');
SELECT results_eq(
  $$SELECT id FROM public.people ORDER BY id$$,
  $$VALUES
    ('a4000000-0000-0000-0000-000000000001'::uuid),
    ('a4000000-0000-0000-0000-000000000002'::uuid),
    ('a4000000-0000-0000-0000-000000000003'::uuid),
    ('a4000000-0000-0000-0000-000000000004'::uuid),
    ('a4000000-0000-0000-0000-000000000005'::uuid),
    ('a4000000-0000-0000-0000-000000000006'::uuid),
    ('a4000000-0000-0000-0000-000000000007'::uuid),
    ('a4000000-0000-0000-0000-000000000008'::uuid),
    ('a4000000-0000-0000-0000-000000000009'::uuid)$$,
  'ordinary raw Person read exposes only deterministic same-branch identities'
);
SELECT results_eq(
  $$SELECT person_id FROM public.person_roles ORDER BY person_id$$,
  $$VALUES
    ('a4000000-0000-0000-0000-000000000001'::uuid),
    ('a4000000-0000-0000-0000-000000000002'::uuid),
    ('a4000000-0000-0000-0000-000000000003'::uuid),
    ('a4000000-0000-0000-0000-000000000004'::uuid),
    ('a4000000-0000-0000-0000-000000000005'::uuid),
    ('a4000000-0000-0000-0000-000000000006'::uuid),
    ('a4000000-0000-0000-0000-000000000007'::uuid),
    ('a4000000-0000-0000-0000-000000000008'::uuid),
    ('a4000000-0000-0000-0000-000000000009'::uuid)$$,
  'ordinary raw Person role read follows visible identities only'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT is_empty($$SELECT id FROM public.properties$$, 'same branch without Properties permission reads no Properties');
SELECT is_empty($$SELECT id FROM public.units$$, 'same branch without Properties permission reads no Units');
SELECT is_empty($$SELECT id FROM public.asset_photos$$, 'same branch without Properties permission reads no assets');
SELECT ok(EXISTS (SELECT 1 FROM public.people WHERE id = 'a4000000-0000-0000-0000-000000000002'), 'People permission independently exposes same-branch identities');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
SET LOCAL ROLE authenticated;
SELECT is_empty($$SELECT id FROM public.people$$, 'same branch without People permission reads no People');
SELECT is_empty($$SELECT id FROM public.person_roles$$, 'same branch without People permission reads no Person roles');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.eval_boolean($$SELECT app_private.has_org_permission('a1000000-0000-0000-0000-000000000001','finance.publish')$$), true, 'Super Admin bypasses permission keys inside own organization');
SELECT is(pg_temp.eval_boolean($$SELECT app_private.can_access_property('a1000000-0000-0000-0000-000000000001','a5000000-0000-0000-0000-000000000004','properties.view')$$), true, 'Super Admin sees unresolved Property inside own organization');
SELECT is((SELECT count(*) FROM public.properties), 4::bigint, 'Super Admin reads every own-organization Property including unresolved scope');
SELECT is((SELECT count(*) FROM public.units), 3::bigint, 'Super Admin reads every own-organization Unit');
SELECT is((SELECT count(*) FROM public.asset_photos), 4::bigint, 'Super Admin reads every own-organization asset including conflicting scope');
SELECT is((SELECT count(*) FROM public.people), 12::bigint, 'Super Admin reads complete own-organization Person identity');
SELECT is((SELECT count(*) FROM public.person_roles), 12::bigint, 'Super Admin reads complete own-organization Person roles');
SELECT results_eq($$SELECT id FROM public.organizations$$, $$VALUES ('a1000000-0000-0000-0000-000000000001'::uuid)$$, 'Super Admin cannot cross organizations');
SELECT is((SELECT count(*) FROM public.organization_branches), 3::bigint, 'Super Admin reads all own-organization branches');
SELECT is((SELECT count(*) FROM public.organization_members), 4::bigint, 'Super Admin reads all own-organization memberships');
SELECT is((SELECT count(*) FROM public.organization_invitations), 1::bigint, 'Super Admin reads own-organization invitations');
SELECT is((SELECT count(*) FROM public.organization_teams), 1::bigint, 'Super Admin reads own-organization teams');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT is(pg_temp.eval_boolean($$SELECT app_private.has_org_permission('f1000000-0000-0000-0000-000000000001','properties.view')$$), false, 'legacy ordinary role never maps implicitly to a permission');
SELECT is_empty($$SELECT id FROM public.organizations$$, 'legacy ordinary role reads no organization data while contained');
SELECT is_empty($$SELECT id FROM public.properties$$, 'legacy ordinary role reads no Properties while contained');
SELECT is_empty($$SELECT id FROM public.people$$, 'legacy ordinary role reads no People while contained');
SELECT is_empty($$SELECT id FROM public.organization_members$$, 'legacy ordinary role cannot even use self-read before transition');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT is_empty($$SELECT id FROM public.organizations$$, 'disabled ordinary authorization state denies all raw access');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT is_empty($$SELECT id FROM public.organizations$$, 'archived assigned role denies all raw access');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT is_empty($$SELECT id FROM public.organizations$$, 'inactive assigned branch denies all raw access');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT id FROM public.properties', '42501', NULL, 'anon has no raw core-table read grant');
RESET ROLE;

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_views v
    JOIN pg_class c ON c.relname = v.viewname
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.schemaname
    WHERE v.schemaname = 'public'
      AND has_table_privilege('authenticated', c.oid, 'SELECT')
      AND NOT coalesce((c.reloptions @> ARRAY['security_invoker=true']), false)
  ),
  'authenticated public views remain security invoker'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('properties','units','people','person_roles','asset_photos','organizations','organization_branches','organization_members','organization_invitations','organization_teams')
      AND grantee = 'anon'
  )
  AND NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['properties','units','people','person_roles','asset_photos','organizations','organization_branches','organization_members','organization_invitations','organization_teams']) AS expected(table_name)
    WHERE NOT has_table_privilege('authenticated', format('public.%I', expected.table_name), 'SELECT')
  ),
  'core Data API reads are explicitly authenticated-only'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app_private'
      AND p.proname IN ('has_org_permission', 'current_active_branch_id', 'can_access_branch', 'property_branch_id', 'can_access_property', 'person_is_visible_in_branch')
      AND lower(pg_get_functiondef(p.oid)) ~ '(auth\\.jwt|user_metadata|raw_user_meta_data)'
  ),
  'database authorization truth does not use mutable or stale JWT claims'
);

SELECT * FROM finish();
ROLLBACK;
