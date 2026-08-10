BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table(
  'public',
  'owner_event_allocation_sets',
  'Track 3 persists one immutable allocation set per atomic owner-affecting source'
);

SELECT has_table(
  'public',
  'owner_event_owner_allocations',
  'Track 3 persists the exact owner roster allocation used by each source'
);

SELECT has_table(
  'public',
  'owner_component_movements',
  'Track 3 persists component movements instead of inventing report-time effects'
);

SELECT has_table(
  'public',
  'owner_cash_source_consumptions',
  'Track 3 persists exact downstream held-cash consumption lineage'
);

SELECT has_table(
  'public',
  'owner_cash_events',
  'owner contributions and reimbursements remain distinct checked sources'
);

SELECT has_table(
  'public',
  'owner_component_transfer_instructions',
  'ownership transfers require an explicit immutable instruction'
);

SELECT has_table(
  'public',
  'owner_component_transfer_lines',
  'component transfer instructions persist exact from and to source lines'
);

SELECT has_column(
  'public',
  'owner_event_allocation_sets',
  'source_fingerprint',
  'allocation sets retain the immutable source fingerprint'
);

SELECT has_column(
  'public',
  'owner_event_allocation_sets',
  'reversal_of_allocation_set_id',
  'allocation reversals retain immutable allocation-set lineage'
);

SELECT has_column(
  'public',
  'owner_event_allocation_sets',
  'idempotency_key',
  'allocation commands retain their exact idempotency identity'
);

SELECT has_column(
  'public',
  'owner_event_allocation_sets',
  'command_payload_hash',
  'allocation commands retain their canonical replay payload hash'
);

SELECT has_column(
  'public',
  'owner_event_owner_allocations',
  'ownership_percent_snapshot',
  'owner allocations retain the exact effective share snapshot'
);

SELECT has_column(
  'public',
  'owner_component_movements',
  'reversal_of_movement_id',
  'component reversals retain exact movement lineage'
);

SELECT has_function(
  'public',
  'allocate_owner_event',
  ARRAY['uuid', 'text', 'uuid', 'text'],
  'a checked public command allocates one canonical source line'
);

SELECT has_function(
  'public',
  'record_owner_cash_event',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code', 'text', 'date', 'numeric', 'text', 'text'],
  'owner contribution and reimbursement sources use one checked exact-money command'
);

SELECT has_function(
  'public',
  'transfer_owner_balance_component',
  ARRAY['uuid', 'uuid', 'uuid', 'uuid', 'currency_code', 'date', 'owner_balance_component', 'numeric', 'text', 'text', 'text', 'text'],
  'a checked Super Admin command records explicit component transfer evidence'
);

SELECT has_function(
  'public',
  'get_owner_event_allocation_queue',
  ARRAY['uuid', 'uuid', 'currency_code', 'date', 'date'],
  'Finance roles receive a typed source allocation and remediation queue'
);

SELECT has_function(
  'public',
  'get_owner_balance_source_ledger',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code', 'date', 'date'],
  'Finance roles receive exact source, allocation, movement, and reversal lineage'
);

SELECT has_function(
  'app_private',
  'allocate_owner_roster_amount',
  ARRAY['uuid', 'uuid', 'date', 'numeric'],
  'one private allocator owns deterministic exact-cent roster allocation'
);

SELECT has_function(
  'app_private',
  'owner_event_source_rule',
  ARRAY['text'],
  'one private source rule registry freezes allocation basis and component semantics'
);

