BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(66);

SELECT has_column(
  'public',
  'property_owners',
  'effective_range',
  'property ownership stores a generated effective range'
);

SELECT col_type_is(
  'public',
  'property_owners',
  'effective_range',
  'daterange',
  'the ownership effective range uses daterange'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_owners'::regclass
      AND conname = 'property_owners_unarchived_start_required_check'
      AND contype = 'c'
  ),
  'unarchived ownership requires an explicit start date'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_owners'::regclass
      AND conname = 'property_owners_unarchived_share_required_check'
      AND contype = 'c'
  ),
  'unarchived ownership requires an explicit positive share'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_owners'::regclass
      AND conname = 'property_owners_half_open_date_check'
      AND contype = 'c'
  ),
  'ownership end must be strictly later than start'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.property_owners'::regclass
      AND conname = 'property_owners_unarchived_person_effective_range_excl'
      AND contype = 'x'
  ),
  'same-person unarchived ownership overlap is excluded'
);

SELECT has_function(
  'app_private',
  'validate_owner_roster_on_date',
  ARRAY['uuid', 'uuid', 'date'],
  'the private date-scoped owner roster validator exists'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.parameters
    WHERE specific_schema = 'app_private'
      AND specific_name LIKE 'validate_owner_roster_on_date_%'
      AND parameter_mode = 'OUT'
      AND parameter_name = 'ownership_roster_hash'
  ),
  'the private validator names its authority hash ownership_roster_hash'
);

SELECT has_function(
  'app_private',
  'update_property_preserving_ownership_for_import',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'date', 'text', 'uuid'],
  'imports have an explicit private preserve-owner property path'
);

SELECT function_privs_are(
  'app_private',
  'update_property_preserving_ownership_for_import',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'date', 'text', 'uuid'],
  'authenticated',
  ARRAY[]::text[],
  'authenticated cannot execute the private preserve-owner import path'
);

SELECT ok(
  to_regprocedure('public.update_property(uuid,uuid,text,text,text,text,text,text,date,text,uuid)') IS NULL,
  'the legacy public 11-argument property update overload is removed'
);

SELECT has_function(
  'app_private',
  'owner_roster_legacy_preflight',
  ARRAY['date'],
  'the private reusable legacy preflight exists'
);

SELECT has_function(
  'public',
  'get_owner_roster_readiness',
  ARRAY['uuid', 'date'],
  'the checked Finance-readable remediation RPC exists'
);

SELECT function_privs_are(
  'app_private',
  'validate_owner_roster_on_date',
  ARRAY['uuid', 'uuid', 'date'],
  'authenticated',
  ARRAY[]::text[],
  'authenticated cannot execute the private roster validator'
);

SELECT function_privs_are(
  'app_private',
  'owner_roster_legacy_preflight',
  ARRAY['date'],
  'authenticated',
  ARRAY[]::text[],
  'authenticated cannot execute the private legacy preflight'
);

SELECT function_privs_are(
  'public',
  'get_owner_roster_readiness',
  ARRAY['uuid', 'date'],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated may execute only the checked remediation RPC'
);

SELECT function_privs_are(
  'public',
  'get_owner_roster_readiness',
  ARRAY['uuid', 'date'],
  'anon',
  ARRAY[]::text[],
  'anonymous callers cannot inspect owner readiness'
);

SELECT function_privs_are(
  'public',
  'get_owner_roster_readiness',
  ARRAY['uuid', 'date'],
  'service_role',
  ARRAY[]::text[],
  'service-role callers cannot bypass the checked owner readiness boundary'
);

SELECT ok(
  (SELECT provolatile = 's' FROM pg_proc WHERE oid = 'public.get_owner_roster_readiness(uuid,date)'::regprocedure),
  'the remediation RPC is declared read-only stable'
);

SELECT has_function(
  'app_private',
  'sync_property_primary_owner',
  ARRAY['uuid', 'uuid', 'uuid', 'date', 'numeric'],
  'the carried-forward owner writer requires explicit start and share arguments'
);

