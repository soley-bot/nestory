BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(124);

CREATE TEMP TABLE financial_authority_test_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  deleted_actor_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  other_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_deposit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  deposit_event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_account_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_period_id uuid NOT NULL DEFAULT gen_random_uuid(),
  petty_entry_id uuid NOT NULL DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL DEFAULT gen_random_uuid(),
  pooled_source_id uuid,
  dedicated_source_id uuid,
  other_property_source_id uuid,
  cross_source_id uuid,
  period_id uuid,
  other_period_id uuid,
  initial_revision_id uuid,
  other_revision_id uuid,
  idempotency_request_id uuid,
  reserved_ledger_id uuid NOT NULL DEFAULT gen_random_uuid(),
  reserved_journal_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO financial_authority_test_state DEFAULT VALUES;
GRANT SELECT ON financial_authority_test_state
TO anon, authenticated, service_role;
GRANT UPDATE ON financial_authority_test_state TO authenticated;

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
  label || '-' || left(user_id::text, 8) || '@example.test',
  extensions.crypt('financial-authority-test', extensions.gen_salt('bf')),
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
  SELECT admin_id, 'authority-admin' FROM financial_authority_test_state
  UNION ALL
  SELECT member_id, 'authority-member' FROM financial_authority_test_state
  UNION ALL
  SELECT manager_id, 'authority-manager' FROM financial_authority_test_state
  UNION ALL
  SELECT deleted_actor_id, 'authority-deleted-actor'
  FROM financial_authority_test_state
  UNION ALL
  SELECT cross_admin_id, 'authority-cross-admin'
  FROM financial_authority_test_state
) AS users(user_id, label);

INSERT INTO public.organizations(id, name, slug)
SELECT
  organization_id,
  'Financial authority organization',
  'financial-authority-' || left(organization_id::text, 8)
FROM financial_authority_test_state
UNION ALL
SELECT
  cross_organization_id,
  'Financial authority cross organization',
  'financial-authority-cross-' || left(cross_organization_id::text, 8)
FROM financial_authority_test_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'admin'
FROM financial_authority_test_state
UNION ALL
SELECT organization_id, member_id, 'member'
FROM financial_authority_test_state
UNION ALL
SELECT organization_id, manager_id, 'manager'
FROM financial_authority_test_state
UNION ALL
SELECT cross_organization_id, cross_admin_id, 'admin'
FROM financial_authority_test_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
)
SELECT
  property_id,
  organization_id,
  'Authority property',
  'AUTH-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM financial_authority_test_state
UNION ALL
SELECT
  other_property_id,
  organization_id,
  'Other authority property',
  'AUTH-OTHER-' || left(other_property_id::text, 8),
  'apartment',
  'active'
FROM financial_authority_test_state
UNION ALL
SELECT
  cross_property_id,
  cross_organization_id,
  'Cross authority property',
  'AUTH-CROSS-' || left(cross_property_id::text, 8),
  'apartment',
  'active'
FROM financial_authority_test_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT
  unit_id,
  organization_id,
  property_id,
  'AUTH-1',
  'occupied',
  1000,
  'USD'
FROM financial_authority_test_state;

INSERT INTO public.people(id, organization_id, display_name)
SELECT tenant_id, organization_id, 'Authority tenant'
FROM financial_authority_test_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM financial_authority_test_state;

INSERT INTO public.leases(
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  tenant_name, lease_start_date, lease_end_date, monthly_rent_amount,
  monthly_rent_currency, deposit_amount, deposit_currency, status
)
SELECT
  lease_id,
  organization_id,
  property_id,
  unit_id,
  tenant_id,
  'Authority tenant',
  '2026-01-01',
  '2026-12-31',
  1000,
  'USD',
  500,
  'USD',
  'active'
FROM financial_authority_test_state;

INSERT INTO public.lease_deposits(
  id, organization_id, lease_id, deposit_type, amount, currency, status
)
SELECT
  lease_deposit_id,
  organization_id,
  lease_id,
  'security',
  500,
  'USD',
  'pending'
FROM financial_authority_test_state;

INSERT INTO public.finance_income_items(
  id, organization_id, property_id, unit_id, lease_id, income_type,
  payer_label, due_date, amount_due, currency, status
)
SELECT
  income_id,
  organization_id,
  property_id,
  unit_id,
  lease_id,
  'rent',
  'Authority tenant',
  '2026-07-01',
  100,
  'USD',
  'open'
FROM financial_authority_test_state;

INSERT INTO public.finance_expense_items(
  id, organization_id, property_id, unit_id, expense_type, vendor_label,
  invoice_date, amount, currency, category, status
)
SELECT
  expense_id,
  organization_id,
  property_id,
  unit_id,
  'vendor_bill',
  'Authority vendor',
  '2026-07-02',
  40,
  'USD',
  'Repairs',
  'approved'
FROM financial_authority_test_state;

INSERT INTO public.finance_receipts(
  id, organization_id, property_id, received_date, amount, currency,
  payer_label
)
SELECT
  receipt_id,
  organization_id,
  property_id,
  '2026-07-03',
  100,
  'USD',
  'Authority tenant'
FROM financial_authority_test_state;

INSERT INTO public.finance_receipt_allocations(
  id, organization_id, receipt_id, income_item_id, amount
)
SELECT
  receipt_allocation_id,
  organization_id,
  receipt_id,
  income_id,
  100
FROM financial_authority_test_state;

INSERT INTO public.finance_payments(
  id, organization_id, property_id, paid_date, amount, currency, payee_label
)
SELECT
  payment_id,
  organization_id,
  property_id,
  '2026-07-04',
  40,
  'USD',
  'Authority vendor'
FROM financial_authority_test_state;

INSERT INTO public.finance_payment_allocations(
  id, organization_id, payment_id, expense_item_id, amount
)
SELECT
  payment_allocation_id,
  organization_id,
  payment_id,
  expense_id,
  40
FROM financial_authority_test_state;

INSERT INTO public.lease_deposit_events(
  id, organization_id, property_id, lease_deposit_id, event_type,
  event_date, amount, currency
)
SELECT
  deposit_event_id,
  organization_id,
  property_id,
  lease_deposit_id,
  'received',
  '2026-07-05',
  50,
  'USD'
FROM financial_authority_test_state;

INSERT INTO public.petty_cash_accounts(
  id, organization_id, account_number, name, currency, float_amount, status
)
SELECT
  petty_account_id,
  organization_id,
  'AUTH-PC',
  'Authority petty cash',
  'USD',
  100,
  'active'
