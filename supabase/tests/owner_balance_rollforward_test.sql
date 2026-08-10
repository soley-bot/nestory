BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_table(
  'public',
  'owner_balance_periods',
  'Track 3 stores one authoritative owner balance period per exact period key'
);

SELECT has_table(
  'public',
  'owner_balance_period_components',
  'Track 3 stores exactly four component rows for each authoritative period'
);

SELECT has_column(
  'public',
  'owner_balance_periods',
  'input_watermark',
  'period authority retains its deterministic source watermark'
);

SELECT has_column(
  'public',
  'owner_balance_periods',
  'input_hash',
  'period authority retains its deterministic input hash'
);

SELECT has_column(
  'public',
  'owner_balance_periods',
  'blocked_reason_code',
  'blocked periods expose typed remediation instead of guessed balances'
);

SELECT has_function(
  'public',
  'generate_owner_balance_period',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code', 'date', 'text'],
  'a checked command generates or deterministically recomputes one owner period'
);

SELECT has_function(
  'public',
  'get_owner_balance_ledger',
  ARRAY['uuid', 'uuid', 'uuid', 'currency_code', 'date', 'date'],
  'Finance roles read canonical decimal owner periods and source lineage through a checked boundary'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', actor_id, 'authenticated',
  'authenticated', label || '@owner-rollforward.test',
  extensions.crypt('owner-rollforward', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM (
  VALUES
    ('e5500000-0000-4000-8000-000000000010'::uuid, 'opening-submitter'),
    ('e5500000-0000-4000-8000-000000000011'::uuid, 'finance-reviewer'),
    ('e5500000-0000-4000-8000-000000000012'::uuid, 'super-reviewer')
) AS actors(actor_id, label);

INSERT INTO public.organizations (id, name, slug)
VALUES (
  'e5500000-0000-4000-8000-000000000001',
  'Owner roll-forward test',
  'owner-rollforward-test'
);

INSERT INTO public.properties (id, organization_id, name, code, property_type)
VALUES (
  'e5500000-0000-4000-8000-000000000002',
  'e5500000-0000-4000-8000-000000000001',
  'Owner roll-forward property', 'ORF-1', 'Apartment'
);

INSERT INTO public.people (id, organization_id, display_name)
VALUES (
  'e5500000-0000-4000-8000-000000000003',
  'e5500000-0000-4000-8000-000000000001',
  'Roll-forward owner'
);

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES (
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000003',
  'owner', 'active'
);

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
)
VALUES (
  'e5500000-0000-4000-8000-000000000004',
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000002',
  'e5500000-0000-4000-8000-000000000003',
  100.000, '2026-01-01'
);

INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES
  (
    'e5500000-0000-4000-8000-000000000001',
    'e5500000-0000-4000-8000-000000000010',
    'finance_member'
  ),
  (
    'e5500000-0000-4000-8000-000000000001',
    'e5500000-0000-4000-8000-000000000011',
    'finance_manager'
  ),
  (
    'e5500000-0000-4000-8000-000000000001',
    'e5500000-0000-4000-8000-000000000012',
    'super_admin'
  );

WITH roster AS (
  SELECT *
  FROM app_private.validate_owner_roster_on_date(
    'e5500000-0000-4000-8000-000000000001',
    'e5500000-0000-4000-8000-000000000002',
    '2026-08-01'
  )
), opening_values AS (
  SELECT *
  FROM (
    VALUES
      (
        'e5500000-0000-4000-8000-000000000101'::uuid,
        'ips_held_owner_cash'::public.owner_balance_component,
        100.00::numeric
      ),
      (
        'e5500000-0000-4000-8000-000000000102'::uuid,
        'owner_due_to_ips'::public.owner_balance_component,
        20.00::numeric
      ),
      (
        'e5500000-0000-4000-8000-000000000103'::uuid,
        'ips_due_to_owner'::public.owner_balance_component,
        5.00::numeric
      ),
      (
        'e5500000-0000-4000-8000-000000000104'::uuid,
        'security_deposit_custody'::public.owner_balance_component,
        50.00::numeric
      )
  ) AS values_by_component(request_id, component, proposed_amount)
)
INSERT INTO public.owner_opening_balance_requests (
  id,
  organization_id,
  property_id,
  owner_person_id,
  property_owner_id,
  ownership_percent_snapshot,
  ownership_roster_hash,
  currency,
  effective_date,
  component,
  request_kind,
  proposed_amount,
  status,
  reason,
  source_reference,
  evidence_sha256,
  payload_hash,
  submitted_by,
  reviewed_at,
  reviewed_by,
  review_reason
)
SELECT
  opening_values.request_id,
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000002',
  roster.owner_person_id,
  roster.property_owner_id,
  roster.ownership_percent,
  roster.ownership_roster_hash,
  'USD',
  '2026-08-01',
  opening_values.component,
  'initial',
  opening_values.proposed_amount,
  'submitted',
  'Literal roll-forward opening',
  'Track 3 roll-forward test oracle',
  repeat('1', 64),
  repeat('2', 64),
  'e5500000-0000-4000-8000-000000000010',
  NULL::timestamptz,
  NULL::uuid,
  NULL::text
FROM opening_values
CROSS JOIN roster;

SELECT set_config(
  'app.owner_opening_request_review_context',
  'checked-review-v1',
  true
);

UPDATE public.owner_opening_balance_requests
SET
  status = 'approved',
  reviewed_at = now(),
  reviewed_by = 'e5500000-0000-4000-8000-000000000011',
  review_reason = 'Independent test approval'
WHERE organization_id = 'e5500000-0000-4000-8000-000000000001';

INSERT INTO public.owner_opening_balance_entries (
  request_id,
  organization_id,
  property_id,
  owner_person_id,
  property_owner_id,
  ownership_percent_snapshot,
  ownership_roster_hash,
  currency,
  effective_date,
  component,
  entry_kind,
  signed_amount,
  created_by
)
SELECT
  request.id,
  request.organization_id,
  request.property_id,
  request.owner_person_id,
  request.property_owner_id,
  request.ownership_percent_snapshot,
  request.ownership_roster_hash,
  request.currency,
  request.effective_date,
  request.component,
  'opening',
  request.proposed_amount,
  request.reviewed_by
FROM public.owner_opening_balance_requests AS request
WHERE request.organization_id = 'e5500000-0000-4000-8000-000000000001';

SELECT set_config(
  'request.jwt.claim.sub',
  'e5500000-0000-4000-8000-000000000011',
  true
);
SET LOCAL ROLE authenticated;

SELECT public.record_owner_cash_event(
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000002',
  'e5500000-0000-4000-8000-000000000003',
  'USD', 'owner_contribution', '2026-08-10', 25.00,
  'August owner contribution', 'rollforward-aug-contribution-0001'
);

SELECT public.record_owner_cash_event(
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000002',
  'e5500000-0000-4000-8000-000000000003',
  'USD', 'owner_reimbursement', '2026-08-12', 2.00,
  'August owner reimbursement', 'rollforward-aug-reimburse-0001'
);

SELECT public.record_owner_cash_event(
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000002',
  'e5500000-0000-4000-8000-000000000003',
  'USD', 'owner_contribution', '2026-09-05', 5.00,
  'September owner contribution', 'rollforward-sep-contribution-0001'
);

CREATE OR REPLACE FUNCTION pg_temp.generate_period_probe(
  p_month_start date,
  p_idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.generate_owner_balance_period(
    'e5500000-0000-4000-8000-000000000001',
    'e5500000-0000-4000-8000-000000000002',
    'e5500000-0000-4000-8000-000000000003',
    'USD', p_month_start, p_idempotency_key
  );
  RETURN v_result->>'status';
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

SELECT is(
  pg_temp.generate_period_probe('2026-08-01', 'rollforward-generate-aug-0001'),
  'ready',
  'first authoritative month consumes all four approved openings'
);

SELECT results_eq(
  $$
    SELECT
      component::text,
      to_char(opening_amount, 'FM999999999990.00'),
      to_char(movement_amount, 'FM999999999990.00'),
      to_char(closing_amount, 'FM999999999990.00')
    FROM public.owner_balance_period_components
    WHERE owner_balance_period_id = (
      SELECT id FROM public.owner_balance_periods WHERE month_start = '2026-08-01'
    )
    ORDER BY component::text
  $$,
  $$
    VALUES
      ('ips_due_to_owner', '5.00', '-2.00', '3.00'),
      ('ips_held_owner_cash', '100.00', '25.00', '125.00'),
      ('owner_due_to_ips', '20.00', '0.00', '20.00'),
      ('security_deposit_custody', '50.00', '0.00', '50.00')
  $$,
  'August four-component arithmetic matches literal hand-calculated oracles'
);

SELECT is(
  pg_temp.generate_period_probe('2026-09-01', 'rollforward-generate-sep-0001'),
  'ready',
  'second authoritative month consumes the immediately prior closing values'
);

SELECT results_eq(
  $$
    SELECT
      component::text,
      to_char(opening_amount, 'FM999999999990.00'),
      to_char(movement_amount, 'FM999999999990.00'),
      to_char(closing_amount, 'FM999999999990.00')
    FROM public.owner_balance_period_components
    WHERE owner_balance_period_id = (
      SELECT id FROM public.owner_balance_periods WHERE month_start = '2026-09-01'
    )
    ORDER BY component::text
  $$,
  $$
    VALUES
      ('ips_due_to_owner', '3.00', '0.00', '3.00'),
      ('ips_held_owner_cash', '125.00', '5.00', '130.00'),
      ('owner_due_to_ips', '20.00', '0.00', '20.00'),
      ('security_deposit_custody', '50.00', '0.00', '50.00')
  $$,
  'September opening equals August closing for all four exact components'
);

SELECT is(
  pg_temp.generate_period_probe('2026-09-01', 'rollforward-generate-sep-0001'),
  'ready',
  'same-input generation is a stable idempotent replay'
);

SELECT is(
  (SELECT count(*) FROM public.owner_balance_period_components),
  8::bigint,
  'idempotent replay preserves exactly four rows for each ready period'
);

SELECT public.record_owner_cash_event(
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000002',
  'e5500000-0000-4000-8000-000000000003',
  'USD', 'owner_contribution', '2026-08-25', 1.00,
  'Late August owner contribution', 'rollforward-aug-contribution-late-0001'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.owner_balance_periods
    WHERE status = 'stale'
  ),
  2::bigint,
  'a late earlier-month source marks that period and every dependent month stale'
);

SELECT is(
  pg_temp.generate_period_probe('2026-08-01', 'rollforward-regenerate-aug-0001'),
  'ready',
  'stale first period recomputes deterministically from its persisted inputs'
);

SELECT is(
  pg_temp.generate_period_probe('2026-09-01', 'rollforward-regenerate-sep-0001'),
  'ready',
  'dependent stale period recomputes from the revised prior closing'
);

SELECT is(
  (
    SELECT to_char(component.closing_amount, 'FM999999999990.00')
    FROM public.owner_balance_period_components AS component
    JOIN public.owner_balance_periods AS period
      ON period.id = component.owner_balance_period_id
    WHERE period.month_start = '2026-09-01'
      AND component.component = 'ips_held_owner_cash'
  ),
  '131.00',
  'recomputed September closing includes revised August continuity exactly once'
);

CREATE OR REPLACE FUNCTION pg_temp.ledger_probe()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result text;
BEGIN
  SELECT pg_catalog.string_agg(
    ledger.month_start::text || ':' || ledger.closing_amount,
    ',' ORDER BY ledger.month_start
  )
  INTO v_result
  FROM public.get_owner_balance_ledger(
    'e5500000-0000-4000-8000-000000000001',
    'e5500000-0000-4000-8000-000000000002',
    'e5500000-0000-4000-8000-000000000003',
    'USD', '2026-08-01', '2026-09-01'
  ) AS ledger
  WHERE ledger.component = 'ips_held_owner_cash';
  RETURN coalesce(v_result, 'missing');
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLSTATE || ':' || SQLERRM;
END;
$$;

SELECT is(
  pg_temp.ledger_probe(),
  '2026-08-01:126.00,2026-09-01:131.00',
  'checked ledger exposes canonical decimal strings across both authoritative months'
);

RESET ROLE;

CREATE TEMP TABLE owner_opening_correction_state (
  request_id uuid NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT ON owner_opening_correction_state TO authenticated;

SELECT set_config(
  'request.jwt.claim.sub',
  'e5500000-0000-4000-8000-000000000010',
  true
);
SET LOCAL ROLE authenticated;

INSERT INTO owner_opening_correction_state (request_id)
SELECT (
  public.submit_owner_opening_balance_correction(
    'e5500000-0000-4000-8000-000000000001',
    (
      SELECT entry.id
      FROM public.owner_opening_balance_entries AS entry
      WHERE entry.organization_id = 'e5500000-0000-4000-8000-000000000001'
        AND entry.component = 'ips_held_owner_cash'
        AND entry.entry_kind = 'opening'
    ),
    110.00,
    'Correct opening cash source',
    'Track 3 opening correction stale oracle',
    NULL,
    repeat('5', 64),
    NULL,
    'rollforward-opening-correction-submit-0001'
  )->>'request_id'
)::uuid;

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'e5500000-0000-4000-8000-000000000012',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    public.review_owner_opening_balance(
      'e5500000-0000-4000-8000-000000000001',
      (SELECT request_id FROM owner_opening_correction_state),
      'approve',
      'Independent opening correction approval',
      'rollforward-opening-correction-review-0001'
    )->>'status'
  ),
  'approved',
  'an approved opening correction appends its exact reversal and replacement'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.owner_balance_periods AS period
    WHERE period.organization_id = 'e5500000-0000-4000-8000-000000000001'
      AND period.property_id = 'e5500000-0000-4000-8000-000000000002'
      AND period.owner_person_id = 'e5500000-0000-4000-8000-000000000003'
      AND period.currency = 'USD'
      AND period.month_start >= '2026-08-01'
      AND period.status = 'stale'
      AND period.stale_reason = 'opening_authority_changed'
  ),
  2::bigint,
  'an approved opening correction marks its period and every dependent month stale'
);

