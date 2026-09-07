BEGIN;

SELECT plan(8);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_accounts AS account
    WHERE account.organization_id = '00000000-0000-0000-0000-000000000001'
      AND account.display_name IN (
        'Operating account',
        'Trust account',
        'Rental income',
        'Cleaning',
        'Repairs and maintenance',
        'Utilities'
      )
      AND account.archived_at IS NULL
  ),
  6::bigint,
  'the local fixture retains the readable starter Chart accounts'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_accounts AS child
    JOIN public.finance_accounts AS parent
      ON parent.organization_id = child.organization_id
     AND parent.id = child.parent_account_id
    WHERE child.organization_id = '00000000-0000-0000-0000-000000000001'
      AND child.display_name = 'Plumbing'
      AND child.account_class = 'expense'
      AND child.account_subtype = 'expense'
      AND child.account_number IS NULL
      AND child.description = 'Synthetic local fixture account; no real account number.'
      AND child.archived_at IS NULL
      AND parent.display_name = 'Repairs and maintenance'
      AND parent.account_class = child.account_class
  ),
  1::bigint,
  'Plumbing is one active nested Expense account without a real account number'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_account_category_links AS link
    JOIN public.finance_accounts AS account
      ON account.organization_id = link.organization_id
     AND account.id = link.account_id
    JOIN public.finance_categories AS category
      ON category.organization_id = link.organization_id
     AND category.id = link.category_id
    WHERE account.organization_id = '00000000-0000-0000-0000-000000000001'
      AND account.display_name = 'Plumbing'
      AND account.archived_at IS NULL
      AND category.namespace = 'owner_expense'
      AND category.display_label = 'Plumbing'
      AND category.archived_at IS NULL
  ),
  1::bigint,
  'Plumbing is available through the Expense Category mapping'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_accounts AS account
    JOIN public.finance_account_source_links AS link
      ON link.organization_id = account.organization_id
     AND link.account_id = account.id
    JOIN public.financial_reconciliation_sources AS source
      ON source.organization_id = link.organization_id
     AND source.id = link.source_id
    WHERE account.organization_id = '00000000-0000-0000-0000-000000000001'
      AND account.display_name IN ('Operating account', 'Trust account')
      AND account.archived_at IS NULL
      AND source.archived_at IS NULL
  ),
  2::bigint,
  'Operating and Trust accounts remain mapped for Pay from and receive-into work'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_accounts AS account
    JOIN public.finance_account_category_links AS link
      ON link.organization_id = account.organization_id
     AND link.account_id = account.id
    JOIN public.finance_categories AS category
      ON category.organization_id = link.organization_id
     AND category.id = link.category_id
    WHERE account.organization_id = '00000000-0000-0000-0000-000000000001'
      AND account.display_name = 'Rental income'
      AND account.use_for_lease_charges
      AND account.archived_at IS NULL
      AND category.namespace = 'tenant_billing'
      AND category.archived_at IS NULL
  ),
  1::bigint,
  'Rental income remains mapped for tenant-charge workflow selection'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_accounts AS account
    JOIN public.finance_account_category_links AS link
      ON link.organization_id = account.organization_id
     AND link.account_id = account.id
    JOIN public.finance_categories AS category
      ON category.organization_id = link.organization_id
     AND category.id = link.category_id
    WHERE account.organization_id = '00000000-0000-0000-0000-000000000001'
      AND account.display_name IN ('Cleaning', 'Repairs and maintenance', 'Utilities', 'Plumbing')
      AND account.account_class = 'expense'
      AND account.archived_at IS NULL
      AND category.namespace = 'owner_expense'
      AND category.archived_at IS NULL
  ),
  4::bigint,
  'daily Expense Category selectors retain the readable fixture choices'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_accounts AS account
    LEFT JOIN public.finance_account_source_links AS link
      ON link.organization_id = account.organization_id
     AND link.account_id = account.id
    WHERE account.organization_id = '00000000-0000-0000-0000-000000000001'
      AND account.archived_at IS NULL
      AND account.account_class = 'asset'
      AND account.account_subtype IN ('bank', 'cash', 'petty_cash')
      AND link.source_id IS NULL
  ),
  0::bigint,
  'every active Pay from account has an operational source mapping'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.finance_categories AS category
    LEFT JOIN public.finance_account_category_links AS link
      ON link.organization_id = category.organization_id
     AND link.category_id = category.id
    WHERE category.organization_id = '00000000-0000-0000-0000-000000000001'
      AND category.archived_at IS NULL
      AND link.account_id IS NULL
  ),
  0::bigint,
  'every active fixture Finance category has one account mapping'
);

SELECT * FROM finish();

ROLLBACK;