FROM financial_authority_test_state;

INSERT INTO public.petty_cash_periods(
  id, organization_id, account_id, period_start, opening_balance_amount,
  status
)
SELECT
  petty_period_id,
  organization_id,
  petty_account_id,
  '2026-07-01',
  100,
  'open'
FROM financial_authority_test_state;

INSERT INTO public.petty_cash_entries(
  id, organization_id, account_id, period_id, property_id, invoice_date,
  clear_date, entry_kind, status, category, description, out_amount,
  in_amount, currency
)
SELECT
  petty_entry_id,
  organization_id,
  petty_account_id,
  petty_period_id,
  property_id,
  '2026-07-06',
  '2026-07-06',
  'expense',
  'cleared',
  'Supplies',
  'Authority petty cash expense',
  10,
  0,
  'USD'
FROM financial_authority_test_state;

INSERT INTO public.accounting_books(
  id, organization_id, book_type, name, currency, is_default
)
SELECT
  book_id,
  organization_id,
  'client',
  'Authority client book',
  'USD',
  true
FROM financial_authority_test_state;

SELECT has_table(
  'public',
  'property_reporting_periods',
  'stable property reporting periods exist'
);
SELECT has_table(
  'public',
  'property_close_revisions',
  'append-only property close revisions exist'
);
SELECT has_table(
  'public',
  'financial_reconciliation_sources',
  'stable financial reconciliation sources exist'
);
SELECT has_table(
  'app_private',
  'financial_idempotency_requests',
  'private shared financial idempotency exists'
);
SELECT has_table(
  'app_private',
  'financial_projection_context_capability',
  'private reserved-projection capability exists'
);
SELECT ok(
  (
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'property_reporting_periods'
  ),
  'property reporting periods have RLS'
);
SELECT ok(
  (
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'property_close_revisions'
  ),
  'property close revisions have RLS'
);
SELECT ok(
  (
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'financial_reconciliation_sources'
  ),
  'financial reconciliation sources have RLS'
);
SELECT table_privs_are(
  'public',
  'property_reporting_periods',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated actors have read-only period metadata privileges'
);
SELECT table_privs_are(
  'public',
  'property_close_revisions',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated actors have read-only revision metadata privileges'
);
SELECT table_privs_are(
  'public',
  'financial_reconciliation_sources',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated actors have read-only reconciliation metadata privileges'
);
SELECT table_privs_are(
  'app_private',
  'financial_idempotency_requests',
  'authenticated',
  ARRAY[]::text[],
  'authenticated actors have no private idempotency table privileges'
);
SELECT table_privs_are(
  'app_private',
  'financial_projection_context_capability',
  'authenticated',
  ARRAY[]::text[],
  'authenticated actors cannot read the projection capability'
);
SELECT table_privs_are(
  'app_private',
  'financial_projection_context_capability',
  'service_role',
  ARRAY[]::text[],
  'service role cannot read the projection capability'
);

