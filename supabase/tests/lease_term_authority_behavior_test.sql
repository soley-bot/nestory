BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(49);

CREATE TEMP TABLE lease_authority_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  cross_organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  second_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  incomplete_import_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  rollback_unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  incomplete_import_run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  oversized_import_run_id uuid NOT NULL DEFAULT gen_random_uuid(),
  policy_id uuid,
  past_policy_id uuid,
  term_id uuid,
  scheduled_term_id uuid,
  created_lease_id uuid
) ON COMMIT DROP;

INSERT INTO lease_authority_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON lease_authority_state
TO authenticated, service_role;

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
  extensions.crypt('lease-authority-test', extensions.gen_salt('bf')),
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
  SELECT admin_id, 'lease-authority-admin' FROM lease_authority_state
  UNION ALL
  SELECT manager_id, 'lease-authority-manager' FROM lease_authority_state
  UNION ALL
  SELECT cross_admin_id, 'lease-authority-cross-admin'
  FROM lease_authority_state
) AS users(user_id, label);

INSERT INTO public.organizations(id, name, slug)
SELECT
  organization_id,
  'Lease authority organization',
  'lease-authority-' || left(organization_id::text, 8)
FROM lease_authority_state
UNION ALL
SELECT
  cross_organization_id,
  'Lease authority cross organization',
  'lease-authority-cross-' || left(cross_organization_id::text, 8)
FROM lease_authority_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'admin'
FROM lease_authority_state
UNION ALL
SELECT organization_id, manager_id, 'manager'
FROM lease_authority_state
UNION ALL
SELECT cross_organization_id, cross_admin_id, 'admin'
FROM lease_authority_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
)
SELECT
  property_id,
  organization_id,
  'Lease authority property',
  'LEASE-AUTH-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM lease_authority_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT
  unit_id,
  organization_id,
  property_id,
  'AUTH-1',
  'occupied',
  1000,
  'USD'::public.currency_code
FROM lease_authority_state
UNION ALL
SELECT
  second_unit_id,
  organization_id,
  property_id,
  'AUTH-2',
  'vacant',
  900,
  'USD'::public.currency_code
FROM lease_authority_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT
  import_unit_id,
  organization_id,
  property_id,
  'AUTH-IMPORT-1',
  'vacant',
  950,
  'USD'::public.currency_code
FROM lease_authority_state
UNION ALL
SELECT
  incomplete_import_unit_id,
  organization_id,
  property_id,
  'AUTH-IMPORT-2',
  'vacant',
  975,
  'USD'::public.currency_code
FROM lease_authority_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT
  rollback_unit_id,
  organization_id,
  property_id,
  'AUTH-ROLLBACK',
  'vacant',
  925,
  'USD'::public.currency_code
FROM lease_authority_state;

INSERT INTO public.people(id, organization_id, display_name)
SELECT tenant_id, organization_id, 'Lease authority tenant'
FROM lease_authority_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, tenant_id, 'tenant'
FROM lease_authority_state;


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
  'Lease authority tenant',
  current_date - 30,
  current_date + 330,
  1000,
  'USD',
  500,
  'USD',
  'active'
FROM lease_authority_state;


SELECT is(
  (
    SELECT authority_kind
    FROM public.lease_terms
    WHERE lease_id = (SELECT lease_id FROM lease_authority_state)
  ),
  'legacy_inferred',
  'compatibility lease creation produces explicit legacy-inferred evidence'
);

SELECT is(
  (
    SELECT rent_due_day
    FROM public.lease_terms
    WHERE lease_id = (SELECT lease_id FROM lease_authority_state)
  ),
  NULL::integer,
  'compatibility lease creation no longer infers due day from start date'
);

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_authority_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  format(
    'SELECT readiness_status,reason_code FROM public.resolve_lease_rent_readiness(%L,%L,current_date)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state)
  ),
  $$VALUES ('legacy_unconfirmed'::text, 'legacy_unconfirmed'::text)$$,
  'legacy-inferred evidence is not rent-ready'
);

