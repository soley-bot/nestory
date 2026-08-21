BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(6);

SELECT has_function(
  'public',
  'create_unit',
  ARRAY['uuid', 'uuid', 'text', 'text', 'numeric', 'numeric', 'numeric', 'text'],
  'unit creation does not accept rent authority'
);

SELECT has_function(
  'public',
  'update_unit',
  ARRAY['uuid', 'uuid', 'uuid', 'text', 'text', 'numeric', 'numeric', 'numeric', 'text'],
  'unit editing does not accept rent authority'
);

SELECT hasnt_function(
  'public',
  'create_unit',
  ARRAY['uuid', 'uuid', 'text', 'text', 'numeric', 'text', 'numeric', 'currency_code'],
  'the legacy rent-writing create command is absent'
);

SELECT hasnt_function(
  'public',
  'update_unit',
  ARRAY['uuid', 'uuid', 'uuid', 'text', 'text', 'numeric', 'text', 'numeric', 'currency_code'],
  'the legacy rent-writing update command is absent'
);

CREATE TEMP TABLE unit_rent_authority_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid
) ON COMMIT DROP;

GRANT SELECT, UPDATE ON unit_rent_authority_state TO authenticated;

INSERT INTO unit_rent_authority_state DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  admin_id,
  'authenticated',
  'authenticated',
  'unit-rent-authority-' || left(admin_id::text, 8) || '@example.test',
  extensions.crypt('unit-rent-authority-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM unit_rent_authority_state;

INSERT INTO public.organizations(id, name, slug)
SELECT
  organization_id,
  'Unit rent authority organization',
  'unit-rent-authority-' || left(organization_id::text, 8)
FROM unit_rent_authority_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM unit_rent_authority_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
)
SELECT
  property_id,
  organization_id,
  'Unit rent authority property',
  'URA-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM unit_rent_authority_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM unit_rent_authority_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE unit_rent_authority_state
SET unit_id = public.create_unit(
  organization_id,
  property_id,
  '1A',
  '1',
  48,
  2,
  1,
  'vacant'
);

SELECT is(
  (
    SELECT current_rent_amount
    FROM public.units
    WHERE id = (SELECT unit_id FROM unit_rent_authority_state)
  ),
  NULL::numeric,
  'a unit starts without a shadow rent value'
);

RESET ROLE;

UPDATE public.units
SET
  current_rent_amount = 850,
  current_rent_currency = 'USD'::public.currency_code
WHERE id = (SELECT unit_id FROM unit_rent_authority_state);

SET LOCAL ROLE authenticated;

SELECT public.update_unit(
  unit_id,
  organization_id,
  property_id,
  '1A',
  '2',
  48,
  2,
  1,
  'vacant'
)
FROM unit_rent_authority_state;

SELECT is(
  (
    SELECT current_rent_amount
    FROM public.units
    WHERE id = (SELECT unit_id FROM unit_rent_authority_state)
  ),
  850::numeric,
  'editing unit details cannot overwrite legacy rent evidence'
);

SELECT * FROM finish();
ROLLBACK;
