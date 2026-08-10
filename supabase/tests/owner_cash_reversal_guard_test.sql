BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_column(
  'public',
  'owner_payments',
  'reversal_of_id',
  'owner invoice payment reversals retain the original payment identity'
);

SELECT has_column(
  'public',
  'owner_payments',
  'reversal_reason',
  'owner invoice payment reversals retain an immutable reason'
);

SELECT has_column(
  'public',
  'owner_payment_allocations',
  'reversal_of_allocation_id',
  'owner invoice allocation reversals retain exact line lineage'
);

SELECT has_column(
  'public',
  'property_withdrawals',
  'reversal_of_id',
  'property withdrawal reversals retain the original distribution identity'
);

SELECT has_column(
  'public',
  'property_withdrawals',
  'reversal_reason',
  'property withdrawal reversals retain an immutable reason'
);

SELECT has_function(
  'public',
  'reverse_owner_invoice_payment',
  ARRAY['uuid', 'uuid', 'date', 'text', 'text'],
  'owner invoice payment has a checked append-only reversal command'
);

SELECT has_function(
  'public',
  'reverse_property_withdrawal',
  ARRAY['uuid', 'uuid', 'date', 'text', 'text'],
  'property withdrawal has a checked append-only reversal command'
);

SELECT has_function(
  'public',
  'record_owner_distribution',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code', 'numeric', 'date', 'text', 'text'],
  'owner distributions use explicit owner identity and authoritative withdrawal capacity'
);

SELECT has_function(
  'public',
  'get_owner_available_withdrawal',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code', 'date'],
  'available withdrawal derives only from authoritative held cash less canonical commitments'
);

SELECT ok(
  (
    SELECT count(*) = 2
      AND pg_catalog.bool_and(
        procedure.prosrc LIKE '%app_private.can_correct_finance(p_organization_id)%'
        AND procedure.prosrc NOT LIKE '%app_private.can_operate_finance(p_organization_id)%'
      )
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'reverse_owner_invoice_payment',
        'reverse_property_withdrawal'
      )
  ),
  'owner cash reversals require the narrow ordinary-correction capability'
);

SELECT ok(
  (
    WITH command_boundaries(command_name, baseline_name) AS (
      VALUES
        ('record_owner_distribution'::text, 'record_owner_distribution_baseline'::text),
        ('reverse_property_withdrawal'::text, 'reverse_property_withdrawal_baseline'::text),
        ('reverse_owner_invoice_payment'::text, 'reverse_owner_invoice_payment_baseline'::text)
    ), definitions AS (
      SELECT
        boundary.command_name,
        boundary.baseline_name,
        public_procedure.prosrc AS public_source,
        public_procedure.prosrc || private_procedure.prosrc AS effective_source
      FROM command_boundaries AS boundary
      JOIN pg_catalog.pg_proc AS public_procedure
        ON public_procedure.proname = boundary.command_name
      JOIN pg_catalog.pg_namespace AS public_namespace
        ON public_namespace.oid = public_procedure.pronamespace
       AND public_namespace.nspname = 'public'
      JOIN pg_catalog.pg_proc AS private_procedure
        ON private_procedure.proname = boundary.baseline_name
      JOIN pg_catalog.pg_namespace AS private_namespace
        ON private_namespace.oid = private_procedure.pronamespace
       AND private_namespace.nspname = 'app_private'
    )
    SELECT count(*) = 3
      AND pg_catalog.bool_and(
        effective_source LIKE '%app_private.get_financial_idempotency_replay%'
        AND effective_source LIKE '%app_private.claim_financial_idempotency%'
        AND effective_source LIKE '%app_private.complete_financial_idempotency%'
        AND public_source LIKE '%' || baseline_name || '%'
      )
    FROM definitions
  ),
  'Track 3 cash and reversal public/private-baseline boundaries reuse the single financial idempotency authority'
);

