BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(41);

SELECT has_column('public', 'units', 'bedroom_count', 'units store bedroom counts');
SELECT has_column('public', 'units', 'bathroom_count', 'units store bathroom counts');
SELECT col_type_is('public', 'units', 'bedroom_count', 'smallint', 'bedroom counts use compact integers');
SELECT col_type_is('public', 'units', 'bathroom_count', 'smallint', 'bathroom counts use compact integers');
SELECT col_is_null('public', 'units', 'bedroom_count', 'unknown bedroom counts remain nullable');
SELECT col_is_null('public', 'units', 'bathroom_count', 'unknown bathroom counts remain nullable');
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
    JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname = 'units'
      AND constraint_record.conname = 'units_bedroom_count_check'
      AND constraint_record.contype = 'c'
  ),
  'bedroom counts have a named database check'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint constraint_record
    JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
    JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
    WHERE schema_record.nspname = 'public'
      AND table_record.relname = 'units'
      AND constraint_record.conname = 'units_bathroom_count_check'
      AND constraint_record.contype = 'c'
  ),
  'bathroom counts have a named database check'
);

SELECT has_function(
  'public',
  'create_unit',
  ARRAY['uuid', 'uuid', 'text', 'text', 'numeric', 'numeric', 'numeric', 'text'],
  'checked unit creation accepts optional room counts'
);

SELECT has_function(
  'public',
  'update_unit',
  ARRAY['uuid', 'uuid', 'uuid', 'text', 'text', 'numeric', 'numeric', 'numeric', 'text'],
  'checked unit editing accepts optional room counts'
);

SELECT has_function(
  'public',
  'create_unit',
  ARRAY['uuid', 'uuid', 'text', 'text', 'numeric', 'text'],
  'the previous create signature remains available for rollback'
);

SELECT has_function(
  'public',
  'update_unit',
  ARRAY['uuid', 'uuid', 'uuid', 'text', 'text', 'numeric', 'text'],
  'the previous update signature remains available for rollback'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.create_unit(uuid,uuid,text,text,numeric,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text)',
    'EXECUTE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc function_record
    CROSS JOIN LATERAL aclexplode(
      coalesce(function_record.proacl, acldefault('f', function_record.proowner))
    ) AS privilege_record
    WHERE function_record.oid = ANY (
      ARRAY[
        to_regprocedure('public.create_unit(uuid,uuid,text,text,numeric,text)'),
        to_regprocedure('public.create_unit(uuid,uuid,text,text,numeric,numeric,numeric,text)')
      ]
    )
      AND privilege_record.grantee = 0
      AND privilege_record.privilege_type = 'EXECUTE'
  ),
  'both create overloads grant authenticated execution without PUBLIC execution'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_unit(uuid,uuid,uuid,text,text,numeric,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.update_unit(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text)',
    'EXECUTE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc function_record
    CROSS JOIN LATERAL aclexplode(
      coalesce(function_record.proacl, acldefault('f', function_record.proowner))
    ) AS privilege_record
    WHERE function_record.oid = ANY (
      ARRAY[
        to_regprocedure('public.update_unit(uuid,uuid,uuid,text,text,numeric,text)'),
        to_regprocedure('public.update_unit(uuid,uuid,uuid,text,text,numeric,numeric,numeric,text)')
      ]
    )
      AND privilege_record.grantee = 0
      AND privilege_record.privilege_type = 'EXECUTE'
  ),
  'both update overloads grant authenticated execution without PUBLIC execution'
);

SELECT throws_ok(
  $$
    SELECT public.create_unit(
      gen_random_uuid(), gen_random_uuid(), '1A', '1', 48, 2, 1, 'vacant'
    )
  $$,
  '28000',
  'Not authenticated',
  'anonymous callers cannot create units with room counts'
);

