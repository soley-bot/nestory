BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(17);

CREATE TEMP TABLE financial_month_lock_test_state (
  super_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  finance_manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid()
) ON COMMIT DROP;

INSERT INTO financial_month_lock_test_state DEFAULT VALUES;

GRANT SELECT ON financial_month_lock_test_state TO authenticated;

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
  label || '-' || left(actor_id::text, 8) || '@example.test',
  extensions.crypt('financial-month-lock-test', extensions.gen_salt('bf')),
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
  SELECT super_admin_id AS actor_id, 'month-lock-admin' AS label
  FROM financial_month_lock_test_state
  UNION ALL
  SELECT finance_manager_id, 'month-lock-finance-manager'
  FROM financial_month_lock_test_state
) AS actors;

INSERT INTO public.organizations (id, name, slug)
SELECT
  organization_id,
  'Financial month lock organization',
  'financial-month-lock-' || left(organization_id::text, 8)
FROM financial_month_lock_test_state
UNION ALL
SELECT
  cross_organization_id,
  'Financial month lock cross organization',
  'financial-month-lock-cross-' || left(cross_organization_id::text, 8)
FROM financial_month_lock_test_state;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT organization_id, super_admin_id, 'super_admin'
FROM financial_month_lock_test_state
UNION ALL
SELECT organization_id, finance_manager_id, 'finance_manager'
FROM financial_month_lock_test_state;

SELECT has_table(
  'public',
  'financial_month_locks',
  'financial month locks have one product table'
);

SELECT ok(
  COALESCE(
    (
      SELECT relation.relrowsecurity
      FROM pg_class AS relation
      WHERE relation.oid = to_regclass('public.financial_month_locks')
    ),
    false
  ),
  'financial month locks enforce RLS'
);

SELECT has_function(
  'public',
  'set_financial_month_lock',
  ARRAY['uuid', 'date', 'boolean', 'text'],
  'checked financial month transition exists'
);

SELECT has_function(
  'app_private',
  'lock_open_financial_month',
  ARRAY['uuid', 'date'],
  'private financial write guard exists'
);

SELECT function_privs_are(
  'public',
  'set_financial_month_lock',
  ARRAY['uuid', 'date', 'boolean', 'text'],
  'anon',
  ARRAY[]::text[],
  'anonymous actors cannot transition financial months'
);

SELECT function_privs_are(
  'public',
  'set_financial_month_lock',
  ARRAY['uuid', 'date', 'boolean', 'text'],
  'authenticated',
  ARRAY['EXECUTE'],
  'authenticated actors can reach the checked transition'
);

SELECT function_privs_are(
  'public',
  'set_financial_month_lock',
  ARRAY['uuid', 'date', 'boolean', 'text'],
  'service_role',
  ARRAY[]::text[],
  'service role cannot bypass the checked transition'
);

SELECT table_privs_are(
  'public',
  'financial_month_locks',
  'authenticated',
  ARRAY['SELECT'],
  'authenticated actors have read-only table access'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM financial_month_lock_test_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.set_financial_month_lock(%L,%L,true,%L)',
    (SELECT organization_id FROM financial_month_lock_test_state),
    '2026-08-22',
    'Freeze August operational changes'
  ),
  'Super Admin can lock an operational month'
);

RESET ROLE;

SELECT is(
  pg_temp.read_optional_scalar(
    format(
      'SELECT month_start::text FROM public.financial_month_locks WHERE organization_id = %L',
      (SELECT organization_id FROM financial_month_lock_test_state)
    )
  ),
  '2026-08-01'::text,
  'month identity is normalized to the first day'
);

SELECT throws_ok(
  format(
    'SELECT app_private.lock_open_financial_month(%L,%L)',
    (SELECT organization_id FROM financial_month_lock_test_state),
    '2026-08-31'
  ),
  '22023',
  'Financial month is locked',
  'the private write guard rejects a locked month'
);

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT public.set_financial_month_lock(%L,%L,false,%L)',
    (SELECT organization_id FROM financial_month_lock_test_state),
    '2026-08-01',
    'Corrections approved'
  ),
  'Super Admin can unlock an operational month'
);

RESET ROLE;

SELECT is(
  pg_temp.read_optional_scalar(
    format(
      'SELECT is_locked::text FROM public.financial_month_locks WHERE organization_id = %L AND month_start = %L',
      (SELECT organization_id FROM financial_month_lock_test_state),
      '2026-08-01'
    )
  ),
  'false'::text,
  'unlock retains one audited row in the unlocked state'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM financial_month_lock_test_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.set_financial_month_lock(%L,%L,true,%L)',
    (SELECT organization_id FROM financial_month_lock_test_state),
    '2026-09-01',
    'Finance cannot lock'
  ),
  '42501',
  'Not authorized',
  'Finance Manager cannot transition a month'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM financial_month_lock_test_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT public.set_financial_month_lock(%L,%L,true,%L)',
    (SELECT cross_organization_id FROM financial_month_lock_test_state),
    '2026-09-01',
    'Cross organization attempt'
  ),
  '42501',
  'Not authorized',
  'Super Admin cannot transition another organization'
);

SELECT throws_ok(
  format(
    'SELECT public.set_financial_month_lock(%L,%L,true,%L)',
    (SELECT organization_id FROM financial_month_lock_test_state),
    '2026-09-01',
    repeat('x', 401)
  ),
  '22023',
  'Reason is too long',
  'financial month reason is bounded'
);

RESET ROLE;

SELECT is(
  pg_temp.read_optional_scalar(
    format(
      'SELECT count(*)::text FROM public.activity_logs WHERE organization_id = %L AND entity_type = %L AND action = %L AND new_values ->> %L = %L AND new_values ->> %L = %L',
      (SELECT organization_id FROM financial_month_lock_test_state),
      'financial_month',
      'unlocked',
      'month_start',
      '2026-08-01',
      'reason',
      'Corrections approved'
    )
  ),
  '1'::text,
  'month transition activity retains the operator action and reason'
);

SELECT * FROM finish();

ROLLBACK;
