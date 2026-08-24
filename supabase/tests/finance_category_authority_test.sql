BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

SELECT has_table(
  'public',
  'finance_categories',
  'Finance categories have an organization-owned authority table'
);

SELECT has_function(
  'public',
  'get_finance_categories',
  ARRAY['uuid', 'text', 'boolean'],
  'Finance category ordering has one checked read boundary'
);
SELECT has_function(
  'public',
  'resolve_finance_category',
  ARRAY['uuid', 'text', 'text'],
  'legacy Finance codes have one checked compatibility resolver'
);
SELECT has_function(
  'public',
  'create_finance_category',
  ARRAY['uuid', 'text', 'text', 'text'],
  'custom Finance categories have one checked creation boundary'
);
SELECT has_function(
  'public',
  'update_finance_category',
  ARRAY['uuid', 'uuid', 'text', 'text'],
  'Finance category labels and safe reporting mappings have one checked update boundary'
);
SELECT has_function(
  'public',
  'set_finance_category_archived',
  ARRAY['uuid', 'uuid', 'boolean'],
  'Finance category lifecycle uses archive and restore'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_catalog.pg_class
    WHERE oid = 'public.finance_categories'::regclass
  ),
  'Finance categories enforce row-level security'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.finance_categories', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.finance_categories', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.finance_categories', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.finance_categories', 'DELETE'),
  'authenticated callers can read authorized categories but cannot bypass checked writes'
);
SELECT ok(
  NOT coalesce(
    has_function_privilege(
      'anon',
      'public.create_finance_category(uuid,text,text,text)',
      'EXECUTE'
    ),
    false
  ),
  'anonymous callers cannot create Finance categories'
);

CREATE TEMP TABLE finance_category_state (
  organization_id uuid NOT NULL DEFAULT 'ca100000-0000-0000-0000-000000000001',
  cross_organization_id uuid NOT NULL DEFAULT 'ca100000-0000-0000-0000-000000000002',
  super_admin_id uuid NOT NULL DEFAULT 'ca200000-0000-0000-0000-000000000001',
  cross_admin_id uuid NOT NULL DEFAULT 'ca200000-0000-0000-0000-000000000002',
  property_id uuid NOT NULL DEFAULT 'ca300000-0000-0000-0000-000000000001',
  owner_custom_id uuid,
  tenant_custom_id uuid,
  insurance_custom_id uuid
) ON COMMIT DROP;

INSERT INTO finance_category_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON finance_category_state TO authenticated;

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
  label || '@finance-category.test',
  extensions.crypt('finance-category-test', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
FROM (
  SELECT super_admin_id, 'super-admin' FROM finance_category_state
  UNION ALL
  SELECT cross_admin_id, 'cross-admin' FROM finance_category_state
) AS users(user_id, label);

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Finance category organization', 'finance-category'
FROM finance_category_state
UNION ALL
SELECT cross_organization_id, 'Cross Finance category organization', 'cross-finance-category'
FROM finance_category_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, super_admin_id, 'super_admin'
FROM finance_category_state
UNION ALL
SELECT cross_organization_id, cross_admin_id, 'super_admin'
FROM finance_category_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT
  property_id,
  organization_id,
  'Finance category property',
  'FC-001',
  'apartment',
  'active'
FROM finance_category_state;

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_categories
    WHERE organization_id = (
      SELECT organization_id FROM finance_category_state
    )
  ),
  8::bigint,
  'every organization receives four defaults in each Finance namespace'
);

SELECT results_eq(
  $$
    SELECT namespace, code, reporting_group, sort_order
    FROM public.finance_categories
    WHERE organization_id = (
      SELECT organization_id FROM finance_category_state
    )
    ORDER BY namespace, sort_order, code
  $$,
  $$VALUES
    ('owner_expense'::text, 'cleaning'::text, 'maintenance'::text, 10),
    ('owner_expense'::text, 'utilities'::text, 'utilities'::text, 20),
    ('owner_expense'::text, 'repairs_maintenance'::text, 'maintenance'::text, 30),
    ('owner_expense'::text, 'other'::text, 'other'::text, 40),
    ('tenant_billing'::text, 'cleaning'::text, 'other'::text, 10),
    ('tenant_billing'::text, 'utilities'::text, 'utility_reimbursement'::text, 20),
    ('tenant_billing'::text, 'repairs_maintenance'::text, 'other'::text, 30),
    ('tenant_billing'::text, 'other'::text, 'other'::text, 40)
  $$,
  'default codes preserve the current reporting meanings in separate namespaces'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM finance_category_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_categories
    WHERE organization_id = (
      SELECT organization_id FROM finance_category_state
    )
  ),
  0::bigint,
  'RLS hides another organization category catalog'
);

