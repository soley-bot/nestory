BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(15);

CREATE TEMP TABLE import_lease_person_state (
  run_id uuid,
  result jsonb,
  first_person jsonb,
  second_person jsonb
) ON COMMIT DROP;

INSERT INTO import_lease_person_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON import_lease_person_state TO authenticated;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a7040000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'import-lease-attribution@example.test',
  extensions.crypt('import-lease-attribution', extensions.gen_salt('bf')), now(),
  '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

INSERT INTO public.organizations(id, name, slug)
VALUES ('a7040000-0000-4000-8000-000000000001', 'Import lease attribution', 'import-lease-attribution');

INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES ('a7040000-0000-4000-8000-000000000001', 'a7040000-0000-4000-8000-000000000002', 'super_admin');

INSERT INTO public.organization_branches(id, organization_id, name, code)
VALUES ('a7040000-0000-4000-8000-000000000006', 'a7040000-0000-4000-8000-000000000001', 'Import attribution branch', 'IMPORT-ATTR');

SELECT set_config('request.jwt.claim.sub', 'a7040000-0000-4000-8000-000000000002', true);

INSERT INTO public.people(id, organization_id, display_name, primary_email, primary_phone, party_type, notes)
VALUES
  ('a7040000-0000-4000-8000-000000000003', 'a7040000-0000-4000-8000-000000000001', 'Shared Tenant Name', 'first-tenant@example.test', '+10000000003', 'individual', 'First tenant notes'),
  ('a7040000-0000-4000-8000-000000000004', 'a7040000-0000-4000-8000-000000000001', 'Shared Tenant Name', 'second-tenant@example.test', '+10000000004', 'company', 'Second tenant notes');

INSERT INTO public.person_roles(organization_id, person_id, role, status)
VALUES
  ('a7040000-0000-4000-8000-000000000001', 'a7040000-0000-4000-8000-000000000003', 'tenant', 'active'),
  ('a7040000-0000-4000-8000-000000000001', 'a7040000-0000-4000-8000-000000000004', 'tenant', 'active');

INSERT INTO public.person_branch_relationships(organization_id, person_id, branch_id)
VALUES
  ('a7040000-0000-4000-8000-000000000001', 'a7040000-0000-4000-8000-000000000003', 'a7040000-0000-4000-8000-000000000006'),
  ('a7040000-0000-4000-8000-000000000001', 'a7040000-0000-4000-8000-000000000004', 'a7040000-0000-4000-8000-000000000006');

INSERT INTO public.properties(id, organization_id, branch_id, name, code, property_type, rental_structure, status)
VALUES ('a7040000-0000-4000-8000-000000000005', 'a7040000-0000-4000-8000-000000000001', 'a7040000-0000-4000-8000-000000000006', 'Import attribution property', 'IMP-ATTR', 'apartment', 'multi_unit', 'active');

INSERT INTO public.units(id, organization_id, property_id, unit_number, status, current_rent_amount, current_rent_currency)
VALUES
  ('a7040000-0000-4000-8000-000000000007', 'a7040000-0000-4000-8000-000000000001', 'a7040000-0000-4000-8000-000000000005', 'ATTR-01', 'vacant', 1300, 'USD'),
  ('a7040000-0000-4000-8000-000000000008', 'a7040000-0000-4000-8000-000000000001', 'a7040000-0000-4000-8000-000000000005', 'ATTR-02', 'vacant', 1300, 'USD');

UPDATE import_lease_person_state
SET first_person = (SELECT to_jsonb(person) FROM public.people person WHERE id = 'a7040000-0000-4000-8000-000000000003'),
  second_person = (SELECT to_jsonb(person) FROM public.people person WHERE id = 'a7040000-0000-4000-8000-000000000004');

SET LOCAL ROLE authenticated;

UPDATE import_lease_person_state
SET run_id = (public.stage_import_run_v1(
  'a7040000-0000-4000-8000-000000000001', 'leases', 'second-same-name-tenant.csv', 10::bigint, 'text/csv',
  '["Tenant Name","Tenant Email","Rent"]', '{"tenantName":"Tenant Name","tenantEmail":"Tenant Email","monthlyRentAmount":"Rent"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Tenant Name":"Shared Tenant Name","Tenant Email":"second-tenant@example.test","Rent":"1300"},"normalized_data":{"propertyId":"a7040000-0000-4000-8000-000000000005","unitId":"a7040000-0000-4000-8000-000000000007","tenantPersonId":"a7040000-0000-4000-8000-000000000004","tenantName":"Shared Tenant Name","tenantEmail":"second-tenant@example.test","leaseStartDate":"2033-01-01","leaseEndDate":"2033-12-31","monthlyRentAmount":"1300","rentDueDay":"5","paymentFrequency":"monthly","termStatus":"upcoming","depositAmount":"","status":"draft"},"issues":[]}]'
) ->> 'runId')::uuid;

UPDATE import_lease_person_state
SET result = public.commit_generic_import_run(run_id, 'a7040000-0000-4000-8000-000000000001');