SELECT has_function(
  'app_private',
  'reverse_tenant_invoice_payment_after_owner_cash_guard',
  ARRAY['uuid', 'uuid', 'date', 'text', 'text'],
  'tenant reversal delegates only after the private dependent-cash guard'
);

SELECT has_column(
  'public',
  'property_withdrawals',
  'command_payload_hash',
  'distribution and reversal commands retain canonical idempotency payload hashes'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd4400000-0000-4000-8000-000000000010',
  'authenticated', 'authenticated', 'finance@owner-cash-guard.test',
  extensions.crypt('owner-cash-guard', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd4400000-0000-4000-8000-000000000011',
  'authenticated', 'authenticated', 'super@owner-cash-guard.test',
  extensions.crypt('owner-cash-guard', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
);

INSERT INTO public.organizations (id, name, slug)
VALUES (
  'd4400000-0000-4000-8000-000000000001',
  'Owner cash guard test',
  'owner-cash-guard-test'
);

INSERT INTO public.properties (id, organization_id, name, code, property_type)
VALUES (
  'd4400000-0000-4000-8000-000000000002',
  'd4400000-0000-4000-8000-000000000001',
  'Owner cash guard property', 'OCG-1', 'Apartment'
);

INSERT INTO public.people (id, organization_id, display_name)
VALUES
  (
    'd4400000-0000-4000-8000-000000000003',
    'd4400000-0000-4000-8000-000000000001',
    'Cash guard owner'
  ),
  (
    'd4400000-0000-4000-8000-000000000005',
    'd4400000-0000-4000-8000-000000000001',
    'Successor cash guard owner'
  );

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES
  (
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000003',
    'owner', 'active'
  ),
  (
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000005',
    'owner', 'active'
  );

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on,
  ended_on
)
VALUES
  (
    'd4400000-0000-4000-8000-000000000004',
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000002',
    'd4400000-0000-4000-8000-000000000003',
    100.000, '2026-01-01', '2026-09-01'
  ),
  (
    'd4400000-0000-4000-8000-000000000006',
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000002',
    'd4400000-0000-4000-8000-000000000005',
    100.000, '2026-09-01', NULL
  );

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000010',
    'finance_manager'
  ),
  (
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000011',
    'super_admin'
  );

INSERT INTO public.owner_invoices (
  id, organization_id, property_id, owner_person_id, invoice_number,
  billing_period_start, issue_date, due_date, currency, created_by
)
VALUES (
  'd4400000-0000-4000-8000-000000000020',
  'd4400000-0000-4000-8000-000000000001',
  'd4400000-0000-4000-8000-000000000002',
  'd4400000-0000-4000-8000-000000000003',
  'OINV-OCG-0001', '2026-08-01', '2026-08-05', '2026-08-31', 'USD',
  'd4400000-0000-4000-8000-000000000010'
);

INSERT INTO public.owner_invoice_lines (
  id, organization_id, invoice_id, property_id, source_type, source_id,
  customer_label, description, amount, sort_order, created_by
)
VALUES (
  'd4400000-0000-4000-8000-000000000021',
  'd4400000-0000-4000-8000-000000000001',
  'd4400000-0000-4000-8000-000000000020',
  'd4400000-0000-4000-8000-000000000002',
  'management_fee', 'd4400000-0000-4000-8000-000000000022',
  'Management fee', 'Owner invoice reversal oracle', 40.00, 1,
  'd4400000-0000-4000-8000-000000000010'
);

INSERT INTO public.owner_payments (
  id, organization_id, owner_invoice_id, property_id, owner_person_id,
  payment_number, received_date, amount, currency, reference, idempotency_key,
  created_by
)
VALUES (
  'd4400000-0000-4000-8000-000000000023',
  'd4400000-0000-4000-8000-000000000001',
  'd4400000-0000-4000-8000-000000000020',
  'd4400000-0000-4000-8000-000000000002',
  'd4400000-0000-4000-8000-000000000003',
  'OPAY-OCG-0001', '2026-08-15', 40.00, 'USD', 'Original owner payment',
  'owner-payment-original-0001',
  'd4400000-0000-4000-8000-000000000010'
);