SELECT throws_ok(
  format(
    $$SELECT public.create_finance_category(%L, 'owner_expense', 'Cross-org bypass', 'other')$$,
    (SELECT organization_id FROM finance_category_state)
  ),
  '42501',
  'Not authorized',
  'a Super Admin cannot mutate another organization category catalog'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_state),
  true
);
SET LOCAL ROLE authenticated;

UPDATE finance_category_state
SET owner_custom_id = public.create_finance_category(
  organization_id,
  'owner_expense',
  '  Garden   Care  ',
  'maintenance'
);

UPDATE finance_category_state
SET tenant_custom_id = public.create_finance_category(
  organization_id,
  'tenant_billing',
  'Garden Care',
  'other'
);

SELECT isnt(
  owner_custom_id,
  tenant_custom_id,
  'the same label in owner-expense and tenant-billing namespaces has separate identity'
)
FROM finance_category_state;

SELECT throws_ok(
  format(
    $$SELECT public.create_finance_category(%L, 'owner_expense', E'garden\tcare', 'other')$$,
    (SELECT organization_id FROM finance_category_state)
  ),
  '23505',
  'Finance category label already exists in this namespace',
  'duplicate labels are rejected after case and whitespace normalization'
);

SELECT is(
  public.update_finance_category(
    organization_id,
    owner_custom_id,
    'Groundskeeping',
    'supplies'
  ),
  owner_custom_id,
  'an unused custom category can be renamed and remapped explicitly'
)
FROM finance_category_state;

UPDATE finance_category_state
SET insurance_custom_id = public.create_finance_category(
  organization_id,
  'owner_expense',
  'Insurance',
  'other'
);

SELECT is(
  (
    SELECT array_agg(display_label ORDER BY sort_order, normalized_label, code, id)
    FROM public.finance_categories
    WHERE organization_id = (
      SELECT organization_id FROM finance_category_state
    )
      AND namespace = 'owner_expense'
  ),
  ARRAY[
    'Cleaning',
    'Utilities',
    'Repairs and maintenance',
    'Other',
    'Groundskeeping',
    'Insurance'
  ]::text[],
  'default and custom category ordering is deterministic'
);

SELECT is(
  public.set_finance_category_archived(
    organization_id,
    owner_custom_id,
    true
  ),
  owner_custom_id,
  'custom categories archive through the checked lifecycle boundary'
)
FROM finance_category_state;

SELECT is(
  (
    SELECT count(*)
    FROM public.get_finance_categories(
      (SELECT organization_id FROM finance_category_state),
      'owner_expense',
      false
    )
    WHERE id = (SELECT owner_custom_id FROM finance_category_state)
  ),
  0::bigint,
  'active category reads omit archived categories'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.get_finance_categories(
      (SELECT organization_id FROM finance_category_state),
      'owner_expense',
      true
    )
    WHERE id = (SELECT owner_custom_id FROM finance_category_state)
      AND NOT is_active
  ),
  1::bigint,
  'history-aware category reads retain archived categories'
);

RESET ROLE;

SET LOCAL session_replication_role = replica;
INSERT INTO public.finance_expense_items (
  organization_id,
  property_id,
  expense_type,
  vendor_label,
  invoice_date,
  amount,
  category,
  status
)
SELECT
  organization_id,
  property_id,
  'maintenance',
  'Legacy cleaning vendor',
  '2026-08-01',
  25,
  'Cleaning',
  'paid'
FROM finance_category_state;
SET LOCAL session_replication_role = origin;