SELECT throws_ok(
  $$
    SELECT public.update_unit(
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
      '1A', '1', 48, 2, 1, 'vacant'
    )
  $$,
  '28000',
  'Not authenticated',
  'anonymous callers cannot update unit room counts'
);

SELECT throws_ok(
  $$
    SELECT public.create_unit(
      gen_random_uuid(), gen_random_uuid(), '1A', '1', 48, 'vacant'
    )
  $$,
  '28000',
  'Not authenticated',
  'the rollback create overload preserves the authentication check'
);

SELECT throws_ok(
  $$
    SELECT public.update_unit(
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
      '1A', '1', 48, 'vacant'
    )
  $$,
  '28000',
  'Not authenticated',
  'the rollback update overload preserves the authentication check'
);

CREATE TEMP TABLE unit_room_count_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unauthorized_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_unit_id uuid,
  null_unit_id uuid,
  zero_unit_id uuid,
  unit_id uuid
) ON COMMIT DROP;

GRANT SELECT, UPDATE ON unit_room_count_state TO authenticated;

INSERT INTO unit_room_count_state DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated',
  'authenticated',
  email_prefix || '-' || left(user_id::text, 8) || '@example.test',
  extensions.crypt('unit-room-count-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM unit_room_count_state
CROSS JOIN LATERAL (
  VALUES
    (admin_id, 'unit-room-count-admin'),
    (unauthorized_id, 'unit-room-count-unauthorized')
) AS users(user_id, email_prefix);

INSERT INTO public.organizations(id, name, slug)
SELECT
  organization_id,
  'Unit room count organization',
  'unit-room-count-' || left(organization_id::text, 8)
FROM unit_room_count_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM unit_room_count_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
)
SELECT
  property_id,
  organization_id,
  'Unit room count property',
  'URC-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM unit_room_count_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT unauthorized_id::text FROM unit_room_count_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_unit(%L,%L,%L,%L,48,2,1,%L)',
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'UNAUTHORIZED',
    '1',
    'vacant'
  ),
  '42501',
  'Not authorized',
  'an authenticated non-admin cannot create a unit'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM unit_room_count_state),
  true
);

UPDATE unit_room_count_state
SET null_unit_id = public.create_unit(
  organization_id, property_id, 'NULL', '1', 48, NULL, NULL, 'vacant'
);

SELECT results_eq(
  $$
    SELECT bedroom_count, bathroom_count
    FROM public.units
    WHERE id = (SELECT null_unit_id FROM unit_room_count_state)
  $$,
  $$ VALUES (NULL::smallint, NULL::smallint) $$,
  'blank room counts persist as unknown rather than zero'
);

UPDATE unit_room_count_state
SET legacy_unit_id = public.create_unit(
  organization_id, property_id, 'LEGACY', '1', 48, 'vacant'
);

SELECT results_eq(
  $$
    SELECT bedroom_count, bathroom_count
    FROM public.units
    WHERE id = (SELECT legacy_unit_id FROM unit_room_count_state)
  $$,
  $$ VALUES (NULL::smallint, NULL::smallint) $$,
  'the rollback create overload persists unknown room counts'
);

SELECT results_eq(
  $$
    SELECT
      jsonb_typeof(new_values -> 'bedroom_count'),
      jsonb_typeof(new_values -> 'bathroom_count')
    FROM public.activity_logs
    WHERE entity_id = (SELECT legacy_unit_id FROM unit_room_count_state)
      AND action = 'unit_created'
  $$,
  $$ VALUES ('null'::text, 'null'::text) $$,
  'the rollback create overload keeps room-count keys in activity evidence'
);

UPDATE unit_room_count_state
SET zero_unit_id = public.create_unit(
  organization_id, property_id, 'ZERO', '1', 48, 0, 0, 'vacant'
);

SELECT results_eq(
  $$
    SELECT bedroom_count, bathroom_count
    FROM public.units
    WHERE id = (SELECT zero_unit_id FROM unit_room_count_state)
  $$,
  $$ VALUES (0::smallint, 0::smallint) $$,
  'intentional zero room counts persist without becoming unknown'
);