SELECT function_privs_are(
  'app_private',
  'sync_property_primary_owner',
  ARRAY['uuid', 'uuid', 'uuid', 'date', 'numeric'],
  'authenticated',
  ARRAY[]::text[],
  'authenticated cannot bypass the checked property RPC through the private owner writer'
);

SELECT hasnt_function(
  'app_private', 'sync_property_primary_owner', ARRAY['uuid', 'uuid', 'uuid'],
  'the legacy owner writer overload with hidden date and share defaults is removed'
);

SELECT hasnt_function(
  'public', 'create_property',
  ARRAY['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'date', 'text', 'uuid'],
  'the legacy create-property overload cannot bypass explicit ownership facts'
);

SELECT hasnt_function(
  'public', 'update_property',
  ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'date', 'text', 'uuid'],
  'the public import-compatibility update overload is removed'
);

SELECT has_function(
  'public',
  'create_property',
  ARRAY[
    'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'date', 'text',
    'uuid', 'date', 'numeric'
  ],
  'property creation accepts explicit ownership authority'
);

SELECT has_function(
  'public',
  'update_property',
  ARRAY[
    'uuid', 'uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'date',
    'text', 'uuid', 'date', 'numeric'
  ],
  'property updates accept explicit ownership authority'
);

INSERT INTO public.organizations (id, name, slug)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Owner readiness test', 'owner-readiness-test');

INSERT INTO public.properties (id, organization_id, name, code, property_type)
VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Transfer', 'OWN-1', 'Apartment'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Low total', 'OWN-2', 'Apartment'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'High total', 'OWN-3', 'Apartment'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'No roster', 'OWN-4', 'Apartment'),
  ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Inactive owner', 'OWN-5', 'Apartment');

INSERT INTO public.people (id, organization_id, display_name)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Owner one'),
  ('10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Owner two'),
  ('10000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Inactive owner');

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner', 'active'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'owner', 'active'),
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'owner', 'inactive');

SELECT throws_ok(
  $$INSERT INTO public.property_owners (organization_id, property_id, person_id, ownership_percent)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 100)$$,
  '23514', NULL,
  'an unarchived owner cannot omit its start date'
);

SELECT throws_ok(
  $$INSERT INTO public.property_owners (organization_id, property_id, person_id, started_on)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-01-01')$$,
  '23514', NULL,
  'an unarchived owner cannot omit its share'
);

SELECT throws_ok(
  $$INSERT INTO public.property_owners (organization_id, property_id, person_id, ownership_percent, started_on)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 0, '2026-01-01')$$,
  '23514', NULL,
  'an owner share cannot be zero'
);

SELECT throws_ok(
  $$INSERT INTO public.property_owners (organization_id, property_id, person_id, ownership_percent, started_on)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', -1, '2026-01-01')$$,
  '23514', NULL,
  'an owner share cannot be negative'
);

SELECT throws_ok(
  $$INSERT INTO public.property_owners (organization_id, property_id, person_id, ownership_percent, started_on)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 100.001, '2026-01-01')$$,
  '23514', NULL,
  'an individual owner share cannot exceed 100'
);

SELECT throws_ok(
  $$INSERT INTO public.property_owners (organization_id, property_id, person_id, ownership_percent, started_on, ended_on)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 100, '2026-01-01', '2026-01-01')$$,
  '23514', NULL,
  'a same-day zero-length owner interval is rejected'
);