RESET ROLE;

UPDATE public.property_owners
SET ended_on = '2026-10-01'
WHERE id = 'e5500000-0000-4000-8000-000000000004';

INSERT INTO public.people (id, organization_id, display_name)
VALUES (
  'e5500000-0000-4000-8000-000000000005',
  'e5500000-0000-4000-8000-000000000001',
  'Successor owner'
);

INSERT INTO public.person_roles (organization_id, person_id, role, status)
VALUES (
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000005',
  'owner', 'active'
);

INSERT INTO public.property_owners (
  id, organization_id, property_id, person_id, ownership_percent, started_on
)
VALUES (
  'e5500000-0000-4000-8000-000000000006',
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000002',
  'e5500000-0000-4000-8000-000000000005',
  100.000, '2026-10-01'
);

WITH roster AS (
  SELECT *
  FROM app_private.validate_owner_roster_on_date(
    'e5500000-0000-4000-8000-000000000001',
    'e5500000-0000-4000-8000-000000000002',
    '2026-10-01'
  )
), opening_values AS (
  SELECT *
  FROM (
    VALUES
      (
        'e5500000-0000-4000-8000-000000000201'::uuid,
        'ips_held_owner_cash'::public.owner_balance_component
      ),
      (
        'e5500000-0000-4000-8000-000000000202'::uuid,
        'owner_due_to_ips'::public.owner_balance_component
      ),
      (
        'e5500000-0000-4000-8000-000000000203'::uuid,
        'ips_due_to_owner'::public.owner_balance_component
      ),
      (
        'e5500000-0000-4000-8000-000000000204'::uuid,
        'security_deposit_custody'::public.owner_balance_component
      )
  ) AS values_by_component(request_id, component)
)
INSERT INTO public.owner_opening_balance_requests (
  id,
  organization_id,
  property_id,
  owner_person_id,
  property_owner_id,
  ownership_percent_snapshot,
  ownership_roster_hash,
  currency,
  effective_date,
  component,
  request_kind,
  proposed_amount,
  status,
  reason,
  source_reference,
  evidence_sha256,
  payload_hash,
  submitted_by
)
SELECT
  opening_values.request_id,
  'e5500000-0000-4000-8000-000000000001',
  'e5500000-0000-4000-8000-000000000002',
  roster.owner_person_id,
  roster.property_owner_id,
  roster.ownership_percent,
  roster.ownership_roster_hash,
  'USD',
  '2026-10-01',
  opening_values.component,
  'initial',
  0.00,
  'submitted',
  'Literal successor opening authority',
  'Track 3 transfer remediation oracle',
  repeat('3', 64),
  repeat('4', 64),
  'e5500000-0000-4000-8000-000000000010'
