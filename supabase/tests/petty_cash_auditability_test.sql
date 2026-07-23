BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(53);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

SELECT has_column(
  'public',
  'petty_cash_entries',
  'counterparty_person_id',
  'petty cash entries link an optional counterparty person'
);

SELECT fk_ok(
  'public',
  'petty_cash_entries',
  'counterparty_person_id',
  'public',
  'people',
  'id',
  'counterparty link has its people foreign key'
);

SELECT has_index(
  'public',
  'petty_cash_entries',
  'petty_cash_entries_org_counterparty_idx',
  'counterparty lookups have an organization index'
);

SELECT has_function(
  'public',
  'update_petty_cash_entry',
  ARRAY[
    'uuid', 'uuid', 'uuid', 'uuid', 'date', 'date', 'text', 'text',
    'text', 'text', 'text', 'numeric', 'uuid', 'text', 'text', 'text',
    'text', 'numeric', 'numeric', 'numeric'
  ],
  'safe update RPC exists'
);

SELECT has_function(
  'public',
  'void_petty_cash_entry',
  ARRAY['uuid', 'uuid', 'text'],
  'safe void RPC exists'
);

SELECT is(
  (
    SELECT procedure.prosecdef
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'post_petty_cash_entry'
      AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) = 'p_organization_id uuid, p_entry_id uuid'
  ),
  true,
  'posting RPC is the checked definer boundary for private ledger helpers'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.petty_cash_entries', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_entries', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_entries', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_entries', 'TRUNCATE')
    AND NOT has_table_privilege('anon', 'public.petty_cash_entries', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.petty_cash_entries', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.petty_cash_entries', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.petty_cash_entries', 'TRUNCATE'),
  'Data API callers cannot bypass audited entry RPCs with direct writes'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.petty_cash_accounts', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_accounts', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_accounts', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_accounts', 'TRUNCATE')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_periods', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_periods', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_periods', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.petty_cash_periods', 'TRUNCATE')
    AND NOT has_table_privilege('anon', 'public.petty_cash_accounts', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.petty_cash_accounts', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.petty_cash_accounts', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.petty_cash_accounts', 'TRUNCATE')
    AND NOT has_table_privilege('anon', 'public.petty_cash_periods', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.petty_cash_periods', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.petty_cash_periods', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.petty_cash_periods', 'TRUNCATE'),
  'Data API callers cannot bypass audited account or period RPCs'
);

SELECT lives_ok(
  $$SELECT public.create_petty_cash_account(
    '00000000-0000-0000-0000-000000000001',
    'AUDIT-CASH-01',
    'Audit cash',
    500,
    '80300000-0000-0000-0000-000000000001'
  )$$,
  'active Staff can be assigned as account custodian'
);

SELECT is(
  (
    SELECT custodian_person_id
    FROM public.petty_cash_accounts
    WHERE account_number = 'AUDIT-CASH-01'
  ),
  '80300000-0000-0000-0000-000000000001'::uuid,
  'account stores its validated custodian'
);

SELECT is(
  (
    SELECT opening_balance_amount
    FROM public.petty_cash_periods AS period
    JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
    WHERE account.account_number = 'AUDIT-CASH-01'
  ),
  500::numeric,
  'new account opening float is stored as cash already on hand'
);

SELECT is(
  (
    SELECT advance_amount
    FROM public.petty_cash_periods AS period
    JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
    WHERE account.account_number = 'AUDIT-CASH-01'
  ),
  0::numeric,
  'new account does not duplicate opening cash as a legacy period advance'
);

SELECT is(
  (
    SELECT new_values ->> 'custodian_person_id'
    FROM public.activity_logs
    WHERE entity_type = 'petty_cash_account'
      AND entity_id = (
        SELECT id
        FROM public.petty_cash_accounts
        WHERE account_number = 'AUDIT-CASH-01'
      )
      AND action = 'created'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  '80300000-0000-0000-0000-000000000001',
  'account creation audit includes custodian identity'
);

SELECT lives_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
    ),
    p_property_id => NULL,
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => current_date,
    p_entry_kind => 'advance',
    p_status => 'cleared',
    p_category => 'STAFF-ADVANCE',
    p_supplier => NULL,
    p_description => 'Additional custodian funding',
    p_amount => 100,
    p_counterparty_person_id => '80300000-0000-0000-0000-000000000001'
  )$$,
  'later Staff advance is additive to opening cash'
);

