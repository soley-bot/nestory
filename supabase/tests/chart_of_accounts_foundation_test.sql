BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(25);

\set organization_id 'cf100000-0000-0000-0000-000000000001'
\set super_admin_id 'cf200000-0000-0000-0000-000000000001'
\set unauthorized_admin_id 'cf200000-0000-0000-0000-000000000002'
\set unauthorized_organization_id 'cf100000-0000-0000-0000-000000000002'

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
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    :'super_admin_id'::uuid,
    'authenticated',
    'authenticated',
    'chart-admin@finance-account.test',
    extensions.crypt('chart-account-test', extensions.gen_salt('bf')),
    now(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    :'unauthorized_admin_id'::uuid,
    'authenticated',
    'authenticated',
    'chart-cross-admin@finance-account.test',
    extensions.crypt('chart-account-test', extensions.gen_salt('bf')),
    now(), '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{}', now(), now()
  );

INSERT INTO public.organizations (id, name, slug)
VALUES
  (:'organization_id'::uuid, 'Chart account organization', 'chart-account-test'),
  (:'unauthorized_organization_id'::uuid, 'Cross chart account organization', 'cross-chart-account-test');

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (:'organization_id'::uuid, :'super_admin_id'::uuid, 'super_admin'),
  (:'unauthorized_organization_id'::uuid, :'unauthorized_admin_id'::uuid, 'super_admin');

SELECT has_table('public', 'finance_accounts', 'finance_accounts exists');
SELECT has_table('public', 'finance_account_roles', 'finance_account_roles exists');
SELECT has_table('public', 'finance_account_source_links', 'source mapping exists');
SELECT has_table('public', 'finance_account_category_links', 'category mapping exists');

SELECT col_is_pk('public', 'finance_accounts', 'id', 'account id is primary key');
SELECT col_has_check('public', 'finance_accounts', 'account_class', 'account class is constrained');
SELECT col_has_check('public', 'finance_accounts', 'account_subtype', 'account subtype is constrained');
SELECT has_column(
  'public',
  'finance_accounts',
  'use_for_lease_credits',
  'lease credits have a distinct account capability'
);

SELECT results_eq(
  format(
    $$SELECT count(*)::bigint FROM public.finance_accounts
      WHERE organization_id = %L::uuid
        AND system_role IN ('operating_bank','trust_bank','undeposited_funds','accounts_receivable','accounts_payable','security_deposits','opening_balance','owner_contributions','owner_distributions','retained_earnings','rental_income')$$,
    :'organization_id'
  ),
  ARRAY[11::bigint],
  'required starter accounts are seeded exactly once'
);

SELECT is(
  (SELECT account_class FROM public.finance_accounts
   WHERE organization_id = :'organization_id'::uuid AND system_role = 'operating_bank'),
  'asset',
  'operating bank is an asset account'
);

SELECT is(
  (SELECT account_subtype FROM public.finance_accounts
   WHERE organization_id = :'organization_id'::uuid AND system_role = 'security_deposits'),
  'current_liability',
  'security deposits use a liability subtype'
);

SELECT results_eq(
  format(
    $$SELECT count(*)::bigint FROM public.finance_account_source_links l
    JOIN public.financial_reconciliation_sources s ON s.id = l.source_id
    WHERE s.organization_id = %L::uuid$$,
    :'organization_id'
  ),
  format(
    $$SELECT count(*)::bigint FROM public.financial_reconciliation_sources
    WHERE organization_id = %L::uuid$$,
    :'organization_id'
  ),
  'every legacy source maps to one account'
);

SELECT results_eq(
  format(
    $$SELECT count(*)::bigint FROM public.finance_account_category_links l
    JOIN public.finance_categories c ON c.id = l.category_id
    WHERE c.organization_id = %L::uuid$$,
    :'organization_id'
  ),
  format(
    $$SELECT count(*)::bigint FROM public.finance_categories
    WHERE organization_id = %L::uuid$$,
    :'organization_id'
  ),
  'every legacy category maps to one account'
);