SELECT throws_ok(
  format(
    'INSERT INTO public.lease_terms (organization_id,lease_id,term_sequence,start_date,end_date,rent_amount,rent_currency,rent_due_day,payment_frequency,status,authority_kind,confirmed_at,confirmed_by) VALUES (%L,%L,99,current_date,current_date + 30,1000,%L,10,%L,%L,%L,now(),%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    'USD',
    'monthly',
    'active',
    'authoritative',
    (SELECT admin_id FROM lease_authority_state)
  ),
  '42501',
  NULL,
  'authenticated callers cannot directly insert authoritative terms'
);

SELECT lives_ok(
  format(
    'UPDATE lease_authority_state SET policy_id = public.create_rent_policy_draft(%L,current_date,%L)',
    (SELECT organization_id FROM lease_authority_state),
    'rent-policy-draft-0001'
  ),
  'admin can create a draft policy with unresolved fields'
);

SELECT throws_ok(
  format(
    'SELECT public.approve_rent_policy_version(%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT policy_id FROM lease_authority_state)
  ),
  '23514',
  'Rent policy is incomplete and cannot be approved',
  'incomplete rent policy approval fails closed'
);

SELECT lives_ok(
  format(
    'SELECT public.update_rent_policy_draft(%L,%L,ARRAY[%L]::text[],%L,%L,NULL,%L,%L,%L,%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT policy_id FROM lease_authority_state),
    'monthly',
    'Asia/Bangkok',
    'term',
    'last_calendar_day',
    'actual_days',
    'actual_days',
    'through_lease_end',
    'prorate_actual_days',
    'unsupported',
    'unsupported',
    'unsupported'
  ),
  'admin can resolve every policy rule explicitly'
);

SELECT lives_ok(
  format(
    'SELECT public.approve_rent_policy_version(%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT policy_id FROM lease_authority_state)
  ),
  'complete policy can be approved'
);

UPDATE lease_authority_state
SET past_policy_id = public.create_rent_policy_draft(
  organization_id,
  current_date - 1,
  'rent-policy-past-draft-0001'
);

SELECT public.update_rent_policy_draft(
  (SELECT organization_id FROM lease_authority_state),
  (SELECT past_policy_id FROM lease_authority_state),
  ARRAY['monthly']::text[],
  'Asia/Bangkok',
  'term',
  NULL,
  'last_calendar_day',
  'actual_days',
  'actual_days',
  'through_lease_end',
  'prorate_actual_days',
  'unsupported',
  'unsupported',
  'unsupported'
);

SELECT throws_ok(
  format(
    'SELECT public.approve_rent_policy_version(%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT past_policy_id FROM lease_authority_state)
  ),
  '22023',
  'Rent policy effective date cannot be in the past',
  'policy approval rejects an unbounded historical lock window'
);

SELECT lives_ok(
  format(
    'UPDATE lease_authority_state SET created_lease_id = public.create_lease_with_authoritative_term(%L,%L,%L,%L,current_date - 10,current_date + 355,900,%L,12,%L,%L,NULL,NULL,%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT property_id FROM lease_authority_state),
    (SELECT second_unit_id FROM lease_authority_state),
    (SELECT tenant_id FROM lease_authority_state),
    'USD',
    'monthly',
    'active',
    'active',
    'lease-with-term-create-0001'
  ),
  'checked lease creation is atomic with explicit term authority'
);

SELECT is(
  (
    SELECT authority_kind
    FROM public.lease_terms
    WHERE lease_id = (SELECT created_lease_id FROM lease_authority_state)
      AND status = 'active'
  ),
  'authoritative',
  'checked lease creation leaves one active authoritative term'
);

SELECT is(
  (
    SELECT rent_due_day
    FROM public.lease_terms
    WHERE lease_id = (SELECT created_lease_id FROM lease_authority_state)
      AND status = 'active'
  ),
  12,
  'checked lease creation preserves explicit due day'
);

SELECT results_eq(
  format(
    'SELECT readiness_status,reason_code FROM public.resolve_lease_rent_readiness(%L,%L,current_date)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT created_lease_id FROM lease_authority_state)
  ),
  $$VALUES ('ready'::text, 'ready'::text)$$,
  'checked lease creation is ready against the approved policy'
);

SELECT public.set_ledger_period_lock(
  (SELECT organization_id FROM lease_authority_state),
  date_trunc('month', current_date)::date,
  true,
  'Metadata-only lease edit proof'
);

