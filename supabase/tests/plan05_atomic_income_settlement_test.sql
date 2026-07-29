BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(52);

SELECT has_function(
  'public',
  'record_finance_receipt_v2',
  ARRAY['uuid', 'uuid', 'numeric', 'date', 'uuid', 'text', 'text'],
  'Plan 05 exposes the payload-idempotent receipt command'
);

SELECT has_function(
  'public',
  'reverse_finance_receipt_v2',
  ARRAY['uuid', 'uuid', 'date', 'uuid', 'text', 'text'],
  'Plan 05 exposes the payload-idempotent reversal command'
);

SELECT has_function(
  'public',
  'get_finance_income_owner_state_v1',
  ARRAY['uuid', 'text', 'uuid', 'text'],
  'Plan 05 exposes the read-only owner adapter'
);

SELECT has_column(
  'public',
  'finance_receipt_allocations',
  'ledger_entry_id',
  'receipt allocations own their Ledger projection identity'
);

SELECT has_column(
  'public',
  'finance_receipt_allocations',
  'reversal_of_allocation_id',
  'reversing allocations directly identify the original allocation'
);

SELECT has_column(
  'public',
  'finance_receipt_allocations',
  'settlement_basis',
  'receipt allocations freeze their settlement basis'
);

SELECT has_column(
  'public',
  'finance_receipt_allocations',
  'publication_source_class',
  'receipt allocations freeze their publication class'
);

SELECT has_table(
  'public',
  'finance_receipt_allocation_journals',
  'allocation-to-book journal identity is explicit'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.post_finance_income_item(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated operators cannot separately post settled income'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.record_finance_receipt(uuid,uuid,numeric,date,text)',
    'EXECUTE'
  ),
  'the legacy non-idempotent receipt wrapper is no longer an operator authority'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'app_private.record_finance_receipt(uuid,uuid,numeric,date,text)',
    'EXECUTE'
  ),
  'the private legacy receipt command is not an authenticated authority'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'app_private.reverse_finance_receipt(uuid,uuid,date,text)',
    'EXECUTE'
  ),
  'the private legacy reversal command is not an authenticated authority'
);

CREATE TEMP TABLE plan05_test_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL DEFAULT gen_random_uuid(),
  income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_receipt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  legacy_allocation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  precision_income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unsupported_income_id uuid NOT NULL DEFAULT gen_random_uuid(),
  reconciliation_source_id uuid,
  first_result jsonb,
  second_result jsonb,
  reversal_result jsonb
) ON COMMIT DROP;

INSERT INTO plan05_test_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON plan05_test_state TO authenticated;

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
  extensions.crypt('plan05-test', extensions.gen_salt('bf')),
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
  SELECT admin_id AS user_id, 'plan05-admin' AS label
  FROM plan05_test_state
  UNION ALL
  SELECT member_id AS user_id, 'plan05-member' AS label
  FROM plan05_test_state
) AS users;

INSERT INTO public.organizations(id, name, slug)
SELECT
  organization_id,
  'Plan 05 organization',
  'plan05-' || left(organization_id::text, 8)
FROM plan05_test_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'admin'
FROM plan05_test_state
UNION ALL
SELECT organization_id, member_id, 'member'
FROM plan05_test_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
)
SELECT
  property_id,
  organization_id,
  'Plan 05 property',
  'P05-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM plan05_test_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT
  unit_id,
  organization_id,
  property_id,
  'P05-1',
  'occupied',
  300,
  'USD'
FROM plan05_test_state;

INSERT INTO public.people(id, organization_id, display_name)
SELECT tenant_id, organization_id, 'Plan 05 tenant'
FROM plan05_test_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM plan05_test_state;

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
  'Plan 05 tenant',
  '2026-01-01',
  '2026-12-31',
  300,
  'USD'::public.currency_code,
  100,
  'USD'::public.currency_code,
  'active'
FROM plan05_test_state;

