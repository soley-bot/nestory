BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

WITH authority_tables(table_name) AS (
  VALUES
    ('owner_close_series'),
    ('owner_close_revisions'),
    ('owner_close_lines'),
    ('owner_close_line_sources'),
    ('owner_close_corrections')
)
SELECT ok(
  (
    SELECT count(*) = 5
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN authority_tables AS expected
      ON expected.table_name = relation.relname
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'r'
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ),
  'all five Track 4A authority tables exist with RLS and FORCE RLS'
);

WITH authority_tables(table_name) AS (
  VALUES
    ('owner_close_series'),
    ('owner_close_revisions'),
    ('owner_close_lines'),
    ('owner_close_line_sources'),
    ('owner_close_corrections')
), checked_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
), mutation_privileges(privilege_name) AS (
  VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')
)
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM authority_tables
    CROSS JOIN checked_roles
    CROSS JOIN mutation_privileges
    WHERE pg_catalog.has_table_privilege(
      checked_roles.role_name,
      'public.' || authority_tables.table_name,
      mutation_privileges.privilege_name
    )
  ),
  'application roles have no direct Track 4A table mutation grant'
);

WITH authority_tables(table_name) AS (
  VALUES
    ('owner_close_series'),
    ('owner_close_revisions'),
    ('owner_close_lines'),
    ('owner_close_line_sources'),
    ('owner_close_corrections')
)
SELECT ok(
  (
    SELECT pg_catalog.bool_and(
      pg_catalog.has_table_privilege(
        'authenticated', 'public.' || table_name, 'SELECT'
      )
      AND NOT pg_catalog.has_table_privilege(
        'anon', 'public.' || table_name, 'SELECT'
      )
      AND NOT pg_catalog.has_table_privilege(
        'service_role', 'public.' || table_name, 'SELECT'
      )
    )
    FROM authority_tables
  ),
  'Track 4A table reads are explicitly authenticated-only before tenant RLS'
);

SELECT has_function(
  'public',
  'get_owner_close_readiness',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code', 'date'],
  'Finance roles inspect typed close readiness through one checked RPC'
);

SELECT has_function(
  'public',
  'get_owner_close_history',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code', 'date'],
  'Finance roles read frozen close evidence with exact decimal strings'
);

SELECT has_function(
  'public',
  'close_owner_month',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code', 'date', 'text', 'text'],
  'Super Admin closes one exact owner period through one checked RPC'
);

SELECT has_function(
  'public',
  'reopen_owner_month',
  ARRAY['uuid', 'uuid', 'text', 'text'],
  'Super Admin reopens a closed series into revision N plus 1'
);

SELECT has_function(
  'public',
  'record_owner_close_correction',
  ARRAY[
    'uuid', 'uuid', 'owner_balance_component', 'date', 'numeric',
    'text', 'text', 'text', 'text'
  ],
  'Super Admin records a checked append-only correction against a preparing revision'
);

WITH public_rpcs(function_name) AS (
  VALUES
    ('get_owner_close_readiness'),
    ('get_owner_close_history'),
    ('close_owner_month'),
    ('reopen_owner_month'),
    ('record_owner_close_correction')
), resolved AS (
  SELECT procedure.oid
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  JOIN public_rpcs AS expected
    ON expected.function_name = procedure.proname
  WHERE namespace.nspname = 'public'
)
SELECT ok(
  (SELECT count(*) = 5 FROM resolved)
  AND (
    SELECT pg_catalog.bool_and(
      pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('service_role', oid, 'EXECUTE')
    )
    FROM resolved
  ),
  'Track 4A public RPCs are executable only by authenticated callers'
);

CREATE TEMP TABLE owner_close_test_runtime (
  revision_one_id uuid,
  revision_two_id uuid,
  revision_three_id uuid,
  series_id uuid,
  revision_one_snapshot text,
  revision_one_content_hash text
) ON COMMIT DROP;
GRANT ALL ON TABLE owner_close_test_runtime TO authenticated;

SET LOCAL ROLE authenticated;

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

SELECT public.set_financial_month_lock(
  '00000000-0000-0000-0000-000000000001',
  pg_catalog.date_trunc('month', current_date)::date,
  false,
  'Track 4A pgTAP starts from an explicit unlocked month'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);

SELECT is(
  (
    public.get_owner_close_readiness(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )->>'is_ready'
  ),
  'false',
  'an otherwise ready period is not close-ready before its organization month is locked'
);

SELECT is(
  (
    public.get_owner_close_readiness(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )->'blockers'->0->>'code'
  ),
  'financial_month_not_locked',
  'readiness reports the operational lock requirement as a stable typed blocker'
);

SELECT throws_ok(
  $$
    SELECT public.close_owner_month(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date,
      'Finance Manager must remain read only',
      'track-4a-finance-close-denial'
    )
  $$,
  '42501',
  'owner_close_forbidden',
  'Finance Manager cannot close an owner month'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000501',
  true
);

SELECT throws_ok(
  $$
    SELECT public.get_owner_close_readiness(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )
  $$,
  '42501',
  'owner_close_readiness_forbidden',
  'Operations cannot inspect close readiness'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000009999',
  true
);

SELECT throws_ok(
  $$
    SELECT public.get_owner_close_history(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )
  $$,
  '42501',
  'owner_close_history_forbidden',
  'an authenticated user without organization membership cannot read close evidence'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);

SELECT throws_ok(
  $$
    SELECT public.get_owner_close_readiness(
      '00000000-0000-0000-0000-000000009999',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )
  $$,
  '42501',
  'owner_close_readiness_forbidden',
  'a Finance caller cannot use a different tenant id to probe close scope existence'
);

SELECT pg_catalog.set_config('request.jwt.claim.sub', '', true);