SELECT throws_ok(
  $$SELECT public.create_petty_cash_account(
    '00000000-0000-0000-0000-000000000001',
    'AUDIT-BAD-CUSTODIAN',
    'Bad custodian',
    100,
    '80200000-0000-0000-0000-000000000001'
  )$$,
  '23503',
  'Custodian must be active Staff in this organization',
  'vendor cannot be assigned as account custodian'
);

INSERT INTO public.people (
  id,
  organization_id,
  display_name,
  party_type
)
VALUES (
  '89900000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'Other workspace vendor',
  'company'
);

INSERT INTO public.person_roles (
  id,
  organization_id,
  person_id,
  role,
  status
)
VALUES (
  '89910000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '89900000-0000-0000-0000-000000000001',
  'vendor',
  'active'
);

SELECT lives_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
    ),
    p_property_id => NULL,
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => current_date,
    p_entry_kind => 'cash_in',
    p_status => 'cleared',
    p_category => 'LINKED-IN',
    p_supplier => 'Untrusted browser label',
    p_description => 'Linked person snapshot',
    p_amount => 75,
    p_counterparty_person_id => '80200000-0000-0000-0000-000000000001'
  )$$,
  'linked counterparty entry is created'
);

SELECT is(
  (
    SELECT supplier
    FROM public.petty_cash_entries
    WHERE category = 'LINKED-IN'
  ),
  'Phnom Penh Plumbing Co.',
  'RPC derives the transaction-time supplier snapshot from Person'
);

UPDATE public.people
SET display_name = 'PP Plumbing Renamed'
WHERE id = '80200000-0000-0000-0000-000000000001';

SELECT is(
  (
    SELECT supplier
    FROM public.petty_cash_entries
    WHERE category = 'LINKED-IN'
  ),
  'Phnom Penh Plumbing Co.',
  'later Person rename does not rewrite the entry snapshot'
);

SELECT throws_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
    ),
    p_property_id => NULL,
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => NULL,
    p_entry_kind => 'cash_in',
    p_status => 'draft',
    p_category => 'CROSS-ORG',
    p_supplier => NULL,
    p_description => 'Rejected cross-org person',
    p_amount => 10,
    p_counterparty_person_id => '89900000-0000-0000-0000-000000000001'
  )$$,
  '23503',
  'Counterparty must be an active person in this organization',
  'cross-organization counterparty is rejected'
);

UPDATE public.people
SET archived_at = now()
WHERE id = '80200000-0000-0000-0000-000000000008';

SELECT throws_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
    ),
    p_property_id => NULL,
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => NULL,
    p_entry_kind => 'cash_in',
    p_status => 'draft',
    p_category => 'ARCHIVED-PARTY',
    p_supplier => NULL,
    p_description => 'Rejected archived person',
    p_amount => 10,
    p_counterparty_person_id => '80200000-0000-0000-0000-000000000008'
  )$$,
  '23503',
  'Counterparty must be an active person in this organization',
  'archived counterparty is rejected'
);

UPDATE public.people
SET archived_at = NULL
WHERE id = '80200000-0000-0000-0000-000000000008';

SELECT lives_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
    ),
    p_property_id => NULL,
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => current_date,
    p_entry_kind => 'cash_in',
    p_status => 'cleared',
    p_category => 'EXTERNAL-IN',
    p_supplier => 'Walk-in source',
    p_description => 'External cash source',
    p_amount => 25,
    p_counterparty_person_id => NULL
  )$$,
  'external party entry is created'
);

SELECT is(
  (
    SELECT supplier
    FROM public.petty_cash_entries
    WHERE category = 'EXTERNAL-IN'
  ),
  'Walk-in source',
  'external party name is stored as its immutable snapshot'
);

SELECT throws_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
    ),
    p_property_id => NULL,
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => NULL,
    p_entry_kind => 'cash_in',
    p_status => 'draft',
    p_category => 'MISSING-PARTY',
    p_supplier => NULL,
    p_description => 'Missing party',
    p_amount => 10,
    p_counterparty_person_id => NULL
  )$$,
  '22023',
  'Choose a linked person or name an external party',
  'new entry cannot omit both linked and external counterparty'
);