SELECT lives_ok(
  $$INSERT INTO public.property_owners (organization_id, property_id, person_id, archived_at)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', now())$$,
  'an explicitly archived legacy row may retain missing ownership facts'
);

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on, ended_on
) VALUES
  ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 100.000, '2026-01-01', '2026-06-01'),
  ('00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 100.000, '2026-06-01', NULL),
  ('00000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 99.999, '2026-01-01', NULL),
  ('00000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 50.000, '2026-01-01', NULL),
  ('00000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 50.001, '2026-01-01', NULL),
  ('00000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003', 100.000, '2026-01-01', NULL);

SELECT throws_ok(
  $$INSERT INTO public.property_owners (organization_id, property_id, person_id, ownership_percent, started_on)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 10, '2026-05-01')$$,
  '23P01', NULL,
  'overlapping unarchived intervals for the same property and person are rejected'
);

SELECT throws_ok(
  $$SELECT * FROM app_private.validate_owner_roster_on_date('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', '2026-08-01')$$,
  '23514', 'owner_share_total_not_100: expected 100.000, got 99.999',
  'a 99.999 roster is not opening-authority ready'
);

SELECT throws_ok(
  $$SELECT * FROM app_private.validate_owner_roster_on_date('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', '2026-08-01')$$,
  '23514', 'owner_share_total_not_100: expected 100.000, got 100.001',
  'a 100.001 roster is not opening-authority ready'
);

SELECT throws_ok(
  $$SELECT * FROM app_private.validate_owner_roster_on_date('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', '2026-08-01')$$,
  '23514', 'owner_roster_missing',
  'a property with no effective roster is not opening-authority ready'
);

SELECT is(
  (SELECT property_owner_id FROM app_private.validate_owner_roster_on_date(
    'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2026-06-01'
  )),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'a same-day transfer uses the successor half-open roster'
);

SELECT is(
  (SELECT count(*)::integer FROM app_private.validate_owner_roster_on_date(
    'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2026-06-01'
  ) WHERE property_owner_id = '00000000-0000-0000-0000-000000000001'),
  0,
  'the owner ending on the effective date is excluded'
);

SELECT is(
  (SELECT to_jsonb(validated) ->> 'ownership_roster_hash'
   FROM app_private.validate_owner_roster_on_date(
     'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2026-06-01'
   ) AS validated),
  encode(extensions.digest(
    '00000000-0000-0000-0000-000000000002|10000000-0000-0000-0000-000000000001|100.000|2026-06-01|',
    'sha256'
  ), 'hex'),
  'the validator reconstructs the deterministic lowercase LF roster hash'
);

SELECT is(
  (SELECT ownership_percent FROM public.property_owners WHERE id = '00000000-0000-0000-0000-000000000010'),
  99.999::numeric,
  'a sole owner keeps the explicit actor-supplied share instead of receiving a 100 default'
);

UPDATE public.property_owners
SET is_primary = true
WHERE id = '00000000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$SELECT app_private.sync_property_primary_owner(
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '2026-06-01',
    100.000
  )$$,
  '22023', 'Ownership replacement would create an empty interval',
  'the property owner writer rejects a same-day zero-length replacement'
);

SELECT throws_ok(
  $$SELECT * FROM app_private.validate_owner_roster_on_date('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', '2026-08-01')$$,
  '23514', 'owner_person_inactive',
  'an inactive owner cannot support opening authority'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'property_owners'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  ),
  'property ownership has no direct-write RLS policy'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) AS privilege
    WHERE has_table_privilege('anon', 'public.property_owners', privilege)
  ),
  'anon has no direct property-owner DML privilege'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) AS privilege
    WHERE has_table_privilege('authenticated', 'public.property_owners', privilege)
  ),
  'authenticated has no direct property-owner DML privilege'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) AS privilege
    WHERE has_table_privilege('service_role', 'public.property_owners', privilege)
  ),
  'service_role has no direct property-owner DML privilege'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-4000-8000-000000000099',
  'authenticated', 'authenticated', 'owner-readiness-admin@example.test',
  extensions.crypt('owner-readiness', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-4000-8000-000000000099',
  'super_admin'
);

INSERT INTO public.organizations (id, name, slug)
VALUES ('a0000000-0000-0000-0000-000000000098', 'Other owner org', 'other-owner-org');
INSERT INTO public.properties (id, organization_id, name, code, property_type)
VALUES ('b0000000-0000-0000-0000-000000000098', 'a0000000-0000-0000-0000-000000000098', 'Other property', 'OTHER-OWN', 'Apartment');
INSERT INTO public.people (id, organization_id, display_name)
VALUES ('10000000-0000-0000-0000-000000000098', 'a0000000-0000-0000-0000-000000000098', 'Other owner');
INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES ('a0000000-0000-0000-0000-000000000098', '10000000-0000-0000-0000-000000000098', 'owner', 'active');
INSERT INTO public.property_owners (organization_id, property_id, person_id, ownership_percent, started_on)
VALUES ('a0000000-0000-0000-0000-000000000098', 'b0000000-0000-0000-0000-000000000098', '10000000-0000-0000-0000-000000000098', 100.000, '2026-01-01');

SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000099', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.create_property(
    'a0000000-0000-0000-0000-000000000001', 'Checked owner write', 'OWN-CHECKED',
    'Apartment', NULL, NULL, 'active', NULL, NULL,
    '10000000-0000-0000-0000-000000000002', '2026-08-01', 100.000
  )$$,
  'the checked SECURITY DEFINER property RPC remains the ownership write boundary'
);

SELECT is(
  (SELECT setup_path FROM public.get_owner_roster_readiness(
    'a0000000-0000-0000-0000-000000000001', '2026-08-01'
  ) WHERE property_id = 'b0000000-0000-0000-0000-000000000002' LIMIT 1),
  '/properties/b0000000-0000-0000-0000-000000000002',
  'readiness remediation links to the working property detail edit surface'
);

SELECT is(
  (SELECT organization_id FROM public.get_owner_roster_readiness(
    'a0000000-0000-0000-0000-000000000001', '2026-08-01'
  ) WHERE property_id = 'b0000000-0000-0000-0000-000000000002' LIMIT 1),
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'readiness remediation returns the explicit organization scope'
);

SELECT ok(
  (SELECT canonical_roster IS NULL AND ownership_roster_hash IS NULL
   FROM public.get_owner_roster_readiness(
     'a0000000-0000-0000-0000-000000000001', '2026-08-01'
   ) WHERE property_id = 'b0000000-0000-0000-0000-000000000002' LIMIT 1),
  'readiness issue rows expose nullable canonical authority and roster hash fields'
);

SELECT ok(
  (SELECT count(*) > 0 FROM public.property_owners WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'),
  'a Finance-readable authenticated member retains scoped owner-roster SELECT'
);

SELECT is(
  (SELECT count(*)::integer FROM public.property_owners WHERE organization_id = 'a0000000-0000-0000-0000-000000000098'),
  0,
  'owner-roster SELECT does not cross the organization RLS boundary'
);

SELECT throws_ok(
  $$INSERT INTO public.property_owners (organization_id, property_id, person_id, ownership_percent, started_on)
    VALUES ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 1, '2027-01-01')$$,
  '42501', 'permission denied for table property_owners',
  'authenticated direct owner INSERT is denied before RLS can delegate a write'
);

RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$UPDATE public.property_owners SET ownership_percent = 1 WHERE id = '00000000-0000-0000-0000-000000000010'$$,
  '42501', 'permission denied for table property_owners',
  'service-role direct owner UPDATE is denied by ACL'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$DELETE FROM public.property_owners WHERE id = '00000000-0000-0000-0000-000000000010'$$,
  '42501', 'permission denied for table property_owners',
  'anonymous direct owner DELETE is denied by ACL'
);
RESET ROLE;

SELECT is(
  (SELECT issue_code FROM app_private.owner_roster_legacy_preflight('2026-08-01')
   WHERE property_id = 'b0000000-0000-0000-0000-000000000002' AND boundary_date = '2026-08-01'),
  'owner_share_total_not_100',
  'the preflight emits the exact not-100 issue name'
);

SELECT ok(
  (SELECT canonical_roster IS NULL AND ownership_roster_hash IS NULL
   FROM app_private.owner_roster_legacy_preflight('2026-08-01')
   WHERE property_id = 'b0000000-0000-0000-0000-000000000002' AND boundary_date = '2026-08-01'),
  'an invalid-total issue never carries canonical authority or a roster hash'
);

SELECT is(
  (SELECT property_owner_ids FROM app_private.owner_roster_legacy_preflight('2026-08-01')
   WHERE property_id = 'b0000000-0000-0000-0000-000000000002' AND boundary_date = '2026-08-01'),
  ARRAY['00000000-0000-0000-0000-000000000010'::uuid],
  'issue rows carry sorted property-owner IDs'
);

