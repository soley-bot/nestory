BEGIN;

SELECT plan(15);

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

SELECT has_function(
  'public', 'submit_expense_with_accounts',
  ARRAY['uuid','uuid','uuid','text','uuid','uuid','text','date','numeric','numeric','currency_code','text','uuid','uuid','uuid','uuid','text','text'],
  'paid costs accept explicit category and pay-from account identities'
);

SELECT has_function(
  'public', 'record_tenant_invoice_payment_with_account',
  ARRAY['uuid','uuid','numeric','date','uuid','text','jsonb','text'],
  'tenant invoice payments accept an explicit receiving account identity'
);

SELECT has_function(
  'public', 'record_lease_deposit_event_with_account',
  ARRAY['uuid','uuid','uuid','text','date','numeric','text'],
  'lease deposit activity has its own account-aware mutation boundary'
);

SELECT ok(
  pg_get_functiondef(
    'public.submit_expense_with_accounts(uuid,uuid,uuid,text,uuid,uuid,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) LIKE '%resolve_chart_category_for_workflow%'
  AND pg_get_functiondef(
    'public.submit_expense_with_accounts(uuid,uuid,uuid,text,uuid,uuid,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) LIKE '%resolve_chart_source_for_workflow%',
  'paid costs resolve both account identities inside the checked database mutation'
);

SELECT ok(
  pg_get_functiondef(
    'public.record_tenant_invoice_payment_with_account(uuid,uuid,numeric,date,uuid,text,jsonb,text)'::regprocedure
  ) LIKE '%resolve_chart_source_for_workflow%'
  AND pg_get_functiondef(
    'public.record_tenant_invoice_payment_with_account(uuid,uuid,numeric,date,uuid,text,jsonb,text)'::regprocedure
  ) LIKE '%false%',
  'receiving-account resolution excludes liability credit cards'
);

SELECT has_column(
  'public', 'lease_deposit_events', 'liability_account_id',
  'deposit events retain the selected liability account identity'
);

SELECT ok(
  pg_get_constraintdef(
    (SELECT oid FROM pg_constraint
     WHERE conrelid = 'public.financial_reconciliation_sources'::regclass
       AND conname = 'financial_reconciliation_sources_source_kind_check')
  ) LIKE '%credit_card%'
  AND app_private.finance_account_source_is_compatible(
    'credit_card', 'liability', 'credit_card'
  )
  AND NOT app_private.finance_account_source_is_compatible(
    'other', 'liability', 'credit_card'
  ),
  'credit cards use their own constrained operational source kind and never other'
);

SELECT * FROM finish();
ROLLBACK;