SELECT throws_ok(
  $$
    SELECT public.get_owner_close_history(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )
  $$,
  '42501',
  'owner_close_history_forbidden',
  'an authenticated database role without an actor claim cannot read close evidence'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

SELECT lives_ok(
  $$
    SELECT public.set_financial_month_lock(
      '00000000-0000-0000-0000-000000000001',
      pg_catalog.date_trunc('month', current_date)::date,
      true,
      'Track 4A deterministic close acceptance'
    )
  $$,
  'Super Admin locks the organization month before close'
);

SELECT is(
  (
    public.get_owner_close_readiness(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )->>'is_ready'
  ),
  'false',
  'a pending opening correction remains a typed close blocker after month lock'
);

SELECT is(
  (
    SELECT blocker->>'code'
    FROM pg_catalog.jsonb_array_elements(
      public.get_owner_close_readiness(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000004',
        'USD',
        pg_catalog.date_trunc('month', current_date)::date
      )->'blockers'
    ) AS blocker
    WHERE blocker->>'code' = 'pending_owner_opening_or_correction'
  ),
  'pending_owner_opening_or_correction',
  'the locked readiness result names the exact pending correction blocker'
);

SELECT lives_ok(
  $$
    SELECT public.review_owner_opening_balance(
      request.organization_id,
      request.id,
      'reject',
      'Resolve the pending fixture correction before close',
      'track-4a-reject-pending-opening-correction'
    )
    FROM public.owner_opening_balance_requests AS request
    WHERE request.organization_id = '00000000-0000-0000-0000-000000000001'
      AND request.property_id = '10000000-0000-0000-0000-000000000001'
      AND request.owner_person_id = '80000000-0000-0000-0000-000000000004'
      AND request.currency = 'USD'
      AND request.effective_date = pg_catalog.date_trunc('month', current_date)::date
      AND request.status = 'submitted'
  $$,
  'the checked locked-month rejection path resolves the pending correction'
);

SELECT is(
  (
    public.get_owner_close_readiness(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )->>'is_ready'
  ),
  'true',
  'the exact locked fixture scope becomes close-ready after blocker remediation'
);

SELECT results_eq(
  $$
    SELECT
      component->>'component',
      component->>'opening_amount',
      component->>'movement_amount',
      component->>'closing_amount'
    FROM pg_catalog.jsonb_array_elements(
      public.get_owner_close_readiness(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000004',
        'USD',
        pg_catalog.date_trunc('month', current_date)::date
      )->'components'
    ) AS component
    ORDER BY component->>'component'
  $$,
  $$
    VALUES
      ('ips_due_to_owner'::text, '240.50'::text, '-40.00'::text, '200.50'::text),
      ('ips_held_owner_cash'::text, '1250.00'::text, '605.00'::text, '1855.00'::text),
      ('owner_due_to_ips'::text, '0.00'::text, '0.00'::text, '0.00'::text),
      ('security_deposit_custody'::text, '800.00'::text, '60.00'::text, '860.00'::text)
  $$,
  'readiness exposes the literal four-component reconciliation without floating point'
);

SAVEPOINT track_4a_c1_zero_line_constraint;

RESET ROLE;
SELECT pg_catalog.set_config(
  'app.owner_close_write_context', 'checked-owner-close-v1', true
);

INSERT INTO public.owner_close_series (
  id, organization_id, property_id, owner_person_id, currency, month_start,
  state, created_by, state_changed_by
) VALUES (
  'c1000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD', pg_catalog.date_trunc('month', current_date)::date,
  'open',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

INSERT INTO public.owner_close_revisions (
  id, owner_close_series_id, organization_id, property_id, owner_person_id,
  currency, month_start, revision_number, status, prepared_by
) VALUES (
  'c1000000-0000-0000-0000-000000000011',
  'c1000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD', pg_catalog.date_trunc('month', current_date)::date,
  1, 'preparing',
  '00000000-0000-0000-0000-000000000101'
);

UPDATE public.owner_close_series
SET state = 'preparing',
    active_revision_id = 'c1000000-0000-0000-0000-000000000011',
    state_changed_at = pg_catalog.now(),
    state_changed_by = '00000000-0000-0000-0000-000000000101'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND id = 'c1000000-0000-0000-0000-000000000010';

SELECT lives_ok(
  $$
    INSERT INTO public.owner_close_lines (
      owner_close_revision_id, organization_id, line_number, line_kind,
      component, description, business_date, signed_amount, source_count,
      created_by
    ) VALUES (
      'c1000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000001',
      1, 'movement', 'ips_held_owner_cash',
      'Exact zero-cent source movement evidence',
      pg_catalog.date_trunc('month', current_date)::date,
      0.00, 1,
      '00000000-0000-0000-0000-000000000101'
    )
  $$,
  'a checked preparing revision accepts an exact zero-cent movement evidence line'
);

ROLLBACK TO SAVEPOINT track_4a_c1_zero_line_constraint;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);

SAVEPOINT track_4a_c1_zero_source_freeze;

RESET ROLE;
DELETE FROM public.property_owners
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND id = '90000000-0000-0000-0000-000000000005';

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);
SELECT public.set_financial_month_lock(
  '00000000-0000-0000-0000-000000000001',
  pg_catalog.date_trunc('month', current_date)::date,
  false,
  'Create Track 4A zero-cent source evidence'
);
SELECT public.allocate_owner_event(
  '00000000-0000-0000-0000-000000000001', queue.source_type,
  queue.source_line_id, 'track-4a-clear-fixture-source-' || queue.source_line_id::text
)
FROM public.get_owner_event_allocation_queue(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002', 'USD',
  pg_catalog.date_trunc('month', current_date)::date,
  (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date
) AS queue
WHERE queue.allocation_state <> 'allocated';

RESET ROLE;
UPDATE public.property_owners
SET ownership_percent = 50.000,
  updated_by = '00000000-0000-0000-0000-000000000101'
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND id = '90000000-0000-0000-0000-000000000002';

INSERT INTO public.people (
  id, organization_id, display_name, legal_name, party_type,
  primary_email, created_by, updated_by
) VALUES (
  'c1000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  'Track 4A zero-cent owner', 'Track 4A zero-cent owner', 'individual',
  'track4a.zero@example.test',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);
INSERT INTO public.person_roles (
  organization_id, person_id, role, status, created_by, updated_by
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000020',
  'owner', 'active',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);
INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_label,
  ownership_percent, is_primary, started_on, created_by, updated_by
) VALUES
  (
    'c1000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000020',
    'Equal owner B', 50.000, false,
    '2024-01-01'::date,
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101'
  );

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);
SELECT public.record_lease_deposit_event(
  '00000000-0000-0000-0000-000000000001', deposit.id, 'received',
  current_date,
  0.01, 'TRACK4A-ZERO-MOVEMENT'
)
FROM public.lease_deposits AS deposit
JOIN public.leases AS lease
  ON lease.organization_id = deposit.organization_id
 AND lease.id = deposit.lease_id
