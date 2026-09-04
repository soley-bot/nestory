BEGIN;

SELECT no_plan();

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
  ) LIKE '%resolve_chart_expense_category%'
  AND pg_get_functiondef(
    'public.submit_expense_with_accounts(uuid,uuid,uuid,text,uuid,uuid,text,date,numeric,numeric,public.currency_code,text,uuid,uuid,uuid,uuid,text,text)'::regprocedure
  ) LIKE '%resolve_chart_source_for_workflow_v2%',
  'paid costs resolve both account identities inside the checked database mutation'
);

SELECT ok(
  pg_get_functiondef(
    'public.record_tenant_invoice_payment_with_account(uuid,uuid,numeric,date,uuid,text,jsonb,text)'::regprocedure
  ) LIKE '%resolve_chart_source_for_workflow_v2%'
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

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.record_lease_deposit_event(uuid,uuid,text,date,numeric,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.record_lease_deposit_event_with_account(uuid,uuid,uuid,text,date,numeric,text)',
    'EXECUTE'
  ),
  'authenticated deposit activity cannot bypass the liability-account boundary'
);

CREATE TEMP TABLE chart_workflow_state (
  organization_id uuid NOT NULL DEFAULT 'c5100000-0000-0000-0000-000000000001',
  actor_id uuid NOT NULL DEFAULT 'c5200000-0000-0000-0000-000000000001',
  property_id uuid NOT NULL DEFAULT 'c5300000-0000-0000-0000-000000000001',
  other_property_id uuid NOT NULL DEFAULT 'c5300000-0000-0000-0000-000000000002',
  property_bank_id uuid NOT NULL DEFAULT 'c5400000-0000-0000-0000-000000000001',
  credit_card_id uuid NOT NULL DEFAULT 'c5400000-0000-0000-0000-000000000002',
  lease_credit_expense_id uuid NOT NULL DEFAULT 'c5400000-0000-0000-0000-000000000003'
) ON COMMIT DROP;
INSERT INTO chart_workflow_state DEFAULT VALUES;

INSERT INTO auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,
  email_change_token_current,reauthentication_token,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',actor_id,'authenticated','authenticated',
  'chart-workflow@behavior.test',extensions.crypt('chart-workflow', extensions.gen_salt('bf')),
  now(),'','','','','','', '{"provider":"email","providers":["email"]}','{}',now(),now()
FROM chart_workflow_state;

INSERT INTO public.organizations (id,name,slug)
SELECT organization_id,'Chart workflow behavior','chart-workflow-behavior'
FROM chart_workflow_state;
INSERT INTO public.organization_members (organization_id,user_id,role)
SELECT organization_id,actor_id,'super_admin' FROM chart_workflow_state;
INSERT INTO public.properties (id,organization_id,name,code,property_type,status)
SELECT property_id,organization_id,'Workflow property','CWF-1','apartment','active'
FROM chart_workflow_state
UNION ALL
SELECT other_property_id,organization_id,'Other workflow property','CWF-2','apartment','active'
FROM chart_workflow_state;

INSERT INTO public.finance_accounts (
  id,organization_id,account_class,account_subtype,display_name,property_id,
  use_for_lease_credits,created_by
)
SELECT property_bank_id,organization_id,'asset','bank','Workflow property bank',property_id,false,actor_id
FROM chart_workflow_state
UNION ALL
SELECT credit_card_id,organization_id,'liability','credit_card','Workflow company card',NULL,false,actor_id
FROM chart_workflow_state
UNION ALL
SELECT lease_credit_expense_id,organization_id,'expense','expense','Workflow tenant repair credit',NULL,true,actor_id
FROM chart_workflow_state;
SELECT app_private.ensure_finance_account_categories(
  organization_id,lease_credit_expense_id,actor_id
) FROM chart_workflow_state;
SELECT app_private.ensure_finance_account_source(organization_id,property_bank_id,NULL)
FROM chart_workflow_state;
SELECT app_private.ensure_finance_account_source(organization_id,credit_card_id,NULL)
FROM chart_workflow_state;

SELECT lives_ok(
  format(
    $$SELECT app_private.resolve_chart_expense_category(%L,%L,'owner_expense',%L,false)$$,
    state.organization_id,
    (SELECT account.id FROM public.finance_accounts AS account
     JOIN public.finance_account_category_links AS link ON link.account_id=account.id AND link.organization_id=account.organization_id
     JOIN public.finance_categories AS category ON category.id=link.category_id AND category.organization_id=link.organization_id
     WHERE account.organization_id=state.organization_id AND account.account_class='expense'
       AND category.namespace='owner_expense' LIMIT 1),
    state.property_id
  ),
  'an expense account resolves at the paid-cost boundary'
) FROM chart_workflow_state AS state;

SELECT throws_ok(
  format(
    $$SELECT app_private.resolve_chart_expense_category(%L,%L,'tenant_billing',%L,false)$$,
    state.organization_id,
    (SELECT id FROM public.finance_accounts WHERE organization_id=state.organization_id AND system_role='rental_income'),
    state.property_id
  ),
  '22023',NULL,'an Income lease-charge account cannot masquerade as a paid-cost account'
) FROM chart_workflow_state AS state;