SELECT lives_ok(
  format(
    'SELECT public.update_lease_with_authoritative_term(%L,%L,%L,%L,%L,current_date - 10,current_date + 355,900,%L,12,%L,%L,100,%L,%L,%L)',
    (SELECT created_lease_id FROM lease_authority_state),
    (SELECT organization_id FROM lease_authority_state),
    (SELECT property_id FROM lease_authority_state),
    (SELECT second_unit_id FROM lease_authority_state),
    (SELECT tenant_id FROM lease_authority_state),
    'USD',
    'monthly',
    'active',
    'USD',
    'active',
    'lease-metadata-only-update-0001'
  ),
  'metadata-only lease edits do not acquire economic-period locks'
);

SELECT public.set_ledger_period_lock(
  (SELECT organization_id FROM lease_authority_state),
  date_trunc('month', current_date)::date,
  false,
  'Metadata-only lease edit proof complete'
);

SELECT throws_ok(
  format(
    'SELECT public.update_lease_with_authoritative_term(%L,%L,%L,%L,%L,current_date - 10,current_date + 355,900,%L,12,%L,%L,100,%L,%L,%L)',
    (SELECT created_lease_id FROM lease_authority_state),
    (SELECT organization_id FROM lease_authority_state),
    (SELECT property_id FROM lease_authority_state),
    (SELECT second_unit_id FROM lease_authority_state),
    (SELECT tenant_id FROM lease_authority_state),
    'USD',
    'monthly',
    'active',
    'USD',
    'ended',
    'lease-invalid-inactive-update-0001'
  ),
  '55000',
  'Changing Lease lifecycle status requires a checked occupancy transition',
  'lease lifecycle change requires a checked occupancy transition'
);

RESET ROLE;
SELECT set_config('app.people_leases_skip_sync', 'on', true);

UPDATE public.leases
SET status = 'ended'
WHERE id = (SELECT created_lease_id FROM lease_authority_state);

SELECT set_config('app.people_leases_skip_sync', 'off', true);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  format(
    'SELECT readiness_status,reason_code FROM public.resolve_lease_rent_readiness(%L,%L,current_date)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT created_lease_id FROM lease_authority_state)
  ),
  $$VALUES ('blocked'::text, 'inactive_lease'::text)$$,
  'pre-existing inactive leases fail closed even if an active term remains'
);

RESET ROLE;
SELECT set_config('app.people_leases_skip_sync', 'on', true);

UPDATE public.leases
SET status = 'active'
WHERE id = (SELECT created_lease_id FROM lease_authority_state);

SELECT set_config('app.people_leases_skip_sync', 'off', true);
SET LOCAL ROLE authenticated;

SELECT is(
  public.create_lease_with_authoritative_term(
    (SELECT organization_id FROM lease_authority_state),
    (SELECT property_id FROM lease_authority_state),
    (SELECT second_unit_id FROM lease_authority_state),
    (SELECT tenant_id FROM lease_authority_state),
    current_date - 10,
    current_date + 355,
    900,
    'USD',
    12,
    'monthly',
    'active',
    NULL,
    NULL,
    'active',
    'lease-with-term-create-0001'
  ),
  (SELECT created_lease_id FROM lease_authority_state),
  'checked lease creation retry returns the original lease identity'
);

SELECT throws_ok(
  format(
    'SELECT public.create_lease_with_authoritative_term(%L,%L,%L,%L,current_date - 10,current_date + 355,925,%L,12,%L,%L,NULL,NULL,%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT property_id FROM lease_authority_state),
    (SELECT rollback_unit_id FROM lease_authority_state),
    (SELECT tenant_id FROM lease_authority_state),
    'USD',
    'weekly',
    'active',
    'active',
    'lease-with-term-forced-failure-0001'
  ),
  '22023',
  'Authoritative lease term inputs are incomplete or invalid',
  'forced term failure escapes the checked lease creation statement'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.leases
    WHERE unit_id = (SELECT rollback_unit_id FROM lease_authority_state)
  ),
  0::bigint,
  'forced term failure atomically rolls back the compatibility lease insert'
);

SELECT has_trigger(
  'public',
  'leases',
  'guard_checked_lease_creation',
  'legacy create RPC and import writes cross the checked creation guard'
);