FROM opening_values
CROSS JOIN roster;

SELECT set_config(
  'app.owner_opening_request_review_context',
  'checked-review-v1',
  true
);

UPDATE public.owner_opening_balance_requests
SET
  status = 'approved',
  reviewed_at = now(),
  reviewed_by = 'e5500000-0000-4000-8000-000000000011',
  review_reason = 'Independent successor opening approval'
WHERE organization_id = 'e5500000-0000-4000-8000-000000000001'
  AND owner_person_id = 'e5500000-0000-4000-8000-000000000005';

INSERT INTO public.owner_opening_balance_entries (
  request_id,
  organization_id,
  property_id,
  owner_person_id,
  property_owner_id,
  ownership_percent_snapshot,
  ownership_roster_hash,
  currency,
  effective_date,
  component,
  entry_kind,
  signed_amount,
  created_by
)
SELECT
  request.id,
  request.organization_id,
  request.property_id,
  request.owner_person_id,
  request.property_owner_id,
  request.ownership_percent_snapshot,
  request.ownership_roster_hash,
  request.currency,
  request.effective_date,
  request.component,
  'opening',
  request.proposed_amount,
  request.reviewed_by
FROM public.owner_opening_balance_requests AS request
WHERE request.organization_id = 'e5500000-0000-4000-8000-000000000001'
  AND request.owner_person_id = 'e5500000-0000-4000-8000-000000000005';