WHERE deposit.organization_id = '00000000-0000-0000-0000-000000000001'
  AND lease.property_id = '10000000-0000-0000-0000-000000000002'
LIMIT 1;

SELECT public.allocate_owner_event(
  '00000000-0000-0000-0000-000000000001',
  'security_deposit_receipt', event.id,
  'track-4a-zero-movement-allocation'
)
FROM public.lease_deposit_events AS event
WHERE event.organization_id = '00000000-0000-0000-0000-000000000001'
  AND event.reference = 'TRACK4A-ZERO-MOVEMENT';

SELECT public.record_lease_deposit_event(
  '00000000-0000-0000-0000-000000000001', deposit.id, 'received',
  current_date,
  0.01, 'TRACK4A-ZERO-ACTIVITY'
)
FROM public.lease_deposits AS deposit
JOIN public.leases AS lease
  ON lease.organization_id = deposit.organization_id
 AND lease.id = deposit.lease_id
WHERE deposit.organization_id = '00000000-0000-0000-0000-000000000001'
  AND lease.property_id = '10000000-0000-0000-0000-000000000002'
LIMIT 1;

RESET ROLE;
SELECT pg_catalog.set_config(
  'app.owner_balance_write_context', 'checked-owner-balance-v1', true
);

WITH source AS (
  SELECT resolved.*
  FROM public.lease_deposit_events AS event
  CROSS JOIN LATERAL app_private.resolve_owner_event_source(
    event.organization_id, 'security_deposit_receipt', event.id
  ) AS resolved
  WHERE event.organization_id = '00000000-0000-0000-0000-000000000001'
    AND event.reference = 'TRACK4A-ZERO-ACTIVITY'
)
INSERT INTO public.owner_event_allocation_sets (
  id, organization_id, property_id, currency, event_date, source_type,
  source_id, source_line_id, gross_signed_amount, source_fingerprint,
  allocation_basis, explicit_owner_person_id, idempotency_key,
  command_payload_hash, created_by
)
SELECT
  'c1000000-0000-0000-0000-000000000023',
  '00000000-0000-0000-0000-000000000001', source.property_id,
  source.currency, source.event_date, 'security_deposit_receipt',
  source.source_id, event.id, source.gross_signed_amount,
  source.source_fingerprint, source.allocation_basis,
  source.explicit_owner_person_id, 'track-4a-zero-activity-allocation',
  app_private.canonical_financial_payload_hash(
    pg_catalog.jsonb_build_object('oracle', 'track-4a-zero-activity')
  ),
  '00000000-0000-0000-0000-000000000101'
FROM public.lease_deposit_events AS event
CROSS JOIN source
WHERE event.organization_id = '00000000-0000-0000-0000-000000000001'
  AND event.reference = 'TRACK4A-ZERO-ACTIVITY';

INSERT INTO public.owner_event_owner_allocations (
  id, allocation_set_id, organization_id, property_owner_id, owner_person_id,
  ownership_percent_snapshot, ownership_started_on_snapshot,
  ownership_ended_on_snapshot, ownership_roster_hash,
  allocated_gross_signed_amount, allocation_order, created_by
)
SELECT
  CASE roster.owner_person_id
    WHEN '80000000-0000-0000-0000-000000000005'::uuid
      THEN 'c1000000-0000-0000-0000-000000000024'::uuid
    ELSE 'c1000000-0000-0000-0000-000000000025'::uuid
  END,
  'c1000000-0000-0000-0000-000000000023',
  '00000000-0000-0000-0000-000000000001',
  roster.property_owner_id, roster.owner_person_id, roster.ownership_percent,
  roster.started_on, roster.ended_on, roster.ownership_roster_hash,
  CASE roster.owner_person_id
    WHEN '80000000-0000-0000-0000-000000000005'::uuid THEN 0.01
    ELSE 0.00
  END,
  pg_catalog.row_number() OVER (ORDER BY roster.property_owner_id),
  '00000000-0000-0000-0000-000000000101'
FROM app_private.validate_owner_roster_on_date(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  current_date
) AS roster;

INSERT INTO public.owner_component_movements (
  id, organization_id, owner_event_owner_allocation_id, property_id,
  owner_person_id, currency, event_date, month_start, component,
  signed_amount, movement_order, created_by
) VALUES (
  'c1000000-0000-0000-0000-000000000026',
  '00000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000024',
  '10000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000005', 'USD',
  current_date,
  pg_catalog.date_trunc('month', current_date)::date,
  'security_deposit_custody', 0.01, 1,
  '00000000-0000-0000-0000-000000000101'
);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);
SELECT public.set_financial_month_lock(
  '00000000-0000-0000-0000-000000000001',
  pg_catalog.date_trunc('month', current_date)::date,
  true,
  'Track 4A zero-cent frozen evidence oracle'
);
SELECT public.generate_owner_balance_period(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000020', 'USD',
  pg_catalog.date_trunc('month', current_date)::date,
  'track-4a-zero-owner-period'
);

RESET ROLE;
SELECT pg_catalog.set_config(
  'app.owner_balance_period_write_context', 'checked-rollforward-v1', true
);
UPDATE public.owner_balance_periods AS period
SET status = 'ready',
  blocked_reason_code = NULL,
  blocked_reason_detail = NULL
WHERE period.organization_id = '00000000-0000-0000-0000-000000000001'
  AND period.property_id = '10000000-0000-0000-0000-000000000002'
  AND period.owner_person_id = 'c1000000-0000-0000-0000-000000000020'
  AND period.month_start = pg_catalog.date_trunc('month', current_date)::date;
INSERT INTO public.owner_balance_period_components (
  owner_balance_period_id, organization_id, component,
  opening_amount, movement_amount, closing_amount, created_by
)
SELECT period.id, period.organization_id, component.component,
  0.00, 0.00, 0.00,
  '00000000-0000-0000-0000-000000000101'
FROM public.owner_balance_periods AS period
CROSS JOIN (
  VALUES
    ('ips_held_owner_cash'::public.owner_balance_component),
    ('owner_due_to_ips'::public.owner_balance_component),
    ('ips_due_to_owner'::public.owner_balance_component),
    ('security_deposit_custody'::public.owner_balance_component)
) AS component(component)
WHERE period.organization_id = '00000000-0000-0000-0000-000000000001'
  AND period.property_id = '10000000-0000-0000-0000-000000000002'
  AND period.owner_person_id = 'c1000000-0000-0000-0000-000000000020'
  AND period.month_start = pg_catalog.date_trunc('month', current_date)::date;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);