SELECT function_privs_are(
  'app_private',
  'lock_property_reporting_period',
  ARRAY['uuid', 'uuid', 'currency_code', 'date'],
  'authenticated',
  ARRAY[]::text[],
  'authenticated actors cannot execute the private lock-only helper'
);
SELECT function_privs_are(
  'app_private',
  'lock_open_property_reporting_period',
  ARRAY['uuid', 'uuid', 'currency_code', 'date'],
  'service_role',
  ARRAY[]::text[],
  'service role cannot execute the private open-check helper'
);
SELECT has_function(
  'app_private',
  'lock_financial_authority_period_shared',
  ARRAY['uuid', 'currency_code', 'date'],
  'shared broader-period authority helper exists'
);
SELECT has_function(
  'app_private',
  'lock_financial_authority_period_exclusive',
  ARRAY['uuid', 'currency_code', 'date'],
  'exclusive broader-period authority helper exists'
);
SELECT has_function(
  'app_private',
  'lock_ledger_authority_period_exclusive',
  ARRAY['uuid', 'date'],
  'organization Ledger transition helper exists'
);
SELECT function_privs_are(
  'app_private',
  'lock_financial_authority_period_shared',
  ARRAY['uuid', 'currency_code', 'date'],
  'authenticated',
  ARRAY[]::text[],
  'authenticated actors cannot execute the private shared authority helper'
);
SELECT function_privs_are(
  'app_private',
  'lock_financial_authority_period_exclusive',
  ARRAY['uuid', 'currency_code', 'date'],
  'service_role',
  ARRAY[]::text[],
  'service role cannot execute the private exclusive authority helper'
);
SELECT table_privs_are(
  'public',
  'ledger_period_locks',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated actors can read Ledger authority but cannot bypass its transition RPC'
);
SELECT ok(
  position(
    'lock_financial_authority_period_shared' IN pg_get_functiondef(
      'app_private.lock_property_reporting_period_internal(uuid,uuid,public.currency_code,date,boolean)'::regprocedure
    )
  ) > 0,
  'property source authority takes the shared broader-period lock'
);
SELECT ok(
  position(
    'lock_ledger_authority_period_exclusive' IN pg_get_functiondef(
      'public.set_ledger_period_lock(uuid,date,boolean,text)'::regprocedure
    )
  ) > 0,
  'organization Ledger transitions take exclusive broader authority'
);
SELECT ok(
  position(
    'lock_financial_authority_period_exclusive' IN pg_get_functiondef(
      'app_private.set_accounting_period_lock_internal(uuid,uuid,date,boolean,text,uuid)'::regprocedure
    )
  ) > 0,
  'client-accounting transitions take exclusive broader authority'
);
SELECT ok(
  position(
    'ORDER BY book.id' IN pg_get_functiondef(
      'app_private.lock_property_reporting_period_internal(uuid,uuid,public.currency_code,date,boolean)'::regprocedure
    )
  ) > 0,
  'multiple active client books are checked in stable identifier order'
);
SELECT set_config(
  'app.financial_authority_period_context',
  'on',
  true
);
SELECT app_private.lock_property_reporting_period(
  (SELECT organization_id FROM financial_authority_test_state),
  (SELECT other_property_id FROM financial_authority_test_state),
  'USD',
  '2026-10-15'
);
SELECT is(
  current_setting('app.financial_authority_period_context', true),
  'on',
  'property-period helper restores a caller-owned mutation context'
);
SELECT set_config(
  'app.financial_authority_period_context',
  'off',
  true
);
SELECT function_privs_are(
  'app_private',
  'claim_financial_idempotency',
  ARRAY['uuid', 'text', 'text', 'uuid', 'jsonb'],
  'authenticated',
  ARRAY[]::text[],
  'authenticated actors cannot execute private idempotency claims'
);
SELECT function_privs_are(
  'app_private',
  'complete_financial_idempotency',
  ARRAY['uuid', 'uuid', 'uuid', 'jsonb'],
  'service_role',
  ARRAY[]::text[],
  'service role cannot execute private idempotency completion'
);
SELECT function_privs_are(
  'app_private',
  'set_financial_projection_context',
  ARRAY['boolean'],
  'authenticated',
  ARRAY[]::text[],
  'authenticated actors cannot enable the private projection context'
);
SELECT function_privs_are(
  'app_private',
  'set_financial_projection_context',
  ARRAY['boolean'],
  'service_role',
  ARRAY[]::text[],
  'service role cannot enable the private projection context'
);
SELECT ok(
  position(
    'FOR SHARE' IN pg_get_functiondef(
      'app_private.enforce_reconciliation_source_link()'::regprocedure
    )
  ) > 0,
  'reconciliation links lock their active source against archival races'
);
SELECT ok(
  position(
    'FOR SHARE' IN pg_get_functiondef(
      'public.reverse_accounting_journal(uuid,uuid,date,text)'::regprocedure
    )
  ) > 0,
  'generic journal reversal locks the inspected source row'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT public.create_financial_reconciliation_source(%L,%L,%L,%L,%L,%L,NULL,NULL)',
    (SELECT organization_id FROM financial_authority_test_state),
    'MEMBER-SOURCE',
    'Member source',
    'bank',
    'organization_pooled',
    'USD'
  ),
  '42501',
  'Not authorized',
  'member cannot create a reconciliation source'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT manager_id::text FROM financial_authority_test_state),
  true
);
SELECT throws_ok(
  format(
    'SELECT public.create_financial_reconciliation_source(%L,%L,%L,%L,%L,%L,NULL,NULL)',
    (SELECT organization_id FROM financial_authority_test_state),
    'MANAGER-SOURCE',
    'Manager source',
    'bank',
    'organization_pooled',
    'USD'
  ),
  '42501',
  'Not authorized',
  'manager cannot create a reconciliation source'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM financial_authority_test_state),
  true
);
SELECT throws_ok(
  format(
    'SELECT public.create_financial_reconciliation_source(%L,%L,%L,%L,%L,%L,NULL,NULL)',
    (SELECT organization_id FROM financial_authority_test_state),
    'CROSS-SOURCE',
    'Cross source',
    'bank',
    'organization_pooled',
    'USD'
  ),
  '42501',
  'Not authorized',
  'cross-organization admin cannot create a reconciliation source'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SELECT throws_ok(
  format(
    'INSERT INTO public.financial_reconciliation_sources (organization_id,currency,code,display_name,source_kind,scope_kind) VALUES (%L,%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    'USD',
    'DIRECT',
    'Direct source',
    'bank',
    'organization_pooled'
  ),
  '42501',
  NULL,
  'admin direct reconciliation-source DML is denied'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
UPDATE financial_authority_test_state
SET pooled_source_id = public.create_financial_reconciliation_source(
  organization_id,
  'POOL-USD',
  'Pooled USD source',
  'bank',
  'organization_pooled',
  'USD',
  NULL,
  'ending 1234'
);
UPDATE financial_authority_test_state
SET dedicated_source_id = public.create_financial_reconciliation_source(
  organization_id,
  'PROPERTY-USD',
  'Dedicated property source',
  'bank',
  'property_dedicated',
  'USD',
  property_id,
  'ending 5678'
);
UPDATE financial_authority_test_state
SET other_property_source_id = public.create_financial_reconciliation_source(
  organization_id,
  'OTHER-PROPERTY-USD',
  'Other property source',
  'bank',
  'property_dedicated',
  'USD',
  other_property_id,
  NULL
);
SELECT lives_ok(
  format(
    'SELECT public.update_financial_reconciliation_source_label(%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT pooled_source_id FROM financial_authority_test_state),
    'Pooled USD source renamed',
    'ending 1234'
  ),
  'checked admin label update succeeds'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
UPDATE financial_authority_test_state
SET cross_source_id = public.create_financial_reconciliation_source(
  cross_organization_id,
  'CROSS-USD',
  'Cross organization source',
  'bank',
  'organization_pooled',
  'USD',
  NULL,
  NULL
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.financial_reconciliation_sources
  ),
  1,
  'cross-organization admin reads only its own reconciliation metadata'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.financial_reconciliation_sources
  ),
  3,
  'same-organization admin reads its reconciliation metadata'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT is_empty(
  'SELECT id FROM public.financial_reconciliation_sources',
  'same-organization member cannot read admin-only reconciliation metadata'
);
RESET ROLE;

SELECT set_config(
  'app.financial_reconciliation_source_context',
  'on',
  true
);
SELECT throws_ok(
  format(
    'INSERT INTO public.financial_reconciliation_sources (organization_id,property_id,currency,code,display_name,source_kind,scope_kind) VALUES (%L,%L,%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    'USD',
    'BAD-POOLED',
    'Bad pooled source',
    'bank',
    'organization_pooled'
  ),
  '23514',
  NULL,
  'pooled source rejects a property identity'
);
SELECT throws_ok(
  format(
    'INSERT INTO public.financial_reconciliation_sources (organization_id,currency,code,display_name,source_kind,scope_kind) VALUES (%L,%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    'USD',
    'BAD-DEDICATED',
    'Bad dedicated source',
    'bank',
    'property_dedicated'
  ),
  '23514',
  NULL,
  'dedicated source requires a property identity'
);
SELECT set_config(
  'app.financial_reconciliation_source_context',
  'off',
  true
);

SELECT lives_ok(
  format(
    'UPDATE public.finance_receipts SET reconciliation_source_id = %L WHERE id = %L',
    (SELECT pooled_source_id FROM financial_authority_test_state),
    (SELECT receipt_id FROM financial_authority_test_state)
  ),
  'pooled source links to a receipt'
);
SELECT lives_ok(
  format(
    'UPDATE public.finance_payments SET reconciliation_source_id = %L WHERE id = %L',
    (SELECT dedicated_source_id FROM financial_authority_test_state),
    (SELECT payment_id FROM financial_authority_test_state)
  ),
  'matching dedicated source links to a payment'
);
SELECT lives_ok(
  format(
    'UPDATE public.lease_deposit_events SET reconciliation_source_id = %L WHERE id = %L',
    (SELECT pooled_source_id FROM financial_authority_test_state),
    (SELECT deposit_event_id FROM financial_authority_test_state)
  ),
  'pooled source links to a deposit event'
);
SELECT lives_ok(
  format(
    'UPDATE public.petty_cash_entries SET reconciliation_source_id = %L WHERE id = %L',
    (SELECT dedicated_source_id FROM financial_authority_test_state),
    (SELECT petty_entry_id FROM financial_authority_test_state)
  ),
  'matching dedicated source links to petty cash'
);
SELECT throws_ok(
  format(
    'UPDATE public.finance_receipts SET reconciliation_source_id = %L WHERE id = %L',
    (SELECT other_property_source_id FROM financial_authority_test_state),
    (SELECT receipt_id FROM financial_authority_test_state)
  ),
  '22023',
  'Dedicated financial reconciliation source does not match the property',
  'wrong-property dedicated source link is rejected'
);
SELECT throws_ok(
  format(
    'UPDATE public.finance_receipts SET reconciliation_source_id = %L WHERE id = %L',
    (SELECT cross_source_id FROM financial_authority_test_state),
    (SELECT receipt_id FROM financial_authority_test_state)
  ),
  '23503',
  NULL,
  'cross-organization source link is rejected'
);
SELECT ok(
  position(
    'v_source.currency <> NEW.currency'
    IN pg_get_functiondef(
      'app_private.enforce_reconciliation_source_link()'::regprocedure
    )
  ) > 0,
  'source-link trigger enforces exact currency'
);

SELECT set_config(
  'app.financial_reconciliation_source_context',
  'on',
  true
);
SELECT throws_ok(
  format(
    'UPDATE public.financial_reconciliation_sources SET source_kind = %L WHERE id = %L',
    'clearing',
    (SELECT pooled_source_id FROM financial_authority_test_state)
  ),
  '55000',
  'Referenced financial reconciliation source scope is immutable',
  'referenced reconciliation source core scope is immutable'
);
SELECT set_config(
  'app.financial_reconciliation_source_context',
  'off',
  true
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT reconciliation_source_id
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM financial_authority_test_state),
      (SELECT property_id FROM financial_authority_test_state),
      'USD',
      '2026-07-01',
      '2026-07-31',
      NULL,
      NULL,
      NULL,
      100
    )
    WHERE source_type = 'receipt_allocation'
      AND source_id = (
        SELECT receipt_allocation_id
        FROM financial_authority_test_state
      )
  ),
  (SELECT pooled_source_id FROM financial_authority_test_state),
  'property cash event exposes the exact linked source'
);
SELECT is(
  (
    SELECT reconciliation_state
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM financial_authority_test_state),
      (SELECT property_id FROM financial_authority_test_state),
      'USD',
      '2026-07-01',
      '2026-07-31',
      NULL,
      NULL,
      NULL,
      100
    )
    WHERE source_type = 'receipt_allocation'
      AND source_id = (
        SELECT receipt_allocation_id
        FROM financial_authority_test_state
      )
  ),
  'linked_exact_identity',
  'property cash event exposes linked reconciliation state'
);
SELECT is(
  (
    SELECT
      resolution_codes IS NOT NULL
      AND NOT coalesce(
        'missing_reconciliation_source' = ANY(resolution_codes),
        false
      )
    FROM public.get_property_cash_events_v1_page(
      (SELECT organization_id FROM financial_authority_test_state),
      (SELECT property_id FROM financial_authority_test_state),
      'USD',
      '2026-07-01',
      '2026-07-31',
      NULL,
      NULL,
      NULL,
      100
    )
    WHERE source_type = 'receipt_allocation'
      AND source_id = (
        SELECT receipt_allocation_id
        FROM financial_authority_test_state
      )
  ),
  true,
  'linked property cash event returns non-null codes without the missing-source code'
);
SELECT is(
  (
    SELECT contract_version
    FROM public.get_finance_inventory_page(
      (SELECT organization_id FROM financial_authority_test_state),
      (SELECT property_id FROM financial_authority_test_state),
      'USD',
      '2026-07-01',
      '2026-07-31',
      'sources',
      NULL,
      1000,
      NULL,
      NULL
    )
    LIMIT 1
  ),
  'finance_inventory_v3',
  'Plan 01 reports the reconciliation-aware contract version'
);
SELECT is(
  (
    SELECT payload ->> 'reconciliationSourceId'
    FROM public.get_finance_inventory_page(
      (SELECT organization_id FROM financial_authority_test_state),
      (SELECT property_id FROM financial_authority_test_state),
      'USD',
      '2026-07-01',
      '2026-07-31',
      'sources',
      NULL,
      1000,
      NULL,
      NULL
    )
    WHERE stable_key = 'receipt_allocation:' || (
      SELECT receipt_allocation_id::text
      FROM financial_authority_test_state
    )
  ),
  (SELECT pooled_source_id::text FROM financial_authority_test_state),
  'Plan 01 source row exposes exact reconciliation identity'
);
SELECT is_empty(
  format(
    'SELECT 1 FROM public.get_finance_inventory_page(%L,%L,%L,%L,%L,%L,NULL,1000,ARRAY[%L],NULL) WHERE stable_key = %L',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    'USD',
    '2026-07-01',
    '2026-07-31',
    'diagnostics',
    'MISSING_STABLE_RECONCILIATION_IDENTITY',
    'MISSING_STABLE_RECONCILIATION_IDENTITY:receipt_allocation:'
      || (SELECT receipt_allocation_id::text FROM financial_authority_test_state)
  ),
  'Plan 01 suppresses missing-source diagnostics for linked evidence'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'INSERT INTO public.property_reporting_periods (organization_id,property_id,currency,period_start) VALUES (%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    'USD',
    '2026-07-01'
  ),
  '42501',
  NULL,
  'admin direct property-period DML is denied'
);
SELECT throws_ok(
  format(
    'INSERT INTO public.property_close_revisions (organization_id,property_reporting_period_id,revision_number,revision_kind,calculation_contract_version) VALUES (%L,%L,1,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    gen_random_uuid(),
    'initial_close',
    'test-v1'
  ),
  '42501',
  NULL,
  'admin direct close-revision DML is denied'
);
RESET ROLE;