SELECT throws_ok(
  format(
    'SELECT public.generate_monthly_rent_income_items(%L,current_date)',
    (SELECT organization_id FROM lease_authority_state)
  ),
  '0A000',
  'Legacy rent generation is blocked until Plan 09 consumes authoritative term and policy identities',
  'legacy generator cannot treat unresolved or new authoritative terms as safe'
);

SELECT throws_ok(
  format(
    'UPDATE public.rent_policy_versions SET rent_calculation_timezone = %L WHERE id = %L',
    'UTC',
    (SELECT policy_id FROM lease_authority_state)
  ),
  '42501',
  NULL,
  'authenticated callers cannot directly mutate approved policy'
);

SELECT lives_ok(
  format(
    'UPDATE lease_authority_state SET term_id = public.create_authoritative_lease_term(%L,%L,current_date - 30,current_date + 330,1200,%L,10,%L,%L,(SELECT id FROM public.lease_terms WHERE lease_id = %L AND authority_kind = %L),%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    'USD',
    'monthly',
    'active',
    (SELECT lease_id FROM lease_authority_state),
    'legacy_inferred',
    'lease-term-create-0001'
  ),
  'admin can replace legacy evidence with an explicit authoritative term'
);

SELECT is(
  (
    SELECT status
    FROM public.lease_terms
    WHERE authority_kind = 'legacy_inferred'
      AND lease_id = (SELECT lease_id FROM lease_authority_state)
  ),
  'superseded',
  'replaced legacy evidence remains preserved as superseded history'
);

SELECT results_eq(
  format(
    'SELECT readiness_status,reason_code,term_id,policy_id FROM public.resolve_lease_rent_readiness(%L,%L,current_date)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state)
  ),
  format(
    'VALUES (%L::text,%L::text,%L::uuid,%L::uuid)',
    'ready',
    'ready',
    (SELECT term_id FROM lease_authority_state),
    (SELECT policy_id FROM lease_authority_state)
  ),
  'approved policy plus one authoritative term is ready with exact identities'
);

SELECT is(
  (
    SELECT monthly_rent_amount
    FROM public.leases
    WHERE id = (SELECT lease_id FROM lease_authority_state)
  ),
  1200.00::numeric,
  'authoritative current term projects its amount to compatibility fields'
);

SELECT is(
  (
    SELECT lease_start_date
    FROM public.leases
    WHERE id = (SELECT lease_id FROM lease_authority_state)
  ),
  current_date - 30,
  'authoritative current term projects its date to compatibility fields'
);

SELECT is(
  public.create_authoritative_lease_term(
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    current_date - 30,
    current_date + 330,
    1200,
    'USD',
    10,
    'monthly',
    'active',
    (
      SELECT id
      FROM public.lease_terms
      WHERE lease_id = (SELECT lease_id FROM lease_authority_state)
        AND authority_kind = 'legacy_inferred'
    ),
    'lease-term-create-0001'
  ),
  (SELECT term_id FROM lease_authority_state),
  'identical retry returns the original authoritative term identity'
);

SELECT lives_ok(
  format(
    'UPDATE lease_authority_state SET scheduled_term_id = public.schedule_authoritative_lease_term(%L,%L,current_date + 31,current_date + 690,1250,%L,10,%L,%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    'USD',
    'monthly',
    (SELECT term_id FROM lease_authority_state),
    'lease-term-schedule-active-0001'
  ),
  'future rent change splits only the unused future range'
);

SELECT is(
  (
    SELECT end_date
    FROM public.lease_terms
    WHERE id = (SELECT term_id FROM lease_authority_state)
  ),
  current_date + 30,
  'future rent change preserves active identity and shortens its unused range'
);

SELECT results_eq(
  $$
    SELECT status, supersedes_term_id
    FROM public.lease_terms
    WHERE id = (SELECT scheduled_term_id FROM lease_authority_state)
  $$,
  $$
    SELECT
      'upcoming'::text,
      (SELECT term_id FROM lease_authority_state)
  $$,
  'future rent change creates a linked upcoming authority without deleting history'
);

SELECT throws_ok(
  format(
    'SELECT public.terminate_authoritative_lease_term(%L,%L,%L,current_date - 30,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    (SELECT term_id FROM lease_authority_state),
    'lease-term-terminate-start-0001'
  ),
  '22023',
  'Termination date must be after the lease start date',
  'termination cannot collapse the compatibility lease to a zero-day range'
);

