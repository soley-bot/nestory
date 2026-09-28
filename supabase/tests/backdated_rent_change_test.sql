BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

CREATE TEMP TABLE rent_change_state (
  admin_id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_id uuid NOT NULL DEFAULT gen_random_uuid(),
  initial_term_id uuid,
  changed_term_id uuid
) ON COMMIT DROP;

INSERT INTO rent_change_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON rent_change_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  admin_id,
  'authenticated',
  'authenticated',
  'lease-billing-' || left(admin_id::text, 8) || '@example.test',
  extensions.crypt('lease-billing-test', extensions.gen_salt('bf')),
  now(), '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{}', now(), now()
FROM rent_change_state;

INSERT INTO public.organizations(id, name, slug, operational_timezone)
SELECT
  organization_id,
  'Lease billing organization',
  'lease-billing-' || left(organization_id::text, 8),
  'UTC'
FROM rent_change_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM rent_change_state;

INSERT INTO public.properties(
  id, organization_id, name, code, property_type, status
)
SELECT
  property_id,
  organization_id,
  'Lease billing property',
  'BILL-' || left(property_id::text, 8),
  'apartment',
  'active'
FROM rent_change_state;

INSERT INTO public.units(
  id, organization_id, property_id, unit_number, status,
  current_rent_amount, current_rent_currency
)
SELECT
  unit_id,
  organization_id,
  property_id,
  'BILL-1',
  'occupied',
  1000,
  'USD'::public.currency_code
FROM rent_change_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT owner_id, organization_id, 'Billing Owner', 'individual'
FROM rent_change_state
UNION ALL
SELECT tenant_id, organization_id, 'Billing Tenant', 'individual'
FROM rent_change_state
UNION ALL
SELECT company_id, organization_id, 'Billing Company', 'company'
FROM rent_change_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, owner_id, 'owner'
FROM rent_change_state
UNION ALL
SELECT organization_id, tenant_id, 'tenant'
FROM rent_change_state;

INSERT INTO public.property_owners(
  organization_id, property_id, person_id, ownership_percent, is_primary,
  started_on
)
SELECT
  organization_id, property_id, owner_id, 100, true, current_date - 365
FROM rent_change_state;

SET LOCAL session_replication_role = replica;

INSERT INTO public.leases(
  id, organization_id, property_id, unit_id, primary_tenant_person_id,
  status
)
SELECT
  lease_id,
  organization_id,
  property_id,
  unit_id,
  tenant_id,
  'active'
FROM rent_change_state;

SET LOCAL session_replication_role = origin;

INSERT INTO public.lease_terms(
  organization_id, lease_id, term_sequence, start_date, end_date,
  rent_amount, rent_currency, rent_due_day, payment_frequency, status,
  authority_kind, confirmed_at, confirmed_by, created_by, updated_by
)
SELECT
  organization_id,
  lease_id,
  1,
  current_date - 60,
  current_date + 300,
  1000,
  'USD'::public.currency_code,
  1,
  'monthly',
  'active',
  'authoritative',
  now(),
  admin_id,
  admin_id,
  admin_id
FROM rent_change_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM rent_change_state),
  true
);
SET LOCAL ROLE authenticated;


-- No billing rule exists in this fixture, so the automatic catch-up leaves
-- invoices untouched. Exercise the authenticated command, not direct term edits.
UPDATE rent_change_state SET initial_term_id = (
  SELECT id FROM public.lease_terms WHERE lease_id = rent_change_state.lease_id
);
CREATE FUNCTION pg_temp.change_rent(p_offset integer, p_key text)
RETURNS uuid LANGUAGE sql AS $$
  SELECT public.schedule_authoritative_lease_term(
    organization_id, lease_id, current_date + p_offset, current_date + 300,
    1200, 'USD', 1, 'monthly', initial_term_id, p_key
  ) FROM rent_change_state
$$;

SAVEPOINT today_change;
SELECT lives_ok($$SELECT pg_temp.change_rent(0, 'today-change')$$, 'today is accepted');
SELECT is((SELECT status FROM public.lease_terms WHERE rent_amount = 1200 AND lease_id = (SELECT lease_id FROM rent_change_state)), 'active', 'today term is immediately active');
SELECT is((SELECT end_date FROM public.lease_terms WHERE id = (SELECT initial_term_id FROM rent_change_state)), current_date - 1, 'predecessor ends yesterday');
SELECT is((SELECT status FROM public.lease_terms WHERE id = (SELECT initial_term_id FROM rent_change_state)), 'expired', 'predecessor expires before catch-up');
SELECT lives_ok($$SELECT pg_temp.change_rent(0, 'today-change')$$, 'retry succeeds after predecessor expires');
SELECT is((SELECT count(*)::integer FROM public.lease_terms WHERE lease_id = (SELECT lease_id FROM rent_change_state)), 2, 'retry does not duplicate the term');
ROLLBACK TO today_change;

SAVEPOINT past_change;
SELECT lives_ok($$SELECT pg_temp.change_rent(-10, 'past-change')$$, 'past effective date is accepted');
SELECT is((SELECT status FROM public.lease_terms WHERE rent_amount = 1200 AND lease_id = (SELECT lease_id FROM rent_change_state)), 'active', 'backdated term is immediately active');
ROLLBACK TO past_change;

SAVEPOINT same_start;
SELECT lives_ok($$SELECT pg_temp.change_rent(-60, 'term-start-change')$$, 'term start can be edited with prior version retained');
ROLLBACK TO same_start;

SAVEPOINT issued_rent;
SELECT public.set_lease_billing_term(
  organization_id, lease_id, current_date - 60, 'through_ips', 'percentage',
  0, false, false, 'individual', tenant_id, NULL, NULL, NULL, 'backdated-billing-rule'
) FROM rent_change_state;
RESET ROLE;
INSERT INTO public.tenant_invoices (
  organization_id, invoice_number, property_id, unit_id, lease_id,
  billing_term_id, billing_period_start, billing_period_end, issue_date,
  due_date, collection_route, recipient_kind, recipient_person_id,
  recipient_label, total_amount
)
SELECT state.organization_id, 'BACKDATED-ISSUED', state.property_id, state.unit_id,
  state.lease_id, billing.id, date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  current_date, current_date, 'through_ips', 'individual', tenant_id,
  'Billing Tenant', 1000
FROM rent_change_state state
JOIN public.lease_billing_terms billing ON billing.lease_id = state.lease_id;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT pg_temp.change_rent((date_trunc('month',current_date)::date + 1) - current_date, 'issued-today')$$, '22023', 'issued_rent_change_requires_month_start', 'issued month requires a full-month effective date');
SELECT throws_ok($$SELECT pg_temp.change_rent((date_trunc('month',current_date)::date + 1) - current_date, 'issued-past')$$, '22023', 'issued_rent_change_requires_month_start', 'invalid issued-month request remains blocked on retry');
SELECT is((SELECT end_date FROM public.lease_terms WHERE id = (SELECT initial_term_id FROM rent_change_state)), current_date + 300, 'rejected changes leave the predecessor unchanged');
ROLLBACK TO issued_rent;

SELECT lives_ok($$SELECT pg_temp.change_rent(10, 'future-change')$$, 'future dates still work');
SELECT is((SELECT status FROM public.lease_terms WHERE rent_amount = 1200 AND lease_id = (SELECT lease_id FROM rent_change_state)), 'upcoming', 'future term stays upcoming');
SELECT * FROM finish();
ROLLBACK;