SELECT lives_ok(
  $$
    SELECT public.close_owner_month(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      'c1000000-0000-0000-0000-000000000020', 'USD',
      pg_catalog.date_trunc('month', current_date)::date,
      'Freeze zero-cent split evidence exactly',
      'track-4a-zero-owner-close'
    )
  $$,
  'a split-cent losing owner closes with zero movement and activity evidence'
);

SELECT results_eq(
  $$
    SELECT line.line_kind, pg_catalog.to_char(line.signed_amount, 'FM999999999990.00'),
      count(source.id)::integer
    FROM public.owner_close_series AS series
    JOIN public.owner_close_lines AS line
      ON line.organization_id = series.organization_id
     AND line.owner_close_revision_id = series.current_closed_revision_id
    JOIN public.owner_close_line_sources AS source
      ON source.organization_id = line.organization_id
     AND source.close_line_id = line.id
    WHERE series.organization_id = '00000000-0000-0000-0000-000000000001'
      AND series.property_id = '10000000-0000-0000-0000-000000000002'
      AND series.owner_person_id = 'c1000000-0000-0000-0000-000000000020'
      AND line.line_kind IN ('movement', 'activity')
    GROUP BY line.line_kind, line.signed_amount
    ORDER BY line.line_kind
  $$,
  $$ VALUES
    ('activity'::text, '0.00'::text, 1),
    ('movement'::text, '0.00'::text, 1)
  $$,
  'zero movement and activity allocations freeze once with exact source lineage'
);

SELECT results_eq(
  $$
    SELECT component.component::text,
      pg_catalog.to_char(component.opening_amount, 'FM999999999990.00'),
      pg_catalog.to_char(component.movement_amount, 'FM999999999990.00'),
      pg_catalog.to_char(component.closing_amount, 'FM999999999990.00')
    FROM public.owner_balance_periods AS period
    JOIN public.owner_balance_period_components AS component
      ON component.organization_id = period.organization_id
     AND component.owner_balance_period_id = period.id
    WHERE period.organization_id = '00000000-0000-0000-0000-000000000001'
      AND period.property_id = '10000000-0000-0000-0000-000000000002'
      AND period.owner_person_id = 'c1000000-0000-0000-0000-000000000020'
    ORDER BY component.component::text
  $$,
  $$ VALUES
    ('ips_due_to_owner'::text, '0.00'::text, '0.00'::text, '0.00'::text),
    ('ips_held_owner_cash'::text, '0.00'::text, '0.00'::text, '0.00'::text),
    ('owner_due_to_ips'::text, '0.00'::text, '0.00'::text, '0.00'::text),
    ('security_deposit_custody'::text, '0.00'::text, '0.00'::text, '0.00'::text)
  $$,
  'zero-value evidence leaves every authoritative component total unchanged'
);

ROLLBACK TO SAVEPOINT track_4a_c1_zero_source_freeze;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);


WITH result AS (
  SELECT public.close_owner_month(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'USD',
    pg_catalog.date_trunc('month', current_date)::date,
    'Month reconciled to immutable owner authority',
    'track-4a-close-central-r1'
  ) AS payload
)
INSERT INTO owner_close_test_runtime (
  revision_one_id,
  series_id,
  revision_one_content_hash
)
SELECT
  (payload->>'revision_id')::uuid,
  (payload->>'series_id')::uuid,
  payload->>'content_hash'
FROM result;

SELECT is(
  (
    SELECT revision.status || ':' || revision.revision_number::text
    FROM public.owner_close_revisions AS revision
    JOIN owner_close_test_runtime AS runtime
      ON runtime.revision_one_id = revision.id
  ),
  'closed:1',
  'the first close persists immutable closed revision 1'
);

SELECT results_eq(
  $$
    SELECT
      line.line_kind,
      line.component::text,
      pg_catalog.to_char(line.signed_amount, 'FM999999999990.00')
    FROM public.owner_close_lines AS line
    JOIN owner_close_test_runtime AS runtime
      ON runtime.revision_one_id = line.owner_close_revision_id
    WHERE line.line_kind IN ('opening', 'closing')
    ORDER BY line.line_number
  $$,
  $$
    VALUES
      ('opening'::text, 'ips_held_owner_cash'::text, '1250.00'::text),
      ('opening'::text, 'owner_due_to_ips'::text, '0.00'::text),
      ('opening'::text, 'ips_due_to_owner'::text, '240.50'::text),
      ('opening'::text, 'security_deposit_custody'::text, '800.00'::text),
      ('closing'::text, 'ips_held_owner_cash'::text, '1855.00'::text),
      ('closing'::text, 'owner_due_to_ips'::text, '0.00'::text),
      ('closing'::text, 'ips_due_to_owner'::text, '200.50'::text),
      ('closing'::text, 'security_deposit_custody'::text, '860.00'::text)
  $$,
  'frozen opening lines come first and frozen closing lines come last in component order'
);

SELECT is(
  (
    SELECT count(*)::text
    FROM public.owner_component_movements AS movement
    WHERE movement.organization_id = '00000000-0000-0000-0000-000000000001'
      AND movement.property_id = '10000000-0000-0000-0000-000000000001'
      AND movement.owner_person_id = '80000000-0000-0000-0000-000000000004'
      AND movement.currency = 'USD'
      AND movement.month_start = pg_catalog.date_trunc('month', current_date)::date
      AND (
        SELECT count(*)
        FROM public.owner_close_line_sources AS source
        JOIN owner_close_test_runtime AS runtime
          ON runtime.revision_one_id = source.owner_close_revision_id
        WHERE source.owner_component_movement_id = movement.id
      ) <> 1
  ),
  '0',
  'every owner component movement is frozen exactly once with exact movement lineage'
);