SELECT set_config(
  'request.jwt.claim.sub',
  'e5500000-0000-4000-8000-000000000011',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    public.generate_owner_balance_period(
      'e5500000-0000-4000-8000-000000000001',
      'e5500000-0000-4000-8000-000000000002',
      'e5500000-0000-4000-8000-000000000005',
      'USD', '2026-10-01', 'rollforward-successor-oct-0001'
    )->>'status'
  ),
  'blocked',
  'a successor owner with unsettled predecessor balances remains blocked'
);

SELECT results_eq(
  $$
    SELECT
      blocked_reason_code,
      blocked_reason_detail->>'previous_owner_person_id',
      blocked_reason_detail->>'ownership_started_on',
      blocked_reason_detail->>'unsettled_component_count'
    FROM public.owner_balance_periods
    WHERE organization_id = 'e5500000-0000-4000-8000-000000000001'
      AND property_id = 'e5500000-0000-4000-8000-000000000002'
      AND owner_person_id = 'e5500000-0000-4000-8000-000000000005'
      AND month_start = '2026-10-01'
  $$,
  $$
    VALUES (
      'unresolved_transfer'::text,
      'e5500000-0000-4000-8000-000000000003'::text,
      '2026-10-01'::text,
      '4'::text
    )
  $$,
  'absent explicit transfer instructions expose exact typed successor remediation'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.owner_component_movements
    WHERE owner_person_id = 'e5500000-0000-4000-8000-000000000005'
  ),
  0::bigint,
  'ownership change never invents component movements for the successor'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.owner_balance_period_components AS component
    JOIN public.owner_balance_periods AS period
      ON period.organization_id = component.organization_id
      AND period.id = component.owner_balance_period_id
    WHERE period.organization_id = 'e5500000-0000-4000-8000-000000000001'
      AND period.property_id = 'e5500000-0000-4000-8000-000000000002'
      AND period.owner_person_id = 'e5500000-0000-4000-8000-000000000005'
      AND period.month_start = '2026-10-01'
  ),
  0::bigint,
  'an unresolved transfer leaves no authoritative successor components'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
