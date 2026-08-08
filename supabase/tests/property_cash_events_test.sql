BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT no_plan();

CREATE TEMP TABLE property_cash_test_state (
  organization_id uuid NOT NULL DEFAULT 'c1000000-0000-0000-0000-000000000001',
  cross_organization_id uuid NOT NULL DEFAULT 'c1000000-0000-0000-0000-000000000002',
  property_id uuid NOT NULL DEFAULT 'c2000000-0000-0000-0000-000000000001',
  cross_property_id uuid NOT NULL DEFAULT 'c2000000-0000-0000-0000-000000000002',
  owner_id uuid NOT NULL DEFAULT 'c3000000-0000-0000-0000-000000000001',
  operations_person_id uuid NOT NULL DEFAULT 'c3000000-0000-0000-0000-000000000002',
  super_admin_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000001',
  finance_manager_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000002',
  finance_member_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000003',
  operations_manager_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000004',
  cross_admin_id uuid NOT NULL DEFAULT 'c4000000-0000-0000-0000-000000000005',
  owner_invoice_id uuid NOT NULL DEFAULT 'c5000000-0000-0000-0000-000000000001',
  owner_payment_id uuid NOT NULL DEFAULT 'c6000000-0000-0000-0000-000000000001',
  ledger_entry_id uuid
) ON COMMIT DROP;

INSERT INTO property_cash_test_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON property_cash_test_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000', actor_id, 'authenticated',
  'authenticated', label || '@property-cash.test',
  extensions.crypt('property-cash-test', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '', '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM (
  SELECT super_admin_id AS actor_id, 'super-admin' AS label
  FROM property_cash_test_state
  UNION ALL SELECT finance_manager_id, 'finance-manager'
  FROM property_cash_test_state
  UNION ALL SELECT finance_member_id, 'finance-member'
  FROM property_cash_test_state
  UNION ALL SELECT operations_manager_id, 'operations-manager'
  FROM property_cash_test_state
  UNION ALL SELECT cross_admin_id, 'cross-admin'
  FROM property_cash_test_state
) AS actors;

INSERT INTO public.organizations (id, name, slug)
SELECT organization_id, 'Property cash organization', 'property-cash'
FROM property_cash_test_state
UNION ALL
SELECT cross_organization_id, 'Cross property cash organization', 'cross-property-cash'
FROM property_cash_test_state;

INSERT INTO public.organization_branches (organization_id, name, code)
SELECT organization_id, 'Operations', 'OPS'
FROM property_cash_test_state;

INSERT INTO public.people (id, organization_id, display_name, party_type)
SELECT owner_id, organization_id, 'Property Cash Owner', 'individual'
FROM property_cash_test_state
UNION ALL
SELECT operations_person_id, organization_id, 'Operations Manager', 'individual'
FROM property_cash_test_state;

INSERT INTO public.person_roles (organization_id, person_id, role, status)
SELECT organization_id, owner_id, 'owner', 'active'
FROM property_cash_test_state
UNION ALL
SELECT organization_id, operations_person_id, 'staff', 'active'
FROM property_cash_test_state;

INSERT INTO public.organization_members (
  organization_id, user_id, role, person_id, branch_id
)
SELECT organization_id, super_admin_id, 'super_admin', NULL::uuid, NULL::uuid
FROM property_cash_test_state
UNION ALL
SELECT organization_id, finance_manager_id, 'finance_manager', NULL::uuid, NULL::uuid
FROM property_cash_test_state
UNION ALL
SELECT organization_id, finance_member_id, 'finance_member', NULL::uuid, NULL::uuid
FROM property_cash_test_state
UNION ALL
SELECT
  state.organization_id,
  state.operations_manager_id,
  'operations_manager',
  state.operations_person_id,
  branch.id
FROM property_cash_test_state AS state
JOIN public.organization_branches AS branch
  ON branch.organization_id = state.organization_id
UNION ALL
SELECT cross_organization_id, cross_admin_id, 'super_admin', NULL::uuid, NULL::uuid
FROM property_cash_test_state;

INSERT INTO public.properties (
  id, organization_id, name, code, property_type, status
)
SELECT property_id, organization_id, 'Property Cash', 'PC-001', 'apartment', 'active'
FROM property_cash_test_state
UNION ALL
SELECT cross_property_id, cross_organization_id, 'Cross Property Cash', 'PC-002', 'apartment', 'active'
FROM property_cash_test_state;

INSERT INTO public.owner_invoices (
  id, organization_id, property_id, owner_person_id, invoice_number,
  billing_period_start, issue_date, due_date, currency, created_by
)
SELECT
  owner_invoice_id, organization_id, property_id, owner_id, 'OWN-PC-001',
  '2026-08-01', '2026-08-01', '2026-08-15', 'USD', super_admin_id
FROM property_cash_test_state;

INSERT INTO public.owner_payments (
  id, organization_id, owner_invoice_id, property_id, owner_person_id,
  payment_number, received_date, amount, currency, reference,
  idempotency_key, created_by
)
SELECT
  owner_payment_id, organization_id, owner_invoice_id, property_id, owner_id,
  'PAY-PC-001', '2026-08-08', 250, 'USD', 'Owner funding',
  'property-cash-test', super_admin_id