SELECT is(
  (
    SELECT count(*)::text
    FROM public.owner_close_lines AS line
    JOIN owner_close_test_runtime AS runtime
      ON runtime.revision_one_id = line.owner_close_revision_id
    WHERE line.component IS NOT NULL
      AND line.line_kind = 'movement'
      AND NOT EXISTS (
        SELECT 1
        FROM public.owner_close_line_sources AS source
        WHERE source.owner_close_revision_id = line.owner_close_revision_id
          AND source.close_line_id = line.id
          AND source.source_fingerprint ~ '^[0-9a-f]{64}$'
      )
  ),
  '0',
  'every frozen movement line retains one exact lowercase SHA-256 source fingerprint'
);

SELECT is(
  (
    SELECT count(*)::text
    FROM (
      SELECT
        line.component,
        pg_catalog.sum(line.signed_amount) FILTER (
          WHERE line.line_kind = 'opening'
        ) AS opening_amount,
        pg_catalog.sum(line.signed_amount) FILTER (
          WHERE line.line_kind = 'movement'
        ) AS movement_amount,
        pg_catalog.sum(line.signed_amount) FILTER (
          WHERE line.line_kind = 'closing'
        ) AS closing_amount
      FROM public.owner_close_lines AS line
      JOIN owner_close_test_runtime AS runtime
        ON runtime.revision_one_id = line.owner_close_revision_id
      WHERE line.component IS NOT NULL
      GROUP BY line.component
      HAVING
        coalesce(pg_catalog.sum(line.signed_amount) FILTER (
          WHERE line.line_kind = 'opening'
        ), 0)
        + coalesce(pg_catalog.sum(line.signed_amount) FILTER (
          WHERE line.line_kind = 'movement'
        ), 0)
        <> coalesce(pg_catalog.sum(line.signed_amount) FILTER (
          WHERE line.line_kind = 'closing'
        ), 0)
    ) AS broken
  ),
  '0',
  'frozen opening plus movements equals frozen closing for every component'
);

SELECT ok(
  (
    SELECT revision.input_hash ~ '^[0-9a-f]{64}$'
      AND revision.content_hash ~ '^[0-9a-f]{64}$'
      AND revision.input_watermark <> ''
    FROM public.owner_close_revisions AS revision
    JOIN owner_close_test_runtime AS runtime
      ON runtime.revision_one_id = revision.id
  ),
  'revision 1 persists canonical lowercase input and content hashes plus a watermark'
);

UPDATE owner_close_test_runtime AS runtime
SET revision_one_snapshot = (
  SELECT pg_catalog.concat_ws(
    E'\n--lines--\n',
    pg_catalog.row_to_json(revision)::text,
    (
      SELECT pg_catalog.string_agg(pg_catalog.row_to_json(line)::text, E'\n' ORDER BY line.line_number)
      FROM public.owner_close_lines AS line
      WHERE line.owner_close_revision_id = revision.id
    ),
    (
      SELECT pg_catalog.string_agg(
        pg_catalog.row_to_json(source)::text,
        E'\n' ORDER BY source.close_line_id, source.id
      )
      FROM public.owner_close_line_sources AS source
      WHERE source.owner_close_revision_id = revision.id
    )
  )
  FROM public.owner_close_revisions AS revision
  WHERE revision.id = runtime.revision_one_id
);

SELECT throws_ok(
  $$
    UPDATE public.owner_close_revisions
    SET close_reason = 'Attempted rewrite'
    WHERE id = (
      SELECT revision_one_id FROM owner_close_test_runtime
    )
  $$,
  '42501',
  'permission denied for table owner_close_revisions',
  'direct revision mutation is denied even to Super Admin'
);

SELECT is(
  (
    public.close_owner_month(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date,
      'Month reconciled to immutable owner authority',
      'track-4a-close-central-r1'
    )->>'revision_id'
  ),
  (SELECT revision_one_id::text FROM owner_close_test_runtime),
  'completed close replay returns the original revision before mutable close-state checks'
);

SELECT throws_ok(
  $$
    SELECT public.close_owner_month(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date,
      'A conflicting close reason',
      'track-4a-close-central-r1'
    )
  $$,
  '22023',
  'Conflicting financial idempotency request',
  'close idempotency conflict is atomic'
);

WITH result AS (
  SELECT public.reopen_owner_month(
    '00000000-0000-0000-0000-000000000001',
    runtime.series_id,
    'Correct one evidenced owner payable source',
    'track-4a-reopen-central-r2'
  ) AS payload
  FROM owner_close_test_runtime AS runtime
)
UPDATE owner_close_test_runtime AS runtime
SET revision_two_id = (result.payload->>'revision_id')::uuid
FROM result;

SELECT results_eq(
  $$
    SELECT
      revision.revision_number,
      revision.status,
      revision.supersedes_revision_id,
      revision.reopen_reason
    FROM public.owner_close_revisions AS revision
    JOIN owner_close_test_runtime AS runtime
      ON revision.id IN (runtime.revision_one_id, runtime.revision_two_id)
    ORDER BY revision.revision_number
  $$,
  $$
    SELECT 1, 'closed'::text, NULL::uuid, NULL::text
    UNION ALL
    SELECT 2, 'preparing'::text, revision_one_id,
      'Correct one evidenced owner payable source'::text
    FROM owner_close_test_runtime
  $$,
  'reopen preserves revision 1 and creates preparing revision 2 linked to it'
);