SELECT lives_ok(
  $$SELECT public.update_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_entry_id => (
      SELECT id FROM public.petty_cash_entries WHERE category = 'LINKED-IN'
    ),
    p_property_id => '10000000-0000-0000-0000-000000000002',
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => current_date,
    p_entry_kind => 'cash_in',
    p_status => 'cleared',
    p_category => 'LINKED-IN',
    p_supplier => NULL,
    p_description => 'Linked person snapshot corrected',
    p_amount => 75,
    p_counterparty_person_id => '80200000-0000-0000-0000-000000000001'
  )$$,
  'unposted entry operational fields can be corrected'
);

SELECT is(
  (
    SELECT previous_values ->> 'property_id'
    FROM public.activity_logs
    WHERE entity_type = 'petty_cash_entry'
      AND entity_id = (
        SELECT id FROM public.petty_cash_entries WHERE category = 'LINKED-IN'
      )
      AND action = 'updated'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  NULL,
  'update audit retains the prior property context'
);

SELECT lives_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
    ),
    p_property_id => '10000000-0000-0000-0000-000000000001',
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => current_date,
    p_entry_kind => 'expense',
    p_status => 'cleared',
    p_category => 'VOID-ME',
    p_supplier => 'Temporary supplier',
    p_description => 'Duplicate expense',
    p_amount => 50,
    p_counterparty_person_id => NULL
  )$$,
  'void candidate is created'
);

SELECT throws_ok(
  $$SELECT public.void_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.petty_cash_entries WHERE category = 'VOID-ME'),
    ' '
  )$$,
  '22023',
  'Void reason is required',
  'void requires an explicit reason'
);

SELECT lives_ok(
  $$SELECT public.void_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.petty_cash_entries WHERE category = 'VOID-ME'),
    'Duplicate receipt'
  )$$,
  'eligible entry can be safely voided'
);

SELECT ok(
  (
    SELECT status = 'void'
      AND out_amount = 50
      AND void_reason = 'Duplicate receipt'
      AND voided_at IS NOT NULL
      AND voided_by = '00000000-0000-0000-0000-000000000101'::uuid
    FROM public.petty_cash_entries
    WHERE category = 'VOID-ME'
  ),
  'void retains the original amount and records actor reason and time'
);

SELECT lives_ok(
  $$SELECT public.void_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.petty_cash_entries WHERE category = 'VOID-ME'),
    'Controlled retry'
  )$$,
  'void retry is idempotent'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE entity_type = 'petty_cash_entry'
      AND entity_id = (
        SELECT id FROM public.petty_cash_entries WHERE category = 'VOID-ME'
      )
      AND action = 'voided'
  ),
  1::bigint,
  'void retry does not duplicate audit history'
);

SELECT throws_ok(
  $$SELECT public.update_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_entry_id => (
      SELECT id FROM public.petty_cash_entries WHERE category = 'VOID-ME'
    ),
    p_property_id => '10000000-0000-0000-0000-000000000001',
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => current_date,
    p_entry_kind => 'expense',
    p_status => 'cleared',
    p_category => 'VOID-ME',
    p_supplier => 'Temporary supplier',
    p_description => 'Cannot change void',
    p_amount => 50,
    p_counterparty_person_id => NULL
  )$$,
  '22023',
  'Only unposted draft or cleared petty cash rows can be edited',
  'void entry is immutable'
);

SELECT lives_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
    ),
    p_property_id => NULL,
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => current_date,
    p_entry_kind => 'cash_in',
    p_status => 'cleared',
    p_category => 'TOP-UP',
    p_supplier => 'Cash office',
    p_description => 'Additional top up',
    p_amount => 20,
    p_counterparty_person_id => NULL
  )$$,
  'cash-in row for rollover is created'
);

SELECT lives_ok(
  $$SELECT public.open_next_petty_cash_period(
    '00000000-0000-0000-0000-000000000001',
    (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
        AND period.status <> 'closed'
    ),
    50
  )$$,
  'month rollover succeeds after expenses are posted or void'
);