INSERT INTO public.owner_payment_allocations (
  id, organization_id, owner_payment_id, owner_invoice_id,
  owner_invoice_line_id, amount, allocation_order, created_by
)
VALUES (
  'd4400000-0000-4000-8000-000000000024',
  'd4400000-0000-4000-8000-000000000001',
  'd4400000-0000-4000-8000-000000000023',
  'd4400000-0000-4000-8000-000000000020',
  'd4400000-0000-4000-8000-000000000021',
  40.00, 1, 'd4400000-0000-4000-8000-000000000010'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'd4400000-0000-4000-8000-000000000010',
  true
);
SET LOCAL ROLE authenticated;

SELECT ok(
  app_private.can_correct_finance(
    'd4400000-0000-4000-8000-000000000001'
  ),
  'Finance Manager receives ordinary correction authority only with Track 3 guards installed'
);

SELECT public.allocate_owner_event(
  'd4400000-0000-4000-8000-000000000001',
  'owner_invoice_payment',
  'd4400000-0000-4000-8000-000000000024',
  'owner-payment-allocation-0001'
);

CREATE OR REPLACE FUNCTION pg_temp.owner_payment_reversal_probe()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.reverse_owner_invoice_payment(
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000023',
    '2026-08-16',
    'Owner payment was duplicated',
    'owner-payment-reversal-0001'
  );
  RETURN (v_result->>'status') || '|' || (v_result->>'amount');
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

SELECT is(
  pg_temp.owner_payment_reversal_probe(),
  'recorded|40.00',
  'Finance Manager records a checked append-only owner-payment reversal'
);

SELECT is(
  pg_temp.owner_payment_reversal_probe(),
  'replayed|40.00',
  'owner-payment reversal returns stable identities on exact replay'
);

CREATE OR REPLACE FUNCTION pg_temp.owner_payment_signed_probe()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result text;
BEGIN
  SELECT to_char(sum(allocation.signed_amount), 'FM999999999990.00')
  INTO v_result
  FROM public.owner_payment_allocations AS allocation
  WHERE allocation.owner_invoice_id = 'd4400000-0000-4000-8000-000000000020';
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

SELECT is(
  pg_temp.owner_payment_signed_probe(),
  '0.00',
  'owner-payment allocation reversal is the exact signed opposite of the original'
);

SELECT is(
  (
    SELECT to_char(sum(movement.signed_amount), 'FM999999999990.00')
    FROM public.owner_component_movements AS movement
    WHERE movement.component = 'owner_due_to_ips'
  ),
  '0.00',
  'owner-payment component movement and its reversal net exactly to zero'
);

SELECT public.record_owner_cash_event(
  'd4400000-0000-4000-8000-000000000001',
  'd4400000-0000-4000-8000-000000000002',
  'd4400000-0000-4000-8000-000000000003',
  'USD', 'owner_contribution', '2026-08-10', 100.00,
  'Owner cash guard funding', 'owner-cash-guard-fund-0001'
);