INSERT INTO public.finance_income_items(
  id, organization_id, property_id, unit_id, lease_id, payer_person_id,
  income_type, payer_label, due_date, amount_due, currency, status
)
SELECT
  income_id,
  organization_id,
  property_id,
  unit_id,
  lease_id,
  tenant_id,
  'rent',
  'Plan 05 tenant',
  '2026-07-01'::date,
  300,
  'USD'::public.currency_code,
  'open'
FROM plan05_test_state
UNION ALL
SELECT
  unsupported_income_id,
  organization_id,
  property_id,
  unit_id,
  lease_id,
  tenant_id,
  'security_deposit',
  'Plan 05 tenant',
  '2026-07-01'::date,
  100,
  'USD'::public.currency_code,
  'open'
FROM plan05_test_state
UNION ALL
SELECT
  legacy_income_id,
  organization_id,
  property_id,
  unit_id,
  lease_id,
  tenant_id,
  'rent',
  'Legacy receipt tenant',
  '2026-07-02'::date,
  10,
  'USD'::public.currency_code,
  'open'
FROM plan05_test_state
UNION ALL
SELECT
  precision_income_id,
  organization_id,
  property_id,
  unit_id,
  lease_id,
  tenant_id,
  'rent',
  'Precision tenant',
  '2026-07-03'::date,
  10,
  'USD'::public.currency_code,
  'open'
FROM plan05_test_state;

SELECT app_private.ensure_accounting_books_and_accounts(
  organization_id,
  'USD'
)
FROM plan05_test_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM plan05_test_state),
  true
);

SELECT ok(
  (
    SELECT pg_catalog.bool_and(
      income.settlement_creation_provenance = 'manual_pre_activation'
      AND income.settlement_creation_version = 1
      AND length(income.settlement_creation_hash) = 64
      AND income.remaining_balance_disposition IS NULL
      AND income.remaining_balance_disposition_version IS NULL
      AND income.remaining_balance_disposition_hash IS NULL
    )
    FROM public.finance_income_items AS income
    WHERE income.id IN (
      (SELECT income_id FROM plan05_test_state),
      (SELECT unsupported_income_id FROM plan05_test_state)
    )
  ),
  'pre-activation inserts receive canonical provenance instead of caller authority'
);

SELECT throws_ok(
  pg_catalog.format(
    $statement$
      SET LOCAL ROLE authenticated;
      INSERT INTO public.finance_income_items(
        id,
        organization_id,
        property_id,
        unit_id,
        lease_id,
        payer_person_id,
        income_type,
        payer_label,
        due_date,
        received_date,
        amount_due,
        amount_received,
        currency,
        status
      )
      VALUES (
        gen_random_uuid(),
        %L::uuid,
        %L::uuid,
        %L::uuid,
        %L::uuid,
        %L::uuid,
        'rent',
        'Direct cash bypass',
        '2026-11-01'::date,
        '2026-11-01'::date,
        300,
        300,
        'USD'::public.currency_code,
        'received'
      )
    $statement$,
    organization_id,
    property_id,
    unit_id,
    lease_id,
    tenant_id
  ),
  '22023',
  'income_obligation_must_start_unsettled',
  'direct obligation inserts cannot pre-populate unprojected cash'
)
FROM plan05_test_state;

UPDATE plan05_test_state
SET reconciliation_source_id =
  public.create_financial_reconciliation_source(
    organization_id,
    'P05BANK',
    'Plan 05 operating account',
    'bank',
    'property_dedicated',
    'USD',
    property_id,
    '****0505'
  );

SELECT lives_ok(
  $$
    SET LOCAL ROLE authenticated;
    UPDATE public.finance_income_items
    SET payer_label = 'Plan 05 tenant corrected'
    WHERE id = (SELECT income_id FROM plan05_test_state);
    RESET ROLE;
  $$,
  'an unsettled obligation remains correctable before its first source snapshot'
);

SELECT ok(
  (
    SELECT owner_state->'actions' = '[]'::jsonb
      AND owner_state->>'unavailable_reason' =
        'income_settlement_class_not_supported'
    FROM (
      SELECT public.get_finance_income_owner_state_v1(
        organization_id,
        'finance_income_item',
        unsupported_income_id,
        'record_receipt'
      ) AS owner_state
      FROM plan05_test_state
    ) AS adapter
  ),
  'the owner adapter does not advertise settlement for unsupported classes'
);