SELECT throws_ok(
  format(
    'SELECT public.create_authoritative_lease_term(%L,%L,current_date - 30,current_date + 330,1201,%L,10,%L,%L,(SELECT id FROM public.lease_terms WHERE lease_id = %L AND authority_kind = %L),%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    'USD',
    'monthly',
    'active',
    (SELECT lease_id FROM lease_authority_state),
    'legacy_inferred',
    'lease-term-create-0001'
  ),
  '22023',
  'Conflicting financial idempotency request',
  'payload-changed retry fails closed'
);

SELECT throws_ok(
  format(
    'SELECT public.create_authoritative_lease_term(%L,%L,current_date - 1,current_date + 30,1300,%L,11,%L,%L,NULL,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    'USD',
    'monthly',
    'active',
    'lease-term-overlap-0001'
  ),
  '23P01',
  NULL,
  'overlapping authoritative term is rejected by the database'
);

SELECT throws_ok(
  format(
    'UPDATE public.leases SET monthly_rent_amount = 999 WHERE id = %L AND organization_id = %L',
    (SELECT lease_id FROM lease_authority_state),
    (SELECT organization_id FROM lease_authority_state)
  ),
  '42501',
  'Authoritative lease economics must be changed through the term workflow',
  'compatibility edit cannot overwrite or diverge from term authority'
);

SELECT throws_ok(
  format(
    'SELECT public.update_rent_policy_draft(%L,%L,ARRAY[%L]::text[],%L,%L,NULL,%L,%L,%L,%L,%L,%L,%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT policy_id FROM lease_authority_state),
    'monthly',
    'UTC',
    'term',
    'last_calendar_day',
    'actual_days',
    'actual_days',
    'through_lease_end',
    'prorate_actual_days',
    'unsupported',
    'unsupported',
    'unsupported'
  ),
  '42501',
  'Only draft rent policy versions can be edited',
  'approved policy cannot be edited through its checked draft RPC'
);

INSERT INTO public.import_runs(
  id,
  organization_id,
  import_type,
  source_file_name,
  total_rows,
  ready_rows
)
SELECT
  import_run_id,
  organization_id,
  'leases',
  'authoritative-lease-import.csv',
  1,
  1
FROM lease_authority_state
UNION ALL
SELECT
  incomplete_import_run_id,
  organization_id,
  'leases',
  'incomplete-lease-import.csv',
  1,
  1
FROM lease_authority_state
UNION ALL
SELECT
  oversized_import_run_id,
  organization_id,
  'leases',
  'oversized-lease-import.csv',
  251,
  251
FROM lease_authority_state;

INSERT INTO public.import_rows(
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  normalized_data
)
SELECT
  import_run_id,
  organization_id,
  1,
  'ready',
  'Create',
  jsonb_build_object(
    'propertyId', property_id,
    'unitId', import_unit_id,
    'tenantPersonId', tenant_id,
    'leaseStartDate', current_date - 10,
    'leaseEndDate', current_date + 355,
    'monthlyRentAmount', 950,
    'rentDueDay', 8,
    'paymentFrequency', 'monthly',
    'termStatus', 'active',
    'depositAmount', 475,
    'status', 'active'
  )
FROM lease_authority_state
UNION ALL
SELECT
  incomplete_import_run_id,
  organization_id,
  1,
  'ready',
  'Create',
  jsonb_build_object(
    'propertyId', property_id,
    'unitId', incomplete_import_unit_id,
    'tenantPersonId', tenant_id,
    'leaseStartDate', current_date - 10,
    'leaseEndDate', current_date + 355,
    'monthlyRentAmount', 975,
    'depositAmount', 488,
    'status', 'active'
  )
FROM lease_authority_state;

INSERT INTO public.import_rows(
  import_run_id,
  organization_id,
  source_row_number,
  row_status,
  action_label,
  normalized_data
)
SELECT
  state.oversized_import_run_id,
  state.organization_id,
  row_number,
  'ready',
  'Create',
  '{}'::jsonb
FROM lease_authority_state AS state
CROSS JOIN generate_series(1, 251) AS rows(row_number);

SELECT throws_ok(
  format(
    'SELECT public.commit_generic_import_run(%L,%L)',
    (SELECT oversized_import_run_id FROM lease_authority_state),
    (SELECT organization_id FROM lease_authority_state)
  ),
  '54000',
  'Lease import runs are limited to 250 commit-ready rows',
  'lease import commit bounds advisory-lock work per transaction'
);