CREATE TEMP TABLE financial_authority_period_watermark_before AS
SELECT payload ->> 'hash' AS hash
FROM public.get_finance_inventory_page(
  (SELECT organization_id FROM financial_authority_test_state),
  (SELECT property_id FROM financial_authority_test_state),
  'USD',
  '2026-07-01',
  '2026-07-31',
  'watermark',
  NULL,
  1000,
  NULL,
  NULL
);
UPDATE financial_authority_test_state
SET period_id = app_private.lock_property_reporting_period(
  organization_id,
  property_id,
  'USD',
  '2026-07-19'
);
SELECT is(
  app_private.lock_property_reporting_period(
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    'USD',
    '2026-07-01'
  ),
  (SELECT period_id FROM financial_authority_test_state),
  'one property/currency/month resolves to one stable header'
);
SELECT isnt(
  (SELECT hash FROM financial_authority_period_watermark_before),
  (
    SELECT payload ->> 'hash'
    FROM public.get_finance_inventory_page(
      (SELECT organization_id FROM financial_authority_test_state),
      (SELECT property_id FROM financial_authority_test_state),
      'USD',
      '2026-07-01',
      '2026-07-31',
      'watermark',
      NULL,
      1000,
      NULL,
      NULL
    )
  ),
  'property reporting-period mutations alter the material watermark'
);
SELECT is(
  (
    SELECT period_start
    FROM public.property_reporting_periods
    WHERE id = (SELECT period_id FROM financial_authority_test_state)
  ),
  '2026-07-01'::date,
  'property-period helper normalizes to month start'
);
UPDATE financial_authority_test_state
SET other_period_id = app_private.lock_property_reporting_period(
  organization_id,
  other_property_id,
  'USD',
  '2026-07-01'
);
SELECT isnt(
  (SELECT period_id FROM financial_authority_test_state),
  (SELECT other_period_id FROM financial_authority_test_state),
  'different properties have independent period headers'
);
SELECT throws_ok(
  format(
    'SELECT app_private.lock_property_reporting_period(%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT cross_property_id FROM financial_authority_test_state),
    'USD',
    '2026-07-01'
  ),
  '23503',
  'Property is outside the requested organization',
  'property-period helper rejects cross-organization property identity'
);