SELECT has_function(
  'app_private',
  'resolve_owner_event_source',
  ARRAY['uuid', 'text', 'uuid'],
  'one private resolver validates and fingerprints every canonical atomic source'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c3300000-0000-4000-8000-000000000010',
  'authenticated', 'authenticated', 'finance@owner-allocation.test',
  extensions.crypt('owner-allocation', extensions.gen_salt('bf')), now(),
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
  'c3300000-0000-4000-8000-000000000011',
  'authenticated', 'authenticated', 'finance-2@owner-allocation.test',
  extensions.crypt('owner-allocation', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
);

INSERT INTO public.organizations (id, name, slug)
VALUES (
  'c3300000-0000-4000-8000-000000000001',
  'Owner allocation test',
  'owner-allocation-test'
);

INSERT INTO public.properties (id, organization_id, name, code, property_type)
VALUES (
  'c3300000-0000-4000-8000-000000000002',
  'c3300000-0000-4000-8000-000000000001',
  'Owner allocation property', 'OAT-1', 'Apartment'
);

INSERT INTO public.people (id, organization_id, display_name)
VALUES
  (
    'c3300000-0000-4000-8000-000000000003',
    'c3300000-0000-4000-8000-000000000001',
    'Allocation owner A'
  ),
  (
    'c3300000-0000-4000-8000-000000000004',
    'c3300000-0000-4000-8000-000000000001',
    'Allocation owner B'
  );

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES
  (
    'c3300000-0000-4000-8000-000000000001',
    'c3300000-0000-4000-8000-000000000003',
    'owner', 'active'
  ),
  (
    'c3300000-0000-4000-8000-000000000001',
    'c3300000-0000-4000-8000-000000000004',
    'owner', 'active'
  );

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
)
VALUES
  (
    'c3300000-0000-4000-8000-000000000005',
    'c3300000-0000-4000-8000-000000000001',
    'c3300000-0000-4000-8000-000000000002',
    'c3300000-0000-4000-8000-000000000003',
    50.000, '2026-01-01'
  ),
  (
    'c3300000-0000-4000-8000-000000000006',
    'c3300000-0000-4000-8000-000000000001',
    'c3300000-0000-4000-8000-000000000002',
    'c3300000-0000-4000-8000-000000000004',
    50.000, '2026-01-01'
  );

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (
    'c3300000-0000-4000-8000-000000000001',
    'c3300000-0000-4000-8000-000000000010',
    'finance_manager'
  ),
  (
    'c3300000-0000-4000-8000-000000000001',
    'c3300000-0000-4000-8000-000000000011',
    'finance_manager'
  );

SELECT results_eq(
  $$
    SELECT
      owner_person_id,
      to_char(allocated_amount, 'FM999999999990.00'),
      allocation_order
    FROM app_private.allocate_owner_roster_amount(
      'c3300000-0000-4000-8000-000000000001',
      'c3300000-0000-4000-8000-000000000002',
      '2026-08-10',
      100.01
    )
    ORDER BY allocation_order
  $$,
  $$
    VALUES
      ('c3300000-0000-4000-8000-000000000003'::uuid, '50.01'::text, 1),
      ('c3300000-0000-4000-8000-000000000004'::uuid, '50.00'::text, 2)
  $$,
  'largest equal fractional remainder is awarded by property_owners.id ascending'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'c3300000-0000-4000-8000-000000000010',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.record_owner_cash_event(
      'c3300000-0000-4000-8000-000000000001',
      'c3300000-0000-4000-8000-000000000002',
      'c3300000-0000-4000-8000-000000000003',
      'USD', 'owner_contribution', '2026-08-10', 75.25,
      'Owner funded operating cash', 'owner-cash-create-0001'
    )
  $$,
  'Finance Manager records a checked owner contribution'
);

SELECT is(
  (SELECT count(*) FROM public.owner_cash_events),
  1::bigint,
  'checked cash command persists one immutable source event'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.owner_event_allocation_sets AS allocation_set
    WHERE allocation_set.source_type = 'owner_contribution'
      AND allocation_set.gross_signed_amount = 75.25
      AND allocation_set.allocation_basis = 'explicit_owner'
  ),
  1::bigint,
  'cash command atomically persists its explicit-owner allocation set'
);

SELECT is(
  (
    SELECT to_char(movement.signed_amount, 'FM999999999990.00')
    FROM public.owner_component_movements AS movement
  ),
  '75.25',
  'owner contribution increases only authoritative IPS-held owner cash'
);

SELECT lives_ok(
  $$
    SELECT public.record_owner_cash_event(
      'c3300000-0000-4000-8000-000000000001',
      'c3300000-0000-4000-8000-000000000002',
      'c3300000-0000-4000-8000-000000000003',
      'USD', 'owner_contribution', '2026-08-10', 75.25,
      'Owner funded operating cash', 'owner-cash-create-0001'
    )
  $$,
  'an exact idempotent replay returns the original stable identities'
);

SELECT is(
  (SELECT count(*) FROM public.owner_cash_events),
  1::bigint,
  'idempotent replay creates no duplicate source or movement'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'c3300000-0000-4000-8000-000000000011',
  true
);

SELECT throws_ok(
  $$
    SELECT public.record_owner_cash_event(
      'c3300000-0000-4000-8000-000000000001',
      'c3300000-0000-4000-8000-000000000002',
      'c3300000-0000-4000-8000-000000000003',
      'USD', 'owner_contribution', '2026-08-10', 75.25,
      'Owner funded operating cash', 'owner-cash-create-0001'
    )
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'an exact replay key remains bound to the authenticated actor'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'c3300000-0000-4000-8000-000000000010',
  true
);