INSERT INTO public.finance_receipts(
  id,
  organization_id,
  property_id,
  received_date,
  amount,
  currency,
  payer_label,
  reference,
  created_by
)
SELECT
  legacy_receipt_id,
  organization_id,
  property_id,
  '2026-07-04',
  10,
  'USD',
  'Legacy receipt tenant',
  'P05-LEGACY',
  admin_id
FROM plan05_test_state;

INSERT INTO public.finance_receipt_allocations(
  id,
  organization_id,
  receipt_id,
  income_item_id,
  amount,
  created_by
)
SELECT
  legacy_allocation_id,
  organization_id,
  legacy_receipt_id,
  legacy_income_id,
  10,
  admin_id
FROM plan05_test_state;

SELECT ok(
  (
    SELECT owner_state->'actions' = '[]'::jsonb
      AND owner_state->>'unavailable_reason' =
        'action_not_available_for_current_state'
    FROM (
      SELECT public.get_finance_income_owner_state_v1(
        organization_id,
        'finance_receipt',
        legacy_receipt_id,
        'reverse_receipt'
      ) AS owner_state
      FROM plan05_test_state
    ) AS adapter
  ),
  'the owner adapter withholds reversal for an unclassified legacy receipt'
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_receipt_v2(
      organization_id,
      precision_income_id,
      1.005,
      '2026-07-05',
      reconciliation_source_id,
      'P05-SUBCENT',
      'plan05-subcent-receipt'
    )
    FROM plan05_test_state
  $$,
  '22023',
  'Receipt amount must use currency precision',
  'receipt settlement rejects amounts that cannot be stored exactly'
);

SELECT lives_ok(
  $$
    UPDATE plan05_test_state
    SET first_result = public.record_finance_receipt_v2(
      organization_id,
      income_id,
      100,
      '2026-07-10',
      reconciliation_source_id,
      'P05-FIRST',
      'plan05-first-receipt'
    )
  $$,
  'a partial receipt atomically records its full settlement result'
);

SELECT is(
  (
    SELECT amount_received
    FROM public.finance_income_items
    WHERE id = (SELECT income_id FROM plan05_test_state)
  ),
  100::numeric,
  'compatibility received amount follows signed allocations'
);

SELECT is(
  (
    SELECT status
    FROM public.finance_income_items
    WHERE id = (SELECT income_id FROM plan05_test_state)
  ),
  'partially_received',
  'partial settlement keeps the obligation open'
);

SELECT ok(
  (
    SELECT allocation.ledger_entry_id IS NOT NULL
      AND allocation.settlement_sequence = 1
      AND allocation.outstanding_balance_after = 200
      AND allocation.settlement_basis = 'pre_cutover_uninvoiced'
      AND allocation.publication_source_class =
        'legacy_cash_non_publishable'
      AND allocation.reconciliation_source_id =
        plan05_test_state.reconciliation_source_id
    FROM plan05_test_state
    JOIN public.finance_receipt_allocations AS allocation
      ON allocation.id = (plan05_test_state.first_result->>'allocation_id')::uuid
  ),
  'the first allocation freezes exact source, balance, and projection evidence'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM plan05_test_state
    JOIN public.finance_receipt_allocation_journals AS link
      ON link.allocation_id =
        (plan05_test_state.first_result->>'allocation_id')::uuid
  ),
  1::bigint,
  'the allocation owns one journal in its one applicable book'
);

SELECT ok(
  (
    SELECT
      sum(line.debit_amount) = sum(line.credit_amount)
      AND sum(line.debit_amount) = 100
    FROM plan05_test_state
    JOIN public.finance_receipt_allocation_journals AS link
      ON link.allocation_id =
        (plan05_test_state.first_result->>'allocation_id')::uuid
    JOIN public.accounting_journal_lines AS line
      ON line.journal_entry_id = link.journal_entry_id
  ),
  'the allocation journal is complete and balanced'
);