SELECT throws_ok(
  format(
    $$
      UPDATE public.finance_categories
      SET reporting_group = 'other'
      WHERE organization_id = %L
        AND namespace = 'owner_expense'
        AND code = 'cleaning'
    $$,
    (SELECT organization_id FROM finance_category_state)
  ),
  '55000',
  'Used Finance categories cannot change reporting group',
  'a category already represented by financial history cannot be reclassified'
);

SELECT throws_ok(
  format(
    $$
      DELETE FROM public.finance_categories
      WHERE organization_id = %L
        AND namespace = 'owner_expense'
        AND code = 'cleaning'
    $$,
    (SELECT organization_id FROM finance_category_state)
  ),
  '55000',
  'Finance categories must be archived, not deleted',
  'a category already represented by financial history cannot be hard-deleted'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM finance_category_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.update_finance_category(
    organization_id,
    (
      SELECT id
      FROM public.finance_categories
      WHERE organization_id = state.organization_id
        AND namespace = 'owner_expense'
        AND code = 'cleaning'
    ),
    'Cleaning services',
    'maintenance'
  ),
  (
    SELECT id
    FROM public.finance_categories
    WHERE organization_id = state.organization_id
      AND namespace = 'owner_expense'
      AND code = 'cleaning'
  ),
  'used categories keep an editable display label without changing reporting meaning'
)
FROM finance_category_state AS state;

SELECT results_eq(
  format(
    $$
      SELECT legacy_code, resolved.canonical_code, resolved.reporting_group,
        resolved.authority_kind
      FROM (VALUES
        ('cleaning'::text),
        ('other'::text),
        ('repairs_maintenance'::text),
        ('utilities'::text),
        ('utility'::text)
      ) AS legacy(legacy_code)
      CROSS JOIN LATERAL public.resolve_finance_category(
        %L,
        'owner_expense',
        legacy.legacy_code
      ) AS resolved
      ORDER BY legacy_code
    $$,
    (SELECT organization_id FROM finance_category_state)
  ),
  $$VALUES
    ('cleaning'::text, 'cleaning'::text, 'maintenance'::text, 'category'::text),
    ('other'::text, 'other'::text, 'other'::text, 'category'::text),
    ('repairs_maintenance'::text, 'repairs_maintenance'::text, 'maintenance'::text, 'category'::text),
    ('utilities'::text, 'utilities'::text, 'utilities'::text, 'category'::text),
    ('utility'::text, 'utilities'::text, 'utilities'::text, 'category'::text)
  $$,
  'legacy owner-expense codes resolve without losing their reporting meaning'
);

SELECT results_eq(
  format(
    $$
      SELECT legacy_code, resolved.canonical_code, resolved.reporting_group,
        resolved.authority_kind
      FROM (VALUES
        ('cleaning'::text),
        ('manual_rent'::text),
        ('other'::text),
        ('repairs_maintenance'::text),
        ('utilities'::text)
      ) AS legacy(legacy_code)
      CROSS JOIN LATERAL public.resolve_finance_category(
        %L,
        'tenant_billing',
        legacy.legacy_code
      ) AS resolved
      ORDER BY legacy_code
    $$,
    (SELECT organization_id FROM finance_category_state)
  ),
  $$VALUES
    ('cleaning'::text, 'cleaning'::text, 'other'::text, 'category'::text),
    ('manual_rent'::text, 'base_rent'::text, 'rent'::text, 'lease_rent'::text),
    ('other'::text, 'other'::text, 'other'::text, 'category'::text),
    ('repairs_maintenance'::text, 'repairs_maintenance'::text, 'other'::text, 'category'::text),
    ('utilities'::text, 'utilities'::text, 'utility_reimbursement'::text, 'category'::text)
  $$,
  'legacy tenant charge codes resolve separately while base rent stays lease-owned'
);

SELECT ok(
  (
    SELECT category_id IS NULL
    FROM public.resolve_finance_category(
      (SELECT organization_id FROM finance_category_state),
      'tenant_billing',
      'manual_rent'
    )
  ),
  'legacy Manual rent never receives a customizable tenant category identity'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