SELECT throws_ok(
  format(
    $$INSERT INTO public.finance_accounts
    (organization_id, account_class, account_subtype, display_name, created_by)
    VALUES (%L::uuid, 'expense', 'bank', 'Impossible', %L::uuid)$$,
    :'organization_id',
    :'super_admin_id'
  ),
  '23514', NULL, 'invalid class/subtype pairing fails'
);

SELECT throws_ok(
  format(
    $$UPDATE public.finance_accounts SET parent_account_id = id
    WHERE id = (
      SELECT id FROM public.finance_accounts
      WHERE organization_id = %L::uuid
      ORDER BY id
      LIMIT 1
    )$$,
    :'organization_id'
  ),
  '23514', NULL, 'self-parenting fails'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_accounts'::regclass),
  'finance_accounts has RLS enabled'
);

SELECT is(
  has_table_privilege('authenticated', 'public.finance_accounts', 'INSERT'),
  false,
  'authenticated cannot insert directly'
);

SELECT is(
  has_table_privilege('authenticated', 'public.finance_accounts', 'UPDATE'),
  false,
  'authenticated cannot update directly'
);

SELECT set_config('request.jwt.claim.sub', :'super_admin_id', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    $$SELECT public.create_finance_account(
    %L::uuid, 'expense', 'expense', 'Landscaping', NULL,
    'Routine grounds care', NULL, NULL, false, true, false
    )$$,
    :'organization_id'
  ),
  'Super Admin creates an expense account through the checked RPC'
);

SELECT results_eq(
  format(
    $$
      SELECT category.namespace
      FROM public.finance_accounts AS account
      JOIN public.finance_account_category_links AS link
        ON link.organization_id = account.organization_id
       AND link.account_id = account.id
      JOIN public.finance_categories AS category
        ON category.organization_id = link.organization_id
       AND category.id = link.category_id
      WHERE account.organization_id = %L::uuid
        AND account.account_class = 'expense'
        AND account.normalized_name = 'landscaping'
        AND account.use_for_lease_credits
      ORDER BY category.namespace
    $$,
    :'organization_id'
  ),
  $$VALUES ('owner_expense'::text), ('tenant_billing'::text)$$,
  'lease-credit expense keeps owner-expense and tenant-billing mappings'
);

SELECT lives_ok(
  format(
    $$SELECT public.create_financial_reconciliation_source(
      %L::uuid, 'EXTRA_BANK', 'Secondary bank', 'bank',
      'organization_pooled', 'USD'::public.currency_code, NULL, NULL
    )$$,
    :'organization_id'
  ),
  'the preserved source RPC remains compatible with the account catalog'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_account_source_links AS link
    JOIN public.financial_reconciliation_sources AS source
      ON source.organization_id = link.organization_id
     AND source.id = link.source_id
    WHERE source.organization_id = :'organization_id'::uuid
      AND source.code = 'EXTRA_BANK'
  ),
  1::bigint,
  'a later preserved source receives exactly one account mapping'
);

SELECT lives_ok(
  format(
    $$SELECT public.create_finance_category(
      %L::uuid, 'owner_expense', 'Garden supplies', 'supplies'
    )$$,
    :'organization_id'
  ),
  'the preserved category RPC remains compatible with the account catalog'
);

SELECT is(
  (
    SELECT account.account_class
    FROM public.finance_categories AS category
    JOIN public.finance_account_category_links AS link
      ON link.organization_id = category.organization_id
     AND link.category_id = category.id
    JOIN public.finance_accounts AS account
      ON account.organization_id = link.organization_id
     AND account.id = link.account_id
    WHERE category.organization_id = :'organization_id'::uuid
      AND category.namespace = 'owner_expense'
      AND category.normalized_label = 'garden supplies'
  ),
  'expense',
  'a later owner-expense category maps to an Expense account'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'unauthorized_admin_id', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    $$SELECT public.create_finance_account(
    %L::uuid, 'asset', 'bank', 'Unauthorized bank', NULL,
    NULL, NULL, NULL, false, false, false
    )$$,
    :'organization_id'
  ),
  '42501', NULL, 'unauthorized actor cannot create an account'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