SELECT is(
  (
    SELECT status
    FROM public.owner_balance_periods
    WHERE organization_id = '00000000-0000-0000-0000-000000000001'
      AND property_id = '10000000-0000-0000-0000-000000000001'
      AND owner_person_id = '80000000-0000-0000-0000-000000000004'
      AND currency = 'USD'
      AND month_start = (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date
  ),
  'stale',
  'reopen marks the later dependent owner period stale'
);

SELECT lives_ok(
  $$
    SELECT public.record_owner_close_correction(
      '00000000-0000-0000-0000-000000000001',
      revision_two_id,
      'owner_due_to_ips',
      pg_catalog.date_trunc('month', current_date)::date,
      10.00,
      'Correct evidenced owner payable source after reopen',
      'TRACK-4A-CORRECTION-OWNER-DUE-001',
      repeat('9', 64),
      'track-4a-correction-central-r2'
    )
    FROM owner_close_test_runtime
  $$,
  'a checked append-only correction is accepted only for the preparing revision'
);

SELECT is(
  (
    SELECT pg_catalog.to_char(movement.signed_amount, 'FM999999999990.00')
    FROM public.owner_close_corrections AS correction
    JOIN public.owner_event_allocation_sets AS allocation_set
      ON allocation_set.organization_id = correction.organization_id
     AND allocation_set.source_type = 'owner_close_correction'
     AND allocation_set.source_line_id = correction.id
    JOIN public.owner_event_owner_allocations AS owner_allocation
      ON owner_allocation.organization_id = allocation_set.organization_id
     AND owner_allocation.allocation_set_id = allocation_set.id
    JOIN public.owner_component_movements AS movement
      ON movement.organization_id = owner_allocation.organization_id
     AND movement.owner_event_owner_allocation_id = owner_allocation.id
    JOIN owner_close_test_runtime AS runtime
      ON runtime.revision_two_id = correction.owner_close_revision_id
  ),
  '10.00',
  'the correction persists one exact component movement through normal Track 3 lineage'
);

SELECT lives_ok(
  $$
    SELECT public.generate_owner_balance_period(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date,
      'track-4a-reroll-central-r2'
    )
  $$,
  'the reopened target period rerolls deterministically while the organization month stays locked'
);

SELECT is(
  (
    SELECT public.close_owner_month(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date,
      'Reconciled after checked correction and ordered reroll',
      'track-4a-close-central-r2'
    )->>'revision_id'
  ),
  (SELECT revision_two_id::text FROM owner_close_test_runtime),
  'the second close completes the preparing revision rather than creating a third revision'
);

SELECT results_eq(
  $$
    SELECT
      revision.revision_number,
      revision.status,
      revision.supersedes_revision_id,
      revision.content_hash = runtime.revision_one_content_hash AS same_hash
    FROM public.owner_close_revisions AS revision
    JOIN owner_close_test_runtime AS runtime
      ON revision.id IN (runtime.revision_one_id, runtime.revision_two_id)
    ORDER BY revision.revision_number
  $$,
  $$
    SELECT 1, 'closed'::text, NULL::uuid, true
    FROM owner_close_test_runtime
    UNION ALL
    SELECT 2, 'closed'::text, revision_one_id, false
    FROM owner_close_test_runtime
  $$,
  'revision 2 closes with different frozen content while revision 1 stays closed'
);

SELECT is(
  (
    SELECT pg_catalog.concat_ws(
      E'\n--lines--\n',
      pg_catalog.row_to_json(revision)::text,
      (
        SELECT pg_catalog.string_agg(pg_catalog.row_to_json(line)::text, E'\n' ORDER BY line.line_number)
        FROM public.owner_close_lines AS line
        WHERE line.owner_close_revision_id = revision.id
      ),
      (
        SELECT pg_catalog.string_agg(
          pg_catalog.row_to_json(source)::text,
          E'\n' ORDER BY source.close_line_id, source.id
        )
        FROM public.owner_close_line_sources AS source
        WHERE source.owner_close_revision_id = revision.id
      )
    )
    FROM public.owner_close_revisions AS revision
    JOIN owner_close_test_runtime AS runtime
      ON runtime.revision_one_id = revision.id
  ),
  (SELECT revision_one_snapshot FROM owner_close_test_runtime),
  'reopen, correction, reroll, and reclose preserve revision 1 byte-for-byte at the database-value boundary'
);

RESET ROLE;

SELECT has_column(
  'public',
  'owner_close_revisions',
  'input_canonical',
  'closed revisions retain the immutable canonical input bytes behind input_hash'
);

WITH live_snapshot AS (
  SELECT snapshot.*
  FROM app_private.owner_close_input_snapshot(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'USD', pg_catalog.date_trunc('month', current_date)::date
  ) AS snapshot
)
SELECT is(
  (
    SELECT (
      revision.input_hash = live_snapshot.input_hash
      AND live_snapshot.input_hash = pg_catalog.encode(
        extensions.digest(live_snapshot.input_canonical, 'sha256'), 'hex'
      )
    )::text
    FROM public.owner_close_revisions AS revision
    JOIN owner_close_test_runtime AS runtime
      ON runtime.revision_two_id = revision.id
    CROSS JOIN live_snapshot
  ),
  'true',
  'the independent live canonical oracle reproduces revision 2 input_hash shape'
);

WITH live_snapshot AS (
  SELECT snapshot.*
  FROM app_private.owner_close_input_snapshot(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'USD', pg_catalog.date_trunc('month', current_date)::date
  ) AS snapshot
)
SELECT is(
  (
    SELECT (revision.input_hash = live_snapshot.input_hash)::text
    FROM public.owner_close_revisions AS revision
    JOIN owner_close_test_runtime AS runtime
      ON runtime.revision_one_id = revision.id
    CROSS JOIN live_snapshot
  ),
  'false',
  'the mutable live snapshot can no longer reproduce revision 1 after reroll and R2 close'
);

SELECT lives_ok(
  $statement$
    DO $oracle$
    DECLARE
      v_unreproducible integer;
    BEGIN
      SELECT count(*)::integer
      INTO v_unreproducible
      FROM public.owner_close_revisions AS revision
      JOIN owner_close_test_runtime AS runtime
        ON revision.id IN (runtime.revision_one_id, runtime.revision_two_id)
      WHERE revision.input_canonical IS NULL
        OR revision.input_hash IS DISTINCT FROM pg_catalog.encode(
          extensions.digest(revision.input_canonical, 'sha256'), 'hex'
        );

      IF v_unreproducible <> 0 THEN
        RAISE EXCEPTION 'retained owner-close input canonical mismatch';
      END IF;
    END;
    $oracle$;
  $statement$,
  'independent retained canonical bytes reproduce both R1 and R2 input hashes'
);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true
);

SAVEPOINT track_4a_c2_positive_first;

UPDATE owner_close_test_runtime AS runtime
SET revision_three_id = (
  SELECT series.active_revision_id
  FROM public.owner_close_series AS series
  WHERE series.organization_id = '00000000-0000-0000-0000-000000000001'
    AND series.property_id = '10000000-0000-0000-0000-000000000004'
    AND series.owner_person_id = '80000000-0000-0000-0000-000000000014'
    AND series.currency = 'USD'
    AND series.month_start = (
      pg_catalog.date_trunc('month', current_date) + INTERVAL '24 months'
    )::date
    AND series.state = 'preparing'
);

