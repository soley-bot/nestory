BEGIN;

SELECT plan(8);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.expense_submissions'::regclass
      AND conname = 'expense_submissions_category_check'
  ),
  'expense submissions are not limited to the legacy four-value category list'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ips_expense_responsibilities'::regclass
      AND conname = 'ips_expense_responsibilities_category_check'
  ),
  'approved expense responsibility snapshots accept organization category codes'
);

SELECT has_column(
  'public',
  'tenant_invoice_lines',
  'finance_category_id',
  'tenant invoice lines retain the selected tenant-billing category identity'
);

SELECT ok(
  pg_get_functiondef(
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) LIKE '%resolve_finance_category%',
  'ordinary paid-cost submission resolves the organization category authority'
);

SELECT ok(
  pg_get_functiondef(
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) LIKE '%tenant_billing%'
  AND pg_get_functiondef(
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) LIKE '%owner_expense%',
  'paid-cost submission keeps owner-expense and tenant-billing namespaces distinct'
);

SELECT ok(
  pg_get_functiondef(
    'public.create_manual_tenant_charge(uuid,uuid,text,date,date,numeric,text,text)'::regprocedure
  ) LIKE '%resolve_finance_category%'
  AND pg_get_functiondef(
    'public.create_manual_tenant_charge(uuid,uuid,text,date,date,numeric,text,text)'::regprocedure
  ) LIKE '%tenant_billing%',
  'ordinary tenant billing resolves only the tenant-billing category namespace'
);

SELECT ok(
  (
    SELECT relrowsecurity
    FROM pg_catalog.pg_class
    WHERE oid = 'public.tenant_invoice_lines'::regclass
  )
  AND has_table_privilege('authenticated', 'public.tenant_invoice_lines', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.tenant_invoice_lines', 'SELECT'),
  'category-bearing tenant invoice lines remain RLS-protected and Data API readable only to authenticated scope'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.submit_expense(uuid,uuid,uuid,text,uuid,text,text,date,numeric,numeric,currency_code,text,uuid,uuid,uuid,uuid,text,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.review_expense(uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.create_manual_tenant_charge(uuid,uuid,text,date,date,numeric,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.create_manual_tenant_charge(uuid,uuid,text,date,date,numeric,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'app_private.create_manual_tenant_charge_before_category_label_bridge(uuid,uuid,text,date,date,numeric,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'app_private.guard_tenant_invoice_line_finance_category()',
    'EXECUTE'
  ),
  'only the checked public workflow functions are executable through the Data API'
);

SELECT * FROM finish();
ROLLBACK;