SELECT is((SELECT result ->> 'status' FROM import_lease_person_state), 'committed', 'checked lease commit accepts the second same-name tenant resolved by email');
SELECT is((SELECT row_status FROM public.import_rows WHERE import_run_id = (SELECT run_id FROM import_lease_person_state)), 'committed', 'the resolved tenant row is committed');
SELECT is(
  (SELECT primary_tenant_person_id FROM public.leases WHERE id = (SELECT result_lease_id FROM public.import_rows WHERE import_run_id = (SELECT run_id FROM import_lease_person_state))),
  'a7040000-0000-4000-8000-000000000004'::uuid,
  'the canonical lease points to the second same-name person'
);
SELECT is(
  (SELECT jsonb_build_object('personId', party.person_id, 'sourceRowId', party.source_import_row_id, 'evidenceState', party.evidence_state, 'recordSource', party.record_source)
   FROM public.lease_parties party JOIN public.import_rows rows ON party.id = rows.result_lease_party_id
   WHERE rows.import_run_id = (SELECT run_id FROM import_lease_person_state)),
  (SELECT jsonb_build_object('personId', 'a7040000-0000-4000-8000-000000000004'::uuid, 'sourceRowId', id, 'evidenceState', 'accepted', 'recordSource', 'imported_explicit')
   FROM public.import_rows WHERE import_run_id = (SELECT run_id FROM import_lease_person_state)),
  'accepted import party evidence carries the exact resolved tenant ID and source row'
);
SELECT is((SELECT count(*) FROM public.lease_parties WHERE organization_id = 'a7040000-0000-4000-8000-000000000001' AND person_id = 'a7040000-0000-4000-8000-000000000003'), 0::bigint, 'the first same-name person receives no lease party attribution');
SELECT is((SELECT count(*) FROM public.leases WHERE organization_id = 'a7040000-0000-4000-8000-000000000001' AND primary_tenant_person_id = 'a7040000-0000-4000-8000-000000000003'), 0::bigint, 'the first same-name person receives no canonical lease attribution');
SELECT is((SELECT to_jsonb(person) FROM public.people person WHERE id = 'a7040000-0000-4000-8000-000000000003'), (SELECT first_person FROM import_lease_person_state), 'lease import leaves the unselected same-name person unchanged');
SELECT is((SELECT to_jsonb(person) FROM public.people person WHERE id = 'a7040000-0000-4000-8000-000000000004'), (SELECT second_person FROM import_lease_person_state), 'lease import preserves the selected tenant contact fields and company type');
SELECT is(
  (SELECT jsonb_build_object('unitId', occupancy.unit_id, 'sourceRowId', occupancy.source_import_row_id, 'evidenceState', occupancy.evidence_state)
   FROM public.lease_occupancies occupancy JOIN public.import_rows rows ON occupancy.id = rows.result_lease_occupancy_id
   WHERE rows.import_run_id = (SELECT run_id FROM import_lease_person_state)),
  (SELECT jsonb_build_object('unitId', 'a7040000-0000-4000-8000-000000000007'::uuid, 'sourceRowId', id, 'evidenceState', 'accepted')
   FROM public.import_rows WHERE import_run_id = (SELECT run_id FROM import_lease_person_state)),
  'lease attribution retains checked import occupancy scope and evidence'
);
SELECT is((SELECT count(*) FROM public.lease_occupancy_participants WHERE organization_id = 'a7040000-0000-4000-8000-000000000001'), 0::bigint, 'lease import does not infer person residence from primary party attribution');
SELECT is(
  (SELECT jsonb_build_object('rent', rent_amount, 'currency', rent_currency, 'dueDay', rent_due_day, 'frequency', payment_frequency, 'status', status)
   FROM public.lease_terms WHERE lease_id = (SELECT result_lease_id FROM public.import_rows WHERE import_run_id = (SELECT run_id FROM import_lease_person_state))),
  '{"rent":1300,"currency":"USD","dueDay":5,"frequency":"monthly","status":"upcoming"}'::jsonb,
  'tenant attribution retains explicit authoritative rent amount, due day, frequency, and term status'
);

UPDATE import_lease_person_state
SET run_id = (public.stage_import_run_v1(
  'a7040000-0000-4000-8000-000000000001', 'leases', 'negative-rent-attribution.csv', 10::bigint, 'text/csv',
  '["Tenant Name","Tenant Email","Rent"]', '{"tenantName":"Tenant Name","tenantEmail":"Tenant Email","monthlyRentAmount":"Rent"}',
  '[{"source_row_number":2,"row_status":"ready","action_label":"Create","raw_data":{"Tenant Name":"Shared Tenant Name","Tenant Email":"second-tenant@example.test","Rent":"-1"},"normalized_data":{"propertyId":"a7040000-0000-4000-8000-000000000005","unitId":"a7040000-0000-4000-8000-000000000008","tenantPersonId":"a7040000-0000-4000-8000-000000000004","tenantName":"Shared Tenant Name","tenantEmail":"second-tenant@example.test","leaseStartDate":"2033-01-01","leaseEndDate":"2033-12-31","monthlyRentAmount":"-1","rentDueDay":"5","paymentFrequency":"monthly","termStatus":"upcoming","depositAmount":"","status":"draft"},"issues":[]}]'
) ->> 'runId')::uuid;

UPDATE import_lease_person_state
SET result = public.commit_generic_import_run(run_id, 'a7040000-0000-4000-8000-000000000001');

SELECT is((SELECT result ->> 'status' FROM import_lease_person_state), 'failed', 'resolved tenant attribution retains the negative-rent safeguard');
SELECT is((SELECT row_status FROM public.import_rows WHERE import_run_id = (SELECT run_id FROM import_lease_person_state)), 'failed', 'invalid financial terms fail the checked import row');
SELECT is((SELECT count(*) FROM public.leases WHERE organization_id = 'a7040000-0000-4000-8000-000000000001' AND unit_id = 'a7040000-0000-4000-8000-000000000008'), 0::bigint, 'invalid financial terms leave no partial attributed lease');
SELECT is((SELECT count(*) FROM public.lease_terms WHERE organization_id = 'a7040000-0000-4000-8000-000000000001'), 1::bigint, 'invalid financial terms leave no additional rent authority');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