SELECT set_config('app.financial_authority_period_context', 'on', true);
UPDATE public.property_reporting_periods
SET lifecycle_status = 'closed'
WHERE id = (SELECT period_id FROM financial_authority_test_state);
SELECT set_config('app.financial_authority_period_context', 'off', true);
SELECT throws_ok(
  format(
    'SELECT app_private.lock_open_property_reporting_period(%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    'USD',
    '2026-07-15'
  ),
  '22023',
  'Property reporting period is not open',
  'closed property period is rejected by the open-check helper'
);
SELECT lives_ok(
  format(
    'SELECT app_private.lock_open_property_reporting_period(%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT other_property_id FROM financial_authority_test_state),
    'USD',
    '2026-07-15'
  ),
  'closed property does not block another property'
);
SELECT set_config('app.financial_authority_period_context', 'on', true);
UPDATE public.property_reporting_periods
SET lifecycle_status = 'in_review'
WHERE id = (SELECT other_period_id FROM financial_authority_test_state);
SELECT set_config('app.financial_authority_period_context', 'off', true);
SELECT throws_ok(
  format(
    'SELECT app_private.lock_open_property_reporting_period(%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT other_property_id FROM financial_authority_test_state),
    'USD',
    '2026-07-15'
  ),
  '22023',
  'Property reporting period is not open',
  'in-review property period is rejected by the open-check helper'
);
SELECT set_config('app.financial_authority_period_context', 'on', true);
UPDATE public.property_reporting_periods
SET lifecycle_status = 'open'
WHERE id = (SELECT other_period_id FROM financial_authority_test_state);
SELECT set_config('app.financial_authority_period_context', 'off', true);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format(
    'SELECT public.set_accounting_period_lock(%L,%L,%L,true,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT book_id FROM financial_authority_test_state),
    '2026-09-01',
    'Authenticated RPC regression'
  ),
  'authorized public accounting-period lock path reaches its private writer'
);
SELECT lives_ok(
  format(
    'SELECT public.set_accounting_period_lock(%L,%L,%L,false,NULL)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT book_id FROM financial_authority_test_state),
    '2026-09-01'
  ),
  'authorized public accounting-period unlock path reaches its private writer'
);
SELECT is(
  (
    SELECT lock_reason
    FROM public.accounting_periods
    WHERE book_id = (
      SELECT book_id FROM financial_authority_test_state
    )
      AND period_start = '2026-09-01'
  ),
  NULL::text,
  'accounting unlock clears the visible lock reason'
);
SELECT throws_ok(
  format(
    'SELECT public.set_accounting_period_lock(%L,%L,%L,true,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT book_id FROM financial_authority_test_state),
    '2026-09-01',
    repeat('x', 401)
  ),
  '22023',
  'Reason is too long',
  'accounting lock rejects reasons beyond the shared 400-character limit'
);
SELECT lives_ok(
  format(
    'SELECT public.set_ledger_period_lock(%L,%L,true,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    '2026-09-01',
    'Ledger lock reason'
  ),
  'serialized Ledger lock RPC remains available to organization admins'
);
SELECT lives_ok(
  format(
    'SELECT public.set_ledger_period_lock(%L,%L,false,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    '2026-09-01',
    'Unlock audit reason'
  ),
  'serialized Ledger unlock RPC remains available to organization admins'
);
SELECT is(
  (
    SELECT reason
    FROM public.ledger_period_locks
    WHERE organization_id = (
      SELECT organization_id FROM financial_authority_test_state
    )
      AND period_start = '2026-09-01'
  ),
  NULL::text,
  'Ledger unlock clears the visible lock reason'
);
RESET ROLE;

INSERT INTO public.ledger_period_locks(
  organization_id, period_start, locked_at, locked_by
)
SELECT organization_id, '2026-07-01', now(), admin_id
FROM financial_authority_test_state;
SELECT throws_ok(
  format(
    'SELECT app_private.lock_open_property_reporting_period(%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT other_property_id FROM financial_authority_test_state),
    'USD',
    '2026-07-15'
  ),
  '22023',
  'Organization Ledger period is locked',
  'organization Ledger lock remains an independent blocker'
);
DELETE FROM public.ledger_period_locks
WHERE organization_id = (
  SELECT organization_id FROM financial_authority_test_state
);

INSERT INTO public.accounting_periods(
  organization_id, book_id, period_start, status, locked_at, locked_by
)
SELECT organization_id, book_id, '2026-07-01', 'locked', now(), admin_id
FROM financial_authority_test_state;
SELECT throws_ok(
  format(
    'SELECT app_private.lock_open_property_reporting_period(%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT other_property_id FROM financial_authority_test_state),
    'USD',
    '2026-07-15'
  ),
  '22023',
  'Accounting book period is locked',
  'client-book period lock remains an independent blocker'
);
DELETE FROM public.accounting_periods
WHERE organization_id = (
  SELECT organization_id FROM financial_authority_test_state
);