SELECT is(
  (SELECT issue_code FROM app_private.owner_roster_legacy_preflight('2026-08-01')
   WHERE property_id = 'b0000000-0000-0000-0000-000000000005' AND boundary_date = '2026-08-01'),
  'owner_person_inactive',
  'the preflight emits the exact inactive-person issue name'
);

SELECT is(
  (SELECT count(*)::integer FROM app_private.owner_roster_legacy_preflight('2026-08-01')
   WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'
     AND property_id = 'b0000000-0000-0000-0000-000000000004'
     AND issue_code = 'owner_roster_missing'),
  1,
  'the preflight emits one missing-roster issue row'
);

SELECT is(
  (SELECT next_boundary_date FROM app_private.owner_roster_legacy_preflight('2026-08-01')
   WHERE property_id = 'b0000000-0000-0000-0000-000000000001'
     AND boundary_date = '2026-01-01'),
  '2026-06-01'::date,
  'every interval row identifies its next boundary'
);

SELECT is(
  (SELECT count(*)::integer FROM app_private.owner_roster_legacy_preflight('2026-08-01')
   WHERE property_id = 'b0000000-0000-0000-0000-000000000002'),
  2,
  'a global invalid-total condition is not repeated beyond its boundary rows'
);

ALTER TABLE public.property_owners
  DROP CONSTRAINT property_owners_unarchived_person_effective_range_excl;

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  10.000, '2026-07-01'
);

SELECT is(
  (SELECT jsonb_build_object(
    'issues', array_agg(issue_code ORDER BY issue_code),
    'allAuthorityNull', bool_and(canonical_roster IS NULL AND ownership_roster_hash IS NULL)
  )
  FROM app_private.owner_roster_legacy_preflight('2026-08-01')
  WHERE property_id = 'b0000000-0000-0000-0000-000000000001'
    AND boundary_date = '2026-08-01'),
  jsonb_build_object(
    'issues', ARRAY['owner_interval_overlap', 'owner_share_total_not_100'],
    'allAuthorityNull', true
  ),
  'overlap and invalid-total conditions produce separate exact issue rows with no authority hash'
);

ALTER TABLE public.property_owners
  DROP CONSTRAINT property_owners_unarchived_share_required_check;

INSERT INTO public.properties (id, organization_id, name, code, property_type)
VALUES
  ('b0000000-0000-0000-0000-000000000096', 'a0000000-0000-0000-0000-000000000001', 'Invalid sibling', 'OWN-SIB', 'Apartment'),
  ('b0000000-0000-0000-0000-000000000097', 'a0000000-0000-0000-0000-000000000001', 'Archived parent', 'OWN-ARC', 'Apartment');

UPDATE public.properties
SET archived_at = now()
WHERE id = 'b0000000-0000-0000-0000-000000000097';

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
) VALUES
  ('00000000-0000-0000-0000-000000000096', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000096', '10000000-0000-0000-0000-000000000001', 100.000, '2026-01-01'),
  ('00000000-0000-0000-0000-000000000097', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000096', '10000000-0000-0000-0000-000000000002', NULL, '2026-01-01'),
  ('00000000-0000-0000-0000-000000000098', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000097', '10000000-0000-0000-0000-000000000002', 100.000, '2026-01-01');

SELECT is(
  (SELECT jsonb_build_object(
    'issues', array_agg(coalesce(issue_code, 'READY') ORDER BY issue_code NULLS FIRST),
    'allAuthorityNull', bool_and(canonical_roster IS NULL AND ownership_roster_hash IS NULL)
  )
  FROM app_private.owner_roster_legacy_preflight('2026-08-01')
  WHERE property_id = 'b0000000-0000-0000-0000-000000000096'
    AND boundary_date = '2026-08-01'),
  jsonb_build_object(
    'issues', ARRAY['owner_share_missing'],
    'allAuthorityNull', true
  ),
  'an effective invalid sibling suppresses the otherwise-valid boundary authority row'
);

SELECT is(
  (SELECT count(*)::integer
   FROM app_private.owner_roster_legacy_preflight('2026-08-01')
   WHERE property_id = 'b0000000-0000-0000-0000-000000000097'),
  2,
  'unarchived owner rows under an archived property remain visible to migration preflight'
);

SELECT * FROM finish();

ROLLBACK;
