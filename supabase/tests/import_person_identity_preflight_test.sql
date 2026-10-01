BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(34);

CREATE TEMP TABLE import_identity_state (
  run_id uuid,
  result jsonb,
  people_snapshot jsonb,
  first_person jsonb,
  shared_email_peer jsonb
) ON COMMIT DROP;
INSERT INTO import_identity_state DEFAULT VALUES;
GRANT SELECT, UPDATE ON import_identity_state TO authenticated;

INSERT INTO auth.users(id, email)
VALUES ('a7050000-0000-4000-8000-000000000002', 'import-identity-preflight@example.test');
INSERT INTO public.organizations(id, name, slug)
VALUES ('a7050000-0000-4000-8000-000000000001', 'Import identity preflight', 'import-identity-preflight');
INSERT INTO public.organization_members(organization_id, user_id, role)
VALUES ('a7050000-0000-4000-8000-000000000001', 'a7050000-0000-4000-8000-000000000002', 'super_admin');

INSERT INTO public.people(id, organization_id, display_name, primary_email, party_type, legal_name, primary_phone, tax_identifier, notes)
VALUES
  ('a7050000-0000-4000-8000-000000000003', 'a7050000-0000-4000-8000-000000000001', 'Same Name', 'first@example.test', 'individual', NULL, NULL, NULL, 'First notes'),
  ('a7050000-0000-4000-8000-000000000004', 'a7050000-0000-4000-8000-000000000001', 'Same Name', 'second@example.test', 'company', 'Second Company Ltd', '+10000000004', 'SECOND-TAX', 'Second company notes'),
  ('a7050000-0000-4000-8000-000000000005', 'a7050000-0000-4000-8000-000000000001', 'Shared Email First', 'shared@example.test', 'individual', NULL, NULL, NULL, NULL),
  ('a7050000-0000-4000-8000-000000000006', 'a7050000-0000-4000-8000-000000000001', 'Shared Email Second', 'shared@example.test', 'company', NULL, NULL, NULL, NULL),
  ('a7050000-0000-4000-8000-000000000007', 'a7050000-0000-4000-8000-000000000001', 'Unique Company', 'unique@example.test', 'company', 'Unique Company Ltd', '+10000000007', 'UNIQUE-TAX', 'Unique notes');
INSERT INTO public.person_roles(organization_id, person_id, role, status)
SELECT organization_id, id, 'tenant', 'active'
FROM public.people WHERE organization_id = 'a7050000-0000-4000-8000-000000000001';

UPDATE import_identity_state
SET people_snapshot = (SELECT jsonb_agg(to_jsonb(person) ORDER BY person.id) FROM public.people person
    WHERE organization_id = 'a7050000-0000-4000-8000-000000000001'),
  first_person = (SELECT to_jsonb(person) FROM public.people person WHERE id = 'a7050000-0000-4000-8000-000000000003'),
  shared_email_peer = (SELECT to_jsonb(person) FROM public.people person WHERE id = 'a7050000-0000-4000-8000-000000000005');

CREATE FUNCTION pg_temp.legacy_person_row(p_number integer, p_raw jsonb, p_selected_id uuid)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'source_row_number', p_number, 'row_status', 'ready',
    'action_label', CASE WHEN p_selected_id IS NULL THEN 'Create' ELSE 'Update' END,
    'raw_data', p_raw,
    'normalized_data', jsonb_build_object(
      'existingPersonId', p_selected_id, 'displayName', p_raw ->> 'Name',
      'roles', jsonb_build_array('tenant'), 'partyType', 'individual',
      'legalName', NULL, 'primaryEmail', p_raw ->> 'Email', 'primaryPhone', NULL,
      'taxIdentifier', NULL, 'notes', NULL
    ), 'issues', '[]'::jsonb
  );
$$;

CREATE FUNCTION pg_temp.legacy_lease_row(p_raw jsonb, p_selected_id uuid)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'source_row_number', 2, 'row_status', 'ready', 'action_label', 'Create', 'raw_data', p_raw,
    'normalized_data', jsonb_build_object(
      'tenantPersonId', p_selected_id, 'propertyId', 'a7050000-0000-4000-8000-000000000099',
      'unitId', NULL, 'leaseStartDate', '2033-01-01', 'leaseEndDate', '2033-12-31',
      'monthlyRentAmount', '1300', 'rentDueDay', '5', 'paymentFrequency', 'monthly',
      'termStatus', 'upcoming', 'depositAmount', '', 'status', 'draft'
    ), 'issues', '[]'::jsonb
  );
