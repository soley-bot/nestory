BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(39);

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
  'the legacy update-property overload cannot bypass explicit ownership facts'
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
  '23514', 'owner_roster_share_total_invalid: expected 100.000, got 99.999',
  'a 99.999 roster is not opening-authority ready'
);

SELECT throws_ok(
  $$SELECT * FROM app_private.validate_owner_roster_on_date('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', '2026-08-01')$$,
  '23514', 'owner_roster_share_total_invalid: expected 100.000, got 100.001',
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
  (SELECT roster_hash FROM app_private.validate_owner_roster_on_date(
    'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2026-06-01'
  )),
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
  '23514', 'owner_roster_inactive_owner',
  'an inactive owner cannot support opening authority'
);

SELECT * FROM finish();

ROLLBACK;