SELECT set_config('app.financial_authority_period_context', 'on', true);
INSERT INTO public.property_close_revisions(
  organization_id,
  property_reporting_period_id,
  revision_number,
  revision_kind,
  calculation_contract_version
)
SELECT organization_id, period_id, 1, 'initial_close', 'test-v1'
FROM financial_authority_test_state;
UPDATE financial_authority_test_state
SET initial_revision_id = (
  SELECT id
  FROM public.property_close_revisions
  WHERE property_reporting_period_id =
    financial_authority_test_state.period_id
);
SELECT throws_ok(
  format(
    'INSERT INTO public.property_close_revisions (organization_id,property_reporting_period_id,revision_number,revision_kind,previous_revision_id,calculation_contract_version) VALUES (%L,%L,2,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT period_id FROM financial_authority_test_state),
    'initial_close',
    (SELECT initial_revision_id FROM financial_authority_test_state),
    'test-v1'
  ),
  '22023',
  'Close revision kind must alternate reopen and reclose after initial close',
  'initial close cannot be appended more than once'
);
SELECT throws_ok(
  format(
    'INSERT INTO public.property_close_revisions (organization_id,property_reporting_period_id,revision_number,revision_kind,previous_revision_id,calculation_contract_version,reason) VALUES (%L,%L,3,%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT period_id FROM financial_authority_test_state),
    'reclose',
    (SELECT initial_revision_id FROM financial_authority_test_state),
    'test-v1',
    'Skipped revision'
  ),
  '22023',
  'Close revisions must append to the exact latest revision',
  'close revision sequence cannot skip a number'
);
SELECT throws_ok(
  format(
    'UPDATE public.property_close_revisions SET calculation_contract_version = %L WHERE id = %L',
    'tampered',
    (SELECT initial_revision_id FROM financial_authority_test_state)
  ),
  '55000',
  'Property close revisions are append-only',
  'existing close revision cannot be updated'
);
SELECT throws_ok(
  format(
    'DELETE FROM public.property_close_revisions WHERE id = %L',
    (SELECT initial_revision_id FROM financial_authority_test_state)
  ),
  '55000',
  'Property close revisions are append-only',
  'existing close revision cannot be deleted'
);
INSERT INTO public.property_close_revisions(
  organization_id,
  property_reporting_period_id,
  revision_number,
  revision_kind,
  calculation_contract_version
)
SELECT organization_id, other_period_id, 1, 'initial_close', 'test-v1'
FROM financial_authority_test_state;
UPDATE financial_authority_test_state
SET other_revision_id = (
  SELECT id
  FROM public.property_close_revisions
  WHERE property_reporting_period_id =
    financial_authority_test_state.other_period_id
);
SELECT throws_ok(
  format(
    'UPDATE public.property_reporting_periods SET current_close_revision_id = %L WHERE id = %L',
    (SELECT other_revision_id FROM financial_authority_test_state),
    (SELECT period_id FROM financial_authority_test_state)
  ),
  '23503',
  NULL,
  'current revision pointer cannot cross property periods'
);
UPDATE public.property_reporting_periods
SET current_close_revision_id = (
  SELECT initial_revision_id FROM financial_authority_test_state
)
WHERE id = (SELECT period_id FROM financial_authority_test_state);
SELECT set_config('app.financial_authority_period_context', 'off', true);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.property_reporting_periods),
  3,
  'same-organization admin reads property reporting periods'
);
SELECT is(
  (SELECT count(*)::integer FROM public.property_close_revisions),
  2,
  'same-organization admin reads property close revisions'
);
RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT is_empty(
  'SELECT 1 FROM public.property_reporting_periods',
  'same-organization member cannot read admin-only reporting periods'
);
SELECT is_empty(
  'SELECT 1 FROM public.property_close_revisions',
  'same-organization member cannot read admin-only close revisions'
);
RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT is_empty(
  'SELECT 1 FROM public.property_reporting_periods',
  'cross-organization admin cannot read reporting periods'
);
SELECT is_empty(
  'SELECT 1 FROM public.property_close_revisions',
  'cross-organization admin cannot read close revisions'
);
RESET ROLE;

SELECT is(
  app_private.canonical_financial_payload_hash(
    '{"amount":"10.00","source":"receipt"}'::jsonb
  ),
  app_private.canonical_financial_payload_hash(
    '{"source":"receipt","amount":"10.00"}'::jsonb
  ),
  'canonical payload hash is independent of JSON key order'
);
WITH claimed AS (
  SELECT *
  FROM app_private.claim_financial_idempotency(
    (SELECT organization_id FROM financial_authority_test_state),
    'record_receipt',
    'authority-test-key-0001',
    (SELECT admin_id FROM financial_authority_test_state),
    '{"amount":"10.00","source":"receipt"}'::jsonb
  )
)
UPDATE financial_authority_test_state
SET idempotency_request_id = (SELECT request_id FROM claimed);
SELECT is(
  (
    SELECT status
    FROM app_private.financial_idempotency_requests
    WHERE id = (
      SELECT idempotency_request_id FROM financial_authority_test_state
    )
  ),
  'pending',
  'first idempotency claim creates one pending authority record'
);
SELECT is(
  app_private.complete_financial_idempotency(
    (SELECT idempotency_request_id FROM financial_authority_test_state),
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT admin_id FROM financial_authority_test_state),
    jsonb_build_object(
      'receiptId',
      (SELECT receipt_id FROM financial_authority_test_state)
    )
  ),
  jsonb_build_object(
    'receiptId',
    (SELECT receipt_id FROM financial_authority_test_state)
  ),
  'idempotency completion stores exact result identities'
);
SELECT results_eq(
  format(
    'SELECT is_replay,result_ids FROM app_private.claim_financial_idempotency(%L,%L,%L,%L,%L::jsonb)',
    (SELECT organization_id FROM financial_authority_test_state),
    'record_receipt',
    'authority-test-key-0001',
    (SELECT admin_id FROM financial_authority_test_state),
    '{"source":"receipt","amount":"10.00"}'
  ),
  format(
    'VALUES (true,%L::jsonb)',
    jsonb_build_object(
      'receiptId',
      (SELECT receipt_id FROM financial_authority_test_state)
    )::text
  ),
  'identical actor and payload replays the original result IDs'
);
SELECT throws_ok(
  format(
    'SELECT * FROM app_private.claim_financial_idempotency(%L,%L,%L,%L,%L::jsonb)',
    (SELECT organization_id FROM financial_authority_test_state),
    'record_receipt',
    'authority-test-key-0001',
    (SELECT admin_id FROM financial_authority_test_state),
    '{"source":"receipt","amount":"11.00"}'
  ),
  '22023',
  'Conflicting financial idempotency request',
  'changed payload fails closed'
);
SELECT throws_ok(
  format(
    'SELECT * FROM app_private.claim_financial_idempotency(%L,%L,%L,%L,%L::jsonb)',
    (SELECT organization_id FROM financial_authority_test_state),
    'record_receipt',
    'authority-test-key-0001',
    (SELECT manager_id FROM financial_authority_test_state),
    '{"source":"receipt","amount":"10.00"}'
  ),
  '22023',
  'Conflicting financial idempotency request',
  'cross-actor key reuse returns a generic conflict without result leakage'
);