SELECT lives_ok(
  format(
    'SELECT public.commit_generic_import_run(%L,%L)',
    (SELECT import_run_id FROM lease_authority_state),
    (SELECT organization_id FROM lease_authority_state)
  ),
  'lease import commits through the checked authority workflow'
);

SELECT is(
  (
    SELECT rows.row_status
    FROM public.import_rows AS rows
    WHERE rows.import_run_id =
      (SELECT import_run_id FROM lease_authority_state)
  ),
  'committed',
  'successful imported lease row is marked committed'
);

SELECT is(
  (
    SELECT terms.authority_kind
    FROM public.lease_terms AS terms
    JOIN public.leases AS leases ON leases.id = terms.lease_id
    WHERE leases.unit_id = (SELECT import_unit_id FROM lease_authority_state)
      AND terms.archived_at IS NULL
      AND terms.status <> 'superseded'
  ),
  'authoritative',
  'successful imported lease receives normalized authoritative term identity'
);

SELECT lives_ok(
  format(
    'SELECT public.commit_generic_import_run(%L,%L)',
    (SELECT incomplete_import_run_id FROM lease_authority_state),
    (SELECT organization_id FROM lease_authority_state)
  ),
  'incomplete lease import is contained as a row failure'
);

SELECT matches(
  (
    SELECT rows.error_message
    FROM public.import_rows AS rows
    WHERE rows.import_run_id =
      (SELECT incomplete_import_run_id FROM lease_authority_state)
  ),
  'explicit due day, payment frequency, and term status',
  'incomplete lease import returns the precise authority blocker'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT manager_id::text FROM lease_authority_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT public.create_authoritative_lease_term(%L,%L,current_date,current_date + 30,1000,%L,10,%L,%L,NULL,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    'USD',
    'monthly',
    'active',
    'manager-term-create-0001'
  ),
  '42501',
  'Not authorized',
  'manager cannot mutate lease-term authority'
);

SELECT throws_ok(
  format(
    'SELECT public.correct_authoritative_lease_term(%L,%L,%L,current_date,current_date + 30,1000,%L,10,%L,%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    (SELECT term_id FROM lease_authority_state),
    'USD',
    'monthly',
    'draft',
    'manager-term-correct-0001'
  ),
  '42501',
  'Not authorized',
  'manager cannot correct authoritative terms'
);

SELECT throws_ok(
  format(
    'SELECT public.confirm_legacy_lease_term(%L,%L,%L,10,%L,%L,%L)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state),
    (SELECT term_id FROM lease_authority_state),
    'monthly',
    'active',
    'manager-term-confirm-0001'
  ),
  '42501',
  'Not authorized',
  'manager cannot confirm legacy terms'
);

RESET ROLE;
SET LOCAL ROLE service_role;

SELECT throws_ok(
  format(
    'UPDATE public.lease_terms SET rent_amount = 1 WHERE id = %L',
    (SELECT term_id FROM lease_authority_state)
  ),
  '42501',
  NULL,
  'service role cannot directly mutate lease terms'
);

SELECT throws_ok(
  format(
    'UPDATE public.rent_policy_versions SET rent_calculation_timezone = %L WHERE id = %L',
    'UTC',
    (SELECT policy_id FROM lease_authority_state)
  ),
  '42501',
  NULL,
  'service role cannot directly mutate policy versions'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT cross_admin_id::text FROM lease_authority_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'SELECT * FROM public.resolve_lease_rent_readiness(%L,%L,current_date)',
    (SELECT organization_id FROM lease_authority_state),
    (SELECT lease_id FROM lease_authority_state)
  ),
  '42501',
  'Not authorized',
  'cross-organization admin cannot resolve another organization lease'
);

RESET ROLE;

SELECT cmp_ok(
  (
    SELECT count(*)
    FROM public.activity_logs
    WHERE organization_id = (SELECT organization_id FROM lease_authority_state)
      AND entity_type IN ('lease_term', 'rent_policy_version')
  ),
  '>=',
  4::bigint,
  'checked authority mutations retain auditable activity history'
);

SELECT * FROM finish();
ROLLBACK;
