BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.canonical_definition(p_signature regprocedure) RETURNS text
LANGUAGE sql SET search_path='' AS $$ SELECT pg_catalog.pg_get_functiondef(p_signature) $$;
-- Reuse the full domain-authority synthetic relationships and actor states.
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



-- Exact pre-cache helper body; nested helpers deliberately stay canonical so
-- each expression is compared independently in the same authorization state.
CREATE OR REPLACE FUNCTION pg_temp.before_can_access_property(p_organization_id uuid, p_property_id uuid, p_permission_key public.organization_permission_key)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(
    app_private.is_super_admin(p_organization_id)
    OR (
      p_property_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.properties AS property
        WHERE property.organization_id=p_organization_id
          AND property.id=p_property_id
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.organization_authorization_states AS authorization_state
          WHERE authorization_state.organization_id=p_organization_id
            AND NOT authorization_state.ordinary_access_enabled
        )
        OR app_private.current_active_branch_id(p_organization_id)
          =app_private.property_branch_id(p_organization_id,p_property_id)
      )
      AND app_private.has_org_permission(
        p_organization_id,p_permission_key
      )
    ),
    false
  );
$function$
;
SELECT extensions.is(pg_catalog.encode(extensions.digest(pg_catalog.regexp_replace(
 pg_temp.canonical_definition('pg_temp.before_can_access_property(uuid,uuid,public.organization_permission_key)'::regprocedure),
 '^CREATE OR REPLACE FUNCTION [^(]+','CREATE OR REPLACE FUNCTION app_private.can_access_property'
),'sha256'),'hex'),'e5290b64f0400d682547f1257a2a6ff751a7e2889adbe0ed50c6aad72eedf7f4','can_access_property oracle matches pinned released definition');

-- Exact pre-cache helper body; nested helpers deliberately stay canonical so
-- each expression is compared independently in the same authorization state.
CREATE OR REPLACE FUNCTION pg_temp.before_current_active_branch_id(p_organization_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT member.branch_id
  FROM public.organization_members AS member
  JOIN public.organization_authorization_states AS authorization_state
    ON authorization_state.organization_id = member.organization_id
   AND authorization_state.ordinary_access_enabled
  JOIN public.organization_branches AS branch
    ON branch.organization_id = member.organization_id
   AND branch.id = member.branch_id
   AND branch.status = 'active'
   AND branch.archived_at IS NULL
  JOIN public.organization_roles AS role_record
    ON role_record.organization_id = member.organization_id
   AND role_record.id = member.custom_role_id
   AND role_record.status = 'active'
   AND role_record.archived_at IS NULL
  WHERE member.organization_id = p_organization_id
    AND member.user_id = (SELECT auth.uid())
    AND member.role = 'custom'
    AND member.branch_id IS NOT NULL
    AND member.custom_role_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_role_permissions AS permission_record
      WHERE permission_record.organization_id = role_record.organization_id
        AND permission_record.role_id = role_record.id
    )
  LIMIT 1;
$function$
;
SELECT extensions.is(pg_catalog.encode(extensions.digest(pg_catalog.regexp_replace(
 pg_temp.canonical_definition('pg_temp.before_current_active_branch_id(uuid)'::regprocedure),
 '^CREATE OR REPLACE FUNCTION [^(]+','CREATE OR REPLACE FUNCTION app_private.current_active_branch_id'
),'sha256'),'hex'),'35ad393db1ddbc5ec88e75f2fd4e1f2aace5fb51b406e6eac9d0f89125f59eaf','current_active_branch_id oracle matches pinned released definition');