CREATE OR REPLACE FUNCTION pg_temp.withdrawal_capacity_probe()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.get_owner_available_withdrawal(
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000002',
    'd4400000-0000-4000-8000-000000000003',
    'USD', '2026-08-31'
  );
  RETURN v_result->>'available_withdrawal';
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.distribution_probe(
  p_amount numeric,
  p_idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.record_owner_distribution(
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000002',
    'd4400000-0000-4000-8000-000000000003',
    'USD', p_amount, '2026-08-20', 'Owner partial distribution',
    p_idempotency_key
  );
  RETURN (v_result->>'status') || '|' || (v_result->>'amount');
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.withdrawal_reversal_probe()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
  v_withdrawal_id uuid;
BEGIN
  SELECT withdrawal.id
  INTO v_withdrawal_id
  FROM public.property_withdrawals AS withdrawal
  WHERE withdrawal.organization_id = 'd4400000-0000-4000-8000-000000000001'
    AND withdrawal.reversal_of_id IS NULL;

  IF v_withdrawal_id IS NULL THEN
    RETURN 'missing';
  END IF;

  v_result := public.reverse_property_withdrawal(
    'd4400000-0000-4000-8000-000000000001',
    v_withdrawal_id,
    '2026-08-21',
    'Distribution entered in error',
    'owner-cash-guard-reverse-0001'
  );
  RETURN (v_result->>'status') || '|' || (v_result->>'amount');
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

SELECT is(
  pg_temp.withdrawal_capacity_probe(),
  '100.00',
  'only authoritative held cash creates initial withdrawal capacity'
);

SELECT is(
  pg_temp.distribution_probe(60.00, 'owner-cash-guard-dist-0001'),
  'recorded|60.00',
  'checked partial distribution records exact canonical money'
);

SELECT is(
  pg_temp.withdrawal_capacity_probe(),
  '40.00',
  'distribution atomically decreases authoritative withdrawal capacity'
);

SELECT is(
  pg_temp.distribution_probe(40.01, 'owner-cash-guard-dist-0002'),
  'error:23514:insufficient_authoritative_held_cash',
  'distribution cannot exceed serialized authoritative held cash'
);

SELECT is(
  pg_temp.withdrawal_reversal_probe(),
  'recorded|60.00',
  'withdrawal reversal is append-only with the exact original amount'
);

SELECT is(
  pg_temp.withdrawal_capacity_probe(),
  '100.00',
  'safe withdrawal reversal restores held-cash capacity exactly'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.owner_component_movements AS movement
    WHERE movement.component = 'ips_held_owner_cash'
      AND movement.signed_amount IN (-60.00, 60.00)
  ),
  2::bigint,
  'distribution and reversal persist equal opposite component movements'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.property_withdrawals AS withdrawal
    JOIN public.ledger_entries AS ledger
      ON ledger.organization_id = withdrawal.organization_id
      AND ledger.id = withdrawal.ledger_entry_id
    LEFT JOIN public.property_withdrawals AS original
      ON original.organization_id = withdrawal.organization_id
      AND original.id = withdrawal.reversal_of_id
    WHERE withdrawal.organization_id = 'd4400000-0000-4000-8000-000000000001'
      AND (
        (
          withdrawal.reversal_of_id IS NULL
          AND ledger.direction = 'expense'
          AND ledger.amount = withdrawal.amount
          AND ledger.source_type = 'owner_cash_event'
          AND ledger.source_id = withdrawal.id
          AND ledger.reversal_of_ledger_entry_id IS NULL
        )
        OR
        (
          withdrawal.reversal_of_id IS NOT NULL
          AND ledger.direction = 'income'
          AND ledger.amount = withdrawal.amount
          AND ledger.source_type = 'owner_cash_event'
          AND ledger.source_id = withdrawal.id
          AND ledger.reversal_of_ledger_entry_id = original.ledger_entry_id
        )
      )
  ),
  2::bigint,
  'distribution and reversal own exact opposite operational Ledger events'
);

SELECT results_eq(
  $$
    SELECT event.resolution_state
    FROM public.get_property_cash_events_page(
      'd4400000-0000-4000-8000-000000000001',
      'd4400000-0000-4000-8000-000000000002',
      'USD', '2026-08-01', '2026-08-31',
      NULL, NULL, NULL, 100
    ) AS event
    WHERE event.source_type = 'property_withdrawal'
    ORDER BY event.event_date, event.source_id
  $$,
  $$ VALUES ('resolved'::text), ('resolved'::text) $$,
  'canonical property cash projection resolves both distribution Ledger events'
);

RESET ROLE;

