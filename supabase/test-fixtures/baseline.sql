-- Local-only operational fixture for Nestory.
--
-- The fixture deliberately creates one coherent company and exercises the
-- current checked workflows instead of inserting derived Finance/Ledger rows.
-- Every documented login uses the password 123456789.
--
-- - nestory@gmail.com                    -> Super Admin
-- - finance.manager@nestory.com          -> Finance Manager
-- - finance.member@nestory.com           -> Finance Member
-- - operations.manager@nestory.com       -> Operations Manager
-- - operations.member@nestory.com        -> Operations Member

DO $$
BEGIN
  IF current_setting('app.settings.jwt_secret', true)
    IS DISTINCT FROM
      'super-secret-jwt-token-with-at-least-32-characters-long' THEN
    RAISE EXCEPTION
      'The operational fixture is local-only and refused this database';
  END IF;
END;
$$;

BEGIN;

DO $$
DECLARE
  fixture_tables text;
BEGIN
  SELECT string_agg(
    format('%I.%I', tables.schemaname, tables.tablename),
    ', ' ORDER BY tables.schemaname, tables.tablename
  )
  INTO fixture_tables
  FROM pg_catalog.pg_tables AS tables
  WHERE tables.schemaname IN ('app_private', 'public')
    AND NOT (
      tables.schemaname = 'app_private'
      AND tables.tablename LIKE '%\_capability' ESCAPE '\'
    );

  IF fixture_tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || fixture_tables ||
      ' RESTART IDENTITY CASCADE';
  END IF;
END;
$$;

DELETE FROM auth.identities
WHERE user_id IN (
  SELECT users.id
  FROM auth.users AS users
  WHERE users.email IN (
    'nestory@gmail.com',
    'finance.manager@nestory.com',
    'finance.member@nestory.com',
    'operations.manager@nestory.com',
    'operations.member@nestory.com',
    'manager@nestory.com',
    'member@nestory.com',
    'demo@nestory.com'
  )
  OR users.id IN (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000501',
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000701',
    '00000000-0000-0000-0000-000000000801'
  )
);

DELETE FROM auth.users
WHERE email IN (
  'nestory@gmail.com',
  'finance.manager@nestory.com',
  'finance.member@nestory.com',
  'operations.manager@nestory.com',
  'operations.member@nestory.com',
  'manager@nestory.com',
  'member@nestory.com',
  'demo@nestory.com'
)
OR id IN (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000801'
);