-- Exact pre-cache helper body; nested helpers deliberately stay canonical so
-- each expression is compared independently in the same authorization state.
CREATE OR REPLACE FUNCTION pg_temp.before_current_workspace_role(target_organization_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT membership.role
  FROM public.organization_members AS membership
  WHERE membership.organization_id = target_organization_id
    AND membership.user_id = (SELECT auth.uid())
    AND (
      (
        membership.role IN ('super_admin', 'finance_manager', 'finance_member')
        AND membership.branch_id IS NULL
        AND membership.person_id IS NULL
      )
      OR (
        membership.role IN ('operations_manager', 'operations_member')
        AND membership.branch_id IS NOT NULL
        AND membership.person_id IS NOT NULL
      )
    )
  LIMIT 1;
$function$
;
SELECT extensions.is(pg_catalog.encode(extensions.digest(pg_catalog.regexp_replace(
 pg_temp.canonical_definition('pg_temp.before_current_workspace_role(uuid)'::regprocedure),
 '^CREATE OR REPLACE FUNCTION [^(]+','CREATE OR REPLACE FUNCTION app_private.current_workspace_role'
),'sha256'),'hex'),'64655fe523c72a9fd769b42783b9130c95e4d819c0242447b0e183469261d4ea','current_workspace_role oracle matches pinned released definition');

-- Exact pre-cache helper body; nested helpers deliberately stay canonical so
-- each expression is compared independently in the same authorization state.
CREATE OR REPLACE FUNCTION pg_temp.before_has_org_permission(p_organization_id uuid, p_permission_key public.organization_permission_key)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    app_private.is_super_admin(p_organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.organization_authorization_states AS authorization_state
        ON authorization_state.organization_id=member.organization_id
       AND authorization_state.ordinary_access_enabled
      JOIN public.organization_branches AS branch
        ON branch.organization_id=member.organization_id
       AND branch.id=member.branch_id
       AND branch.status='active'
       AND branch.archived_at IS NULL
      JOIN public.organization_roles AS role_record
        ON role_record.organization_id=member.organization_id
       AND role_record.id=member.custom_role_id
       AND role_record.status='active'
       AND role_record.archived_at IS NULL
      JOIN public.organization_role_permissions AS permission_record
        ON permission_record.organization_id=role_record.organization_id
       AND permission_record.role_id=role_record.id
       AND permission_record.permission_key=p_permission_key
      WHERE member.organization_id=p_organization_id
        AND member.user_id=(SELECT auth.uid())
        AND member.role='custom'
        AND member.branch_id IS NOT NULL
        AND member.custom_role_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS member
      JOIN public.organization_authorization_states AS authorization_state
        ON authorization_state.organization_id=member.organization_id
       AND NOT authorization_state.ordinary_access_enabled
      WHERE member.organization_id=p_organization_id
        AND member.user_id=(SELECT auth.uid())
        AND member.role IN (
          'finance_manager','finance_member',
          'operations_manager','operations_member'
        )
        AND app_private.legacy_role_has_permission(
          member.role,p_permission_key
        )
    );
$function$
;
SELECT extensions.is(pg_catalog.encode(extensions.digest(pg_catalog.regexp_replace(
 pg_temp.canonical_definition('pg_temp.before_has_org_permission(uuid,public.organization_permission_key)'::regprocedure),
 '^CREATE OR REPLACE FUNCTION [^(]+','CREATE OR REPLACE FUNCTION app_private.has_org_permission'
),'sha256'),'hex'),'57f148d42a59923dae55a78c1168c21d1bedf9bf5492a5ba5eac9128ff4166ad','has_org_permission oracle matches pinned released definition');

-- Exact pre-cache helper body; nested helpers deliberately stay canonical so
-- each expression is compared independently in the same authorization state.
CREATE OR REPLACE FUNCTION pg_temp.before_is_org_admin(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT app_private.is_super_admin(target_organization_id);
$function$
;
SELECT extensions.is(pg_catalog.encode(extensions.digest(pg_catalog.regexp_replace(
 pg_temp.canonical_definition('pg_temp.before_is_org_admin(uuid)'::regprocedure),
 '^CREATE OR REPLACE FUNCTION [^(]+','CREATE OR REPLACE FUNCTION app_private.is_org_admin'
),'sha256'),'hex'),'f72ceff8f2c6cade04fd419e5b69edd38053b70983b1cfcdac90001a8bd59416','is_org_admin oracle matches pinned released definition');

-- Exact pre-cache helper body; nested helpers deliberately stay canonical so
-- each expression is compared independently in the same authorization state.
CREATE OR REPLACE FUNCTION pg_temp.before_is_super_admin(target_organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(
    app_private.current_workspace_role(target_organization_id) = 'super_admin',
    false
  );
$function$
;
SELECT extensions.is(pg_catalog.encode(extensions.digest(pg_catalog.regexp_replace(
 pg_temp.canonical_definition('pg_temp.before_is_super_admin(uuid)'::regprocedure),
 '^CREATE OR REPLACE FUNCTION [^(]+','CREATE OR REPLACE FUNCTION app_private.is_super_admin'
),'sha256'),'hex'),'488bb5dc8355c43170d3dc96b779dc705ad097405d0390b6cdfaa500a5218089','is_super_admin oracle matches pinned released definition');

-- Exact pre-cache helper body; nested helpers deliberately stay canonical so
-- each expression is compared independently in the same authorization state.
CREATE OR REPLACE FUNCTION pg_temp.before_property_branch_id(p_organization_id uuid, p_property_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT property.branch_id
  FROM public.properties AS property
  JOIN public.organization_branches AS branch
    ON branch.organization_id = property.organization_id
   AND branch.id = property.branch_id
   AND branch.status = 'active'
   AND branch.archived_at IS NULL
  WHERE property.organization_id = p_organization_id
    AND property.id = p_property_id
  LIMIT 1;
$function$
;
SELECT extensions.is(pg_catalog.encode(extensions.digest(pg_catalog.regexp_replace(
 pg_temp.canonical_definition('pg_temp.before_property_branch_id(uuid,uuid)'::regprocedure),
 '^CREATE OR REPLACE FUNCTION [^(]+','CREATE OR REPLACE FUNCTION app_private.property_branch_id'
),'sha256'),'hex'),'9630cb2e4714e35b26d3e115e07bb4e8c816f64d294b8713e63c0e364560ad1f','property_branch_id oracle matches pinned released definition');

CREATE TEMP TABLE permission_organizations AS
 SELECT id org FROM public.organizations UNION ALL SELECT null::uuid
 UNION ALL SELECT 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid;
CREATE TEMP TABLE permission_properties AS
 SELECT organization_id org,id property_id FROM public.properties
 UNION SELECT 'a1000000-0000-0000-0000-000000000001'::uuid,id FROM public.properties
 UNION SELECT org,null::uuid FROM permission_organizations
 UNION SELECT org,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid FROM permission_organizations;
CREATE TEMP TABLE permission_keys AS
 SELECT unnest(enum_range(null::public.organization_permission_key)) permission
 UNION ALL SELECT null::public.organization_permission_key;
CREATE TEMP TABLE permission_actors AS
 SELECT id actor,email label FROM auth.users WHERE email like 'domain-%@example.test'
 UNION ALL SELECT null::uuid,'unauthenticated'
 UNION ALL SELECT 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,'outsider';
GRANT SELECT ON permission_actors TO authenticated;
CREATE FUNCTION pg_temp.permission_equivalence(p_actor uuid)
RETURNS TABLE(helper text,equivalent boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
 RETURN QUERY SELECT 'current_workspace_role'::text,bool_and(
  pg_temp.before_current_workspace_role(org) IS NOT DISTINCT FROM app_private.current_workspace_role(org)) FROM pg_temp.permission_organizations;
 RETURN QUERY SELECT 'is_super_admin'::text,bool_and(
  pg_temp.before_is_super_admin(org) IS NOT DISTINCT FROM app_private.is_super_admin(org)) FROM pg_temp.permission_organizations;
 RETURN QUERY SELECT 'is_org_admin'::text,bool_and(
  pg_temp.before_is_org_admin(org) IS NOT DISTINCT FROM app_private.is_org_admin(org)) FROM pg_temp.permission_organizations;
 RETURN QUERY SELECT 'current_active_branch_id'::text,bool_and(
  pg_temp.before_current_active_branch_id(org) IS NOT DISTINCT FROM app_private.current_active_branch_id(org)) FROM pg_temp.permission_organizations;
 RETURN QUERY SELECT 'property_branch_id'::text,bool_and(
  pg_temp.before_property_branch_id(org,property_id) IS NOT DISTINCT FROM app_private.property_branch_id(org,property_id)) FROM pg_temp.permission_properties;
 RETURN QUERY SELECT 'has_org_permission'::text,bool_and(
  pg_temp.before_has_org_permission(org,permission) IS NOT DISTINCT FROM app_private.has_org_permission(org,permission))
  FROM pg_temp.permission_organizations CROSS JOIN pg_temp.permission_keys;
 RETURN QUERY SELECT 'can_access_property'::text,bool_and(
  pg_temp.before_can_access_property(org,property_id,permission) IS NOT DISTINCT FROM app_private.can_access_property(org,property_id,permission))
  FROM pg_temp.permission_properties CROSS JOIN pg_temp.permission_keys;
END $$;
SET LOCAL ROLE authenticated;
SELECT ok(result.equivalent,actor.label||': '||result.helper||' has identical truth including NULL/foreign/missing inputs')
FROM permission_actors actor CROSS JOIN LATERAL pg_temp.permission_equivalence(actor.actor) result;
RESET ROLE;
SELECT ok(bool_and(p.prosecdef AND p.provolatile='s' AND p.proconfig @> ARRAY['search_path=""']
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')=(p.proname<>'property_branch_id')
 AND NOT EXISTS(SELECT 1 FROM aclexplode(p.proacl) privilege WHERE privilege.grantee=0)),
 'all seven existing helpers keep the released volatility, definer, pinned path and ACL boundary')
FROM pg_proc p WHERE p.oid=ANY(ARRAY[
 'app_private.can_access_property(uuid,uuid,public.organization_permission_key)'::regprocedure,
 'app_private.current_active_branch_id(uuid)'::regprocedure,
 'app_private.current_workspace_role(uuid)'::regprocedure,
 'app_private.has_org_permission(uuid,public.organization_permission_key)'::regprocedure,
 'app_private.is_org_admin(uuid)'::regprocedure,
 'app_private.is_super_admin(uuid)'::regprocedure,
 'app_private.property_branch_id(uuid,uuid)'::regprocedure
]);
SELECT * FROM finish();
ROLLBACK;
