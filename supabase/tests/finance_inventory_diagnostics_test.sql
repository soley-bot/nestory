BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

CREATE TEMP TABLE finance_inventory_test_state (
  admin_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_admin_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ledger_entry_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO finance_inventory_test_state DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  user_id,
  'authenticated',
  'authenticated',
  email,
  extensions.crypt('finance-inventory-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now()
FROM (
  SELECT admin_user_id, 'inventory-admin-' || admin_user_id::text || '@example.test'
  FROM finance_inventory_test_state
  UNION ALL
  SELECT member_user_id, 'inventory-member-' || member_user_id::text || '@example.test'
  FROM finance_inventory_test_state
  UNION ALL
  SELECT manager_user_id, 'inventory-manager-' || manager_user_id::text || '@example.test'
  FROM finance_inventory_test_state
  UNION ALL
  SELECT cross_admin_user_id, 'inventory-cross-' || cross_admin_user_id::text || '@example.test'
  FROM finance_inventory_test_state
) AS fixture_users(user_id, email);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Finance inventory test', 'finance-inventory-' || left(organization_id::text, 8)
FROM finance_inventory_test_state
UNION ALL
SELECT cross_organization_id, 'Finance inventory cross test', 'finance-inventory-cross-' || left(cross_organization_id::text, 8)
FROM finance_inventory_test_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, admin_user_id, 'super_admin'
FROM finance_inventory_test_state
UNION ALL
SELECT organization_id, member_user_id, 'finance_member'
FROM finance_inventory_test_state
UNION ALL
SELECT organization_id, manager_user_id, 'finance_manager'
FROM finance_inventory_test_state
UNION ALL
SELECT cross_organization_id, cross_admin_user_id, 'super_admin'
FROM finance_inventory_test_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT property_id, organization_id, 'Inventory property', 'INV-' || left(property_id::text, 8), 'apartment', 'active'
FROM finance_inventory_test_state
UNION ALL
SELECT cross_property_id, cross_organization_id, 'Cross inventory property', 'CROSS-' || left(cross_property_id::text, 8), 'apartment', 'active'
FROM finance_inventory_test_state;

INSERT INTO public.ledger_entries (
  id,
  organization_id,
  property_id,
  transaction_date,
  direction,
  category,
  amount,
  currency,
  description,
  source_type,
  source_id
)
SELECT
  ledger_entry_id,
  organization_id,
  property_id,
  '2026-07-10'::date,
  'income',
  'Manual inventory mismatch',
  19.25,
  'USD',
  'Deliberate manual row for diagnostic RED coverage',
  'manual',
  NULL
FROM finance_inventory_test_state;

GRANT SELECT ON finance_inventory_test_state TO authenticated, anon;

SELECT has_function(
  'public',
  'get_finance_inventory_page',
  ARRAY[
    'uuid',
    'uuid',
    'currency_code',
    'date',
    'date',
    'text',
    'text',
    'integer',
    'text[]',
    'text[]'
  ],
  'checked finance inventory page RPC exists'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_finance_inventory_page(uuid,uuid,public.currency_code,date,date,text,text,integer,text[],text[])',
    'EXECUTE'
  ),
  'authenticated database role can execute the checked RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.get_finance_inventory_page(uuid,uuid,public.currency_code,date,date,text,text,integer,text[],text[])',
    'EXECUTE'
  ),
  'anonymous database role cannot execute the finance inventory RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'app_private.get_finance_inventory_page(uuid,uuid,public.currency_code,date,date,text,text,integer,text[],text[])',
    'EXECUTE'
  ),
  'the private finance inventory helper is denied to authenticated callers'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_user_id::text FROM finance_inventory_test_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L, %L, %L, %L, %L, %L, NULL, 100, NULL, NULL)',
    (SELECT organization_id FROM finance_inventory_test_state),
    (SELECT property_id FROM finance_inventory_test_state),
    'USD',
    '2026-07-01',
    '2026-07-31',
    'diagnostics'
  ),
  'an organization admin can read its bounded diagnostics'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_test_state),
      (SELECT property_id FROM finance_inventory_test_state),
      'USD',
      '2026-07-01',
      '2026-07-31',
      'diagnostics',
      NULL,
      100,
      ARRAY['MANUAL_LEDGER_ROW'],
      NULL
    )
    WHERE payload ->> 'issueCode' = 'MANUAL_LEDGER_ROW'
      AND payload ->> 'sourceId' = (
        SELECT ledger_entry_id::text FROM finance_inventory_test_state
      )
  ),
  1::bigint,
  'the deliberately seeded manual Ledger row is detected exactly once'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.get_finance_inventory_page(
      (SELECT organization_id FROM finance_inventory_test_state),
      (SELECT property_id FROM finance_inventory_test_state),
      'USD',
      '2026-07-01',
      '2026-07-31',
      'sources',
      NULL,
      100,
      NULL,
      ARRAY['ledger_entry']
    )
    WHERE payload ->> 'sourceId' = (
      SELECT ledger_entry_id::text FROM finance_inventory_test_state
    )
  ),
  1::bigint,
  'typed source filtering returns the seeded Ledger row'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_user_id::text FROM finance_inventory_test_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L, %L, %L, %L, %L, %L, NULL, 100, NULL, NULL)',
    (SELECT organization_id FROM finance_inventory_test_state),
    (SELECT property_id FROM finance_inventory_test_state),
    'USD',
    '2026-07-01',
    '2026-07-31',
    'diagnostics'
  ),
  '42501',
  'Not authorized',
  'a member cannot invoke organization finance diagnostics'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT manager_user_id::text FROM finance_inventory_test_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L, %L, %L, %L, %L, %L, NULL, 100, NULL, NULL)',
    (SELECT organization_id FROM finance_inventory_test_state),
    (SELECT property_id FROM finance_inventory_test_state),
    'USD',
    '2026-07-01',
    '2026-07-31',
    'diagnostics'
  ),
  '42501',
  'Not authorized',
  'a manager cannot invoke organization finance diagnostics'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_user_id::text FROM finance_inventory_test_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L, %L, %L, %L, %L, %L, NULL, 100, NULL, NULL)',
    (SELECT organization_id FROM finance_inventory_test_state),
    (SELECT property_id FROM finance_inventory_test_state),
    'USD',
    '2026-07-01',
    '2026-07-31',
    'diagnostics'
  ),
  '42501',
  'Not authorized',
  'a cross-organization admin cannot invoke finance diagnostics'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

SET LOCAL ROLE anon;
SELECT throws_ok(
  format(
    'SELECT * FROM public.get_finance_inventory_page(%L, %L, %L, %L, %L, %L, NULL, 100, NULL, NULL)',
    (SELECT organization_id FROM finance_inventory_test_state),
    (SELECT property_id FROM finance_inventory_test_state),
    'USD',
    '2026-07-01',
    '2026-07-31',
    'diagnostics'
  ),
  '42501',
  NULL,
  'anonymous callers cannot execute the finance inventory RPC'
);
RESET ROLE;

SELECT ok(
  NOT has_table_privilege('anon', 'public.ledger_entries', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.ledger_entries', 'UPDATE'),
  'table privileges deny anonymous reads and authenticated Ledger writes'
);

SELECT * FROM finish();

ROLLBACK;