UPDATE unit_room_count_state
SET unit_id = public.create_unit(
  organization_id, property_id, 'ROOMS', '2', 72, 3, 2, 'vacant'
);

SELECT results_eq(
  $$
    SELECT bedroom_count, bathroom_count
    FROM public.units
    WHERE id = (SELECT unit_id FROM unit_room_count_state)
  $$,
  $$ VALUES (3::smallint, 2::smallint) $$,
  'checked creation persists bedroom and bathroom counts'
);

SELECT results_eq(
  $$
    SELECT new_values ->> 'bedroom_count', new_values ->> 'bathroom_count'
    FROM public.activity_logs
    WHERE entity_id = (SELECT unit_id FROM unit_room_count_state)
      AND action = 'unit_created'
  $$,
  $$ VALUES ('3'::text, '2'::text) $$,
  'unit creation records both counts in activity evidence'
);

SELECT public.update_unit(
  unit_id, organization_id, property_id, 'ROOMS', '2', 72, 4, 3, 'vacant'
)
FROM unit_room_count_state;

SELECT results_eq(
  $$
    SELECT bedroom_count, bathroom_count
    FROM public.units
    WHERE id = (SELECT unit_id FROM unit_room_count_state)
  $$,
  $$ VALUES (4::smallint, 3::smallint) $$,
  'checked editing persists changed bedroom and bathroom counts'
);

SELECT results_eq(
  $$
    SELECT
      previous_values ->> 'bedroom_count',
      previous_values ->> 'bathroom_count',
      new_values ->> 'bedroom_count',
      new_values ->> 'bathroom_count'
    FROM public.activity_logs
    WHERE entity_id = (SELECT unit_id FROM unit_room_count_state)
      AND action = 'unit_updated'
  $$,
  $$ VALUES ('3'::text, '2'::text, '4'::text, '3'::text) $$,
  'unit editing records previous and new counts in activity evidence'
);

SELECT public.update_unit(
  unit_id, organization_id, property_id, 'ROOMS-LEGACY', '3', 73, 'maintenance'
)
FROM unit_room_count_state;

SELECT results_eq(
  $$
    SELECT bedroom_count, bathroom_count
    FROM public.units
    WHERE id = (SELECT unit_id FROM unit_room_count_state)
  $$,
  $$ VALUES (4::smallint, 3::smallint) $$,
  'the rollback update overload preserves existing room counts'
);

SELECT results_eq(
  $$
    SELECT
      previous_values ->> 'bedroom_count',
      previous_values ->> 'bathroom_count',
      new_values ->> 'bedroom_count',
      new_values ->> 'bathroom_count'
    FROM public.activity_logs
    WHERE entity_id = (SELECT unit_id FROM unit_room_count_state)
      AND action = 'unit_updated'
      AND previous_values ->> 'bedroom_count' = '4'
      AND new_values ->> 'unit_number' = 'ROOMS-LEGACY'
  $$,
  $$ VALUES ('4'::text, '3'::text, '4'::text, '3'::text) $$,
  'the rollback update overload records the compatible edit without room-count loss'
);

SELECT public.update_unit(
  unit_id, organization_id, property_id, 'ROOMS', '2', 72, 5, 4, 'vacant'
)
FROM unit_room_count_state;

SELECT public.update_unit(
  unit_id, organization_id, property_id, 'ROOMS', '2', 72, NULL, NULL, 'vacant'
)
FROM unit_room_count_state;

SELECT results_eq(
  $$
    SELECT bedroom_count, bathroom_count
    FROM public.units
    WHERE id = (SELECT unit_id FROM unit_room_count_state)
  $$,
  $$ VALUES (NULL::smallint, NULL::smallint) $$,
  'checked editing can return saved counts to unknown'
);

