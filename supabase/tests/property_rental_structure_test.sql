BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(24);

SELECT has_column('public', 'properties', 'rental_structure',
  'properties record the operator-selected rental structure');
SELECT has_column('public', 'properties', 'registered_date',
  'properties keep registration separate from acquisition');
SELECT col_default_is('public', 'properties', 'rental_structure',
  'undecided', 'existing zero-unit properties remain undecided by default');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.properties'::regclass
    AND conname = 'properties_rental_structure_check'
), 'rental structure is constrained to the supported choices');

SELECT has_function('public', 'create_property_minimal',
  ARRAY['uuid','text','text','text','text','date','text','uuid','date','numeric'],
  'the minimal checked Property creation RPC exists');
SELECT has_function('public', 'set_property_rental_structure',
  ARRAY['uuid','uuid','text'],
  'the checked rental-structure transition RPC exists');
SELECT function_privs_are('public', 'create_property_minimal',
  ARRAY['uuid','text','text','text','text','date','text','uuid','date','numeric'],
  'authenticated', ARRAY['EXECUTE'],
  'authenticated callers may use the checked minimal creation RPC');
SELECT function_privs_are('public', 'create_property_minimal',
  ARRAY['uuid','text','text','text','text','date','text','uuid','date','numeric'],
  'anon', ARRAY[]::text[], 'anonymous callers cannot create Properties');

INSERT INTO public.organizations (id, name, slug)
VALUES ('71000000-0000-4000-8000-000000000001', 'Structure test', 'structure-test');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '71000000-0000-4000-8000-000000000099',
  'authenticated', 'authenticated', 'structure-admin@example.test',
  extensions.crypt('structure-test', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
);

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000099',
  'super_admin'
);

SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000099', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok($$
  SELECT public.create_property_minimal(
    '71000000-0000-4000-8000-000000000001', 'Riverside House', NULL,
    'House', '10 Riverside Road', '2026-08-17', 'property-create-0001'
  )
$$, 'basic Property identity is sufficient for creation');

SELECT is(
  (SELECT count(*)::integer FROM public.properties
   WHERE organization_id = '71000000-0000-4000-8000-000000000001'
     AND name = 'Riverside House'),
  1, 'a minimal Property is created exactly once');

SELECT is(
  (SELECT status || '|' || rental_structure || '|' || registered_date::text
   FROM public.properties
   WHERE organization_id = '71000000-0000-4000-8000-000000000001'
     AND name = 'Riverside House'),
  'active|undecided|2026-08-17',
  'creation owns the Active and undecided defaults and stores registration');

SELECT ok(
  (SELECT code LIKE 'P-%' FROM public.properties
   WHERE organization_id = '71000000-0000-4000-8000-000000000001'
     AND name = 'Riverside House'),
  'blank user code receives a collision-safe internal code');

SELECT is(
  public.create_property_minimal(
    '71000000-0000-4000-8000-000000000001', 'Riverside House', NULL,
    'House', '10 Riverside Road', '2026-08-17', 'property-create-0001'
  ),
  (SELECT id FROM public.properties
   WHERE organization_id = '71000000-0000-4000-8000-000000000001'
     AND name = 'Riverside House'),
  'replaying the same creation request returns the original Property');

SELECT lives_ok($$
  SELECT public.set_property_rental_structure(
    '71000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.properties
     WHERE organization_id = '71000000-0000-4000-8000-000000000001'
       AND name = 'Riverside House'),
    'single_space'
  )
$$, 'an undecided zero-unit Property can be marked whole-property rental');

SELECT is(
  (SELECT rental_structure FROM public.properties
   WHERE organization_id = '71000000-0000-4000-8000-000000000001'
     AND name = 'Riverside House'),
  'single_space', 'the selected rental structure is persisted');

SELECT throws_ok($$
  SELECT public.create_unit(
    '71000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.properties
     WHERE organization_id = '71000000-0000-4000-8000-000000000001'
       AND name = 'Riverside House'),
    'HOUSE-UNIT', NULL, NULL, NULL, NULL, 'vacant'
  )
$$, '23514', 'Whole-property rentals cannot contain Units',
  'a whole-property rental cannot create a fake or accidental Unit');

SELECT lives_ok($$
  SELECT public.create_property_minimal(
    '71000000-0000-4000-8000-000000000001', 'Apartment Building',
    'APT-BUILDING', 'Apartment building', '20 Riverside Road', NULL,
    'property-create-0002'
  )
$$, 'a second basic Property can be created with an explicit user code');

SELECT lives_ok($$
  SELECT public.set_property_rental_structure(
    '71000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.properties
     WHERE organization_id = '71000000-0000-4000-8000-000000000001'
       AND name = 'Apartment Building'),
    'multi_unit'
  )
$$, 'a zero-unit Property can be marked for separate Units');

SELECT lives_ok($$
  SELECT public.create_unit(
    '71000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.properties
     WHERE organization_id = '71000000-0000-4000-8000-000000000001'
       AND name = 'Apartment Building'),
    'A-01', '1', 45.00, NULL, NULL, 'vacant'
  )
$$, 'a multi-unit Property can create its first Unit');

SELECT throws_ok($$
  SELECT public.set_property_rental_structure(
    '71000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.properties
     WHERE organization_id = '71000000-0000-4000-8000-000000000001'
       AND name = 'Apartment Building'),
    'single_space'
  )
$$, '23514', 'Archive active Units before changing the rental structure',
  'an active Unit prevents a circular switch back to whole-property rental');

INSERT INTO public.people (id, organization_id, display_name, party_type)
VALUES (
  '71000000-0000-4000-8000-000000000050',
  '71000000-0000-4000-8000-000000000001', 'Structure Owner', 'individual'
);

SELECT lives_ok($$
  SELECT public.create_property_minimal(
    '71000000-0000-4000-8000-000000000001', 'Owned At Creation', NULL,
    'House', NULL, NULL, 'property-create-0003',
    '71000000-0000-4000-8000-000000000050', '2026-08-01', 100
  )
$$, 'a Property can be created with its primary owner in one call');

SELECT is(
  (SELECT owner.person_id::text || '|' || owner.ownership_percent::text
   FROM public.property_owners AS owner
   JOIN public.properties AS property ON property.id = owner.property_id
   WHERE property.name = 'Owned At Creation' AND owner.is_primary),
  '71000000-0000-4000-8000-000000000050|100.000',
  'the primary ownership link is written with the creation');

SELECT throws_ok($$
  SELECT public.create_property_minimal(
    '71000000-0000-4000-8000-000000000001', 'Partial Owner', NULL,
    'House', NULL, NULL, 'property-create-0004',
    '71000000-0000-4000-8000-000000000050', NULL, NULL
  )
$$, '22023', 'Owner, ownership start date, and ownership share must be supplied together',
  'a partial ownership trio is refused at creation');

SELECT is(
  (SELECT count(*)::integer FROM public.properties
   WHERE organization_id = '71000000-0000-4000-8000-000000000001'
     AND name = 'Partial Owner'),
  0, 'a refused ownership trio leaves no Property behind');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