SELECT is(
  (
    SELECT public.record_finance_receipt_v2(
      organization_id,
      income_id,
      100,
      '2026-07-10',
      reconciliation_source_id,
      'P05-FIRST',
      'plan05-first-receipt'
    )
    FROM plan05_test_state
  ),
  (SELECT first_result FROM plan05_test_state),
  'same-key same-payload receipt replay returns the exact stored identities'
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_receipt_v2(
      organization_id,
      income_id,
      101,
      '2026-07-10',
      reconciliation_source_id,
      'P05-FIRST',
      'plan05-first-receipt'
    )
    FROM plan05_test_state
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'same-key changed-payload receipt reuse fails closed'
);

SELECT lives_ok(
  $$
    UPDATE plan05_test_state
    SET second_result = public.record_finance_receipt_v2(
      organization_id,
      income_id,
      200,
      '2026-08-10',
      reconciliation_source_id,
      'P05-SECOND',
      'plan05-second-receipt'
    )
  $$,
  'a second dated partial receipt remains a separate source event'
);

SELECT ok(
  (
    SELECT count(*) = 2
      AND count(DISTINCT allocation.ledger_entry_id) = 2
      AND array_agg(
        allocation.outstanding_balance_after
        ORDER BY allocation.settlement_sequence
      ) = ARRAY[200::numeric, 0::numeric]
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.income_item_id =
      (SELECT income_id FROM plan05_test_state)
      AND allocation.signed_amount > 0
  ),
  'partial receipts retain separate Ledger identities and historical balances'
);

SELECT is(
  (
    SELECT summary.open_count
    FROM public.get_finance_income_workflow_summary(
      (SELECT organization_id FROM plan05_test_state),
      '2026-07-01',
      '2026-08-01',
      'received',
      NULL,
      NULL,
      '',
      '2026-07-31'
    ) AS summary
  ),
  0::bigint,
  'fully settled obligations are excluded from the open-row count'
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_receipt_v2(
      organization_id,
      income_id,
      1,
      '2026-08-11',
      reconciliation_source_id,
      'P05-OVER',
      'plan05-over-allocation'
    )
    FROM plan05_test_state
  $$,
  '22023',
  'Receipt allocation exceeds open balance',
  'over-allocation fails before a source row commits'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_receipts
    WHERE organization_id =
      (SELECT organization_id FROM plan05_test_state)
  ),
  3::bigint,
  'failed over-allocation leaves no receipt header'
);

SELECT throws_ok(
  $$
    UPDATE public.finance_income_items
    SET amount_due = amount_due + 1
    WHERE id = (SELECT income_id FROM plan05_test_state)
  $$,
  '42501',
  'Settled income material requires the checked settlement workflow',
  'direct material mutation of a settled obligation fails'
);

SELECT throws_ok(
  $$
    UPDATE public.ledger_entries
    SET amount = amount + 1
    WHERE id = (
      SELECT (first_result->>'ledger_entry_id')::uuid
      FROM plan05_test_state
    )
  $$,
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'generic mutation of an allocation-linked Ledger row fails'
);

CREATE TEMP TABLE plan05_activity_count AS
SELECT count(*)::bigint AS value
FROM public.activity_logs
WHERE organization_id =
  (SELECT organization_id FROM plan05_test_state);

SELECT ok(
  (
    SELECT
      owner_state->>'contract_version' = 'plan05.owner.v1'
      AND owner_state->>'owner_state' = 'settled'
      AND length(owner_state->>'material_hash') = 64
      AND jsonb_array_length(owner_state->'scopes') = 1
    FROM (
      SELECT public.get_finance_income_owner_state_v1(
        organization_id,
        'finance_income_item',
        income_id,
        'record_receipt'
      ) AS owner_state
      FROM plan05_test_state
    ) AS adapter
  ),
  'the owner adapter returns typed state, actions, scope, and material hash'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.activity_logs
    WHERE organization_id =
      (SELECT organization_id FROM plan05_test_state)
  ),
  (SELECT value FROM plan05_activity_count),
  'owner adapter preview is read-only'
);

