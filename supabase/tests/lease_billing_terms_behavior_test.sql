BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(9);

CREATE TEMP TABLE lease_billing_state (
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

INSERT INTO lease_billing_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON lease_billing_state TO authenticated;

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
FROM lease_billing_state;

INSERT INTO public.organizations(id, name, slug)
SELECT
  organization_id,
  'Lease billing organization',
  'lease-billing-' || left(organization_id::text, 8)
FROM lease_billing_state;

INSERT INTO public.organization_members(organization_id, user_id, role)
SELECT organization_id, admin_id, 'super_admin'
FROM lease_billing_state;

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
FROM lease_billing_state;

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
FROM lease_billing_state;

INSERT INTO public.people(id, organization_id, display_name, party_type)
SELECT owner_id, organization_id, 'Billing Owner', 'individual'
FROM lease_billing_state
UNION ALL
SELECT tenant_id, organization_id, 'Billing Tenant', 'individual'
FROM lease_billing_state
UNION ALL
SELECT company_id, organization_id, 'Billing Company', 'company'
FROM lease_billing_state;

INSERT INTO public.person_roles(organization_id, person_id, role)
SELECT organization_id, owner_id, 'owner'
FROM lease_billing_state
UNION ALL
SELECT organization_id, tenant_id, 'tenant'
FROM lease_billing_state;

INSERT INTO public.property_owners(
  organization_id, property_id, person_id, ownership_percent, is_primary,
  started_on
)
SELECT
  organization_id, property_id, owner_id, 100, true, current_date - 365
FROM lease_billing_state;

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
FROM lease_billing_state;

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
FROM lease_billing_state;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT admin_id::text FROM lease_billing_state),
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format(
    'INSERT INTO public.lease_billing_terms (organization_id,lease_id,property_id,effective_from,effective_to,collection_route,management_fee_mode,management_fee_value,billing_recipient_kind,billing_recipient_person_id,confirmed_by) VALUES (%L,%L,%L,current_date,current_date + 30,%L,%L,10,%L,%L,%L)',
    (SELECT organization_id FROM lease_billing_state),
    (SELECT lease_id FROM lease_billing_state),
    (SELECT property_id FROM lease_billing_state),
    'through_ips',
    'percentage',
    'individual',
    (SELECT tenant_id FROM lease_billing_state),
    (SELECT admin_id FROM lease_billing_state)
  ),
  '42501',
  NULL,
  'authenticated callers cannot insert billing rules directly'
);

SELECT throws_ok(
  format(
    'SELECT public.set_lease_billing_term(%L,%L,current_date - 60,%L,%L,8,true,true,%L,%L,NULL,NULL,NULL,%L)',
    (SELECT organization_id FROM lease_billing_state),
    (SELECT lease_id FROM lease_billing_state),
    'through_ips',
    'percentage',
    'company',
    (SELECT tenant_id FROM lease_billing_state),
    'lease-billing-mismatch-0001'
  ),
  '23503',
  'Billing recipient does not match the selected recipient type',
  'billing recipient type must match the selected person'
);

SELECT lives_ok(
  format(
    'UPDATE lease_billing_state SET initial_term_id = public.set_lease_billing_term(%L,%L,current_date - 60,%L,%L,8,true,true,%L,%L,500,NULL,NULL,%L)',
    (SELECT organization_id FROM lease_billing_state),
    (SELECT lease_id FROM lease_billing_state),
    'through_ips',
    'percentage',
    'individual',
    (SELECT tenant_id FROM lease_billing_state),
    'lease-billing-initial-0001'
  ),
  'admin can activate initial effective-dated billing rules'
);

SELECT results_eq(
  format(
    'SELECT collection_route,management_fee_mode,management_fee_value::numeric(14,2),first_period_prorated_amount FROM public.resolve_lease_billing_term(%L,%L,current_date)',
    (SELECT organization_id FROM lease_billing_state),
    (SELECT lease_id FROM lease_billing_state)
  ),
  $$VALUES ('through_ips'::text, 'percentage'::text, 8.00::numeric(14,2), 500.00::numeric(14,2))$$,
  'billing resolution returns the applicable collection, fee, and proration rule'
);

SELECT is(
  public.set_lease_billing_term(
    (SELECT organization_id FROM lease_billing_state),
    (SELECT lease_id FROM lease_billing_state),
    current_date - 60,
    'through_ips',
    'percentage',
    8,
    true,
    true,
    'individual',
    (SELECT tenant_id FROM lease_billing_state),
    500,
    NULL,
    NULL,
    'lease-billing-initial-0001'
  ),
  (SELECT initial_term_id FROM lease_billing_state),
  'identical idempotency replay returns the existing billing term'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.lease_billing_terms
    WHERE lease_id = (SELECT lease_id FROM lease_billing_state)
  ),
  1,
  'idempotency replay does not duplicate billing rules'
);

SELECT lives_ok(
  format(
    'UPDATE lease_billing_state SET changed_term_id = public.set_lease_billing_term(%L,%L,current_date + 30,%L,%L,75,true,false,%L,%L,NULL,400,%L,%L)',
    (SELECT organization_id FROM lease_billing_state),
    (SELECT lease_id FROM lease_billing_state),
    'direct_to_owner',
    'flat',
    'company',
    (SELECT company_id FROM lease_billing_state),
    (SELECT initial_term_id FROM lease_billing_state),
    'lease-billing-change-0001'
  ),
  'admin can schedule a simple effective-dated billing change'
);

SELECT is(
  (
    SELECT effective_to
    FROM public.lease_billing_terms
    WHERE id = (SELECT initial_term_id FROM lease_billing_state)
  ),
  current_date + 29,
  'the replaced billing rule ends immediately before the new rule'
);

SELECT results_eq(
  format(
    'SELECT collection_route,management_fee_mode,management_fee_value::numeric(14,2),billing_recipient_kind,full_management_fee_during_proration,final_period_prorated_amount FROM public.resolve_lease_billing_term(%L,%L,current_date + 30)',
    (SELECT organization_id FROM lease_billing_state),
    (SELECT lease_id FROM lease_billing_state)
  ),
  $$VALUES ('direct_to_owner'::text, 'flat'::text, 75.00::numeric(14,2), 'company'::text, false, 400.00::numeric(14,2))$$,
  'the scheduled rule resolves on its effective date'
);

SELECT * FROM finish();
ROLLBACK;
