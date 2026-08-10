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