WITH fixture_users(user_id, email, display_name) AS (
  VALUES
    (
      '00000000-0000-0000-0000-000000000101'::uuid,
      'nestory@gmail.com'::text,
      'Nestory Super Admin'::text
    ),
    (
      '00000000-0000-0000-0000-000000000701'::uuid,
      'finance.manager@nestory.com'::text,
      'Finance Manager'::text
    ),
    (
      '00000000-0000-0000-0000-000000000801'::uuid,
      'finance.member@nestory.com'::text,
      'Finance Member'::text
    ),
    (
      '00000000-0000-0000-0000-000000000501'::uuid,
      'operations.manager@nestory.com'::text,
      'Operations Manager'::text
    ),
    (
      '00000000-0000-0000-0000-000000000601'::uuid,
      'operations.member@nestory.com'::text,
      'Operations Member'::text
    )
)
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
  fixture_users.user_id,
  'authenticated',
  'authenticated',
  fixture_users.email,
  extensions.crypt('123456789', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('name', fixture_users.display_name),
  now(),
  now()
FROM fixture_users;

WITH fixture_identities(identity_id, user_id, email) AS (
  VALUES
    (
      '00000000-0000-0000-0000-000000000102'::uuid,
      '00000000-0000-0000-0000-000000000101'::uuid,
      'nestory@gmail.com'::text
    ),
    (
      '00000000-0000-0000-0000-000000000702'::uuid,
      '00000000-0000-0000-0000-000000000701'::uuid,
      'finance.manager@nestory.com'::text
    ),
    (
      '00000000-0000-0000-0000-000000000802'::uuid,
      '00000000-0000-0000-0000-000000000801'::uuid,
      'finance.member@nestory.com'::text
    ),
    (
      '00000000-0000-0000-0000-000000000502'::uuid,
      '00000000-0000-0000-0000-000000000501'::uuid,
      'operations.manager@nestory.com'::text
    ),
    (
      '00000000-0000-0000-0000-000000000602'::uuid,
      '00000000-0000-0000-0000-000000000601'::uuid,
      'operations.member@nestory.com'::text
    )
)
INSERT INTO auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  fixture_identities.identity_id,
  fixture_identities.user_id::text,
  fixture_identities.user_id,
  jsonb_build_object(
    'sub', fixture_identities.user_id,
    'email', fixture_identities.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
FROM fixture_identities;

INSERT INTO public.organizations (
  id,
  name,
  slug,
  preferred_currency,
  khr_per_usd
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Nestory Sample Operations',
  'nestory-sample-operations',
  'USD',
  4100
);

INSERT INTO public.organization_branches (
  id,
  organization_id,
  name,
  code,
  address,
  status,
  created_by,
  updated_by
)
VALUES (
  '00000000-0000-0000-0000-000000000211',
  '00000000-0000-0000-0000-000000000001',
  'Phnom Penh Operations',
  'PP-OPS',
  'Boeung Keng Kang 1, Phnom Penh',
  'active',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  address,
  status,
  acquisition_date,
  notes,
  created_by,
  updated_by
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Central Residence',
    'CTR-RES',
    'Residential apartment',
    'Street 360, Boeung Keng Kang 1, Phnom Penh',
    'active',
    '2021-03-18',
    'Long-stay apartments managed through the central operations team.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Riverside Shophouse',
    'RIV-SHP',
    'Mixed use',
    'Sisowath Quay, Daun Penh, Phnom Penh',
    'active',
    '2022-09-01',
    'Ground-floor retail with residential units above.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'Garden Court',
    'GDN-CRT',
    'Residential apartment',
    'Street 21, Tonle Bassac, Phnom Penh',
    'active',
    '2023-09-01',
    'Compact residential property used for open operational work.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  floor,
  size_sqm,
  status,
  created_by,
  updated_by
)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'A-01', '1', 54, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'A-02', '1', 58, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'A-03', '2', 62, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'R-01', 'Ground', 82, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'R-02', '2', 48, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '20000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'G-01', 'Ground', 51, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '20000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'G-02', 'Ground', 53, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '20000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'G-11', '1', 55, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '20000000-0000-0000-0000-000000000009',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'G-12', '1', 57, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '20000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'G-21', '2', 60, 'vacant',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.people (
  id,
  organization_id,
  display_name,
  legal_name,
  party_type,
  primary_email,
  primary_phone,
  notes,
  created_by,
  updated_by
)
VALUES
  (
    '80000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Dara Chan', 'Chan Dara', 'individual',
    'dara.chan@example.test', '+855 12 555 101',
    'Primary tenant at Central Residence.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Lina Heng', 'Heng Lina', 'individual',
    'lina.heng@example.test', '+855 12 555 102',
    'Tenant whose rent is collected directly by the owner.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'Bright Mekong Trading', 'Bright Mekong Trading Co., Ltd.', 'company',
    'accounts@bright-mekong.example.test', '+855 23 555 103',
    'Commercial tenant at Riverside Shophouse.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'Sokha Vannak', 'Sokha Vannak', 'individual',
    'sokha.vannak@example.test', '+855 12 555 104',
    'Owner of Central Residence.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'Chanthy Lim', 'Lim Chanthy', 'individual',
    'chanthy.lim@example.test', '+855 12 555 105',
    'Owner of Riverside Shophouse.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000001',
    'Khmer Home Services', 'Khmer Home Services Co., Ltd.', 'company',
    'dispatch@khmer-home.example.test', '+855 23 555 106',
    'Preferred plumbing and appliance vendor.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000001',
    'Mara Sovan', 'Mara Sovan', 'individual',
    'mara.sovan@example.test', '+855 12 555 107',
    'Operations Manager for the Phnom Penh branch.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000001',
    'Vuthy Sok', 'Sok Vuthy', 'individual',
    'vuthy.sok@example.test', '+855 12 555 108',
    'Operations Member assigned to field work.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000009',
    '00000000-0000-0000-0000-000000000001',
    'Sophea Kim', 'Kim Sophea', 'individual',
    'sophea.kim@example.test', '+855 12 555 109',
    'Owner of Garden Court.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'Pisey Touch', 'Touch Pisey', 'individual',
    'pisey.touch@example.test', '+855 12 555 110',
    'Garden Court tenant with an open rent balance.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '80000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'Rithy Meas', 'Meas Rithy', 'individual',
    'rithy.meas@example.test', '+855 12 555 111',
    'Garden Court tenant whose lease needs billing setup.',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.person_roles (
  organization_id,
  person_id,
  role,
  status,
  created_by,
  updated_by
)
VALUES
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'tenant', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'tenant', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', 'tenant', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000004', 'owner', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000005', 'owner', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000006', 'vendor', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000007', 'staff', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000008', 'staff', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000009', 'owner', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000010', 'tenant', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000011', 'tenant', 'active', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101');

INSERT INTO public.vendor_profiles (
  organization_id,
  person_id,
  service_category,
  service_area,
  preferred,
  status,
  created_by,
  updated_by
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000006',
  'Plumbing and appliances',
  'Phnom Penh',
  true,
  'active',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.property_owners (
  organization_id,
  property_id,
  person_id,
  ownership_label,
  ownership_percent,
  is_primary,
  started_on,
  created_by,
  updated_by
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'Sole owner', 100, true,
    (date_trunc('month', current_date) - interval '2 years')::date,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000005',
    'Sole owner', 100, true,
    (date_trunc('month', current_date) - interval '2 years')::date,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    '80000000-0000-0000-0000-000000000009',
    'Sole owner', 100, true,
    (date_trunc('month', current_date) - interval '2 years')::date,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  person_id,
  branch_id
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000101',
    'super_admin', NULL, NULL
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000701',
    'finance_manager', NULL, NULL
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000801',
    'finance_member', NULL, NULL
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000501',
    'operations_manager',
    '80000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000211'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000601',
    'operations_member',
    '80000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000211'
  );

CREATE TEMP TABLE fixture_runtime (
  organization_id uuid NOT NULL,
  policy_id uuid,
  source_id uuid,
  through_lease_id uuid,
  direct_lease_id uuid,
  commercial_lease_id uuid,
  garden_open_lease_id uuid,
  garden_exception_lease_id uuid,
  through_billing_id uuid,
  direct_billing_id uuid,
  commercial_billing_id uuid,
  garden_billing_id uuid,
  through_invoice_id uuid,
  direct_invoice_id uuid,
  garden_invoice_id uuid,
  garden_exception_id uuid,
  through_payment_id uuid,
  direct_confirmation_id uuid,
  reversed_submission_id uuid,
  rejected_submission_id uuid,
  pending_general_submission_id uuid,
  maintenance_task_id uuid,
  maintenance_submission_id uuid,
  pending_maintenance_task_id uuid,
  pending_maintenance_submission_id uuid,
  in_progress_task_id uuid,
  blocked_task_id uuid,
  completed_task_id uuid,
  petty_cash_account_id uuid,
  petty_cash_entry_id uuid,
  open_petty_cash_entry_id uuid
) ON COMMIT DROP;

INSERT INTO fixture_runtime (organization_id)
VALUES ('00000000-0000-0000-0000-000000000001');

GRANT SELECT, UPDATE ON fixture_runtime TO authenticated;

CREATE FUNCTION pg_temp.active_lease_relationship_payload(
  p_person_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'primaryParty', jsonb_build_object(
      'personId', p_person_id,
      'lifecycle', 'effective',
      'recordSource', 'operator_confirmed',
      'reason', 'signed_active_lease',
      'startedOn', jsonb_build_object(
        'date', p_start_date,
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'endedOn', jsonb_build_object(
        'date', NULL,
        'kind', 'open_current',
        'confidence', 'confirmed'
      )
    ),
    'occupancy', jsonb_build_object(
      'lifecycle', 'occupied',
      'recordSource', 'operator_confirmed',
      'reason', 'confirmed_move_in',
      'scheduledMoveIn', jsonb_build_object(
        'date', p_start_date,
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'scheduledMoveOut', jsonb_build_object(
        'date', p_end_date,
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'actualMoveIn', jsonb_build_object(
        'date', p_start_date,
        'kind', 'known',
        'confidence', 'confirmed'
      ),
      'actualMoveOut', jsonb_build_object(
        'date', NULL,
        'kind', 'open_current',
        'confidence', 'confirmed'
      )
    ),
    'participants', jsonb_build_array(
      jsonb_build_object(
        'personId', p_person_id,
        'lifecycle', 'present',
        'recordSource', 'operator_confirmed',
        'reason', 'confirmed_resident',
        'startedOn', jsonb_build_object(
          'date', p_start_date,
          'kind', 'known',
          'confidence', 'confirmed'
        ),
        'endedOn', jsonb_build_object(
          'date', NULL,
          'kind', 'open_current',
          'confidence', 'confirmed'
        )
      )
    )
  );
$$;

UPDATE fixture_runtime
SET policy_id = '90000000-0000-0000-0000-000000000001';

INSERT INTO public.rent_policy_versions (
  id,
  organization_id,
  version_number,
  effective_from,
  supported_frequencies,
  rent_calculation_timezone,
  due_day_source,
  policy_default_due_day,
  short_month_due_day_rule,
  lease_start_proration_rule,
  lease_end_proration_rule,
  notice_period_charging_rule,
  mid_period_rent_change_rule,
  concessions_support_state,
  rent_free_support_state,
  waivers_support_state,
  lifecycle,
  created_by,
  updated_by,
  approved_at,
  approved_by
)
SELECT
  runtime.policy_id,
  runtime.organization_id,
  1,
  (date_trunc('month', current_date) - interval '1 year')::date,
  ARRAY['monthly']::text[],
  'Asia/Bangkok',
  'term',
  5,
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'through_lease_end',
  'next_full_period',
  'unsupported',
  'unsupported',
  'unsupported',
  'approved',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  now(),
  '00000000-0000-0000-0000-000000000101'
FROM fixture_runtime AS runtime;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);
SET LOCAL ROLE authenticated;

UPDATE fixture_runtime
SET through_lease_id = (
  public.create_lease_with_relationships(
    organization_id,
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    (date_trunc('month', current_date) - interval '6 months')::date,
    (date_trunc('month', current_date) + interval '18 months' - interval '1 day')::date,
    850,
    'USD',
    5,
    'monthly',
    'active',
    850,
    'USD',
    'active',
    pg_temp.active_lease_relationship_payload(
      '80000000-0000-0000-0000-000000000001',
      (date_trunc('month', current_date) - interval '6 months')::date,
      (date_trunc('month', current_date) + interval '18 months' - interval '1 day')::date
    ),
    'fixture-lease-through-ips'
  ) ->> 'leaseId'
)::uuid;

UPDATE fixture_runtime
SET direct_lease_id = (
  public.create_lease_with_relationships(
    organization_id,
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000002',
    (date_trunc('month', current_date) - interval '4 months')::date,
    (date_trunc('month', current_date) + interval '20 months' - interval '1 day')::date,
    925,
    'USD',
    5,
    'monthly',
    'active',
    925,
    'USD',
    'active',
    pg_temp.active_lease_relationship_payload(
      '80000000-0000-0000-0000-000000000002',
      (date_trunc('month', current_date) - interval '4 months')::date,
      (date_trunc('month', current_date) + interval '20 months' - interval '1 day')::date
    ),
    'fixture-lease-direct-owner'
  ) ->> 'leaseId'
)::uuid;

UPDATE fixture_runtime
SET commercial_lease_id = (
  public.create_lease_with_relationships(
    organization_id,
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000004',
    '80000000-0000-0000-0000-000000000003',
    (date_trunc('month', current_date) - interval '8 months')::date,
    (date_trunc('month', current_date) + interval '16 months' - interval '1 day')::date,
    1450,
    'USD',
    5,
    'monthly',
    'active',
    2900,
    'USD',
    'active',
    jsonb_set(
      pg_temp.active_lease_relationship_payload(
        '80000000-0000-0000-0000-000000000003',
        (date_trunc('month', current_date) - interval '8 months')::date,
        (date_trunc('month', current_date) + interval '16 months' - interval '1 day')::date
      ),
      '{participants}',
      '[]'::jsonb
    ),
    'fixture-lease-commercial'
  ) ->> 'leaseId'
)::uuid;

UPDATE fixture_runtime
SET garden_open_lease_id = (
  public.create_lease_with_relationships(
    organization_id,
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000006',
    '80000000-0000-0000-0000-000000000010',
    (date_trunc('month', current_date) - interval '3 months')::date,
    (date_trunc('month', current_date) + interval '21 months' - interval '1 day')::date,
    720,
    'USD',
    5,
    'monthly',
    'active',
    720,
    'USD',
    'active',
    pg_temp.active_lease_relationship_payload(
      '80000000-0000-0000-0000-000000000010',
      (date_trunc('month', current_date) - interval '3 months')::date,
      (date_trunc('month', current_date) + interval '21 months' - interval '1 day')::date
    ),
    'fixture-lease-garden-open'
  ) ->> 'leaseId'
)::uuid;

UPDATE fixture_runtime
SET garden_exception_lease_id = (
  public.create_lease_with_relationships(
    organization_id,
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000007',
    '80000000-0000-0000-0000-000000000011',
    (date_trunc('month', current_date) - interval '2 months')::date,
    (date_trunc('month', current_date) + interval '22 months' - interval '1 day')::date,
    760,
    'USD',
    5,
    'monthly',
    'active',
    760,
    'USD',
    'active',
    pg_temp.active_lease_relationship_payload(
      '80000000-0000-0000-0000-000000000011',
      (date_trunc('month', current_date) - interval '2 months')::date,
      (date_trunc('month', current_date) + interval '22 months' - interval '1 day')::date
    ),
    'fixture-lease-garden-exception'
  ) ->> 'leaseId'
)::uuid;

UPDATE fixture_runtime
SET through_billing_id = public.set_lease_billing_term(
  organization_id,
  through_lease_id,
  (date_trunc('month', current_date) - interval '6 months')::date,
  'through_ips',
  'percentage',
  10,
  true,
  true,
  'individual',
  '80000000-0000-0000-0000-000000000001',
  NULL,
  NULL,
  NULL,
  'fixture-billing-through-ips'
);

UPDATE fixture_runtime
SET direct_billing_id = public.set_lease_billing_term(
  organization_id,
  direct_lease_id,
  (date_trunc('month', current_date) - interval '4 months')::date,
  'direct_to_owner',
  'flat',
  60,
  true,
  true,
  'individual',
  '80000000-0000-0000-0000-000000000002',
  NULL,
  NULL,
  NULL,
  'fixture-billing-direct-owner'
);

UPDATE fixture_runtime
SET commercial_billing_id = public.set_lease_billing_term(
  organization_id,
  commercial_lease_id,
  (date_trunc('month', current_date) - interval '8 months')::date,
  'through_ips',
  'percentage',
  8,
  true,
  true,
  'company',
  '80000000-0000-0000-0000-000000000003',
  NULL,
  NULL,
  NULL,
  'fixture-billing-commercial'
);

UPDATE fixture_runtime
SET garden_billing_id = public.set_lease_billing_term(
  organization_id,
  garden_open_lease_id,
  (date_trunc('month', current_date) - interval '3 months')::date,
  'through_ips',
  'percentage',
  9,
  true,
  true,
  'individual',
  '80000000-0000-0000-0000-000000000010',
  NULL,
  NULL,
  NULL,
  'fixture-billing-garden-open'
);

UPDATE fixture_runtime
SET source_id = public.create_financial_reconciliation_source(
  organization_id,
  'OPS-USD',
  'Operating bank account',
  'bank',
  'organization_pooled',
  'USD',
  NULL,
  '****4100'
);

RESET ROLE;
SELECT app_private.run_due_rent_generation(now());
SET LOCAL ROLE authenticated;

UPDATE fixture_runtime AS runtime
SET through_invoice_id = invoice.id
FROM public.tenant_invoices AS invoice
WHERE invoice.organization_id = runtime.organization_id
  AND invoice.lease_id = runtime.through_lease_id
  AND invoice.billing_period_start = date_trunc('month', current_date)::date;

UPDATE fixture_runtime AS runtime
SET direct_invoice_id = invoice.id
FROM public.tenant_invoices AS invoice
WHERE invoice.organization_id = runtime.organization_id
  AND invoice.lease_id = runtime.direct_lease_id
  AND invoice.billing_period_start = date_trunc('month', current_date)::date;

UPDATE fixture_runtime AS runtime
SET garden_invoice_id = invoice.id
FROM public.tenant_invoices AS invoice
WHERE invoice.organization_id = runtime.organization_id
  AND invoice.lease_id = runtime.garden_open_lease_id
  AND invoice.billing_period_start = date_trunc('month', current_date)::date;

UPDATE fixture_runtime AS runtime
SET garden_exception_id = exception.id
FROM public.rent_generation_exceptions AS exception
WHERE exception.organization_id = runtime.organization_id
  AND exception.lease_id = runtime.garden_exception_lease_id
  AND exception.billing_period_start = date_trunc('month', current_date)::date
  AND exception.resolved_at IS NULL;

DO $$
DECLARE
  v_garden_exception_id uuid;
BEGIN
  SELECT garden_exception_id
  INTO v_garden_exception_id
  FROM fixture_runtime;

  IF v_garden_exception_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.rent_generation_exceptions AS exception
    JOIN public.properties AS property
      ON property.organization_id = exception.organization_id
     AND property.id = exception.property_id
    WHERE exception.id = v_garden_exception_id
      AND property.code = 'GDN-CRT'
      AND exception.resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Fixture Garden Court rent exception was not captured as unresolved.';
  END IF;
END;
$$;

SELECT public.set_lease_billing_term(
  runtime.organization_id,
  runtime.garden_exception_lease_id,
  (date_trunc('month', current_date) - interval '2 months')::date,
  'through_ips',
  'percentage',
  5,
  true,
  true,
  'individual',
  '80000000-0000-0000-0000-000000000011',
  NULL,
  NULL,
  NULL,
  'fixture-billing-garden-exception-retry'
)
FROM fixture_runtime AS runtime;

RESET ROLE;

UPDATE public.rent_generation_exceptions AS exception
SET resolved_at = NULL,
    resolved_invoice_id = NULL,
    last_attempted_by = NULL,
    updated_at = now()
FROM fixture_runtime AS runtime
WHERE exception.id = runtime.garden_exception_id;

SET LOCAL ROLE authenticated;

UPDATE fixture_runtime AS runtime
SET through_payment_id = public.record_tenant_invoice_payment(
  runtime.organization_id,
  runtime.through_invoice_id,
  invoice.balance_due - 25,
  current_date,
  runtime.source_id,
  'Fixture bank transfer',
  jsonb_build_array(
    jsonb_build_object(
      'lineId', line.id,
      'amount', invoice.balance_due - 25
    )
  ),
  'fixture-rent-payment-through'
)
FROM public.tenant_invoice_balances AS invoice
JOIN public.tenant_invoice_lines AS line
  ON line.invoice_id = invoice.id
 AND line.line_type = 'rent'
WHERE invoice.id = runtime.through_invoice_id;

UPDATE fixture_runtime AS runtime
SET direct_confirmation_id = public.confirm_owner_collected_rent(
  runtime.organization_id,
  runtime.direct_invoice_id,
  invoice.balance_due - 25,
  current_date,
  'Fixture owner confirmation',
  jsonb_build_array(
    jsonb_build_object(
      'lineId', line.id,
      'amount', invoice.balance_due - 25
    )
  ),
  'fixture-rent-owner-confirmation'
)
FROM public.tenant_invoice_balances AS invoice
JOIN public.tenant_invoice_lines AS line
  ON line.invoice_id = invoice.id
 AND line.line_type = 'rent'
WHERE invoice.id = runtime.direct_invoice_id;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000801',
  true
);

UPDATE fixture_runtime
SET reversed_submission_id = (
  public.submit_expense(
    organization_id,
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'general',
    NULL,
    'cleaning',
    'Khmer Home Services',
    current_date - 4,
    85,
    15,
    'USD',
    'owner',
    NULL,
    source_id,
    NULL,
    '80000000-0000-0000-0000-000000000006',
    'KH-CLN-1001',
    'fixture-expense-to-reverse'
  ) ->> 'submission_id'
)::uuid;

UPDATE fixture_runtime
SET rejected_submission_id = (
  public.submit_expense(
    organization_id,
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000005',
    'general',
    NULL,
    'utility',
    'Riverside Water Service',
    current_date - 3,
    45,
    0,
    'USD',
    'owner',
    NULL,
    source_id,
    NULL,
    NULL,
    'RIV-WATER-DUPLICATE',
    'fixture-expense-to-reject'
  ) ->> 'submission_id'
)::uuid;

UPDATE fixture_runtime
SET pending_general_submission_id = (
  public.submit_expense(
    organization_id,
    '10000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000006',
    'general',
    NULL,
    'repairs_maintenance',
    'Khmer Home Services',
    current_date - 2,
    210,
    20,
    'USD',
    'owner',
    NULL,
    source_id,
    NULL,
    '80000000-0000-0000-0000-000000000006',
    'GDN-PUMP-2088',
    'fixture-expense-pending-review'
  ) ->> 'submission_id'
)::uuid;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);

SELECT public.review_expense(
  runtime.organization_id,
  runtime.reversed_submission_id,
  'approve',
  'Receipt and property scope verified',
  'fixture-expense-approval',
  NULL
)
FROM fixture_runtime AS runtime;

SELECT public.review_expense(
  runtime.organization_id,
  runtime.rejected_submission_id,
  'reject',
  'Duplicate vendor receipt',
  'fixture-expense-rejection',
  NULL
)
FROM fixture_runtime AS runtime;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

SELECT public.reverse_expense(
  runtime.organization_id,
  runtime.reversed_submission_id,
  current_date,
  'Vendor refunded the duplicated cleaning charge',
  'fixture-expense-reversal'
)
FROM fixture_runtime AS runtime;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000501',
  true
);

UPDATE fixture_runtime
SET maintenance_task_id = public.create_maintenance_task(
  organization_id,
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'Kitchen sink repair',
  'Replace the leaking trap and test the cabinet for moisture.',
  'Plumbing',
  'high',
  'pending',
  current_date + 2,
  '10:00',
  current_date + 1,
  '09:00',
  '80000000-0000-0000-0000-000000000006',
  140,
  'USD',
  '[{"label":"Inspect cabinet","done":true},{"label":"Replace trap","done":true},{"label":"Test drain","done":false}]'::jsonb,
  'none',
  '00000000-0000-0000-0000-000000000211',
  '80000000-0000-0000-0000-000000000008'
);

SELECT public.update_maintenance_task(
  runtime.maintenance_task_id,
  runtime.organization_id,
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'Kitchen sink repair',
  'Replace the leaking trap and test the cabinet for moisture.',
  'Plumbing',
  'high',
  'pending',
  current_date + 2,
  '10:00',
  current_date + 1,
  '09:00',
  '80000000-0000-0000-0000-000000000006',
  140,
  'USD',
  125,
  'USD',
  '[{"label":"Inspect cabinet","done":true},{"label":"Replace trap","done":true},{"label":"Test drain","done":false}]'::jsonb,
  'none',
  '00000000-0000-0000-0000-000000000211',
  '80000000-0000-0000-0000-000000000008'
)
FROM fixture_runtime AS runtime;

UPDATE fixture_runtime
SET maintenance_submission_id = (
  public.submit_maintenance_cost(
    organization_id,
    maintenance_task_id,
    current_date - 1,
    NULL,
    'KH-INV-1042',
    'fixture-maintenance-cost'
  ) ->> 'submission_id'
)::uuid;

SELECT public.create_maintenance_task(
  runtime.organization_id,
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000004',
  'Monthly roof tank check',
  'Record the inspection result; recurrence is schedule metadata only.',
  'Preventive maintenance',
  'normal',
  'scheduled',
  current_date + 7,
  '08:30',
  current_date + 6,
  '09:00',
  '80000000-0000-0000-0000-000000000006',
  30,
  'USD',
  '[{"label":"Check float valve","done":false},{"label":"Photograph water level","done":false}]'::jsonb,
  'monthly',
  '00000000-0000-0000-0000-000000000211',
  '80000000-0000-0000-0000-000000000008'
)
FROM fixture_runtime AS runtime;

UPDATE fixture_runtime
SET in_progress_task_id = public.create_maintenance_task(
  organization_id,
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000008',
  'Garden Court corridor light repair',
  'Replace the failed corridor fitting and verify the timer circuit.',
  'Electrical',
  'normal',
  'pending',
  current_date + 1,
  '13:30',
  current_date,
  '09:00',
  '80000000-0000-0000-0000-000000000006',
  55,
  'USD',
  '[{"id":"isolate","label":"Isolate circuit","done":true},{"id":"replace","label":"Replace fitting","done":false}]'::jsonb,
  'none',
  '00000000-0000-0000-0000-000000000211',
  '80000000-0000-0000-0000-000000000008'
);

UPDATE fixture_runtime
SET blocked_task_id = public.create_maintenance_task(
  organization_id,
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000005',
  'Riverside drainage access blocked',
  'Inspect the rear drain once the neighboring delivery lane is clear.',
  'Drainage',
  'high',
  'pending',
  current_date + 3,
  '08:00',
  current_date + 2,
  '09:00',
  '80000000-0000-0000-0000-000000000006',
  90,
  'USD',
  '[{"id":"access","label":"Confirm lane access","done":false}]'::jsonb,
  'none',
  '00000000-0000-0000-0000-000000000211',
  NULL
);

SELECT public.execute_coordinated_maintenance_task(
  organization_id,
  blocked_task_id,
  'start',
  NULL
)
FROM fixture_runtime;

SELECT public.execute_coordinated_maintenance_task(
  organization_id,
  blocked_task_id,
  'block',
  'Delivery vehicles currently block safe drain access.'
)
FROM fixture_runtime;

UPDATE fixture_runtime
SET completed_task_id = public.create_maintenance_task(
  organization_id,
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  'Central Residence fire extinguisher inspection',
  'Verify seals, gauges, and inspection tags on the second floor.',
  'Safety inspection',
  'normal',
  'pending',
  current_date - 2,
  '10:00',
  NULL,
  NULL,
  NULL,
  0,
  'USD',
  '[{"id":"gauges","label":"Check pressure gauges","done":true},{"id":"tags","label":"Update inspection tags","done":true}]'::jsonb,
  'none',
  '00000000-0000-0000-0000-000000000211',
  NULL
);

SELECT public.execute_coordinated_maintenance_task(
  organization_id,
  completed_task_id,
  'start',
  NULL
)
FROM fixture_runtime;

SELECT public.execute_coordinated_maintenance_task(
  organization_id,
  completed_task_id,
  'complete',
  'All gauges and inspection tags were verified.'
)
FROM fixture_runtime;

UPDATE fixture_runtime
SET pending_maintenance_task_id = public.create_maintenance_task(
  organization_id,
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000009',
  'Garden Court pump replacement',
  'Replace the failed booster-pump controller and confirm pressure.',
  'Water system',
  'urgent',
  'pending',
  current_date + 1,
  '11:00',
  current_date,
  '09:00',
  '80000000-0000-0000-0000-000000000006',
  260,
  'USD',
  '[{"id":"controller","label":"Replace controller","done":true},{"id":"pressure","label":"Test water pressure","done":false}]'::jsonb,
  'none',
  '00000000-0000-0000-0000-000000000211',
  '80000000-0000-0000-0000-000000000008'
);

SELECT public.update_maintenance_task(
  runtime.pending_maintenance_task_id,
  runtime.organization_id,
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000009',
  'Garden Court pump replacement',
  'Replace the failed booster-pump controller and confirm pressure.',
  'Water system',
  'urgent',
  'pending',
  current_date + 1,
  '11:00',
  current_date,
  '09:00',
  '80000000-0000-0000-0000-000000000006',
  260,
  'USD',
  245,
  'USD',
  '[{"id":"controller","label":"Replace controller","done":true},{"id":"pressure","label":"Test water pressure","done":false}]'::jsonb,
  'none',
  '00000000-0000-0000-0000-000000000211',
  '80000000-0000-0000-0000-000000000008'
)
FROM fixture_runtime AS runtime;

UPDATE fixture_runtime
SET pending_maintenance_submission_id = (
  public.submit_maintenance_cost(
    organization_id,
    pending_maintenance_task_id,
    current_date,
    NULL,
    'GDN-PUMP-2088',
    'fixture-maintenance-pending-review'
  ) ->> 'submission_id'
)::uuid;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000601',
  true
);

SELECT public.execute_assigned_maintenance_task(
  organization_id,
  in_progress_task_id,
  'start',
  NULL,
  NULL,
  NULL
)
FROM fixture_runtime;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);