SELECT lives_ok(
  format(
    $$SELECT app_private.resolve_chart_expense_category(%L,%L,'tenant_billing',%L,false)$$,
    state.organization_id,state.lease_credit_expense_id,state.property_id
  ),
  'an Expense lease-credit account resolves for a tenant-responsible paid cost'
) FROM chart_workflow_state AS state;

SELECT throws_ok(
  format(
    $$SELECT app_private.resolve_chart_lease_charge_category(%L,%L,%L,false)$$,
    state.organization_id,
    state.lease_credit_expense_id,
    state.property_id
  ),
  '22023',NULL,'an Expense lease-credit account cannot masquerade as a manual charge account'
) FROM chart_workflow_state AS state;

SELECT lives_ok(
  format(
    $$SELECT app_private.resolve_chart_lease_charge_category(%L,%L,%L,false)$$,
    state.organization_id,
    (SELECT id FROM public.finance_accounts WHERE organization_id=state.organization_id AND system_role='rental_income'),
    state.property_id
  ),
  'the configured Income account resolves at the manual-charge boundary'
) FROM chart_workflow_state AS state;

SELECT lives_ok(
  format(
    $$SELECT app_private.resolve_chart_source_for_workflow_v2(%L,%L,%L,true,false)$$,
    state.organization_id,state.credit_card_id,state.property_id
  ),
  'a Credit Card has a real checked paid-cost source representation'
) FROM chart_workflow_state AS state;

SELECT throws_ok(
  format(
    $$SELECT app_private.resolve_chart_source_for_workflow_v2(%L,%L,%L,false,false)$$,
    state.organization_id,state.credit_card_id,state.property_id
  ),
  '22023',NULL,'a Credit Card cannot be used as a tenant-payment receiving account'
) FROM chart_workflow_state AS state;

SELECT throws_ok(
  format(
    $$SELECT app_private.resolve_chart_source_for_workflow_v2(%L,%L,%L,true,false)$$,
    state.organization_id,state.property_bank_id,state.other_property_id
  ),
  '22023',NULL,'a property-scoped account cannot cross property boundaries'
) FROM chart_workflow_state AS state;

SELECT throws_ok(
  format(
    $$SELECT app_private.resolve_chart_source_for_workflow_v2(%L,%L,%L,true,false)$$,
    'c5100000-0000-0000-0000-000000000002',state.property_bank_id,state.property_id
  ),
  '22023',NULL,'an account cannot cross organization boundaries'
) FROM chart_workflow_state AS state;

SET LOCAL session_replication_role = replica;
UPDATE public.finance_accounts AS account
SET archived_at=now(),archived_by=state.actor_id
FROM chart_workflow_state AS state
WHERE account.organization_id=state.organization_id AND account.id=state.property_bank_id;
SET LOCAL session_replication_role = origin;

SELECT throws_ok(
  format(
    $$SELECT app_private.resolve_chart_source_for_workflow_v2(%L,%L,%L,true,false)$$,
    state.organization_id,state.property_bank_id,state.property_id
  ),
  '22023',NULL,'a fresh request cannot bind an archived account'
) FROM chart_workflow_state AS state;

SELECT lives_ok(
  format(
    $$SELECT app_private.resolve_chart_source_for_workflow_v2(%L,%L,%L,true,true)$$,
    state.organization_id,state.property_bank_id,state.property_id
  ),
  'an exact historical replay can resolve its archived account identity'
) FROM chart_workflow_state AS state;

INSERT INTO app_private.financial_idempotency_requests (
  organization_id,operation,idempotency_key,actor_id,payload_hash,status,result_ids,completed_at
)
SELECT organization_id,'record_tenant_invoice_payment','chart-replay-key-0001',actor_id,
  repeat('a',64),'completed','{"paymentId":"c5500000-0000-0000-0000-000000000001"}',now()
FROM chart_workflow_state;

SELECT lives_ok(
  format(
    $$SELECT app_private.bind_chart_workflow_accounts(%L,'record_tenant_invoice_payment','chart-replay-key-0001',%L,NULL,NULL,%L)$$,
    state.organization_id,state.property_bank_id,
    (SELECT source_id FROM public.finance_account_source_links WHERE organization_id=state.organization_id AND account_id=state.property_bank_id)
  ),
  'historical replay seals the exact archived account and source identity'
) FROM chart_workflow_state AS state;

SELECT lives_ok(
  format(
    $$SELECT app_private.bind_chart_workflow_accounts(%L,'record_tenant_invoice_payment','chart-replay-key-0001',%L,NULL,NULL,%L)$$,
    state.organization_id,state.property_bank_id,
    (SELECT source_id FROM public.finance_account_source_links WHERE organization_id=state.organization_id AND account_id=state.property_bank_id)
  ),
  'the same replay binding is idempotent under its update lock'
) FROM chart_workflow_state AS state;

SELECT throws_ok(
  format(
    $$SELECT app_private.bind_chart_workflow_accounts(%L,'record_tenant_invoice_payment','chart-replay-key-0001',%L,NULL,NULL,%L)$$,
    state.organization_id,state.credit_card_id,
    (SELECT source_id FROM public.finance_account_source_links WHERE organization_id=state.organization_id AND account_id=state.credit_card_id)
  ),
  '22023',NULL,'a concurrent or later replay cannot change bound account identity'
) FROM chart_workflow_state AS state;

SELECT * FROM finish();
ROLLBACK;