SELECT throws_ok(
  $$
    SELECT public.record_owner_cash_event(
      'c3300000-0000-4000-8000-000000000001',
      'c3300000-0000-4000-8000-000000000002',
      'c3300000-0000-4000-8000-000000000003',
      'USD', 'owner_contribution', '2026-08-10', 75.26,
      'Owner funded operating cash', 'owner-cash-create-0001'
    )
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'an idempotency key cannot be replayed with a different exact-money payload'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.allocate_owner_event(uuid,text,uuid,text)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.get_owner_event_allocation_queue(uuid,uuid,public.currency_code,date,date)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.allocate_owner_event(uuid,text,uuid,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.allocate_owner_event(uuid,text,uuid,text)',
    'EXECUTE'
  ),
  'allocation commands are authenticated-only while anon and service_role remain denied'
);

SELECT lives_ok(
  $$
    SELECT public.allocate_owner_event(
      'c3300000-0000-4000-8000-000000000001',
      'owner_contribution',
      (SELECT id FROM public.owner_cash_events),
      'owner-cash-create-0001'
    )
  $$,
  'the generic allocator returns the stable completed result for an already allocated source'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM app_private.financial_idempotency_requests AS request
    WHERE request.organization_id = 'c3300000-0000-4000-8000-000000000001'
      AND request.operation IN ('record_owner_cash_event', 'allocate_owner_event')
      AND request.status = 'completed'
      AND request.actor_id = 'c3300000-0000-4000-8000-000000000010'
  ),
  2::bigint,
  'cash recording and generic allocation reuse the authoritative completed idempotency registry'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'c3300000-0000-4000-8000-000000000010',
  true
);
SET LOCAL ROLE authenticated;

SELECT ok(
  (
    SELECT count(*) = 3
      AND pg_catalog.bool_and(
        procedure.prosrc LIKE '%app_private.get_financial_idempotency_replay%'
        AND procedure.prosrc LIKE '%app_private.claim_financial_idempotency%'
        AND procedure.prosrc LIKE '%app_private.complete_financial_idempotency%'
      )
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'record_owner_cash_event',
        'allocate_owner_event',
        'transfer_owner_balance_component'
      )
  ),
  'Track 3 allocation commands reuse the single financial idempotency authority'
);

SELECT throws_ok(
  $$
    SELECT public.allocate_owner_event(
      'c3300000-0000-4000-8000-000000000001',
      'unsupported_owner_source',
      'c3300000-0000-4000-8000-000000000099',
      'unsupported-source-0001'
    )
  $$,
  '22023',
  'source_unsupported',
  'unsupported source types fail closed with typed remediation'
);

CREATE OR REPLACE FUNCTION pg_temp.owner_allocation_queue_probe()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result text;
BEGIN
  SELECT pg_catalog.concat_ws(
    '|',
    queue.allocation_state,
    queue.gross_signed_amount,
    coalesce(queue.remediation_code, '')
  )
  INTO v_result
  FROM public.get_owner_event_allocation_queue(
    'c3300000-0000-4000-8000-000000000001',
    'c3300000-0000-4000-8000-000000000002',
    'USD', '2026-08-01', '2026-08-31'
  ) AS queue
  WHERE queue.source_type = 'owner_contribution';

  RETURN coalesce(v_result, 'missing');
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

SELECT is(
  pg_temp.owner_allocation_queue_probe(),
  'allocated|75.25|',
  'allocation queue exposes canonical exact money and completed source state'
);

SELECT results_eq(
  $$
    SELECT
      source_type,
      gross_signed_amount,
      allocated_gross_signed_amount,
      ownership_percent_snapshot,
      component::text,
      signed_amount,
      reversal_of_allocation_set_id,
      reversal_of_movement_id
    FROM public.get_owner_balance_source_ledger(
      'c3300000-0000-4000-8000-000000000001',
      'c3300000-0000-4000-8000-000000000002',
      'c3300000-0000-4000-8000-000000000003',
      'USD', '2026-08-01', '2026-08-01'
    )
  $$,
  $$
    VALUES (
      'owner_contribution'::text,
      '75.25'::text,
      '75.25'::text,
      '100.000'::text,
      'ips_held_owner_cash'::text,
      '75.25'::text,
      NULL::uuid,
      NULL::uuid
    )
  $$,
  'source drill-through returns exact decimal strings and immutable lineage'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_owner_balance_source_ledger(uuid,uuid,uuid,public.currency_code,date,date)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.get_owner_balance_source_ledger(uuid,uuid,uuid,public.currency_code,date,date)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.get_owner_balance_source_ledger(uuid,uuid,uuid,public.currency_code,date,date)',
    'EXECUTE'
  ),
  'source drill-through is authenticated-only while anon and service_role remain denied'
);

SELECT throws_ok(
  $$
    UPDATE public.owner_event_allocation_sets
    SET gross_signed_amount = 1.00
  $$,
  '42501',
  'permission denied for table owner_event_allocation_sets',
  'authenticated direct mutation of authoritative allocation history is denied'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