SELECT *
FROM app_private.claim_financial_idempotency(
  (SELECT organization_id FROM financial_authority_test_state),
  'record_receipt',
  'authority-test-key-deleted-actor',
  (SELECT deleted_actor_id FROM financial_authority_test_state),
  '{"amount":"12.00","source":"receipt"}'::jsonb
);
DELETE FROM auth.users
WHERE id = (SELECT deleted_actor_id FROM financial_authority_test_state);
SELECT is(
  (
    SELECT actor_id
    FROM app_private.financial_idempotency_requests
    WHERE idempotency_key = 'authority-test-key-deleted-actor'
  ),
  NULL::uuid,
  'retained idempotency history does not block actor deletion'
);
SELECT throws_ok(
  format(
    'SELECT * FROM app_private.claim_financial_idempotency(%L,%L,%L,%L,%L::jsonb)',
    (SELECT organization_id FROM financial_authority_test_state),
    'record_receipt',
    'authority-test-key-deleted-actor',
    (SELECT admin_id FROM financial_authority_test_state),
    '{"amount":"12.00","source":"receipt"}'
  ),
  '22023',
  'Conflicting financial idempotency request',
  'a deleted actor idempotency key cannot leak results to another actor'
);

CREATE OR REPLACE FUNCTION pg_temp.claim_then_fail()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM *
  FROM app_private.claim_financial_idempotency(
    (SELECT organization_id FROM financial_authority_test_state),
    'record_payment',
    'authority-test-key-rollback',
    (SELECT admin_id FROM financial_authority_test_state),
    '{"amount":"40.00","source":"payment"}'::jsonb
  );
  RAISE EXCEPTION 'forced idempotency rollback';