SELECT throws_ok(
  format(
    'SELECT public.create_unit(%L,%L,%L,%L,48,-1,1,%L)',
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'NEG-BED', '1', 'vacant'
  ),
  '22023',
  'Bedroom count must be a whole number from 0 to 100',
  'checked creation rejects negative bedroom counts'
);

SELECT throws_ok(
  format(
    'SELECT public.create_unit(%L,%L,%L,%L,48,1,-1,%L)',
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'NEG-BATH', '1', 'vacant'
  ),
  '22023',
  'Bathroom count must be a whole number from 0 to 100',
  'checked creation rejects negative bathroom counts'
);

SELECT throws_ok(
  format(
    'SELECT public.create_unit(%L,%L,%L,%L,48,101,1,%L)',
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'MAX-BED', '1', 'vacant'
  ),
  '22023',
  'Bedroom count must be a whole number from 0 to 100',
  'checked creation rejects bedroom counts above the upper bound'
);

SELECT throws_ok(
  format(
    'SELECT public.create_unit(%L,%L,%L,%L,48,1,101,%L)',
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'MAX-BATH', '1', 'vacant'
  ),
  '22023',
  'Bathroom count must be a whole number from 0 to 100',
  'checked creation rejects bathroom counts above the upper bound'
);

SELECT throws_ok(
  format(
    'SELECT public.create_unit(%L,%L,%L,%L,48,1.5,1,%L)',
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'FRACTION-BED', '1', 'vacant'
  ),
  '22023',
  'Bedroom count must be a whole number from 0 to 100',
  'checked creation rejects fractional bedroom counts'
);

SELECT throws_ok(
  format(
    'SELECT public.create_unit(%L,%L,%L,%L,48,1,1.5,%L)',
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'FRACTION-BATH', '1', 'vacant'
  ),
  '22023',
  'Bathroom count must be a whole number from 0 to 100',
  'checked creation rejects fractional bathroom counts'
);

RESET ROLE;

SELECT throws_ok(
  format(
    'INSERT INTO public.units (organization_id,property_id,unit_number,bedroom_count,status) VALUES (%L,%L,%L,-1,%L)',
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'DIRECT-BED',
    'vacant'
  ),
  '23514',
  'new row for relation "units" violates check constraint "units_bedroom_count_check"',
  'the table constraint rejects negative bedroom counts outside the RPC'
);

SELECT throws_ok(
  format(
    'INSERT INTO public.units (organization_id,property_id,unit_number,bathroom_count,status) VALUES (%L,%L,%L,101,%L)',
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'DIRECT-BATH',
    'vacant'
  ),
  '23514',
  'new row for relation "units" violates check constraint "units_bathroom_count_check"',
  'the table constraint rejects bathroom counts above the upper bound outside the RPC'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT unauthorized_id::text FROM unit_room_count_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT public.update_unit(%L,%L,%L,%L,%L,72,2,1,%L)',
    (SELECT unit_id FROM unit_room_count_state),
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'ROOMS', '2', 'vacant'
  ),
  '42501',
  'Not authorized',
  'an authenticated non-admin cannot update room counts'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM unit_room_count_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT public.update_unit(%L,%L,%L,%L,%L,72,-1,1,%L)',
    (SELECT unit_id FROM unit_room_count_state),
    (SELECT organization_id FROM unit_room_count_state),
    (SELECT property_id FROM unit_room_count_state),
    'ROOMS', '2', 'vacant'
  ),
  '22023',
  'Bedroom count must be a whole number from 0 to 100',
  'checked editing rejects invalid bedroom counts'
);

SELECT results_eq(
  $$
    SELECT bedroom_count, bathroom_count
    FROM public.units
    WHERE id = (SELECT unit_id FROM unit_room_count_state)
  $$,
  $$ VALUES (NULL::smallint, NULL::smallint) $$,
  'a rejected edit leaves the persisted room counts unchanged'
);

SELECT * FROM finish();
ROLLBACK;