SELECT public.review_expense(
  runtime.organization_id,
  runtime.maintenance_submission_id,
  'approve',
  'Maintenance invoice and work record verified',
  'fixture-maintenance-approval',
  runtime.source_id
)
FROM fixture_runtime AS runtime;

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

UPDATE fixture_runtime
SET petty_cash_account_id = public.create_petty_cash_account(
  organization_id,
  'PC-PP-01',
  'Phnom Penh field cash',
  300,
  '80000000-0000-0000-0000-000000000008'
);

UPDATE fixture_runtime AS runtime
SET petty_cash_entry_id = public.create_petty_cash_entry(
  p_organization_id => runtime.organization_id,
  p_account_id => runtime.petty_cash_account_id,
  p_period_id => period.id,
  p_property_id => '10000000-0000-0000-0000-000000000001',
  p_unit_id => '20000000-0000-0000-0000-000000000002',
  p_invoice_date => current_date - 1,
  p_clear_date => current_date - 1,
  p_entry_kind => 'expense',
  p_status => 'cleared',
  p_category => 'REPAIR-SUPPLIES',
  p_supplier => 'Khmer Home Services',
  p_description => 'Kitchen repair consumables',
  p_amount => 35,
  p_counterparty_person_id => '80000000-0000-0000-0000-000000000006',
  p_receipt_reference => 'PC-0001',
  p_remark => 'Trap, seal tape, and cleaning materials',
  p_idempotency_key => 'fixture-petty-repair-supplies'
)
FROM public.petty_cash_periods AS period
WHERE period.organization_id = runtime.organization_id
  AND period.account_id = runtime.petty_cash_account_id
  AND period.period_start = date_trunc('month', current_date)::date;