END;
$$;
SELECT throws_ok(
  'SELECT pg_temp.claim_then_fail()',
  'P0001',
  'forced idempotency rollback',
  'forced source failure rolls back the idempotency claim'
);
SELECT is_empty(
  $$
    SELECT 1
    FROM app_private.financial_idempotency_requests
    WHERE idempotency_key = 'authority-test-key-rollback'
  $$,
  'failed surrounding transaction leaves no pending claim'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM unnest(ARRAY[
      'receipt_allocation',
      'payment_allocation',
      'deposit_event',
      'petty_cash_entry',
      'rent_charge_occurrence',
      'maintenance_handoff',
      'management_fee_assessment',
      'owner_cash_event',
      'financial_adjustment'
    ]) AS source_type
    WHERE app_private.is_reserved_financial_source_type(source_type)
  ),
  9,
  'one reserved-source predicate recognizes the complete namespace'
);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'INSERT INTO public.ledger_entries (organization_id,property_id,transaction_date,direction,category,amount,currency,source_type,source_id) VALUES (%L,%L,%L,%L,%L,10,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    '2026-07-08',
    'income',
    'Reserved receipt through Data API role',
    'USD',
    'receipt_allocation',
    (SELECT receipt_allocation_id FROM financial_authority_test_state)
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'authenticated direct reserved Ledger insertion is denied'
);
SELECT set_config(
  'app.financial_projection_context',
  'reserved-v1',
  true
);
SELECT throws_ok(
  format(
    'INSERT INTO public.ledger_entries (organization_id,property_id,transaction_date,direction,category,amount,currency,source_type,source_id) VALUES (%L,%L,%L,%L,%L,10,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    '2026-07-08',
    'income',
    'Spoofed reserved namespace',
    'USD',
    reserved_source_type,
    gen_random_uuid()
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  format(
    'authenticated context spoof cannot write %s projections',
    reserved_source_type
  )
)
FROM unnest(ARRAY[
  'receipt_allocation',
  'payment_allocation',
  'deposit_event',
  'petty_cash_entry',
  'rent_charge_occurrence',
  'maintenance_handoff',
  'management_fee_assessment',
  'owner_cash_event',
  'financial_adjustment'
]) AS reserved_source_type;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config(
  'app.financial_projection_context',
  'reserved-v1',
  true
);
SELECT throws_ok(
  format(
    'INSERT INTO public.ledger_entries (organization_id,property_id,transaction_date,direction,category,amount,currency,source_type,source_id) VALUES (%L,%L,%L,%L,%L,10,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    '2026-07-08',
    'income',
    'Service-role context spoof',
    'USD',
    'receipt_allocation',
    gen_random_uuid()
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'service-role context spoof cannot write reserved projections'
);
RESET ROLE;
SELECT throws_ok(
  format(
    'INSERT INTO public.ledger_entries (id,organization_id,property_id,transaction_date,direction,category,amount,currency,source_type,source_id) VALUES (%L,%L,%L,%L,%L,%L,10,%L,%L,%L)',
    (SELECT reserved_ledger_id FROM financial_authority_test_state),
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    '2026-07-08',
    'income',
    'Reserved receipt',
    'USD',
    'receipt_allocation',
    (SELECT receipt_allocation_id FROM financial_authority_test_state)
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'direct reserved Ledger insertion is denied'
);
SELECT app_private.set_financial_projection_context(true);
INSERT INTO public.ledger_entries(
  id, organization_id, property_id, transaction_date, direction, category,
  amount, currency, source_type, source_id
)
SELECT
  reserved_ledger_id,
  organization_id,
  property_id,
  '2026-07-08',
  'income',
  'Reserved receipt',
  10,
  'USD',
  'receipt_allocation',
  receipt_allocation_id
FROM financial_authority_test_state;
SELECT throws_ok(
  format(
    'INSERT INTO public.ledger_entries (organization_id,property_id,transaction_date,direction,category,amount,currency,source_type,source_id) VALUES (%L,%L,%L,%L,%L,10,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    '2026-07-08',
    'income',
    'Duplicate reserved receipt',
    'USD',
    'receipt_allocation',
    (SELECT receipt_allocation_id FROM financial_authority_test_state)
  ),
  '23505',
  NULL,
  'reserved Ledger source identity is exact-once'
);
SELECT throws_ok(
  format(
    'INSERT INTO public.ledger_entries (organization_id,property_id,transaction_date,direction,category,amount,currency,source_type,source_id) VALUES (%L,%L,%L,%L,%L,10,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    '2026-07-08',
    'income',
    'Non-canonical reserved receipt',
    'USD',
    ' RECEIPT_ALLOCATION ',
    gen_random_uuid()
  ),
  '23514',
  NULL,
  'reserved Ledger source type must use canonical lower-case spelling'
);
SELECT throws_ok(
  format(
    'INSERT INTO public.ledger_entries (organization_id,property_id,transaction_date,direction,category,amount,currency,source_type) VALUES (%L,%L,%L,%L,%L,10,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    '2026-07-08',
    'income',
    'Reserved receipt without identity',
    'USD',
    'receipt_allocation'
  ),
  '23514',
  NULL,
  'reserved Ledger projection requires a source identity'
);
SELECT app_private.set_financial_projection_context(false);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT public.update_ledger_entry(%L,%L,%L,NULL,%L,%L,%L,10,%L,%L)',
    (SELECT reserved_ledger_id FROM financial_authority_test_state),
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    '2026-07-08',
    'income',
    'Changed reserved receipt',
    'USD',
    'attempted generic edit'
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'generic Ledger update cannot edit a reserved projection'
);
SELECT throws_ok(
  format(
    'SELECT public.archive_ledger_entry(%L,%L)',
    (SELECT reserved_ledger_id FROM financial_authority_test_state),
    (SELECT organization_id FROM financial_authority_test_state)
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'generic Ledger archive cannot archive a reserved projection'
);
RESET ROLE;

SELECT app_private.set_financial_projection_context(true);
UPDATE public.ledger_entries
SET archived_at = now()
WHERE id = (SELECT reserved_ledger_id FROM financial_authority_test_state);
SELECT app_private.set_financial_projection_context(false);
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT public.restore_ledger_entry(%L,%L)',
    (SELECT reserved_ledger_id FROM financial_authority_test_state),
    (SELECT organization_id FROM financial_authority_test_state)
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'generic Ledger restore cannot restore a reserved projection'
);
RESET ROLE;
SELECT throws_ok(
  format(
    'DELETE FROM public.ledger_entries WHERE id = %L',
    (SELECT reserved_ledger_id FROM financial_authority_test_state)
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'direct reserved Ledger deletion is denied'
);
SELECT lives_ok(
  format(
    'INSERT INTO public.ledger_entries (organization_id,property_id,transaction_date,direction,category,amount,currency,source_type) VALUES (%L,%L,%L,%L,%L,1,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT property_id FROM financial_authority_test_state),
    '2026-07-09',
    'income',
    'Legacy manual',
    'USD',
    'manual'
  ),
  'existing manual Ledger insertion remains available'
);

SELECT throws_ok(
  format(
    'INSERT INTO public.accounting_journal_entries (id,organization_id,book_id,entry_date,currency,description,source_type,source_id,posting_key,payload_hash) VALUES (%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    (SELECT reserved_journal_id FROM financial_authority_test_state),
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT book_id FROM financial_authority_test_state),
    '2026-07-08',
    'USD',
    'Reserved journal',
    'receipt_allocation',
    (SELECT receipt_allocation_id FROM financial_authority_test_state),
    'reserved',
    repeat('a', 64)
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'direct reserved journal insertion is denied'
);
SELECT app_private.set_financial_projection_context(true);
INSERT INTO public.accounting_journal_entries(
  id, organization_id, book_id, entry_date, currency, description,
  source_type, source_id, posting_key, payload_hash
)
SELECT
  reserved_journal_id,
  organization_id,
  book_id,
  '2026-07-08',
  'USD',
  'Reserved journal',
  'receipt_allocation',
  receipt_allocation_id,
  'reserved',
  repeat('a', 64)
FROM financial_authority_test_state;
SELECT throws_ok(
  format(
    'INSERT INTO public.accounting_journal_entries (organization_id,book_id,entry_date,currency,description,source_type,source_id,posting_key,payload_hash) VALUES (%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT book_id FROM financial_authority_test_state),
    '2026-07-08',
    'USD',
    'Duplicate reserved journal',
    'receipt_allocation',
    (SELECT receipt_allocation_id FROM financial_authority_test_state),
    'other-posting-key',
    repeat('b', 64)
  ),
  '23505',
  NULL,
  'reserved journal identity is exact-once per book'
);
SELECT throws_ok(
  format(
    'INSERT INTO public.accounting_journal_entries (organization_id,book_id,entry_date,currency,description,source_type,source_id,posting_key,payload_hash) VALUES (%L,%L,%L,%L,%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT book_id FROM financial_authority_test_state),
    '2026-07-08',
    'USD',
    'Non-canonical reserved journal',
    ' RECEIPT_ALLOCATION ',
    gen_random_uuid(),
    'non-canonical',
    repeat('c', 64)
  ),
  '23514',
  NULL,
  'reserved journal source type must use canonical lower-case spelling'
);
SELECT app_private.set_financial_projection_context(false);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    'SELECT public.post_accounting_journal(%L,%L,%L,%L,%L,%L,%L,%L,NULL,%L::jsonb)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT book_id FROM financial_authority_test_state),
    'receipt_allocation',
    (SELECT receipt_allocation_id FROM financial_authority_test_state),
    'generic-impersonation',
    '2026-07-08',
    'USD',
    'Generic reserved impersonation',
    '[]'
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'generic journal post cannot impersonate a reserved source'
);
SELECT throws_ok(
  format(
    'SELECT public.reverse_accounting_journal(%L,%L,%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT reserved_journal_id FROM financial_authority_test_state),
    '2026-07-09',
    'Generic reversal attempt'
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'generic journal reversal cannot reverse a reserved projection'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM financial_authority_test_state),
  true
);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format(
    'SELECT public.archive_financial_reconciliation_source(%L,%L)',
    (SELECT organization_id FROM financial_authority_test_state),
    (SELECT pooled_source_id FROM financial_authority_test_state)
  ),
  'checked admin source archive succeeds without rewriting linked cash'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
