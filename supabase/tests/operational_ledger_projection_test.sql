BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(11);

CREATE TEMP TABLE operational_ledger_test_state (
  actor_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL DEFAULT gen_random_uuid(),
  reversal_source_id uuid NOT NULL DEFAULT gen_random_uuid(),
  locked_source_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO operational_ledger_test_state DEFAULT VALUES;

CREATE FUNCTION pg_temp.read_optional_scalar(p_query text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_result text;
BEGIN
  EXECUTE p_query INTO v_result;
  RETURN v_result;
EXCEPTION
  WHEN undefined_table OR undefined_column THEN
    RETURN NULL;
END;
$$;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  actor_id,
  'authenticated',
  'authenticated',
  'operational-ledger-' || left(actor_id::text, 8) || '@example.test',
  extensions.crypt('operational-ledger-test', extensions.gen_salt('bf')),
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
FROM operational_ledger_test_state;

INSERT INTO public.organizations (id, name, slug)
SELECT
  organization_id,
  'Operational Ledger organization',
  'operational-ledger-' || left(organization_id::text, 8)
FROM operational_ledger_test_state;

INSERT INTO public.properties (
  id,
  organization_id,
  name,
  code,
  property_type,
  status
)
SELECT
  property_id,
  organization_id,
  'Operational Ledger property',
  'OL-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM operational_ledger_test_state;

INSERT INTO public.units (
  id,
  organization_id,
  property_id,
  unit_number,
  status,
  current_rent_amount,
  current_rent_currency
)
SELECT
  unit_id,
  organization_id,
  property_id,
  'OL-01',
  'occupied',
  1000,
  'USD'
FROM operational_ledger_test_state;

SELECT has_function(
  'app_private',
  'create_operational_ledger_event',
  ARRAY[
    'uuid',
    'uuid',
    'uuid',
    'date',
    'text',
    'text',
    'numeric',
    'currency_code',
    'text',
    'text',
    'uuid',
    'uuid',
    'uuid'
  ],
  'one private operational Ledger projection helper exists'
);

SELECT has_column(
  'public',
  'ledger_entries',
  'reversal_of_ledger_entry_id',
  'Ledger reversals link to the original event'
);

SELECT lives_ok(
  format(
    $sql$
      SELECT app_private.create_operational_ledger_event(
        %L, %L, %L, '2026-08-08', 'income', 'Rent', 100, 'USD',
        'August rent received', 'receipt_allocation', %L, %L, NULL
      )
    $sql$,
    (SELECT organization_id FROM operational_ledger_test_state),
    (SELECT property_id FROM operational_ledger_test_state),
    (SELECT unit_id FROM operational_ledger_test_state),
    (SELECT source_id FROM operational_ledger_test_state),
    (SELECT actor_id FROM operational_ledger_test_state)
  ),
  'a checked source creates one operational Ledger event'
);

SELECT is(
  pg_temp.read_optional_scalar(
    format(
      $sql$
        SELECT concat_ws('|', direction, category, amount, currency, source_type)
        FROM public.ledger_entries
        WHERE organization_id = %L AND source_id = %L
      $sql$,
      (SELECT organization_id FROM operational_ledger_test_state),
      (SELECT source_id FROM operational_ledger_test_state)
    )
  ),
  'income|Rent|100.00|USD|receipt_allocation'::text,
  'the event preserves exact operational identity and money'
);

SELECT lives_ok(
  format(
    $sql$
      SELECT app_private.create_operational_ledger_event(
        %L, %L, %L, '2026-08-08', 'income', 'Rent', 100, 'USD',
        'August rent received', 'receipt_allocation', %L, %L, NULL
      )
    $sql$,
    (SELECT organization_id FROM operational_ledger_test_state),
    (SELECT property_id FROM operational_ledger_test_state),
    (SELECT unit_id FROM operational_ledger_test_state),
    (SELECT source_id FROM operational_ledger_test_state),
    (SELECT actor_id FROM operational_ledger_test_state)
  ),
  'an exact source replay returns the stored event'
);

SELECT is(
  pg_temp.read_optional_scalar(
    format(
      'SELECT count(*)::text FROM public.ledger_entries WHERE organization_id = %L AND source_id = %L',
      (SELECT organization_id FROM operational_ledger_test_state),
      (SELECT source_id FROM operational_ledger_test_state)
    )
  ),
  '1'::text,
  'an exact replay cannot duplicate the event'
);

SELECT throws_ok(
  format(
    $sql$
      SELECT app_private.create_operational_ledger_event(
        %L, %L, %L, '2026-08-08', 'income', 'Rent', 101, 'USD',
        'August rent received', 'receipt_allocation', %L, %L, NULL
      )
    $sql$,
    (SELECT organization_id FROM operational_ledger_test_state),
    (SELECT property_id FROM operational_ledger_test_state),
    (SELECT unit_id FROM operational_ledger_test_state),
    (SELECT source_id FROM operational_ledger_test_state),
    (SELECT actor_id FROM operational_ledger_test_state)
  ),
  '23505',
  'Operational Ledger source conflicts with the existing event',
  'a changed payload cannot reuse a source identity'
);

SELECT lives_ok(
  format(
    $sql$
      SELECT app_private.create_operational_ledger_event(
        %L, %L, %L, '2026-08-09', 'income', 'Rent reversal', -100, 'USD',
        'August rent receipt reversed', 'receipt_allocation', %L, %L,
        (SELECT id FROM public.ledger_entries WHERE organization_id = %L AND source_id = %L)
      )
    $sql$,
    (SELECT organization_id FROM operational_ledger_test_state),
    (SELECT property_id FROM operational_ledger_test_state),
    (SELECT unit_id FROM operational_ledger_test_state),
    (SELECT reversal_source_id FROM operational_ledger_test_state),
    (SELECT actor_id FROM operational_ledger_test_state),
    (SELECT organization_id FROM operational_ledger_test_state),
    (SELECT source_id FROM operational_ledger_test_state)
  ),
  'a reversal appends its own signed event'
);

SELECT is(
  pg_temp.read_optional_scalar(
    format(
      $sql$
        SELECT (reversal.reversal_of_ledger_entry_id = original.id)::text
        FROM public.ledger_entries AS reversal
        JOIN public.ledger_entries AS original
          ON original.organization_id = reversal.organization_id
         AND original.source_id = %L
        WHERE reversal.organization_id = %L AND reversal.source_id = %L
      $sql$,
      (SELECT source_id FROM operational_ledger_test_state),
      (SELECT organization_id FROM operational_ledger_test_state),
      (SELECT reversal_source_id FROM operational_ledger_test_state)
    )
  ),
  'true'::text,
  'the reversal points to the exact original Ledger event'
);

SELECT throws_ok(
  format(
    'UPDATE public.ledger_entries SET amount = 99 WHERE organization_id = %L AND source_id = %L',
    (SELECT organization_id FROM operational_ledger_test_state),
    (SELECT source_id FROM operational_ledger_test_state)
  ),
  '42501',
  'Reserved financial projection must use its domain source workflow',
  'direct mutation cannot rewrite an operational event'
);

INSERT INTO public.financial_month_locks (
  organization_id,
  month_start,
  is_locked,
  reason,
  locked_at,
  locked_by
)
SELECT
  organization_id,
  '2026-09-01',
  true,
  'Projection lock test',
  now(),
  actor_id
FROM operational_ledger_test_state;

SELECT throws_ok(
  format(
    $sql$
      SELECT app_private.create_operational_ledger_event(
        %L, %L, %L, '2026-09-08', 'expense', 'Repair', 75, 'USD',
        'Locked repair expense', 'payment_allocation', %L, %L, NULL
      )
    $sql$,
    (SELECT organization_id FROM operational_ledger_test_state),
    (SELECT property_id FROM operational_ledger_test_state),
    (SELECT unit_id FROM operational_ledger_test_state),
    (SELECT locked_source_id FROM operational_ledger_test_state),
    (SELECT actor_id FROM operational_ledger_test_state)
  ),
  '55000',
  'Financial month is locked',
  'a locked month blocks event creation before mutation'
);

SELECT * FROM finish();

ROLLBACK;