SELECT lives_ok(
  $$
    SELECT public.record_owner_close_correction(
      '00000000-0000-0000-0000-000000000001',
      revision_three_id, 'ips_held_owner_cash',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '24 months')::date,
      100.00,
      'Positive first correction before deterministic reroll',
      'TRACK-4A-C2-POSITIVE-FIRST', repeat('c', 64),
      'track-4a-c2-positive-first'
    )
    FROM owner_close_test_runtime
  $$,
  'a non-crossing positive first correction is accepted'
);

SELECT lives_ok(
  $$
    SELECT public.generate_owner_balance_period(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000004',
      '80000000-0000-0000-0000-000000000014',
      'USD', (pg_catalog.date_trunc('month', current_date) + INTERVAL '24 months')::date,
      'track-4a-c2-positive-reroll'
    )
  $$,
  'the positive first correction is incorporated by one reroll'
);

SELECT throws_ok(
  $$
    SELECT public.record_owner_close_correction(
      '00000000-0000-0000-0000-000000000001',
      revision_three_id, 'ips_held_owner_cash',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '24 months')::date,
      -1100.00,
      'Crossing second correction must fail against authoritative movements',
      'TRACK-4A-C2-POSITIVE-CROSSING', repeat('d', 64),
      'track-4a-c2-positive-crossing'
    )
    FROM owner_close_test_runtime
  $$,
  '23514',
  'owner_close_correction_negative_component',
  'a positive correction already incorporated by reroll is counted exactly once'
);

RESET ROLE;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_array(
      (SELECT count(*) FROM public.owner_close_corrections
       WHERE idempotency_key = 'track-4a-c2-positive-crossing'),
      (SELECT count(*) FROM public.owner_event_allocation_sets
       WHERE idempotency_key = 'track-4a-c2-positive-crossing'),
      (SELECT count(*)
       FROM public.owner_component_movements AS movement
       JOIN public.owner_event_owner_allocations AS owner_allocation
         ON owner_allocation.organization_id = movement.organization_id
        AND owner_allocation.id = movement.owner_event_owner_allocation_id
       JOIN public.owner_event_allocation_sets AS allocation_set
         ON allocation_set.organization_id = owner_allocation.organization_id
        AND allocation_set.id = owner_allocation.allocation_set_id
       WHERE allocation_set.idempotency_key = 'track-4a-c2-positive-crossing'),
      (SELECT count(*) FROM app_private.financial_idempotency_requests
       WHERE organization_id = '00000000-0000-0000-0000-000000000001'
         AND operation = 'record_owner_close_correction'
         AND idempotency_key = 'track-4a-c2-positive-crossing')
    )::text
  ),
  '[0, 0, 0, 0]',
  'a rejected crossing correction leaves no correction, allocation, movement, or idempotency row'
);

ROLLBACK TO SAVEPOINT track_4a_c2_positive_first;

SAVEPOINT track_4a_c3_nested_preparing;