SELECT is(
  (
    SELECT opening_balance_amount
    FROM public.petty_cash_periods AS period
    JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
    WHERE account.account_number = 'AUDIT-CASH-01'
      AND period.status <> 'closed'
  ),
  770::numeric,
  'rollover carries cash, later advance, and requested top-up without double count'
);

SELECT is(
  (
    SELECT advance_amount
    FROM public.petty_cash_periods AS period
    JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
    WHERE account.account_number = 'AUDIT-CASH-01'
      AND period.status <> 'closed'
  ),
  0::numeric,
  'forward-created period does not retain an ambiguous aggregate advance'
);

SELECT is(
  (
    SELECT (log.new_values ->> 'opening_balance_amount')::numeric
    FROM public.activity_logs AS log
    WHERE log.entity_type = 'petty_cash_period'
      AND log.action = 'opened_next_month'
      AND log.entity_id = (
        SELECT period.id
        FROM public.petty_cash_periods AS period
        JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
        WHERE account.account_number = 'AUDIT-CASH-01'
          AND period.status <> 'closed'
      )
  ),
  770::numeric,
  'rollover audit opening cash matches the stored period'
);

SELECT is(
  (
    SELECT (log.new_values ->> 'top_up_amount')::numeric
    FROM public.activity_logs AS log
    WHERE log.entity_type = 'petty_cash_period'
      AND log.action = 'opened_next_month'
      AND log.entity_id = (
        SELECT period.id
        FROM public.petty_cash_periods AS period
        JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
        WHERE account.account_number = 'AUDIT-CASH-01'
          AND period.status <> 'closed'
      )
  ),
  50::numeric,
  'rollover audit preserves the requested top-up separately'
);

SELECT throws_ok(
  $$SELECT public.update_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_entry_id => (
      SELECT id FROM public.petty_cash_entries WHERE category = 'TOP-UP'
    ),
    p_property_id => NULL,
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => current_date,
    p_entry_kind => 'cash_in',
    p_status => 'cleared',
    p_category => 'TOP-UP',
    p_supplier => 'Cash office',
    p_description => 'Closed month change',
    p_amount => 20,
    p_counterparty_person_id => NULL
  )$$,
  '23503',
  'Open petty cash period not found',
  'closed period entry cannot be edited'
);

SELECT lives_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
        AND period.status <> 'closed'
    ),
    p_property_id => '10000000-0000-0000-0000-000000000001',
    p_unit_id => NULL,
    p_invoice_date => (
      SELECT period_start
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
        AND period.status <> 'closed'
    ),
    p_clear_date => NULL,
    p_entry_kind => 'expense',
    p_status => 'draft',
    p_category => 'POST-ME',
    p_supplier => NULL,
    p_description => 'Postable linked expense',
    p_amount => 30,
    p_counterparty_person_id => '80200000-0000-0000-0000-000000000001'
  )$$,
  'post candidate is created in the open period'
);

SELECT lives_ok(
  $$SELECT public.post_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.petty_cash_entries WHERE category = 'POST-ME')
  )$$,
  'petty cash expense posting remains successful'
);

SELECT is(
  public.post_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.petty_cash_entries WHERE category = 'POST-ME')
  ),
  (
    SELECT ledger_entry_id
    FROM public.petty_cash_entries
    WHERE category = 'POST-ME'
  ),
  'posting retry returns the existing ledger entry'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.ledger_entries
    WHERE source_type = 'petty_cash'
      AND source_id = (
        SELECT id FROM public.petty_cash_entries WHERE category = 'POST-ME'
      )
  ),
  1::bigint,
  'posting retry creates exactly one linked ledger row'
);

SELECT throws_ok(
  $$SELECT public.update_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_entry_id => (
      SELECT id FROM public.petty_cash_entries WHERE category = 'POST-ME'
    ),
    p_property_id => '10000000-0000-0000-0000-000000000001',
    p_unit_id => NULL,
    p_invoice_date => current_date,
    p_clear_date => current_date,
    p_entry_kind => 'expense',
    p_status => 'cleared',
    p_category => 'POST-ME',
    p_supplier => NULL,
    p_description => 'Cannot edit posted',
    p_amount => 30,
    p_counterparty_person_id => '80200000-0000-0000-0000-000000000001'
  )$$,
  '22023',
  'Only unposted draft or cleared petty cash rows can be edited',
  'posted entry cannot be edited'
);

