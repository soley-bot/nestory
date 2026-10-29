BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,extensions;
SELECT plan(17);

-- The authority fixture below is copied from custom_role_domain_authority_test
-- so every existing ownership/lease/occupancy/request/task/recurrence path is
-- represented. It is rollback-only and uses the actual production helpers/RLS.
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



-- Exact released wrapper from 20260822045638, independently pinned below.
CREATE OR REPLACE FUNCTION pg_temp.person_visibility_before(p_organization_id uuid, p_person_id uuid, p_branch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    app_private.person_is_visible_in_branch_without_explicit_relationship($1,$2,$3)
    OR (
      app_private.has_org_permission(
        $1,
        'people.view'::public.organization_permission_key
      )
      AND app_private.current_active_branch_id($1) = $3
      AND EXISTS (
        SELECT 1
        FROM public.people AS person
        JOIN public.person_branch_relationships AS relationship
          ON relationship.organization_id = person.organization_id
         AND relationship.person_id = person.id
         AND relationship.branch_id = $3
         AND relationship.archived_at IS NULL
        WHERE person.organization_id = $1
          AND person.id = $2
      )
    );
$function$
;
SELECT is(encode(extensions.digest(regexp_replace(
  pg_get_functiondef('pg_temp.person_visibility_before(uuid,uuid,uuid)'::regprocedure),
  '^CREATE OR REPLACE FUNCTION [^(]+',
  'CREATE OR REPLACE FUNCTION app_private.person_is_visible_in_branch'
),'sha256'),'hex'),'5d27afcb41d61198a281f03f291195a79b1b32950ca6980c3d2baba1cd835d42',
 'differential oracle is the exact pinned original wrapper');

CREATE OR REPLACE FUNCTION pg_temp.person_visibility_before_inner(p_organization_id uuid, p_person_id uuid, p_branch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.people AS person
      WHERE person.organization_id = p_organization_id
        AND person.id = p_person_id
    )
    AND app_private.has_org_permission(
      p_organization_id,
      'people.view'::public.organization_permission_key
    )
    AND app_private.current_active_branch_id(p_organization_id) = p_branch_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = p_organization_id
          AND member.user_id = (SELECT auth.uid())
          AND member.role = 'custom'
          AND member.branch_id = p_branch_id
          AND member.person_id = p_person_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.property_owners AS owner_link
        WHERE owner_link.organization_id = p_organization_id
          AND owner_link.person_id = p_person_id
          AND owner_link.archived_at IS NULL
          AND owner_link.started_on <= current_date
          AND (owner_link.ended_on IS NULL OR owner_link.ended_on > current_date)
          AND app_private.property_branch_id(
            owner_link.organization_id,
            owner_link.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.leases AS lease
        WHERE lease.organization_id = p_organization_id
          AND lease.primary_tenant_person_id = p_person_id
          AND lease.archived_at IS NULL
          AND lease.status IN ('draft', 'active', 'notice_given')
          AND app_private.property_branch_id(
            lease.organization_id,
            lease.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.lease_parties AS party
        JOIN public.leases AS lease
          ON lease.organization_id = party.organization_id
         AND lease.id = party.lease_id
         AND lease.archived_at IS NULL
         AND lease.status IN ('draft', 'active', 'notice_given')
        WHERE party.organization_id = p_organization_id
          AND party.person_id = p_person_id
          AND party.archived_at IS NULL
          AND party.evidence_state = 'accepted'
          AND party.business_lifecycle IN ('planned', 'effective')
          AND (party.ended_on IS NULL OR party.ended_on >= current_date)
          AND app_private.property_branch_id(
            lease.organization_id,
            lease.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.lease_parties AS party
        JOIN public.lease_occupancies AS occupancy
          ON occupancy.organization_id = party.organization_id
         AND occupancy.lease_id = party.lease_id
         AND occupancy.archived_at IS NULL
         AND occupancy.evidence_state = 'accepted'
         AND occupancy.business_lifecycle IN ('reserved', 'occupied', 'notice_given')
        WHERE party.organization_id = p_organization_id
          AND party.person_id = p_person_id
          AND party.archived_at IS NULL
          AND party.evidence_state = 'accepted'
          AND party.business_lifecycle IN ('planned', 'effective')
          AND app_private.property_branch_id(
            occupancy.organization_id,
            occupancy.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.tenant_requests AS request
        WHERE request.organization_id = p_organization_id
          AND request.requested_by_person_id = p_person_id
          AND request.archived_at IS NULL
          AND app_private.property_branch_id(
            request.organization_id,
            request.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.tasks AS task
        WHERE task.organization_id = p_organization_id
          AND p_person_id IN (task.vendor_person_id, task.assignee_person_id)
          AND task.archived_at IS NULL
          AND task.branch_id = p_branch_id
          AND app_private.property_branch_id(
            task.organization_id,
            task.property_id
          ) = p_branch_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.maintenance_recurrence_revisions AS revision
        JOIN public.maintenance_recurrence_series AS series
          ON series.organization_id = revision.organization_id
         AND series.id = revision.series_id
        WHERE revision.organization_id = p_organization_id
          AND p_person_id IN (
            revision.vendor_person_id,
            revision.assignee_person_id
          )
          AND revision.superseded_at IS NULL
          AND series.lifecycle IN ('active', 'paused')
          AND series.retired_at IS NULL
          AND series.branch_id = p_branch_id
          AND app_private.property_branch_id(
            series.organization_id,
            series.property_id
          ) = p_branch_id
      )
    );
$function$
;
SELECT is(encode(extensions.digest(regexp_replace(
 pg_get_functiondef('pg_temp.person_visibility_before_inner(uuid,uuid,uuid)'::regprocedure),
 '^CREATE OR REPLACE FUNCTION [^(]+',
 'CREATE OR REPLACE FUNCTION app_private.person_is_visible_in_branch_without_explicit_relationship'
),'sha256'),'hex'),'165ad014bc3aa88c7cb18463ecbe53f03aab2cd6571d5c8991224da7e0631c82',
 'relationship resolver oracle is the exact pinned released definition');

INSERT INTO public.people(id,organization_id,display_name,archived_at) VALUES
 ('a4000000-0000-0000-0000-000000000014','a1000000-0000-0000-0000-000000000001','Archived explicit identity',now()),
 ('a4000000-0000-0000-0000-000000000015','a1000000-0000-0000-0000-000000000001','Archived explicit relationship',null),
 ('a4000000-0000-0000-0000-000000000016','a1000000-0000-0000-0000-000000000001','Active explicit relationship',null);
INSERT INTO public.person_branch_relationships(organization_id,person_id,branch_id,archived_at) VALUES
 ('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000014','a2000000-0000-0000-0000-000000000001',null),
 ('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000015','a2000000-0000-0000-0000-000000000001',now()),
 ('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000016','a2000000-0000-0000-0000-000000000001',null);

CREATE TEMP TABLE person_visibility_inputs AS
 SELECT organization_id, person_id, branch_id
 FROM (VALUES ('a1000000-0000-0000-0000-000000000001'::uuid),
              ('b1000000-0000-0000-0000-000000000001'::uuid),
              ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid), (null::uuid)) org(organization_id)
 CROSS JOIN (SELECT id person_id FROM public.people UNION ALL SELECT null::uuid
             UNION ALL SELECT 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid) people
 CROSS JOIN (SELECT id branch_id FROM public.organization_branches UNION ALL SELECT null::uuid
             UNION ALL SELECT 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid) branches;
GRANT SELECT ON person_visibility_inputs TO authenticated;

CREATE FUNCTION pg_temp.person_visibility_equivalent(p_actor uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result boolean;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
  SELECT bool_and((pg_temp.person_visibility_before(organization_id,person_id,branch_id)
    IS NOT DISTINCT FROM app_private.person_is_visible_in_branch(organization_id,person_id,branch_id))
    AND (pg_temp.person_visibility_before_inner(organization_id,person_id,branch_id)
    IS NOT DISTINCT FROM app_private.person_is_visible_in_branch_without_explicit_relationship(organization_id,person_id,branch_id)))
  INTO result FROM pg_temp.person_visibility_inputs;
  RETURN result;
END $$;

SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.person_visibility_equivalent('a0000000-0000-0000-0000-000000000001'),'Super Admin old/new truth agrees including NULL branch');
SELECT ok(pg_temp.person_visibility_equivalent('a0000000-0000-0000-0000-000000000002'),'active custom role old/new truth agrees for all relationship paths');
SELECT ok(pg_temp.person_visibility_equivalent('a0000000-0000-0000-0000-000000000003'),'people-only custom role old/new truth agrees');
SELECT ok(pg_temp.person_visibility_equivalent('a0000000-0000-0000-0000-000000000004'),'custom role without people permission old/new truth agrees');
SELECT ok(pg_temp.person_visibility_equivalent('b0000000-0000-0000-0000-000000000001'),'foreign organization admin old/new truth agrees');
SELECT ok(pg_temp.person_visibility_equivalent('c0000000-0000-0000-0000-000000000001'),'disabled ordinary access old/new truth agrees');
SELECT ok(pg_temp.person_visibility_equivalent('d0000000-0000-0000-0000-000000000001'),'archived custom role old/new truth agrees');
SELECT ok(pg_temp.person_visibility_equivalent('e0000000-0000-0000-0000-000000000001'),'inactive assigned branch old/new truth agrees');
SELECT ok(pg_temp.person_visibility_equivalent('f0000000-0000-0000-0000-000000000001'),'legacy organization-wide finance role old/new truth agrees');
SELECT ok(pg_temp.person_visibility_equivalent(null),'unauthenticated actor old/new truth agrees');
SELECT ok(pg_temp.person_visibility_equivalent('ffffffff-ffff-ffff-ffff-ffffffffffff'),'outsider old/new truth agrees');
SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',true);
SELECT is(app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000016','a2000000-0000-0000-0000-000000000001'),true,'active explicit relationship stays visible');
SELECT is(app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000015','a2000000-0000-0000-0000-000000000001'),false,'archived explicit relationship stays hidden');
SELECT is(app_private.person_is_visible_in_branch('a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000016',null),false,'NULL branch is exactly false rather than unknown');
RESET ROLE;
SELECT ok((SELECT prosecdef AND provolatile='s' AND proconfig @> ARRAY['search_path=""']
 AND has_function_privilege('authenticated',oid,'EXECUTE')
 AND NOT has_function_privilege('anon',oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',oid,'EXECUTE')
 AND NOT EXISTS (SELECT 1 FROM aclexplode(proacl) WHERE grantee=0)
 FROM pg_proc WHERE oid='app_private.person_is_visible_in_branch(uuid,uuid,uuid)'::regprocedure),
 'existing private definer and authenticated-only ACL remain unchanged');
SELECT * FROM finish();
ROLLBACK;