SELECT public.generate_owner_balance_period(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD',
  (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
  'track-4a-c3-later-r1-ready'
);

SELECT public.set_financial_month_lock(
  '00000000-0000-0000-0000-000000000001',
  (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
  true,
  'Lock later nested-close test month'
);

CREATE TEMP TABLE owner_close_c3_runtime (
  later_series_id uuid,
  later_revision_one_id uuid,
  later_revision_two_id uuid
) ON COMMIT DROP;
GRANT ALL ON TABLE owner_close_c3_runtime TO authenticated;
INSERT INTO owner_close_c3_runtime DEFAULT VALUES;

WITH result AS (
  SELECT public.close_owner_month(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000004',
    'USD',
    (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
    'Close later month before nested recovery',
    'track-4a-c3-later-close-r1'
  ) AS payload
)
UPDATE owner_close_c3_runtime
SET later_series_id = (result.payload->>'series_id')::uuid,
    later_revision_one_id = (result.payload->>'revision_id')::uuid
FROM result;

WITH result AS (
  SELECT public.reopen_owner_month(
    '00000000-0000-0000-0000-000000000001',
    runtime.later_series_id,
    'Prepare later revision before earlier recovery',
    'track-4a-c3-later-reopen-r2'
  ) AS payload
  FROM owner_close_c3_runtime AS runtime
)
UPDATE owner_close_c3_runtime
SET later_revision_two_id = (result.payload->>'revision_id')::uuid
FROM result;

WITH result AS (
  SELECT public.reopen_owner_month(
    '00000000-0000-0000-0000-000000000001',
    runtime.series_id,
    'Earlier source correction must preserve later preparing lineage',
    'track-4a-c3-earlier-reopen-r3'
  ) AS payload
  FROM owner_close_test_runtime AS runtime
)
UPDATE owner_close_test_runtime
SET revision_three_id = (result.payload->>'revision_id')::uuid
FROM result;

SELECT public.record_owner_close_correction(
  '00000000-0000-0000-0000-000000000001',
  runtime.revision_three_id,
  'owner_due_to_ips',
  pg_catalog.date_trunc('month', current_date)::date,
  1.00,
  'Checked earlier correction in nested recovery',
  'TRACK-4A-C3-EARLIER-CORRECTION',
  repeat('3', 64),
  'track-4a-c3-earlier-correction'
)
FROM owner_close_test_runtime AS runtime;

SELECT public.generate_owner_balance_period(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD', pg_catalog.date_trunc('month', current_date)::date,
  'track-4a-c3-earlier-r3-reroll'
);

SELECT public.close_owner_month(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD', pg_catalog.date_trunc('month', current_date)::date,
  'Reclose earlier month after nested checked correction',
  'track-4a-c3-earlier-close-r3'
);

SELECT public.generate_owner_balance_period(
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000004',
  'USD',
  (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
  'track-4a-c3-later-r2-reroll'
);

SELECT results_eq(
  $$
    SELECT
      series.state,
      series.active_revision_id,
      count(*) FILTER (WHERE revision.status = 'preparing')::integer,
      public.get_owner_close_readiness(
        series.organization_id, series.property_id, series.owner_person_id,
        series.currency, series.month_start
      )->>'is_ready'
    FROM public.owner_close_series AS series
    JOIN public.owner_close_revisions AS revision
      ON revision.organization_id = series.organization_id
     AND revision.owner_close_series_id = series.id
    JOIN owner_close_c3_runtime AS runtime
      ON runtime.later_series_id = series.id
    GROUP BY series.id, runtime.later_revision_two_id
  $$,
  $$
    SELECT
      'preparing'::text,
      later_revision_two_id,
      1::integer,
      'true'::text
    FROM owner_close_c3_runtime
  $$,
  'later state, active pointer, preparing count, and readiness retain one usable N plus 1'
);

SELECT lives_ok(
  $$
    SELECT public.close_owner_month(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
      'Reclose the preserved later preparing revision',
      'track-4a-c3-later-close-r2'
    )
  $$,
  'later N plus 1 can close after ordered earlier recovery and later reroll'
);

SELECT results_eq(
  $$
    SELECT
      series.state,
      series.current_closed_revision_id,
      count(*) FILTER (WHERE revision.status = 'preparing')::integer
    FROM public.owner_close_series AS series
    JOIN public.owner_close_revisions AS revision
      ON revision.organization_id = series.organization_id
     AND revision.owner_close_series_id = series.id
    JOIN owner_close_c3_runtime AS runtime
      ON runtime.later_series_id = series.id
    GROUP BY series.id, runtime.later_revision_two_id
  $$,
  $$
    SELECT 'closed'::text, later_revision_two_id, 0::integer
    FROM owner_close_c3_runtime
  $$,
  'later reclose consumes the same N plus 1 without an orphan preparing revision'
);

ROLLBACK TO SAVEPOINT track_4a_c3_nested_preparing;


SELECT lives_ok(
  $$
    SELECT public.generate_owner_balance_period(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date,
      'track-4a-reroll-central-next-after-r2'
    )
  $$,
  'the next dependent month rerolls after its predecessor is reclosed'
);

SELECT is(
  (
    SELECT pg_catalog.to_char(component.opening_amount, 'FM999999999990.00')
    FROM public.owner_balance_periods AS period
    JOIN public.owner_balance_period_components AS component
      ON component.organization_id = period.organization_id
     AND component.owner_balance_period_id = period.id
    WHERE period.organization_id = '00000000-0000-0000-0000-000000000001'
      AND period.property_id = '10000000-0000-0000-0000-000000000001'
      AND period.owner_person_id = '80000000-0000-0000-0000-000000000004'
      AND period.currency = 'USD'
      AND period.month_start = (pg_catalog.date_trunc('month', current_date) + INTERVAL '1 month')::date
      AND component.component = 'owner_due_to_ips'
  ),
  '10.00',
  'ordered reroll carries revision 2 owner payable closing into the next month opening'
);

SELECT ok(
  (
    SELECT pg_catalog.bool_and(
      pg_catalog.jsonb_typeof(line->'signed_amount') = 'string'
      AND line->>'signed_amount' ~ '^-?[0-9]+\.[0-9]{2}$'
    )
    FROM pg_catalog.jsonb_array_elements(
      public.get_owner_close_history(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '80000000-0000-0000-0000-000000000004',
        'USD',
        pg_catalog.date_trunc('month', current_date)::date
      )->'revisions'
    ) AS revision
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      revision->'lines'
    ) AS line
  ),
  'history returns every frozen amount as an exact two-decimal JSON string'
);

SELECT is(
  (
    public.get_owner_close_history(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )->'corrections'->0->>'signed_amount'
  ),
  '10.00',
  'history preserves the exact checked correction amount as text'
);

WITH canonical_revisions AS (
  SELECT
    revision.id,
    revision.content_hash,
    pg_catalog.concat_ws(
      E'\n--lines--\n',
      revision.organization_id::text || '|' || revision.property_id::text ||
        '|' || revision.owner_person_id::text || '|' || revision.currency::text ||
        '|' || revision.month_start::text || '|' || revision.revision_number::text ||
        '|' || pg_catalog.btrim(revision.close_reason),
      coalesce((
        SELECT pg_catalog.string_agg(
          line.line_number::text || '|' || line.line_kind || '|' ||
          coalesce(line.component::text, '') || '|' || line.description || '|' ||
          line.business_date::text || '|' ||
          pg_catalog.to_char(line.signed_amount, 'FM999999999990.00') || '|' ||
          line.source_count::text,
          E'\n' ORDER BY line.line_number
        )
        FROM public.owner_close_lines AS line
        WHERE line.organization_id = revision.organization_id
          AND line.owner_close_revision_id = revision.id
      ), ''),
      '--sources--',
      coalesce((
        SELECT pg_catalog.string_agg(
          line.line_number::text || '|' || source.source_type || '|' ||
          source.source_id::text || '|' || source.source_line_id::text || '|' ||
          source.source_fingerprint || '|' ||
          coalesce(source.owner_component_movement_id::text, '') || '|' ||
          coalesce(source.owner_event_owner_allocation_id::text, '') || '|' ||
          coalesce(source.owner_balance_period_component_id::text, '') || '|' ||
          coalesce(source.owner_opening_balance_entry_id::text, ''),
          E'\n' ORDER BY line.line_number, source.source_type,
            source.source_line_id, source.id
        )
        FROM public.owner_close_line_sources AS source
        JOIN public.owner_close_lines AS line
          ON line.organization_id = source.organization_id
         AND line.id = source.close_line_id
        WHERE source.organization_id = revision.organization_id
          AND source.owner_close_revision_id = revision.id
      ), '')
    ) AS canonical_value
  FROM public.owner_close_revisions AS revision
  CROSS JOIN owner_close_test_runtime AS runtime
  WHERE revision.id IN (runtime.revision_one_id, runtime.revision_two_id)
)
SELECT ok(
  (
    SELECT pg_catalog.bool_and(
      content_hash = pg_catalog.encode(
        extensions.digest(canonical_value, 'sha256'), 'hex'
      )
    )
    FROM canonical_revisions
  ),
  'an independent literal oracle reproduces both frozen revision content hashes'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000701',
  true
);

SELECT is(
  pg_catalog.jsonb_array_length(
    public.get_owner_close_history(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )->'revisions'
  ),
  2,
  'Finance Manager reads both immutable revisions without mutation authority'
);

SELECT pg_catalog.set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000501',
  true
);

SELECT throws_ok(
  $$
    SELECT public.get_owner_close_history(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000004',
      'USD',
      pg_catalog.date_trunc('month', current_date)::date
    )
  $$,
  '42501',
  'owner_close_history_forbidden',
  'Operations cannot read frozen owner close history'
);

SELECT * FROM finish();
ROLLBACK;