SELECT results_eq(
  $$
    SELECT activity.action, count(*)::bigint
    FROM public.activity_logs AS activity
    WHERE activity.organization_id = 'd4400000-0000-4000-8000-000000000001'
      AND activity.entity_type = 'property_withdrawal'
    GROUP BY activity.action
    ORDER BY activity.action
  $$,
  $$
    VALUES
      ('owner_withdrawal_recorded'::text, 1::bigint),
      ('owner_withdrawal_reversed'::text, 1::bigint)
  $$,
  'distribution and reversal expose checked activity parity'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'd4400000-0000-4000-8000-000000000010',
  true
);
SET LOCAL ROLE authenticated;

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.record_property_withdrawal(uuid,uuid,numeric,date,text,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.record_owner_distribution(uuid,uuid,uuid,public.currency_code,numeric,date,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.record_owner_distribution(uuid,uuid,uuid,public.currency_code,numeric,date,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.record_owner_distribution(uuid,uuid,uuid,public.currency_code,numeric,date,text,text)',
    'EXECUTE'
  ),
  'only the checked explicit-owner distribution command is application executable'
);

RESET ROLE;
SELECT set_config(
  'app.owner_balance_period_write_context',
  'checked-rollforward-v1',
  true
);
INSERT INTO public.owner_balance_periods (
  id, organization_id, property_id, owner_person_id, currency, month_start,
  status, input_watermark, input_hash, generated_at, generated_by
)
VALUES (
  'd4400000-0000-4000-8000-000000000030',
  'd4400000-0000-4000-8000-000000000001',
  'd4400000-0000-4000-8000-000000000002',
  'd4400000-0000-4000-8000-000000000003',
  'USD', '2026-08-01', 'ready', 'cash-guard-transfer-predecessor',
  repeat('3', 64), now(), 'd4400000-0000-4000-8000-000000000011'
);
INSERT INTO public.owner_balance_period_components (
  id, owner_balance_period_id, organization_id, component,
  opening_amount, movement_amount, closing_amount, created_by
)
VALUES (
  'd4400000-0000-4000-8000-000000000031',
  'd4400000-0000-4000-8000-000000000030',
  'd4400000-0000-4000-8000-000000000001',
  'ips_held_owner_cash', 30.00, 0.00, 30.00,
  'd4400000-0000-4000-8000-000000000011'
);
SELECT set_config(
  'request.jwt.claim.sub',
  'd4400000-0000-4000-8000-000000000010',
  true
);
SET LOCAL ROLE authenticated;

CREATE OR REPLACE FUNCTION pg_temp.transfer_probe()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.transfer_owner_balance_component(
    'd4400000-0000-4000-8000-000000000001',
    'd4400000-0000-4000-8000-000000000002',
    'd4400000-0000-4000-8000-000000000003',
    'd4400000-0000-4000-8000-000000000005',
    'USD', '2026-09-01', 'ips_held_owner_cash', 30.00,
    'Ownership changed at September boundary',
    'signed-transfer-instruction-2026-09', repeat('7', 64),
    'owner-component-transfer-0001'
  );
  RETURN (v_result->>'status') || '|' || (v_result->>'amount');
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

SELECT is(
  pg_temp.transfer_probe(),
  'error:42501:owner_component_transfer_forbidden',
  'Finance Manager cannot perform exceptional ownership transfer authority'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'd4400000-0000-4000-8000-000000000011',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  pg_temp.transfer_probe(),
  'recorded|30.00',
  'Super Admin records one checked explicit component transfer'
);

SELECT results_eq(
  $$
    SELECT
      owner_person_id,
      to_char(sum(signed_amount), 'FM999999999990.00')
    FROM public.owner_component_movements
    WHERE event_date = '2026-09-01'
      AND component = 'ips_held_owner_cash'
    GROUP BY owner_person_id
    ORDER BY owner_person_id
  $$,
  $$
    VALUES
      ('d4400000-0000-4000-8000-000000000003'::uuid, '-30.00'::text),
      ('d4400000-0000-4000-8000-000000000005'::uuid, '30.00'::text)
  $$,
  'explicit transfer produces equal opposite held-cash movements with no balancing plug'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.owner_component_transfer_lines
  ),
  2::bigint,
  'transfer evidence persists exactly one from-owner and one to-owner source line'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