SELECT throws_ok(
  $$
    SELECT public.reverse_finance_receipt_v2(
      organization_id,
      (first_result->>'receipt_id')::uuid,
      '2026-07-09',
      reconciliation_source_id,
      'Invalid historical reversal',
      'plan05-predating-reversal'
    )
    FROM plan05_test_state
  $$,
  '22023',
  'Reversal date cannot precede original receipt date',
  'a reversal cannot create negative cash before the original receipt'
);

SELECT lives_ok(
  $$
    UPDATE plan05_test_state
    SET reversal_result = public.reverse_finance_receipt_v2(
      organization_id,
      (first_result->>'receipt_id')::uuid,
      '2026-09-10',
      reconciliation_source_id,
      'Tenant payment returned',
      'plan05-first-reversal'
    )
  $$,
  'reversal atomically appends linked source and projection effects'
);

SELECT ok(
  (
    SELECT reversal.reversal_of_allocation_id = original.id
      AND reversal.signed_amount = -original.amount
      AND reversal.settlement_basis = original.settlement_basis
      AND reversal.publication_source_class =
        original.publication_source_class
      AND reversal.ledger_entry_id IS NOT NULL
    FROM plan05_test_state
    JOIN public.finance_receipt_allocations AS original
      ON original.id = (plan05_test_state.first_result->>'allocation_id')::uuid
    JOIN public.finance_receipt_allocations AS reversal
      ON reversal.id =
        (plan05_test_state.reversal_result->>'allocation_id')::uuid
  ),
  'reversing allocation is directly linked and inherits immutable class'
);

SELECT is(
  (
    SELECT amount_received
    FROM public.finance_income_items
    WHERE id = (SELECT income_id FROM plan05_test_state)
  ),
  200::numeric,
  'reversal refreshes compatibility from the remaining signed allocation'
);

SELECT ok(
  (
    SELECT original.status = 'reversed'
      AND original.reversed_by_id = reversal.id
      AND reversal.reversal_of_id = original.id
    FROM plan05_test_state
    JOIN public.accounting_journal_entries AS original
      ON original.id = (
        plan05_test_state.first_result->'journal_entry_ids'->>0
      )::uuid
    JOIN public.accounting_journal_entries AS reversal
      ON reversal.id = (
        plan05_test_state.reversal_result->'journal_entry_ids'->>0
      )::uuid
  ),
  'journal reversal identity is exact and symmetric'
);

SELECT throws_ok(
  $$
    SELECT public.reverse_finance_receipt_v2(
      organization_id,
      (first_result->>'receipt_id')::uuid,
      '2026-09-11',
      reconciliation_source_id,
      'Duplicate reversal',
      'plan05-duplicate-reversal'
    )
    FROM plan05_test_state
  $$,
  '22023',
  'Finance receipt is already reversed',
  'a second reversal fails without changing the original'
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_receipt_v2(
      organization_id,
      unsupported_income_id,
      10,
      '2026-07-10',
      reconciliation_source_id,
      'P05-DEPOSIT',
      'plan05-deposit-receipt'
    )
    FROM plan05_test_state
  $$,
  '22023',
  'income_settlement_class_not_supported',
  'deposit custody cannot enter operating-income settlement'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT member_id::text FROM plan05_test_state),
  true
);

SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_receipt_allocation_journals
  ),
  0::bigint,
  'non-admin members cannot read allocation-to-journal identities'
);

RESET ROLE;

SELECT throws_ok(
  $$
    SELECT public.get_finance_income_owner_state_v1(
      organization_id,
      'finance_income_item',
      income_id,
      NULL
    )
    FROM plan05_test_state
  $$,
  '42501',
  'Not authorized',
  'non-admin members cannot read the finance owner adapter'
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_receipt_v2(
      organization_id,
      income_id,
      10,
      '2026-10-10',
      reconciliation_source_id,
      'P05-MEMBER',
      'plan05-member-receipt'
    )
    FROM plan05_test_state
  $$,
  '42501',
  'Not authorized',
  'non-admin members cannot settle income'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '',
  true
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_receipt_v2(
      organization_id,
      income_id,
      10,
      '2026-10-10',
      reconciliation_source_id,
      'P05-ANON',
      'plan05-anon-receipt'
    )
    FROM plan05_test_state
  $$,
  '28000',
  'Not authenticated',
  'unauthenticated callers cannot settle income'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM plan05_test_state),
  true
);