SELECT public.post_petty_cash_entry(
  runtime.organization_id,
  runtime.petty_cash_entry_id
)
FROM fixture_runtime AS runtime;

UPDATE fixture_runtime AS runtime
SET open_petty_cash_entry_id = public.create_petty_cash_entry(
  p_organization_id => runtime.organization_id,
  p_account_id => runtime.petty_cash_account_id,
  p_period_id => period.id,
  p_property_id => '10000000-0000-0000-0000-000000000003',
  p_unit_id => '20000000-0000-0000-0000-000000000008',
  p_invoice_date => current_date,
  p_clear_date => NULL,
  p_entry_kind => 'expense',
  p_status => 'draft',
  p_category => 'ELECTRICAL-SUPPLIES',
  p_supplier => 'Khmer Home Services',
  p_description => 'Corridor light fitting',
  p_amount => 20,
  p_counterparty_person_id => '80000000-0000-0000-0000-000000000006',
  p_receipt_reference => 'PC-DRAFT-0002',
  p_remark => 'Awaiting field receipt confirmation',
  p_idempotency_key => 'fixture-petty-electrical-supplies'
)
FROM public.petty_cash_periods AS period
WHERE period.organization_id = runtime.organization_id
  AND period.account_id = runtime.petty_cash_account_id
  AND period.period_start = date_trunc('month', current_date)::date;

RESET ROLE;

COMMIT;