SELECT throws_ok(
  $$SELECT public.void_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.petty_cash_entries WHERE category = 'POST-ME'),
    'Cannot void posted'
  )$$,
  '22023',
  'Only unposted draft or cleared petty cash rows can be voided',
  'posted entry cannot be voided'
);

SELECT lives_ok(
  $$SELECT public.create_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_account_id => (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    p_period_id => (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
        AND period.status <> 'closed'
    ),
    p_property_id => '10000000-0000-0000-0000-000000000001',
    p_unit_id => NULL,
    p_invoice_date => (
      SELECT period_start
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
        AND period.status <> 'closed'
    ),
    p_clear_date => NULL,
    p_entry_kind => 'expense',
    p_status => 'draft',
    p_category => 'INACTIVE-BLOCK',
    p_supplier => NULL,
    p_description => 'Must stop when account becomes inactive',
    p_amount => 15,
    p_counterparty_person_id => '80200000-0000-0000-0000-000000000001'
  )$$,
  'inactive-account guard candidate is created while account is active'
);

UPDATE public.petty_cash_accounts
SET status = 'inactive'
WHERE account_number = 'AUDIT-CASH-01';

SELECT throws_ok(
  $$SELECT public.update_petty_cash_entry(
    p_organization_id => '00000000-0000-0000-0000-000000000001',
    p_entry_id => (
      SELECT id FROM public.petty_cash_entries WHERE category = 'INACTIVE-BLOCK'
    ),
    p_property_id => '10000000-0000-0000-0000-000000000001',
    p_unit_id => NULL,
    p_invoice_date => (
      SELECT period_start
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
        AND period.status <> 'closed'
    ),
    p_clear_date => NULL,
    p_entry_kind => 'expense',
    p_status => 'draft',
    p_category => 'INACTIVE-BLOCK',
    p_supplier => NULL,
    p_description => 'Blocked correction',
    p_amount => 15,
    p_counterparty_person_id => '80200000-0000-0000-0000-000000000001'
  )$$,
  '23503',
  'Active petty cash account not found',
  'inactive account entry cannot be edited'
);

SELECT throws_ok(
  $$SELECT public.void_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.petty_cash_entries WHERE category = 'INACTIVE-BLOCK'),
    'Blocked inactive correction'
  )$$,
  '23503',
  'Active petty cash account not found',
  'inactive account entry cannot be voided'
);

SELECT throws_ok(
  $$SELECT public.post_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.petty_cash_entries WHERE category = 'INACTIVE-BLOCK')
  )$$,
  '23503',
  'Active petty cash account not found',
  'inactive account entry cannot be posted'
);

SELECT throws_ok(
  $$SELECT public.open_next_petty_cash_period(
    '00000000-0000-0000-0000-000000000001',
    (
      SELECT id FROM public.petty_cash_accounts
      WHERE account_number = 'AUDIT-CASH-01'
    ),
    (
      SELECT period.id
      FROM public.petty_cash_periods AS period
      JOIN public.petty_cash_accounts AS account ON account.id = period.account_id
      WHERE account.account_number = 'AUDIT-CASH-01'
        AND period.status <> 'closed'
    ),
    NULL
  )$$,
  '23503',
  'Active petty cash account not found',
  'inactive account cannot be rolled forward'
);

UPDATE public.petty_cash_accounts
SET status = 'active'
WHERE account_number = 'AUDIT-CASH-01';

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000501',
  true
);

SELECT throws_ok(
  $$SELECT public.void_petty_cash_entry(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.petty_cash_entries WHERE category = 'POST-ME'),
    'Unauthorized'
  )$$,
  '42501',
  'Not authorized',
  'non-admin organization member cannot mutate petty cash'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.void_petty_cash_entry(uuid,uuid,text)',
    'EXECUTE'
  ),
  'anonymous role cannot execute the void RPC'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.update_petty_cash_entry(uuid,uuid,uuid,uuid,date,date,text,text,text,text,text,numeric,uuid,text,text,text,text,numeric,numeric,numeric)',
    'EXECUTE'
  ),
  'authenticated role can reach the update RPC subject to authorization checks'
);

SELECT * FROM finish();

ROLLBACK;