$$;

CREATE FUNCTION pg_temp.stage_identity_import(p_type text, p_mapping jsonb, p_rows jsonb)
RETURNS uuid LANGUAGE sql AS $$
  SELECT (public.stage_import_run_v1(
    'a7050000-0000-4000-8000-000000000001', p_type, 'identity-preflight.csv', 10::bigint, 'text/csv',
    '["ID","Name","Email","Roles","Tenant ID","Tenant","Tenant Email"]', p_mapping, p_rows
  ) ->> 'runId')::uuid;
$$;

SELECT ok(
  NOT has_function_privilege('authenticated', 'app_private.assert_import_person_identity(uuid,text,jsonb,jsonb,jsonb)', 'EXECUTE'),
  'authenticated cannot invoke the private commit identity assertion directly'
);

SELECT set_config('request.jwt.claim.sub', 'a7050000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('people',
  '{"displayName":"Name","primaryEmail":"Email","roles":"Roles"}',
  jsonb_build_array(pg_temp.legacy_person_row(2, '{"Name":"Same Name","Email":"second@example.test","Roles":"tenant","Case":"wrong-existing-id"}', 'a7050000-0000-4000-8000-000000000003')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: person identity no longer matches the staged selection.', 'legacy wrong same-name person ID is rejected by authoritative email');
SELECT is((SELECT jsonb_agg(to_jsonb(person) ORDER BY person.id) FROM public.people person WHERE organization_id = 'a7050000-0000-4000-8000-000000000001'),
  (SELECT people_snapshot FROM import_identity_state), 'wrong legacy person selection changes no people');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('people',
  '{"displayName":"Name","primaryEmail":"Email","roles":"Roles"}',
  jsonb_build_array(pg_temp.legacy_person_row(2, '{"Name":"Shared Email First","Email":"shared@example.test","Roles":"tenant","Case":"shared-email"}', 'a7050000-0000-4000-8000-000000000005')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: person identity is ambiguous; map an explicit person ID.', 'shared-email People identity cannot resume a first-match selection');
SELECT is((SELECT status FROM public.import_runs WHERE id = (SELECT run_id FROM import_identity_state)), 'staged', 'ambiguous People run remains staged');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('people',
  '{"displayName":"Name","roles":"Roles"}',
  jsonb_build_array(pg_temp.legacy_person_row(2, '{"Name":"Same Name","Roles":"tenant","Case":"shared-name"}', 'a7050000-0000-4000-8000-000000000003')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: person identity is ambiguous; map an explicit person ID.', 'same-name People ambiguity requires an explicit mapped ID');
SELECT is((SELECT jsonb_agg(to_jsonb(person) ORDER BY person.id) FROM public.people person WHERE organization_id = 'a7050000-0000-4000-8000-000000000001'),
  (SELECT people_snapshot FROM import_identity_state), 'ambiguous names do not change any existing person');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('people',
  '{"displayName":"Name","primaryEmail":"Email","roles":"Roles"}',
  jsonb_build_array(pg_temp.legacy_person_row(2, '{"Name":"Same Name","Email":"unmatched@example.test","Roles":"tenant","Case":"unmatched-email-update"}', 'a7050000-0000-4000-8000-000000000003')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: person identity no longer matches the staged selection.', 'unmatched nonblank People email cannot fall back to a same-name update');
SELECT is((SELECT jsonb_agg(to_jsonb(person) ORDER BY person.id) FROM public.people person WHERE organization_id = 'a7050000-0000-4000-8000-000000000001'),
  (SELECT people_snapshot FROM import_identity_state), 'unmatched email leaves all same-name people unchanged');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('leases',
  '{"tenantName":"Tenant","tenantEmail":"Tenant Email"}',
  jsonb_build_array(pg_temp.legacy_lease_row('{"Tenant":"Same Name","Tenant Email":"second@example.test","Case":"wrong-lease-id"}', 'a7050000-0000-4000-8000-000000000003')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: person identity no longer matches the staged selection.', 'legacy Lease ID cannot retain wrong same-name attribution');
SELECT is((SELECT count(*) FROM public.leases WHERE organization_id = 'a7050000-0000-4000-8000-000000000001'), 0::bigint, 'wrong Lease attribution creates no lease records');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('leases',
  '{"tenantPersonId":"Tenant ID","tenantName":"Tenant","tenantEmail":"Tenant Email"}',
  jsonb_build_array(pg_temp.legacy_lease_row('{"Tenant ID":"a7050000-0000-4000-8000-000000000004","Tenant":"Same Name","Tenant Email":"first@example.test","Case":"lease-id-email-conflict"}', 'a7050000-0000-4000-8000-000000000004')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: the mapped tenant person ID and email identify different people.', 'explicit Lease ID cannot override a conflicting nonblank tenant email');
SELECT is((SELECT count(*) FROM public.leases WHERE organization_id = 'a7050000-0000-4000-8000-000000000001'), 0::bigint, 'conflicting Lease identity creates no lease records');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('leases',
  '{"tenantName":"Tenant","tenantEmail":"Tenant Email"}',
  jsonb_build_array(pg_temp.legacy_lease_row('{"Tenant":"Same Name","Tenant Email":"unmatched@example.test","Case":"lease-unmatched-email"}', 'a7050000-0000-4000-8000-000000000003')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: no person matches the mapped tenant identity.', 'unmatched nonblank Lease email cannot fall back to a same-name tenant');
SELECT is((SELECT count(*) FROM public.leases WHERE organization_id = 'a7050000-0000-4000-8000-000000000001'), 0::bigint, 'unmatched Lease email creates no lease records');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('leases',
  '{"tenantName":"Tenant","tenantEmail":"Tenant Email"}',
  jsonb_build_array(pg_temp.legacy_lease_row('{"Tenant":"Shared Email First","Tenant Email":"shared@example.test","Case":"lease-shared-email"}', 'a7050000-0000-4000-8000-000000000005')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: person identity is ambiguous; map an explicit person ID.', 'shared-email Lease identity requires explicit attribution');
SELECT is((SELECT status FROM public.import_runs WHERE id = (SELECT run_id FROM import_identity_state)), 'staged', 'ambiguous Lease run remains staged');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('people',
  '{"displayName":"Name","primaryEmail":"Email","roles":"Roles"}',
  jsonb_build_array(
    pg_temp.legacy_person_row(2, '{"Name":"Valid row before unsafe row","Email":"valid-before-unsafe@example.test","Roles":"tenant"}', NULL),
    pg_temp.legacy_person_row(3, '{"Name":"Same Name","Email":"second@example.test","Roles":"tenant","Case":"unsafe-second-row"}', 'a7050000-0000-4000-8000-000000000003')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: person identity no longer matches the staged selection.', 'a later unsafe ready row rejects the entire run before the valid row writes');
SELECT is((SELECT count(*) FROM public.people WHERE organization_id = 'a7050000-0000-4000-8000-000000000001' AND display_name = 'Valid row before unsafe row'), 0::bigint, 'the earlier valid Create row is not written');
SELECT is((SELECT count(*) FROM public.import_rows WHERE import_run_id = (SELECT run_id FROM import_identity_state) AND row_status = 'ready'), 2::bigint, 'all original ready rows remain untouched after preflight failure');
SELECT is((SELECT jsonb_agg(to_jsonb(person) ORDER BY person.id) FROM public.people person WHERE organization_id = 'a7050000-0000-4000-8000-000000000001'),
  (SELECT people_snapshot FROM import_identity_state), 'whole-run identity preflight failure preserves every existing person');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('people',
  '{"displayName":"Name","primaryEmail":"Email","roles":"Roles"}',
  jsonb_build_array(pg_temp.legacy_person_row(2, '{"Name":"Same Name","Email":"new-person@example.test","Roles":"tenant","Case":"safe-email-create"}', NULL)));
UPDATE import_identity_state SET result = public.commit_generic_import_run(run_id, 'a7050000-0000-4000-8000-000000000001');
SELECT is((SELECT result ->> 'status' FROM import_identity_state), 'committed', 'authoritative unmatched email can safely create a new same-name person');
SELECT is((SELECT count(*) FROM public.people WHERE organization_id = 'a7050000-0000-4000-8000-000000000001' AND primary_email = 'new-person@example.test'), 1::bigint, 'safe unmatched-email Create creates exactly one new person');
SELECT is((SELECT jsonb_agg(to_jsonb(person) ORDER BY person.id) FROM public.people person WHERE id IN (
  'a7050000-0000-4000-8000-000000000003', 'a7050000-0000-4000-8000-000000000004', 'a7050000-0000-4000-8000-000000000005', 'a7050000-0000-4000-8000-000000000006', 'a7050000-0000-4000-8000-000000000007')),
  (SELECT people_snapshot FROM import_identity_state), 'safe same-name Create does not change the existing people');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('people',
  '{"displayName":"Name","primaryEmail":"Email","roles":"Roles"}',
  jsonb_build_array(pg_temp.legacy_person_row(2, '{"Name":"Same Name","Email":"second@example.test","Roles":"tenant","Case":"safe-unique-email-update"}', 'a7050000-0000-4000-8000-000000000004')));
UPDATE import_identity_state SET result = public.commit_generic_import_run(run_id, 'a7050000-0000-4000-8000-000000000001');
SELECT is((SELECT result ->> 'status' FROM import_identity_state), 'committed', 'unique authoritative email retains the correct existing selection');
SELECT is((SELECT jsonb_build_object('legalName', legal_name, 'partyType', party_type, 'primaryPhone', primary_phone, 'taxIdentifier', tax_identifier, 'notes', notes)
  FROM public.people WHERE id = 'a7050000-0000-4000-8000-000000000004'),
  '{"legalName":"Second Company Ltd","partyType":"company","primaryPhone":"+10000000004","taxIdentifier":"SECOND-TAX","notes":"Second company notes"}'::jsonb,
  'safe legacy unique-email update preserves unmapped company and contact fields despite normalized defaults');
SELECT is((SELECT to_jsonb(person) FROM public.people person WHERE id = 'a7050000-0000-4000-8000-000000000003'), (SELECT first_person FROM import_identity_state), 'safe email selection still leaves the first same-name person unchanged');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('people',
  '{"displayName":"Name","roles":"Roles"}',
  jsonb_build_array(pg_temp.legacy_person_row(2, '{"Name":"Unique Company","Roles":"tenant","Case":"safe-unique-name-update"}', 'a7050000-0000-4000-8000-000000000007')));
UPDATE import_identity_state SET result = public.commit_generic_import_run(run_id, 'a7050000-0000-4000-8000-000000000001');
SELECT is((SELECT result ->> 'status' FROM import_identity_state), 'committed', 'unique name without a mapped email retains the correct existing selection');
SELECT is((SELECT jsonb_build_object('partyType', party_type, 'primaryEmail', primary_email, 'notes', notes) FROM public.people WHERE id = 'a7050000-0000-4000-8000-000000000007'),
  '{"partyType":"company","primaryEmail":"unique@example.test","notes":"Unique notes"}'::jsonb, 'legacy unique-name update preserves unmapped email and company type');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('people',
  '{"personId":"ID","displayName":"Name","primaryEmail":"Email","roles":"Roles"}',
  jsonb_build_array(pg_temp.legacy_person_row(2, '{"ID":"a7050000-0000-4000-8000-000000000006","Name":"Shared Email Second","Email":"changed-by-id@example.test","Roles":"tenant","Case":"safe-explicit-id-update"}', 'a7050000-0000-4000-8000-000000000006')));
UPDATE import_identity_state SET result = public.commit_generic_import_run(run_id, 'a7050000-0000-4000-8000-000000000001');
SELECT is((SELECT result ->> 'status' FROM import_identity_state), 'committed', 'mapped People ID explicitly resolves shared-email identity and permits contact changes');
SELECT is((SELECT primary_email FROM public.people WHERE id = 'a7050000-0000-4000-8000-000000000006'), 'changed-by-id@example.test', 'explicitly selected People ID applies the mapped replacement email');
SELECT is((SELECT to_jsonb(person) FROM public.people person WHERE id = 'a7050000-0000-4000-8000-000000000005'), (SELECT shared_email_peer FROM import_identity_state), 'explicit shared-email resolution leaves the peer unchanged');

UPDATE import_identity_state SET run_id = pg_temp.stage_identity_import('leases',
  '{"tenantName":"Tenant"}',
  jsonb_build_array(pg_temp.legacy_lease_row('{"Tenant":"Same Name","Case":"lease-shared-name"}', 'a7050000-0000-4000-8000-000000000003')));
SELECT throws_ok(format('SELECT public.commit_generic_import_run(%L,%L)', (SELECT run_id FROM import_identity_state), 'a7050000-0000-4000-8000-000000000001'),
  '23514', 'Re-upload this import: person identity is ambiguous; map an explicit person ID.', 'same-name Lease identity without email requires an explicit tenant ID');
SELECT is((SELECT count(*) FROM public.leases WHERE organization_id = 'a7050000-0000-4000-8000-000000000001'), 0::bigint, 'ambiguous tenant names never create a Lease');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