SELECT lives_ok(
  $$
    SELECT public.set_ledger_period_lock(
      organization_id,
      '2026-07-01',
      true,
      'Plan 05 replay test'
    )
    FROM plan05_test_state
  $$,
  'the original receipt month can close after settlement'
);

SELECT is(
  (
    SELECT public.record_finance_receipt_v2(
      organization_id,
      income_id,
      100,
      '2026-07-10',
      reconciliation_source_id,
      'P05-FIRST',
      'plan05-first-receipt'
    )
    FROM plan05_test_state
  ),
  (SELECT first_result FROM plan05_test_state),
  'completed replay survives later period closure'
);

SELECT throws_ok(
  $$
    SELECT public.record_finance_receipt_v2(
      organization_id,
      income_id,
      10,
      '2026-07-20',
      reconciliation_source_id,
      'P05-CLOSED',
      'plan05-closed-period'
    )
    FROM plan05_test_state
  $$,
  '22023',
  'Income settlement period is not open',
  'a genuinely new receipt is rejected in a closed period'
);

SELECT ok(
  (
    SELECT event.ledger_entry_id =
        (plan05_test_state.second_result->>'ledger_entry_id')::uuid
      AND event.journal_entry_id =
        (plan05_test_state.second_result->'journal_entry_ids'->>0)::uuid
      AND event.reconciliation_source_id =
        plan05_test_state.reconciliation_source_id
      AND event.projection_status =
        'obligation_level_ledger_and_journal'
    FROM plan05_test_state
    CROSS JOIN LATERAL public.get_property_cash_events_v1_page(
      plan05_test_state.organization_id,
      plan05_test_state.property_id,
      'USD',
      '2026-08-01',
      '2026-08-31',
      NULL,
      NULL,
      NULL,
      100
    ) AS event
    WHERE event.source_type = 'receipt_allocation'
      AND event.source_id =
        (plan05_test_state.second_result->>'allocation_id')::uuid
  ),
  'canonical property cash events use exact allocation projections and source'
);

SELECT is(
  (
    SELECT count(*)::bigint
    FROM public.finance_receipt_allocations AS allocation
    WHERE allocation.organization_id =
      (SELECT organization_id FROM plan05_test_state)
      AND allocation.settlement_contract_version = 'plan05.v1'
  ),
  3::bigint,
  'only two canonical receipts and their one exact reversal committed'
);

INSERT INTO app_private.finance_income_settlement_policies(
  organization_id,
  activation_state,
  activation_version,
  activation_manifest_hash,
  activated_at,
  activated_by
)
SELECT
  organization_id,
  'activated',
  1,
  repeat('a', 64),
  clock_timestamp(),
  admin_id
FROM plan05_test_state;

SELECT throws_ok(
  pg_catalog.format(
    $statement$
      SET LOCAL ROLE authenticated;
      INSERT INTO public.finance_income_items(
        id,
        organization_id,
        property_id,
        unit_id,
        lease_id,
        payer_person_id,
        income_type,
        payer_label,
        due_date,
        amount_due,
        currency,
        status,
        settlement_creation_provenance,
        settlement_creation_version,
        settlement_creation_hash
      )
      VALUES (
        gen_random_uuid(),
        %L::uuid,
        %L::uuid,
        %L::uuid,
        %L::uuid,
        %L::uuid,
        'rent',
        'Spoofed Plan 09 tenant',
        '2026-11-01'::date,
        300,
        'USD'::public.currency_code,
        'open',
        'plan09_charge_occurrence',
        1,
        repeat('b', 64)
      )
    $statement$,
    organization_id,
    property_id,
    unit_id,
    lease_id,
    tenant_id
  ),
  '22023',
  'rent_occurrence_generation_required',
  'activated creation rejects caller-supplied Plan 09 provenance'
)
FROM plan05_test_state;

SELECT * FROM finish();

ROLLBACK;