FROM property_cash_test_state;

UPDATE property_cash_test_state
SET ledger_entry_id = app_private.create_operational_ledger_event(
  organization_id,
  property_id,
  NULL,
  '2026-08-08',
  'income',
  'owner_contribution',
  250,
  'USD',
  'Owner payment PAY-PC-001',
  'owner_cash_event',
  owner_payment_id,
  super_admin_id,
  NULL
);

UPDATE public.owner_payments AS payment
SET ledger_entry_id = state.ledger_entry_id
FROM property_cash_test_state AS state
WHERE payment.organization_id = state.organization_id
  AND payment.id = state.owner_payment_id;

SELECT has_function(
  'public',
  'get_property_cash_events_page',
  ARRAY[
    'uuid', 'uuid', 'currency_code', 'date', 'date', 'date', 'text', 'uuid',
    'integer'
  ],
  'one canonical operational cash-event page exists'
);

SELECT has_function(
  'app_private',
  'get_property_cash_events_page',
  ARRAY[
    'uuid', 'uuid', 'currency_code', 'date', 'date', 'date', 'text', 'uuid',
    'integer'
  ],
  'cash-event union is isolated behind a private reader'
);

SELECT ok(
  (
    SELECT routine.prosecdef
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname = 'get_property_cash_events_page'
  ),
  'public cash-event reader is a checked definer boundary'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_property_cash_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.get_property_cash_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.get_property_cash_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  ),
  'only authenticated callers can reach the checked cash-event reader'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'app_private.get_property_cash_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)',
    'EXECUTE'
  ),
  'authenticated callers cannot bypass the checked reader'
);

SELECT ok(
  pg_get_function_result(
    'public.get_property_cash_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)'::regprocedure
  ) NOT ILIKE '%journal%'
  AND pg_get_function_result(
    'public.get_property_cash_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)'::regprocedure
  ) NOT ILIKE '%legacy%'
  AND pg_get_function_result(
    'public.get_property_cash_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)'::regprocedure
  ) NOT ILIKE '%compatibility%'
  AND pg_get_function_result(
    'public.get_property_cash_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)'::regprocedure
  ) ILIKE '%resolution_state%'
  AND pg_get_function_result(
    'public.get_property_cash_events_page(uuid,uuid,currency_code,date,date,date,text,uuid,integer)'::regprocedure
  ) ILIKE '%ledger_entry_id%',
  'the public contract exposes operational evidence without accounting compatibility fields'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_manager_id::text FROM property_cash_test_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_test_state),
    (SELECT property_id FROM property_cash_test_state),
    'USD', '2026-08-01', '2026-08-31'
  ),
  'Finance Manager can read canonical property cash events'
);

SELECT is(
  (
    SELECT concat_ws(
      '|', contract_version, source_type, amount::text,
      owner_cash_effect::text, operating_cash_effect::text, resolution_state
    )
    FROM public.get_property_cash_events_page(
      (SELECT organization_id FROM property_cash_test_state),
      (SELECT property_id FROM property_cash_test_state),
      'USD', '2026-08-01', '2026-08-31', NULL, NULL, NULL, 10
    )
  ),
  'property_cash_events.v1|owner_payment|250.00|250.00|0|resolved',
  'owner funding is one resolved source-owned operational movement'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT finance_member_id::text FROM property_cash_test_state),
  true
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.get_property_cash_events_page(
      (SELECT organization_id FROM property_cash_test_state),
      (SELECT property_id FROM property_cash_test_state),
      'USD', '2026-08-01', '2026-08-31', NULL, NULL, NULL, 10
    )
  ),
  1,
  'Finance Member reads the same canonical event set'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT super_admin_id::text FROM property_cash_test_state),
  true
);

SELECT lives_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_test_state),
    (SELECT property_id FROM property_cash_test_state),
    'USD', '2026-08-01', '2026-08-31'
  ),
  'Super Admin can read canonical property cash events'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_page(%L,%L,%L,%L,%L,%L,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_test_state),
    (SELECT property_id FROM property_cash_test_state),
    'USD', '2026-08-01', '2026-08-31', '2026-08-08'
  ),
  '22023',
  'Complete bounded cash-event scope is required',
  'partial cursors are rejected'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,1001)',
    (SELECT organization_id FROM property_cash_test_state),
    (SELECT property_id FROM property_cash_test_state),
    'USD', '2026-08-01', '2026-08-31'
  ),
  '22023',
  'Complete bounded cash-event scope is required',
  'cash-event pages are bounded'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT operations_manager_id::text FROM property_cash_test_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_test_state),
    (SELECT property_id FROM property_cash_test_state),
    'USD', '2026-08-01', '2026-08-31'
  ),
  '42501', 'Not authorized',
  'Operations Manager cannot read Finance cash events'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM property_cash_test_state),
  true
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.get_property_cash_events_page(%L,%L,%L,%L,%L,NULL,NULL,NULL,10)',
    (SELECT organization_id FROM property_cash_test_state),
    (SELECT property_id FROM property_cash_test_state),
    'USD', '2026-08-01', '2026-08-31'
  ),
  '42501', 'Not authorized',
  'cross-organization Super Admin cannot read another organization'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
